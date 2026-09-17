// Sales of a creator's works, read from the ledger itself (TzKT).
//
// There is no "sale" record on Tezos: a sale is an operation in which a
// marketplace contract moves the token to the buyer and moves tez (or wXTZ,
// wrapped tez) out to the seller, the creator's royalty and the platform. So:
//
//   1. every transfer of a token whose metadata lists the creator
//   2. the operation each transfer happened in (block level, counter, hash)
//   3. the tez and wXTZ that moved in those operations, fetched per batch of
//      blocks and narrowed to the marketplace contracts and the wallets that
//      started the operations, then matched to each operation by hash
//
// The price is what the buyer paid the marketplace when they paid in the same
// operation (buying a listing); otherwise it is what the marketplace paid out
// (accepted offers and settled auctions, where the money was held in advance).
//
// Checked against objkt.com's own sales index for a wallet with ~6,000 sales of
// its works: every sale of a token with creator metadata was found, and the
// price matched on 99.9%. Collections whose tokens do not record a creator
// (fxhash generative tokens, some Rarible mints) are not covered.
//
// A token transfer in an operation with no payment is not a sale; those are
// returned as token moves (gifts, hand-backs, moves between own wallets).

import { mapLimit, tzkt, tzktAll } from "./api";
import type { Progress, Sale, TokenMove } from "./types";

const WXTZ = "KT1TjnZYs5CGLbmV6yuW169P8Pnr9BiVwwjz";
const PAGE = 5000;

const isContract = (a: string | null | undefined) => !!a && a.startsWith("KT1");

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface RawMove {
  id: number;
  level: number;
  timestamp: string;
  from: { address: string } | null;
  to: { address: string } | null;
  amount: string;
  transactionId?: number;
  fa2: string;
  tokenId: string;
  name: string | null;
  creators: unknown;
}

interface RawOp {
  id: number;
  level: number;
  counter: number;
  hash: string;
  sender: { address: string };
  initiator: { address: string } | null;
}

interface RawPayment {
  id: number;
  level: number;
  counter: number;
  hash: string;
  sender: { address: string };
  initiator: { address: string } | null;
  target: { address: string };
  amount: number;
  quote?: { usd?: number };
}

interface RawWxtz {
  id: number;
  level: number;
  from: { address: string } | null;
  to: { address: string } | null;
  amount: string;
  transactionId?: number;
}

/**
 * Keeps a request line well under what browsers and TzKT's edge accept: past
 * this, HTTP/2 connections get reset rather than answered.
 */
const MAX_URL = 6000;

/**
 * Rows for a set of block levels. The set is split when the request would be
 * too long, and again whenever a page comes back full, so nothing is cut off.
 * `build` receives the levels for one request.
 */
async function byLevels<T>(levels: number[], build: (levels: number[]) => string): Promise<T[]> {
  const path = `${build(levels)}&limit=${PAGE}`;
  const half = levels.length >> 1;
  const split = async () => [...(await byLevels<T>(levels.slice(0, half), build)), ...(await byLevels<T>(levels.slice(half), build))];
  if (path.length > MAX_URL && levels.length > 1) return split();
  const rows = await tzkt<T[]>(path);
  if (rows.length < PAGE || levels.length === 1) return rows;
  return split();
}

const opKey = (hash: string, counter: number) => `${hash}:${counter}`;

export interface WorksActivity {
  sales: Sale[];
  /** Token transfers between wallets with no payment in the operation. */
  moves: TokenMove[];
}

export async function worksActivity(creator: string, onProgress?: (p: Progress) => void): Promise<WorksActivity> {
  const step = (detail: string) => onProgress?.({ step: "Sales of the works", detail });

  const count = await tzkt<number>(`tokens/transfers/count?token.metadata.creators.[*]=${creator}&from.null=false`);
  if (count === 0) return { sales: [], moves: [] };

  step(`${count.toLocaleString("en-US")} token transfers`);
  const rawMoves = await tzktAll<RawMove>(
    `tokens/transfers?token.metadata.creators.[*]=${creator}&from.null=false` +
      `&select=id,level,timestamp,from,to,amount,transactionId,token.contract.address as fa2,token.tokenId as tokenId,token.metadata.name as name,token.metadata.creators as creators`,
    2000,
    100_000,
  );

  // The operation each transfer happened in.
  const ids = [...new Set(rawMoves.map((m) => m.transactionId).filter((x): x is number => !!x))];
  let done = 0;
  const ops = (
    await mapLimit(chunk(ids, 100), 6, async (batch) => {
      const rows = await tzkt<RawOp[]>(`operations/transactions?id.in=${batch.join(",")}&select=id,level,counter,hash,sender,initiator&limit=100`);
      step(`operations ${Math.min(++done * 100, ids.length).toLocaleString("en-US")} of ${ids.length.toLocaleString("en-US")}`);
      return rows;
    })
  ).flat();
  const opById = new Map(ops.map((o) => [o.id, o]));

  // Operations run by a contract are the candidates for sales.
  const marketOps = ops.filter((o) => isContract(o.sender.address));
  const markets = [...new Set(marketOps.map((o) => o.sender.address))];
  const whoByLevel = new Map<number, Set<string>>();
  for (const o of marketOps) {
    const who = o.initiator?.address ?? o.sender.address;
    const set = whoByLevel.get(o.level) ?? new Set<string>();
    set.add(who);
    whoByLevel.set(o.level, set);
  }
  const buyersByLevel = new Map<number, Set<string>>();
  for (const m of rawMoves) {
    if (!m.to) continue;
    const set = buyersByLevel.get(m.level) ?? new Set<string>();
    set.add(m.to.address);
    buyersByLevel.set(m.level, set);
  }
  const levelBatches = chunk([...whoByLevel.keys()].sort((a, b) => a - b), 50);
  const whoIn = (levels: number[], map: Map<number, Set<string>>) => [...new Set(levels.flatMap((l) => [...(map.get(l) ?? [])]))];

  const SEL = "select=id,level,counter,hash,sender,initiator,target,amount,quote&quote=usd";
  done = 0;
  const tick = (what: string, total: number) => step(`${what}: block batch ${Math.min(++done, total)} of ${total}`);
  const [payouts, payments] = await Promise.all([
    // Tez paid out by the marketplaces in operations these wallets started.
    mapLimit(levelBatches, 2, async (levels) => {
      const rows = await byLevels<RawPayment>(levels, (l) =>
        `operations/transactions?level.in=${l.join(",")}&sender.in=${markets.join(",")}&initiator.in=${whoIn(l, whoByLevel).join(",")}&amount.gt=0&${SEL}`,
      );
      tick("tez payments", levelBatches.length * 2);
      return rows;
    }),
    // Tez the buyer sent the marketplace directly.
    mapLimit(levelBatches, 2, async (levels) => {
      const rows = await byLevels<RawPayment>(levels, (l) =>
        `operations/transactions?level.in=${l.join(",")}&sender.in=${whoIn(l, whoByLevel).join(",")}&target.in=${markets.join(",")}&initiator.null=true&amount.gt=0&${SEL}`,
      );
      tick("tez payments", levelBatches.length * 2);
      return rows;
    }),
  ]);

  // wXTZ offers and auctions: only operations that moved no tez can have been paid this way.
  const paidOps = new Set([...payouts.flat(), ...payments.flat()].map((p) => opKey(p.hash, p.counter)));
  const unpaidLevels = [...new Set(marketOps.filter((o) => !paidOps.has(opKey(o.hash, o.counter))).map((o) => o.level))].sort((a, b) => a - b);
  const wxBatches = chunk(unpaidLevels, 50);
  done = 0;
  const wxtz = await mapLimit(wxBatches, 2, async (levels) => {
    // The marketplace moves wrapped tez, sometimes straight out of the buyer's balance.
    const rows = await byLevels<RawWxtz>(levels, (l) =>
      `tokens/transfers?token.contract=${WXTZ}&level.in=${l.join(",")}&from.in=${[...markets, ...whoIn(l, buyersByLevel)].join(",")}&select=id,level,from,to,amount,transactionId`,
    );
    tick("wXTZ payments", wxBatches.length);
    return rows;
  });

  const uniq = <T extends { id: number }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const wxRows = uniq(wxtz.flat()).filter((w) => w.from && w.to && w.transactionId);
  const wxOps = new Map<number, RawOp>();
  await mapLimit(chunk([...new Set(wxRows.map((w) => w.transactionId!))], 100), 4, async (batch) => {
    const rows = await tzkt<RawOp[]>(`operations/transactions?id.in=${batch.join(",")}&select=id,level,counter,hash,sender,initiator&limit=100`);
    for (const r of rows) wxOps.set(r.id, r);
  });

  interface Flow {
    from: string;
    to: string;
    amount: number;
    wxtz: boolean;
  }
  const outflows = new Map<string, Flow[]>();
  const addFlow = (key: string, f: Flow) => {
    const list = outflows.get(key) ?? [];
    list.push(f);
    outflows.set(key, list);
  };
  const rateByLevel = new Map<number, number>();
  for (const p of uniq(payouts.flat())) {
    addFlow(opKey(p.hash, p.counter), { from: p.sender.address, to: p.target.address, amount: p.amount, wxtz: false });
    if (p.quote?.usd) rateByLevel.set(p.level, p.quote.usd);
  }
  for (const w of wxRows) {
    const o = wxOps.get(w.transactionId!);
    if (o) addFlow(opKey(o.hash, o.counter), { from: w.from!.address, to: w.to!.address, amount: Number(w.amount), wxtz: true });
  }
  const paidIn = new Map<string, { from: string; to: string; amount: number }>();
  for (const p of uniq(payments.flat())) {
    const key = opKey(p.hash, p.counter);
    const prev = paidIn.get(key);
    paidIn.set(key, { from: p.sender.address, to: p.target.address, amount: (prev?.amount ?? 0) + p.amount });
    if (p.quote?.usd) rateByLevel.set(p.level, p.quote.usd);
  }

  // Group the token transfers by operation, then price each operation.
  const groups = new Map<string, { op: RawOp; list: RawMove[] }>();
  const moves: TokenMove[] = [];
  const saleKeys = new Set<string>();
  for (const m of rawMoves) {
    const op = m.transactionId ? opById.get(m.transactionId) : undefined;
    if (op && isContract(op.sender.address) && m.to && !isContract(m.to.address)) {
      const key = opKey(op.hash, op.counter);
      const g = groups.get(key) ?? { op, list: [] };
      g.list.push(m);
      groups.set(key, g);
    }
  }

  const sales: Sale[] = [];
  for (const [key, { op, list }] of groups) {
    const market = op.sender.address;
    const buyers = new Set(list.map((m) => m.to!.address));
    const paid = paidIn.get(key);
    const outs = (outflows.get(key) ?? []).filter(
      (f) => f.from === market || (f.wxtz && buyers.has(f.from) && !buyers.has(f.to)),
    );
    const total = paid && buyers.has(paid.from) && paid.to === market ? paid.amount : outs.reduce((s, f) => s + f.amount, 0);
    if (total <= 0) continue;
    saleKeys.add(key);

    // For escrowed listings the token comes from the contract; the seller is whoever was paid most.
    const payees = new Map<string, number>();
    for (const f of outs) if (!isContract(f.to)) payees.set(f.to, (payees.get(f.to) ?? 0) + f.amount);
    const editions = list.reduce((s, m) => s + Number(m.amount), 0);
    const rate = rateByLevel.get(op.level) ?? null;
    const kind = paid ? "listing" : "offer or auction";

    for (const m of list) {
      const buyer = m.to!.address;
      let seller = m.from?.address ?? null;
      if (!seller || isContract(seller)) {
        seller = [...payees].filter(([a]) => a !== buyer).sort((a, b) => b[1] - a[1])[0]?.[0] ?? [...payees.keys()][0] ?? null;
      }
      if (!seller) continue;
      const amount = Math.max(1, Number(m.amount));
      const saleTotal = Math.round((total * Number(m.amount)) / editions);
      sales.push({
        id: m.id,
        opHash: op.hash,
        timestamp: m.timestamp,
        time: Date.parse(m.timestamp),
        level: m.level,
        kind,
        price: Math.round(saleTotal / amount),
        amount,
        total: saleTotal,
        usd: rate == null ? null : (saleTotal / 1e6) * rate,
        seller,
        buyer,
        fa2: m.fa2,
        tokenId: m.tokenId,
        tokenName: m.name ?? null,
        creators: Array.isArray(m.creators) ? m.creators.filter((c): c is string => typeof c === "string") : [creator],
      });
    }
  }

  // Everything else that moved between wallets without payment.
  for (const m of rawMoves) {
    const op = m.transactionId ? opById.get(m.transactionId) : undefined;
    if (!m.from || !m.to || isContract(m.from.address) || isContract(m.to.address)) continue;
    if (op && saleKeys.has(opKey(op.hash, op.counter))) continue;
    moves.push({
      id: m.id,
      opHash: op?.hash ?? null,
      transactionId: m.transactionId ?? null,
      timestamp: m.timestamp,
      time: Date.parse(m.timestamp),
      level: m.level,
      from: m.from.address,
      to: m.to.address,
      fa2: m.fa2,
      tokenId: m.tokenId,
      tokenName: m.name ?? null,
      amount: Number(m.amount),
    });
  }

  return { sales: sales.sort((a, b) => a.time - b.time), moves };
}

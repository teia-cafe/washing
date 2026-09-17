// One lookup, start to finish: gather the records, link wallets, find patterns.

import { accounts, account, balanceAt, domainsFor, resolveName, transfersFor } from "./collect";
import { detect } from "./detect";
import { shortAddress } from "./format";
import { discoverLinks } from "./links";
import { worksActivity } from "./sales";
import type { Account, Finding, LinkedWallet, Progress, Sale, TokenMove, Transfer } from "./types";

/** Same-controller wallets whose own history is pulled in too. Most create no works, so each is a few requests. */
const MAX_EXTRA_WALLETS = 8;

export interface Investigation {
  account: Account;
  links: LinkedWallet[];
  findings: Finding[];
  names: Record<string, string>;
  /** Every sale of the group's works, for the price chart. */
  works: Sale[];
  counts: { sales: number; transfers: number; tokenMoves: number };
  generatedAt: string;
}

const ADDRESS = /^(tz[1-4])[1-9A-HJ-NP-Za-km-z]{33}$/;

export async function resolveInput(input: string): Promise<string> {
  const q = input.trim();
  if (ADDRESS.test(q)) return q;
  if (/\.tez$/i.test(q)) {
    const a = await resolveName(q);
    if (a) return a;
    throw new Error(`${q} does not resolve to a wallet.`);
  }
  throw new Error("Enter a tz1/tz2/tz3 wallet address or a .tez name.");
}

export async function investigate(address: string, onProgress: (p: Progress) => void): Promise<Investigation> {
  onProgress({ step: "Account" });
  const acc = await account(address);

  onProgress({ step: "Tez transfers and .tez names" });
  const [transfers, domains] = await Promise.all([transfersFor(address), domainsFor(address)]);

  onProgress({ step: "Linked wallets" });
  const links = await discoverLinks(acc, transfers, domains, (detail) => onProgress({ step: "Linked wallets", detail }));

  const extra = links.filter((l) => l.role === "same-controller").slice(0, MAX_EXTRA_WALLETS);
  const allSales = new Map<number, Sale>();
  const allMoves = new Map<number, TokenMove>();
  const allTransfers = new Map<number, Transfer>(transfers.map((t) => [t.id, t]));

  // Sales of the works of every wallet in the group, from the ledger.
  for (const [i, wallet] of [address, ...extra.map((l) => l.address)].entries()) {
    const label = i === 0 ? "Sales of the works" : `Linked wallet ${i} of ${extra.length}: ${shortAddress(wallet)}`;
    onProgress({ step: label });
    const [activity, more] = await Promise.all([
      worksActivity(wallet, (p) => onProgress({ step: label, detail: p.detail })),
      i === 0 ? Promise.resolve([] as Transfer[]) : transfersFor(wallet),
    ]);
    activity.sales.forEach((x) => allSales.set(x.id, x));
    activity.moves.forEach((x) => allMoves.set(x.id, x));
    more.forEach((x) => allTransfers.set(x.id, x));
  }

  const side = new Set([address, ...extra.map((l) => l.address)]);
  const saleList = [...allSales.values()].sort((a, b) => a.time - b.time);
  const transferList = [...allTransfers.values()].sort((a, b) => a.time - b.time);
  const tokenMoves = [...allMoves.values()];

  // Wallets the group exchanges tez with directly.
  const associates = new Set<string>();
  for (const t of transferList) {
    if (side.has(t.from) && !side.has(t.to)) associates.add(t.to);
    if (side.has(t.to) && !side.has(t.from)) associates.add(t.from);
  }

  const works = saleList;

  onProgress({ step: "Names" });
  const involved = new Set<string>([...side, ...associates]);
  for (const s of works) {
    involved.add(s.buyer);
    involved.add(s.seller);
  }
  const info = await accounts([...involved]).catch(() => new Map<string, Account>());
  const names: Record<string, string> = {};
  for (const a of involved) names[a] = info.get(a)?.alias ?? shortAddress(a);
  const name = (a: string) => names[a] ?? shortAddress(a);

  onProgress({ step: "Looking for patterns", detail: "checking balances at the block" });
  const balances = new Map<string, Promise<number | null>>();
  const findings = await detect({
    side,
    associates,
    sales: saleList,
    transfers: transferList,
    tokenMoves,
    name,
    balanceAt: (a, level) => {
      const key = `${a}@${level}`;
      let p = balances.get(key);
      if (!p) balances.set(key, (p = balanceAt(a, level)));
      return p;
    },
  });

  return {
    account: acc,
    links,
    findings,
    names,
    works,
    counts: { sales: saleList.length, transfers: transferList.length, tokenMoves: tokenMoves.length },
    generatedAt: new Date().toISOString(),
  };
}

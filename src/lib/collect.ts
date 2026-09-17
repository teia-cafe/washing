// Gathering the ledger records a lookup needs, from TzKT. Sales of
// works are in sales.ts.

import { tzkt, tzktAll } from "./api";
import type { Account, Domain, Transfer } from "./types";

/* Ledger (TzKT) --------------------------------------------------------------- */

interface RawTx {
  id: number;
  hash: string;
  timestamp: string;
  level: number;
  sender: { address: string };
  target: { address: string };
  amount: number;
  quote?: { usd?: number };
}

const toTransfer = (t: RawTx): Transfer => ({
  id: t.id,
  opHash: t.hash,
  timestamp: t.timestamp,
  time: Date.parse(t.timestamp),
  level: t.level,
  from: t.sender.address,
  to: t.target.address,
  amount: t.amount,
  usdRate: t.quote?.usd ?? null,
});

const TX_SELECT = "select=id,hash,timestamp,level,sender,target,amount,quote&quote=usd";

/**
 * Plain tez transfers in and out: wallet to wallet, no contract call. Payouts
 * from marketplace contracts are internal operations and are left out - those
 * are the sales themselves.
 */
export async function transfersFor(address: string): Promise<Transfer[]> {
  const [sent, received] = await Promise.all([
    tzktAll<RawTx>(`operations/transactions?sender=${address}&amount.gt=0&entrypoint.null=true&target.ne=${address}&${TX_SELECT}`),
    tzktAll<RawTx>(`operations/transactions?target=${address}&amount.gt=0&entrypoint.null=true&initiator.null=true&${TX_SELECT}`),
  ]);
  // Only wallet-to-wallet: a transfer to a contract is not a payment to a person.
  return [...sent, ...received]
    .filter((t) => /^tz/.test(t.sender.address) && /^tz/.test(t.target.address))
    .map(toTransfer)
    .sort((a, b) => a.time - b.time);
}

export async function account(address: string): Promise<Account> {
  const a = await tzkt<{
    address: string;
    alias?: string;
    type: string;
    balance?: number;
    firstActivityTime?: string;
  }>(`accounts/${address}`);
  return {
    address: a.address,
    alias: a.alias ?? null,
    type: a.type,
    balance: a.balance ?? 0,
    firstActivityTime: a.firstActivityTime ?? null,
  };
}

export async function accounts(addresses: string[]): Promise<Map<string, Account>> {
  const out = new Map<string, Account>();
  const unique = [...new Set(addresses)];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const rows = await tzkt<{ address: string; alias?: string; type: string; balance?: number; firstActivityTime?: string }[]>(
      `accounts?address.in=${batch.join(",")}&select=address,alias,type,balance,firstActivityTime&limit=100`,
    );
    for (const a of rows) {
      out.set(a.address, {
        address: a.address,
        alias: a.alias ?? null,
        type: a.type,
        balance: a.balance ?? 0,
        firstActivityTime: a.firstActivityTime ?? null,
      });
    }
  }
  return out;
}

interface RawDomain {
  name: string;
  owner: { address: string };
  address?: { address: string } | null;
  firstTime: string;
  lastLevel: number;
}

const toDomain = (d: RawDomain): Domain => ({
  name: d.name,
  owner: d.owner.address,
  address: d.address?.address ?? null,
  firstTime: d.firstTime,
  lastLevel: d.lastLevel,
});

/** .tez names the wallet owns, and names others own that point at it. */
export async function domainsFor(address: string): Promise<Domain[]> {
  const select = "select=name,owner,address,firstTime,lastLevel&limit=1000";
  const [owned, pointing] = await Promise.all([
    tzkt<RawDomain[]>(`domains?owner=${address}&${select}`),
    tzkt<RawDomain[]>(`domains?address=${address}&${select}`),
  ]);
  const byName = new Map<string, Domain>();
  for (const d of [...owned, ...pointing]) byName.set(d.name, toDomain(d));
  return [...byName.values()];
}

/** The first tez a wallet ever received, which is usually whoever set it up. */
export async function firstFunding(address: string): Promise<Transfer | null> {
  const rows = await tzkt<RawTx[]>(
    `operations/transactions?target=${address}&amount.gt=0&sort.asc=id&limit=1&${TX_SELECT}`,
  );
  return rows[0] ? toTransfer(rows[0]) : null;
}

/** A wallet's balance at the end of a block, in mutez. */
export async function balanceAt(address: string, level: number): Promise<number | null> {
  try {
    return await tzkt<number>(`accounts/${address}/balance_history/${level}`);
  } catch {
    return null;
  }
}

/** Resolve a .tez name to its address. */
export async function resolveName(name: string): Promise<string | null> {
  // A single selected field comes back as the value itself: here the address object.
  const rows = await tzkt<{ address?: string }[]>(
    `domains?name=${encodeURIComponent(name.toLowerCase())}&select=address&limit=1`,
  );
  return rows[0]?.address ?? null;
}

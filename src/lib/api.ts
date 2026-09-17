// Network access for the trade pattern lookup. Every query goes to TzKT, the
// public Tezos indexer, through lib/net, which caps concurrent requests per
// host and backs off on rate limits - a busy wallet takes a few hundred
// requests.

import { EXPLORER_BASE, TZKT_BASE } from "@/config";
import { cached } from "@/lib/cache";
import { request } from "@/lib/net";

/** Big wallets mean long pages: more patience than a page's usual requests. */
const OPTS = { timeout: 45_000, retries: 4 };

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function tzkt<T>(path: string): Promise<T> {
  const url = `${TZKT_BASE}/${path}`;
  // Answered from the visitor's own cache when they turned it on and it is fresh.
  const body = await cached(url, async () => {
    const res = await request(url, {}, OPTS);
    if (!res.ok) throw new ApiError(`TzKT ${res.status} for ${path}`, res.status);
    return res.text();
  });
  return JSON.parse(body) as T;
}

/**
 * Every row of a TzKT list, paged by id so rows arriving mid-read cannot
 * shift the pages. `path` must not already set limit, sort or id filters.
 */
export async function tzktAll<T extends { id: number }>(path: string, pageSize = 1000, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  let after = 0;
  const sep = path.includes("?") ? "&" : "?";
  for (;;) {
    const page = await tzkt<T[]>(`${path}${sep}sort.asc=id&id.gt=${after}&limit=${pageSize}`);
    out.push(...page);
    if (page.length < pageSize || out.length >= max) return out;
    after = page[page.length - 1].id;
  }
}

/** Run `fn` over `items`, a few at a time. lib/net's per-host caps still apply underneath. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/* Links out ------------------------------------------------------------------ */

export const opHref = (hash: string) => `${EXPLORER_BASE}/${hash}`;
export const walletHref = (address: string) => `${EXPLORER_BASE}/${address}/operations`;
export const tokenHref = (fa2: string, tokenId: string) => `https://objkt.com/tokens/${fa2}/${tokenId}`;

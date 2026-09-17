// The detectors: sequences in ledger records where money or a work goes back
// towards the wallet it came from.
//
// Each pattern is built from records anyone can check - operation hashes,
// balances at a block, token moves. None of them shows intent or who is behind
// a wallet, and every one has ordinary explanations (gifts, refunds, moving
// works between one's own wallets). The summaries say what the records show,
// not why it happened.
//
// "The group" is the wallet that was looked up plus the wallets discoverLinks
// judged likely to have the same owner.

import { opHref, tokenHref, walletHref } from "./api";
import { formatGap, formatTez } from "./format";
import type { Finding, Sale, Step, Strength, TokenMove, Transfer } from "./types";

const TEZ = 1_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A funding transfer only explains purchases made soon after it. */
export const FUNDING_WINDOW = 48 * HOUR;
/** A refund is looked for this long after the sale. */
export const REFUND_WINDOW = 7 * DAY;
/** A token handed back within this long of its sale counts as a close link. */
export const RETURN_WINDOW = 30 * DAY;
/** Buying a work back years later is collecting, not price-setting. */
export const BUYBACK_WINDOW = 180 * DAY;

export interface DetectInput {
  side: Set<string>;
  associates: Set<string>;
  sales: Sale[];
  transfers: Transfer[];
  tokenMoves: TokenMove[];
  name: (address: string) => string;
  /** Balance in mutez at the end of `level`; null when unknown. */
  balanceAt: (address: string, level: number) => Promise<number | null>;
}

const usd = (t: Transfer) => (t.usdRate == null ? null : (t.amount / TEZ) * t.usdRate);
const sumTotal = (sales: Sale[]) => sales.reduce((s, x) => s + x.total, 0);
const sumUsd = (sales: Sale[]) =>
  sales.every((x) => x.usd != null) ? sales.reduce((s, x) => s + (x.usd ?? 0), 0) : null;
const title = (s: Sale) => (s.tokenName?.trim() ? `"${s.tokenName.trim()}"` : `token #${s.tokenId}`);

function saleStep(s: Sale, name: (a: string) => string, note = ""): Step {
  const editions = s.amount > 1 ? ` (${s.amount} editions)` : "";
  return {
    time: s.timestamp,
    kind: "sale",
    text: `${name(s.buyer)} bought ${title(s)}${editions} from ${name(s.seller)}${note}`,
    mutez: s.total,
    usd: s.usd,
    from: s.buyer,
    to: s.seller,
    opHash: s.opHash,
    href: opHref(s.opHash),
  };
}

function transferStep(t: Transfer, name: (a: string) => string, text?: string): Step {
  return {
    time: t.timestamp,
    kind: "transfer",
    text: text ?? `${name(t.from)} sent tez to ${name(t.to)}`,
    mutez: t.amount,
    usd: usd(t),
    from: t.from,
    to: t.to,
    opHash: t.opHash,
    href: opHref(t.opHash),
  };
}

/* Detectors ------------------------------------------------------------------ */

/** Both ends of the sale are in the group. */
function selfTrades(input: DetectInput): Finding[] {
  const { side, sales, name } = input;
  return sales
    .filter((s) => side.has(s.seller) && side.has(s.buyer))
    .map((s) => {
      const same = s.seller === s.buyer;
      return finding({
        kind: "self-trade",
        strength: same ? "definitive" : "strong",
        title: same ? `Same wallet on both sides: ${title(s)}` : `Sale between linked wallets: ${title(s)}`,
        summary: same
          ? `${name(s.buyer)} is recorded as both the buyer and the seller of ${title(s)} at ${formatTez(s.total)}. The sale appears in the work's price history.`
          : `${title(s)} was sold by ${name(s.seller)} to ${name(s.buyer)} for ${formatTez(s.total)}. Both wallets are in the group (see Linked wallets), so the work and the payment stayed within wallets that appear to share an owner.`,
        steps: [saleStep(s, name)],
        wallets: [s.seller, s.buyer],
        sales: [s],
      });
    });
}

/**
 * Tez from the group, then - within FUNDING_WINDOW - the recipient buys the
 * group's works for about that amount.
 */
async function fundedPurchases(input: DetectInput, used: Set<number>): Promise<Finding[]> {
  const { side, sales, transfers, name, balanceAt } = input;
  const works = sales.filter((s) => s.creators.some((c) => side.has(c)) && !side.has(s.buyer));
  const byBuyer = group(works, (s) => s.buyer);
  const out: Finding[] = [];

  for (const t of transfers) {
    if (!side.has(t.from) || side.has(t.to)) continue;
    const bought = (byBuyer.get(t.to) ?? []).filter(
      (s) => s.time > t.time && s.time - t.time <= FUNDING_WINDOW && !used.has(s.id),
    );
    const total = sumTotal(bought);
    if (bought.length === 0 || total < 0.6 * t.amount || total > 1.1 * t.amount + TEZ) continue;
    bought.forEach((s) => used.add(s.id));

    const before = await balanceAt(t.to, t.level - 1);
    const couldNotAfford = before != null && before < bought[0].total;
    const backToSide = bought.filter((s) => side.has(s.seller));
    const strength: Strength = couldNotAfford || backToSide.length > 0 ? "strong" : "supporting";

    const steps: Step[] = [];
    if (before != null) {
      steps.push({
        time: t.timestamp,
        kind: "balance",
        text: `${name(t.to)} held ${formatTez(before)} just before the transfer${couldNotAfford ? `, less than the ${formatTez(bought[0].total)} spent next` : ""}`,
        mutez: before,
        href: walletHref(t.to),
      });
    }
    steps.push(transferStep(t, name));
    for (const s of bought) {
      steps.push(saleStep(s, name, side.has(s.seller) ? " (a wallet in the group)" : ""));
    }

    const lines = [
      `${name(t.from)} sent ${formatTez(t.amount)} to ${name(t.to)}.`,
      `${formatGap(bought[0].time - t.time)} later, ${name(t.to)} spent ${formatTez(total)} on ${bought.length === 1 ? title(bought[0]) : `${bought.length} of the group's works`}.`,
    ];
    if (couldNotAfford) lines.push(`Its balance before the transfer, ${formatTez(before!)}, was below that price.`);
    if (backToSide.length === bought.length) lines.push(`The seller was a wallet in the group, so the payment returned to the group.`);
    else if (backToSide.length) lines.push(`${backToSide.length} of those purchases were from a wallet in the group; the rest were resales between other collectors.`);
    else lines.push(`The purchase was a resale, and its price now appears in the collection's sale history.`);

    out.push(
      finding({
        kind: "funded-purchase",
        strength,
        title: `Purchase after a transfer from the group: ${bought.length === 1 ? title(bought[0]) : `${bought.length} works`}`,
        summary: lines.join(" "),
        steps,
        wallets: [t.from, t.to, ...new Set(bought.map((s) => s.seller))],
        sales: bought,
      }),
    );
  }
  return out;
}

/** The group sells a work, then sends the buyer about the price. */
function refundedPurchases(input: DetectInput, used: Set<number>): Finding[] {
  const { side, sales, transfers, name } = input;
  const sold = sales.filter((s) => side.has(s.seller) && !side.has(s.buyer));
  const byBuyer = group(sold, (s) => s.buyer);
  const out: Finding[] = [];

  for (const t of transfers) {
    if (!side.has(t.from) || side.has(t.to)) continue;
    const recent = (byBuyer.get(t.to) ?? []).filter(
      (s) => s.time < t.time && t.time - s.time <= REFUND_WINDOW && !used.has(s.id),
    );
    const fits = (sum: number) => t.amount >= 0.8 * sum && t.amount <= 1.1 * sum + TEZ;
    // Everything bought in the window, or a single sale - whichever the amount matches more closely.
    const miss = (sum: number) => Math.abs(t.amount - sum) / sum;
    const candidates: Sale[][] = [];
    if (recent.length && fits(sumTotal(recent))) candidates.push(recent);
    const single = recent.filter((s) => fits(s.total)).sort((a, b) => miss(a.total) - miss(b.total) || b.time - a.time)[0];
    if (single) candidates.push([single]);
    const earlier = candidates.sort((a, b) => miss(sumTotal(a)) - miss(sumTotal(b)))[0] ?? [];
    const total = sumTotal(earlier);
    if (earlier.length === 0) continue;
    earlier.forEach((s) => used.add(s.id));
    const gap = t.time - earlier[earlier.length - 1].time;

    out.push(
      finding({
        kind: "refunded-purchase",
        strength: gap <= DAY ? "strong" : "supporting",
        title: `Transfer to the buyer after a sale: ${earlier.length === 1 ? title(earlier[0]) : `${earlier.length} works`}`,
        summary:
          `${name(t.to)} paid ${formatTez(total)} for ${earlier.length === 1 ? title(earlier[0]) : `${earlier.length} works`} sold by the group. ` +
          `${formatGap(gap)} later, ${name(t.from)} sent ${formatTez(t.amount)} to that buyer. ` +
          `The sale price stays in the work's history; after the transfer, the buyer's net payment was ${t.amount >= total ? "zero" : formatTez(total - t.amount)}.`,
        steps: [...earlier.map((s) => saleStep(s, name)), transferStep(t, name, `${name(t.from)} sent tez to ${name(t.to)}`)],
        wallets: [t.from, t.to],
        sales: earlier,
      }),
    );
  }
  return out;
}

/** A buyer of the group's work transfers the token back, with no sale. */
function tokensReturned(input: DetectInput): Finding[] {
  const { side, sales, tokenMoves, name } = input;
  const saleHashes = new Set(sales.map((s) => s.opHash));
  const soldBySide = sales.filter((s) => side.has(s.seller) && !side.has(s.buyer));
  const out: Finding[] = [];

  for (const m of tokenMoves) {
    if (!m.from || !m.to || side.has(m.from) || !side.has(m.to)) continue;
    if (m.opHash && saleHashes.has(m.opHash)) continue;
    const sale = soldBySide
      .filter((s) => s.buyer === m.from && s.fa2 === m.fa2 && s.tokenId === m.tokenId && s.time < m.time)
      .at(-1);
    if (!sale) continue;

    out.push(
      finding({
        kind: "token-returned",
        strength: m.time - sale.time <= RETURN_WINDOW ? "strong" : "supporting",
        title: `Work transferred back after a sale: ${title(sale)}`,
        summary:
          `${name(sale.buyer)} bought ${title(sale)} from ${name(sale.seller)} for ${formatTez(sale.total)}. ` +
          `${formatGap(m.time - sale.time)} later it transferred the token to ${name(m.to)}, a wallet in the group, with no payment in that operation. ` +
          `The sale price stays in the work's history.`,
        steps: [
          saleStep(sale, name),
          {
            time: m.timestamp,
            kind: "token",
            text: `${name(m.from)} transferred ${m.amount > 1 ? `${m.amount} editions of ` : ""}${title(sale)} to ${name(m.to)}, with no payment in this operation`,
            from: m.from,
            to: m.to,
            opHash: m.opHash ?? undefined,
            href: m.opHash ? opHref(m.opHash) : tokenHref(m.fa2, m.tokenId),
          },
        ],
        wallets: [m.to, m.from],
        sales: [sale],
      }),
    );
  }
  return out;
}

/**
 * The group sells a work to a wallet it exchanges tez with, then buys it back
 * from that wallet for much more.
 */
function buybacks(input: DetectInput): Finding[] {
  const { side, associates, sales, name } = input;
  const out: Finding[] = [];
  const byToken = group(sales, (s) => `${s.fa2}:${s.tokenId}`);
  for (const list of byToken.values()) {
    for (const back of list) {
      if (!side.has(back.buyer) || side.has(back.seller) || !associates.has(back.seller)) continue;
      const first = list
        .filter((s) => side.has(s.seller) && s.buyer === back.seller && s.time < back.time)
        .at(-1);
      if (!first || back.price < 1.5 * first.price || back.time - first.time > BUYBACK_WINDOW) continue;
      out.push(
        finding({
          kind: "buyback",
          strength: "supporting",
          title: `Sold, then bought back higher: ${title(back)}`,
          summary:
            `${name(first.seller)} sold ${title(first)} to ${name(first.buyer)} at ${formatTez(first.price)}, ` +
            `then bought it back from the same wallet ${formatGap(back.time - first.time)} later at ${formatTez(back.price)} (${(back.price / first.price).toFixed(1)}x). ` +
            `That wallet has also exchanged tez directly with the group.`,
          steps: [saleStep(first, name), saleStep(back, name)],
          wallets: [back.buyer, back.seller],
          sales: [back],
        }),
      );
    }
  }
  return out;
}

/* Assembly ------------------------------------------------------------------- */

export async function detect(input: DetectInput): Promise<Finding[]> {
  const sorted = { ...input, transfers: [...input.transfers].sort((a, b) => a.time - b.time) };
  const funded = new Set<number>();
  const refunded = new Set<number>();
  const findings = [
    ...selfTrades(sorted),
    ...(await fundedPurchases(sorted, funded)),
    ...refundedPurchases(sorted, refunded),
    ...tokensReturned(sorted),
    ...buybacks(sorted),
  ];
  addPriceContext(findings, input.sales, input.side);
  const rank: Record<Strength, number> = { definitive: 0, strong: 1, supporting: 2 };
  return findings.sort((a, b) => rank[a.strength] - rank[b.strength] || b.mutez - a.mutez);
}

let counter = 0;
function finding(f: Omit<Finding, "id" | "mutez" | "usd" | "time" | "priceContext">): Finding {
  return {
    ...f,
    id: `${f.kind}-${f.sales[0]?.id ?? "x"}-${++counter}`,
    mutez: sumTotal(f.sales),
    usd: sumUsd(f.sales),
    time: Math.min(...f.sales.map((s) => s.time)),
    priceContext: null,
  };
}

/**
 * How a pattern's price compares with the same collection's other sales in the
 * surrounding 60 days, excluding sales that are part of a pattern.
 */
function addPriceContext(findings: Finding[], sales: Sale[], side: Set<string>) {
  const inPattern = new Set(findings.flatMap((f) => f.sales.map((s) => s.id)));
  const byCollection = group(
    sales.filter((s) => s.creators.some((c) => side.has(c)) && !inPattern.has(s.id)),
    (s) => s.fa2,
  );
  for (const f of findings) {
    const s = f.sales.reduce((a, b) => (b.price > a.price ? b : a));
    const peers = (byCollection.get(s.fa2) ?? []).filter((p) => Math.abs(p.time - s.time) <= 60 * DAY).map((p) => p.price);
    if (peers.length < 3) continue;
    peers.sort((a, b) => a - b);
    const mid = peers.length >> 1;
    const median = peers.length % 2 ? peers[mid] : (peers[mid - 1] + peers[mid]) / 2;
    if (median > 0) f.priceContext = { median, ratio: s.price / median, sampleSize: peers.length };
  }
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export const STRENGTH_LABEL: Record<Strength, string> = {
  definitive: "Direct",
  strong: "Close",
  supporting: "Loose",
};

export const KIND_LABEL: Record<Finding["kind"], string> = {
  "self-trade": "Within the group",
  "funded-purchase": "Purchase after transfer",
  "refunded-purchase": "Transfer after sale",
  "token-returned": "Work returned",
  buyback: "Buyback",
};


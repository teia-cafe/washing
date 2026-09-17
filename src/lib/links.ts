// Which other wallets appear to belong with the one that was looked up.
//
// Activity often spans more than one address: money moves through a
// second wallet, or a "buyer" is a wallet the artist set up. The ledger can
// show three things that tie wallets together:
//
//   domain        - one wallet owns a .tez name that points at the other
//   first-funded  - a wallet's very first tez came from the looked-up wallet
//                   (or the looked-up wallet's first tez came from it)
//   two-way-tez   - meaningful tez has moved in both directions
//
// "same-controller" wallets are treated as one group with it by the
// detectors. The bar for that is deliberately high; everything else with a
// tie is an "associate", shown but not merged.

import { EXPLORER_BASE } from "@/config";
import { mapLimit, opHref } from "./api";
import { accounts, firstFunding } from "./collect";
import { formatTez } from "./format";
import type { Account, Domain, LinkedWallet, LinkEvidence, Transfer } from "./types";

const TEZ = 1_000_000;

/** Custodial and payment services: money through them says nothing about who controls what. */
const SERVICE = /coinbase|kraken|binance|bitfinex|\bgate\b|gate\.io|okx|okex|huobi|htx|kucoin|bybit|bitstamp|exchange|crypto\.com|upbit|bithumb|changenow|moonpay|wert|ramp|mercuryo|transak|bitpanda|hitbtc|bitso|coinone|swapped|simplex|changelly|fixedfloat|sideshift|stakenow|everstake/i;

export const isService = (a: Account | undefined) => !!a?.alias && SERVICE.test(a.alias);

/** How many counterparties to check for "first funded by". Each check is one request. */
const FIRST_FUNDING_CHECKS = 150;

export async function discoverLinks(
  investigated: Account,
  transfers: Transfer[],
  domains: Domain[],
  onProgress?: (detail: string) => void,
): Promise<LinkedWallet[]> {
  const W = investigated.address;
  const stats = new Map<string, { sent: number; received: number; nSent: number; nReceived: number }>();
  const stat = (a: string) => {
    let s = stats.get(a);
    if (!s) stats.set(a, (s = { sent: 0, received: 0, nSent: 0, nReceived: 0 }));
    return s;
  };
  for (const t of transfers) {
    if (t.from === W && t.to !== W) {
      const s = stat(t.to);
      s.sent += t.amount;
      s.nSent++;
    } else if (t.to === W && t.from !== W) {
      const s = stat(t.from);
      s.received += t.amount;
      s.nReceived++;
    }
  }

  const evidence = new Map<string, LinkEvidence[]>();
  const add = (a: string, e: LinkEvidence) => {
    const list = evidence.get(a) ?? [];
    list.push(e);
    evidence.set(a, list);
  };

  // Names: who owns what points where.
  for (const d of domains) {
    if (d.address === W && d.owner !== W && /^tz/.test(d.owner)) {
      add(d.owner, {
        kind: "domain",
        text: `Owns ${d.name}, which points at the looked-up wallet`,
        steps: [{ time: d.firstTime, kind: "domain", text: `${d.name} registered, owner ${d.owner}, resolves to ${W}`, from: d.owner, to: W, href: `${EXPLORER_BASE}/${d.owner}/domains` }],
      });
    }
    if (d.owner === W && d.address && d.address !== W && /^tz/.test(d.address)) {
      add(d.address, {
        kind: "domain",
        text: `The looked-up wallet owns ${d.name}, which points at this wallet`,
        steps: [{ time: d.firstTime, kind: "domain", text: `${d.name} owned by ${W}, resolves to ${d.address}`, from: W, to: d.address, href: `${EXPLORER_BASE}/${W}/domains` }],
      });
    }
  }

  // Who set whom up.
  const byOutflow = [...stats.entries()].filter(([, s]) => s.sent >= TEZ).sort((a, b) => b[1].sent - a[1].sent);
  const toCheck = [...new Set([...evidence.keys(), ...byOutflow.slice(0, FIRST_FUNDING_CHECKS).map(([a]) => a)])];
  let done = 0;
  const firsts = await mapLimit(toCheck, 6, async (a) => {
    const f = await firstFunding(a).catch(() => null);
    onProgress?.(`first funding ${++done} of ${toCheck.length}`);
    return [a, f] as const;
  });
  for (const [a, f] of firsts) {
    if (f?.from === W) {
      add(a, {
        kind: "first-funded",
        text: `Its first-ever tez came from the looked-up wallet (${formatTez(f.amount)})`,
        steps: [{ time: f.timestamp, kind: "transfer", text: `First tez this wallet ever received`, mutez: f.amount, usd: usdOf(f), from: f.from, to: f.to, opHash: f.opHash, href: opHref(f.opHash) }],
      });
    }
  }
  const own = await firstFunding(W).catch(() => null);
  if (own && own.from !== W) {
    add(own.from, {
      kind: "funded-by",
      text: `Sent the looked-up wallet its first-ever tez (${formatTez(own.amount)})`,
      steps: [{ time: own.timestamp, kind: "transfer", text: `First tez the looked-up wallet ever received`, mutez: own.amount, usd: usdOf(own), from: own.from, to: own.to, opHash: own.opHash, href: opHref(own.opHash) }],
    });
  }

  for (const [a, s] of stats) {
    if (s.sent >= 10 * TEZ && s.received >= 10 * TEZ) {
      add(a, {
        kind: "two-way-tez",
        text: `Tez in both directions: ${formatTez(s.sent)} sent to it in ${s.nSent} transfers, ${formatTez(s.received)} back in ${s.nReceived}`,
        steps: [],
      });
    }
  }

  const info = await accounts([...evidence.keys()]);
  const out: LinkedWallet[] = [
    {
      address: W,
      alias: investigated.alias,
      role: "investigated",
      evidence: [],
      tezSent: 0,
      tezReceived: 0,
    },
  ];
  for (const [a, ev] of evidence) {
    const acc = info.get(a);
    if (isService(acc) || acc?.type === "contract") continue;
    const s = stats.get(a) ?? { sent: 0, received: 0 };
    const kinds = new Set(ev.map((e) => e.kind));
    const returnsMoney = s.received >= 50 * TEZ && s.received >= 0.5 * s.sent;
    const sameController =
      kinds.has("domain") ||
      (kinds.has("funded-by") && kinds.has("two-way-tez")) ||
      (kinds.has("first-funded") && kinds.has("two-way-tez") && returnsMoney);
    out.push({
      address: a,
      alias: acc?.alias ?? null,
      role: sameController ? "same-controller" : "associate",
      evidence: ev,
      tezSent: s.sent,
      tezReceived: s.received,
    });
  }
  return out;
}

function usdOf(t: Transfer): number | null {
  return t.usdRate == null ? null : (t.amount / TEZ) * t.usdRate;
}

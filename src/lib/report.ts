// A plain-text summary: every pattern with its ledger records and links,
// ready to paste into a report or hand to someone who will check it.

import { opHref, walletHref } from "./api";
import { KIND_LABEL, STRENGTH_LABEL } from "./detect";
import { formatDate, formatTez, formatUsd } from "./format";
import { isIncomplete, type Investigation } from "./investigate";
import type { Finding, Step } from "./types";

const money = (mutez?: number, usd?: number | null) =>
  mutez == null ? "" : ` - ${formatTez(mutez)}${usd != null ? ` (${formatUsd(usd)} at the time)` : ""}`;

function step(s: Step): string {
  const link = s.opHash ? ` [${s.opHash}](${opHref(s.opHash)})` : s.href ? ` [record](${s.href})` : "";
  return `   - ${formatDate(s.time)} - ${s.text}${money(s.mutez, s.usd)}${link}`;
}

export function findingText(f: Finding): string {
  const ctx = f.priceContext
    ? `\n   Price context: ${f.priceContext.ratio.toFixed(1)}x the collection's median sale price of ${formatTez(f.priceContext.median)} over the surrounding 60 days (${f.priceContext.sampleSize} sales).`
    : "";
  return [
    `**${KIND_LABEL[f.kind]} - ${STRENGTH_LABEL[f.strength].toLowerCase()} link** - ${f.title}`,
    `   ${f.summary}${ctx}`,
    `   Ledger records:`,
    ...f.steps.map(step),
  ].join("\n");
}

export function caseReport(inv: Investigation): string {
  const name = (a: string) => inv.names[a] ?? a;
  const side = inv.links.filter((l) => l.role !== "associate");
  const lines = [
    `# Wash-trade inspector report: ${inv.account.alias ?? inv.account.address}`,
    ``,
    `This report lists patterns in public ledger records. It is not a finding of wrongdoing or evidence of guilt, and it makes no recommendation about legal action. Wash trading is not necessarily illegal, and money and tokens move between people for legitimate reasons.`,
    ``,
    `Wallet: [${inv.account.address}](${walletHref(inv.account.address)})`,
    `Generated: ${formatDate(inv.generatedAt)} from the Tezos ledger (TzKT).`,
    `Reviewed: ${inv.counts.sales} sales of the works, ${inv.counts.transfers} direct tez transfers, ${inv.counts.tokenMoves} token movements without payment.`,
    ...(isIncomplete(inv.completeness)
      ? [
          ``,
          `> **This report may be incomplete.** The public data service (TzKT) limited or dropped requests during the lookup: ${inv.completeness.failed} queries could not be completed${inv.completeness.skipped.length ? `, and these were left out: ${inv.completeness.skipped.join("; ")}` : ""}. Some sales, linked wallets, names or balances may be missing. Run the lookup again later for complete results.`,
        ]
      : []),
    ``,
    `## Wallets grouped with it`,
    ...side.map((l) =>
      [
        `- ${name(l.address)} [${l.address}](${walletHref(l.address)})${l.role === "investigated" ? " - the wallet looked up" : ""}`,
        ...l.evidence.map((e) => `  - ${e.text}${e.steps[0]?.opHash ? ` ([${e.steps[0].opHash}](${opHref(e.steps[0].opHash)}))` : ""}`),
      ].join("\n"),
    ),
    ``,
    `## Patterns (${inv.findings.length})`,
    ``,
    ...inv.findings.map((f, i) => `${i + 1}. ${findingText(f)}\n`),
    `## What these records do and do not show`,
    `Each pattern lists operations recorded on the Tezos ledger; anyone can open the links and confirm them. The records show where tez and tokens moved, when, and in what amounts. They do not show who controls a wallet or why a transfer was made, and every pattern here has ordinary explanations - gifts, refunds, a collector's own wallets, a gallery acting for an artist. "Likely the same owner" is an inference from .tez domain ownership and first-funding links, stated with its records above. A pattern is a reason to look closer, not a conclusion. The operators of the site that produced this report make no accusations.`,
  ];
  return lines.join("\n");
}

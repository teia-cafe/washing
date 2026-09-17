import { useState } from "react";
import { tokenHref, walletHref } from "@/lib/api";
import { KIND_LABEL, STRENGTH_LABEL } from "@/lib/detect";
import { formatDate, formatTez, formatUsd, shortAddress } from "@/lib/format";
import { findingText } from "@/lib/report";
import type { Finding, Step } from "@/lib/types";

const STRENGTH_ICON: Record<Finding["strength"], string> = {
  definitive: "■",
  strong: "▲",
  supporting: "○",
};

const STEP_ICON: Record<Step["kind"], { icon: string; label: string }> = {
  sale: { icon: "⇄", label: "Sale" },
  transfer: { icon: "ꜩ", label: "Tez transfer" },
  token: { icon: "◆", label: "Token transfer" },
  domain: { icon: "@", label: "Domain record" },
  balance: { icon: "≡", label: "Balance at block" },
  note: { icon: "i", label: "Note" },
};

export function StrengthBadge({ strength }: { strength: Finding["strength"] }) {
  return (
    <span className={`badge badge-${strength}`}>
      <span aria-hidden="true">{STRENGTH_ICON[strength]}</span>
      {STRENGTH_LABEL[strength]}
    </span>
  );
}

function StepRow({ step }: { step: Step }) {
  const kind = STEP_ICON[step.kind];
  return (
    <li className="step">
      <span className="step-icon" title={kind.label} aria-label={kind.label}>
        {kind.icon}
      </span>
      <div>
        <span className="step-time">{formatDate(step.time)}</span>
        {step.text}
        {step.href ? (
          <div className="step-link">
            <a href={step.href} target="_blank" rel="noreferrer">
              {step.opHash ? <span className="mono">{step.opHash}</span> : "view record"} ↗
            </a>
          </div>
        ) : null}
      </div>
      {step.mutez != null ? (
        <div className="step-amount">
          {formatTez(step.mutez)}
          {step.usd != null ? <small>{formatUsd(step.usd)} then</small> : null}
        </div>
      ) : (
        <span />
      )}
    </li>
  );
}

export function FindingCard({
  finding,
  names,
  highlighted,
}: {
  finding: Finding;
  names: Record<string, string>;
  highlighted: boolean;
}) {
  const [open, setOpen] = useState(finding.strength !== "supporting");
  const [copied, setCopied] = useState(false);
  const token = finding.sales[0];
  const ctx = finding.priceContext;

  async function copy() {
    try {
      await navigator.clipboard.writeText(findingText(finding));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused; nothing to do.
    }
  }

  return (
    <article id={finding.id} className={`finding${highlighted ? " highlight" : ""}`}>
      <header className="finding-head">
        <div>
          <div className="finding-tags">
            <StrengthBadge strength={finding.strength} />
            <span className="badge badge-kind">{KIND_LABEL[finding.kind]}</span>
            <span className="faint" style={{ fontSize: 13 }}>
              {formatDate(finding.time).slice(0, 10)}
            </span>
          </div>
          <h3 className="finding-title">{finding.title}</h3>
        </div>
        <div className="finding-value">
          <strong>{formatTez(finding.mutez)}</strong>
          {finding.usd != null ? `${formatUsd(finding.usd)} at the time` : "recorded sale value"}
        </div>
      </header>

      <div className="finding-body">
        <p className="finding-summary">{finding.summary}</p>

        {ctx && ctx.ratio >= 1.5 ? (
          <div className="price-context">
            <span className="ratio-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (ctx.ratio / Math.max(ctx.ratio, 10)) * 100)}%` }} />
              <b style={{ left: `${(1 / Math.max(ctx.ratio, 10)) * 100}%` }} />
            </span>
            <span>
              <strong>{ctx.ratio.toFixed(1)}×</strong> the collection&apos;s median of {formatTez(ctx.median)} in the surrounding 60
              days ({ctx.sampleSize} other sales)
            </span>
          </div>
        ) : null}

        <button type="button" className="toggle-steps" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"} Ledger records ({finding.steps.length})
        </button>
        {open ? (
          <ol className="steps">
            {finding.steps.map((s, i) => (
              <StepRow key={i} step={s} />
            ))}
          </ol>
        ) : null}
      </div>

      <footer className="finding-foot">
        <span>
          Wallets:{" "}
          {finding.wallets
            .filter((w, i, all) => all.indexOf(w) === i)
            .map((w, i) => (
              <span key={w}>
                {i > 0 ? ", " : ""}
                <a href={walletHref(w)} target="_blank" rel="noreferrer" title={w}>
                  {names[w] ?? shortAddress(w)}
                </a>
              </span>
            ))}
          {token ? (
            <>
              {" · "}
              <a href={tokenHref(token.fa2, token.tokenId)} target="_blank" rel="noreferrer">
                artwork on objkt ↗
              </a>
            </>
          ) : null}
        </span>
        <button type="button" className="link-btn" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy as text"}
        </button>
      </footer>
    </article>
  );
}

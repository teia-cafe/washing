import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FindingCard } from "./FindingCard";
import { IncompleteNotice, LimitedError, SlowingDown } from "./Limits";
import { LinkedWallets } from "./LinkedWallets";
import { Notice } from "./Notice";
import { PriceChart } from "./PriceChart";
import { walletHref } from "@/lib/api";
import { KIND_LABEL, STRENGTH_LABEL } from "@/lib/detect";
import { formatDate, formatTez, formatUsd, plural } from "@/lib/format";
import { investigate, isIncomplete, resolveInput, type Investigation } from "@/lib/investigate";
import { COOLDOWN_MS, isLimitError } from "@/lib/limits";
import { netHealth, onNetHealth, type NetHealth } from "@/lib/net";
import { caseReport } from "@/lib/report";
import type { Finding, FindingKind, Progress, Sale, Strength } from "@/lib/types";

type State =
  | { kind: "idle" }
  | { kind: "running"; steps: Progress[]; health: NetHealth }
  | { kind: "done"; inv: Investigation }
  | { kind: "error"; message: string; limited: boolean };

function readWalletParam(): string {
  return new URLSearchParams(window.location.search).get("wallet") ?? "";
}

/**
 * The wash-trade inspector: look up a wallet and see the sale and transfer
 * patterns in its public records, each with the operations it is built from.
 * It reports data only; see About for what that does and does not mean, and
 * lib/detect.ts for the rules.
 */
export function WashTradeInspector() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const runId = useRef(0);
  const lastRun = useRef("");
  /** After a lookup that hit limits, "Run again" waits this long. */
  const [retryAt, setRetryAt] = useState(0);

  const run = useCallback(async (raw: string) => {
    const id = ++runId.current;
    lastRun.current = raw;
    setState({ kind: "running", steps: [{ step: "Resolving wallet" }], health: { ...netHealth(), pushback: 0, failed: 0 } });
    const stop = onNetHealth((health) => {
      if (runId.current === id) setState((s) => (s.kind === "running" ? { ...s, health } : s));
    });
    try {
      const address = await resolveInput(raw);
      const url = new URL(window.location.href);
      url.searchParams.set("wallet", raw.trim());
      window.history.replaceState(null, "", url);
      const inv = await investigate(address, (p) => {
        if (runId.current !== id) return;
        setState((s) => {
          if (s.kind !== "running") return s;
          const last = s.steps[s.steps.length - 1];
          // Detail updates replace the current line instead of piling up.
          const steps = last?.step === p.step ? [...s.steps.slice(0, -1), p] : [...s.steps, p];
          return { ...s, steps };
        });
      });
      if (runId.current === id) {
        if (isIncomplete(inv.completeness)) setRetryAt(Date.now() + COOLDOWN_MS);
        setState({ kind: "done", inv });
      }
    } catch (err) {
      if (runId.current !== id) return;
      const limited = isLimitError(err);
      if (limited) setRetryAt(Date.now() + COOLDOWN_MS);
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err), limited });
    } finally {
      stop();
    }
  }, []);
  const retry = useCallback(() => void run(lastRun.current), [run]);

  // A shared link opens straight into its lookup. Deferred and
  // cancellable, so a development double-mount does not start it twice.
  // The URL is only readable in the browser, so it is read after mount.
  useEffect(() => {
    const initial = readWalletParam();
    if (!initial) return;
    const timer = setTimeout(() => {
      setInput(initial);
      void run(initial);
    }, 0);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <strong>Look up a wallet</strong>
            <span>Sale and transfer patterns from the Tezos ledger</span>
          </div>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) void run(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="tz1… wallet or name.tez"
              aria-label="Wallet address or .tez name"
              spellCheck={false}
              autoCapitalize="off"
            />
            <button className="wti-btn" type="submit" disabled={state.kind === "running" || !input.trim()}>
              {state.kind === "running" ? "Looking up…" : "Look up"}
            </button>
          </form>
        </div>
      </div>

      <main className="shell">
        {state.kind === "idle" ? <Intro /> : null}
        {state.kind === "running" ? <Running steps={state.steps} health={state.health} /> : null}
        {state.kind === "error" && state.limited ? <LimitedError until={retryAt} onRetry={retry} /> : null}
        {state.kind === "error" && !state.limited ? (
          <div className="error" role="alert">
            <strong>Could not complete the lookup.</strong> {state.message}
          </div>
        ) : null}
        {state.kind === "done" ? <Report key={state.inv.generatedAt} inv={state.inv} retryAt={retryAt} onRetry={retry} /> : null}
      </main>
    </>
  );
}

function Intro() {
  return (
    <section className="intro">
      <h1>Wash-trade inspector</h1>
      <p className="lede">
        Enter a Tezos wallet or .tez name to see the patterns in its public sales and transfers: works sold between wallets that
        appear to share an owner, purchases paid for with tez that came from the seller&apos;s side, prices sent back to buyers,
        and works handed back after a sale. Every pattern links to the operations it is built from, so you can check it
        yourself.
      </p>
      <Notice />
      <h2>Why it exists</h2>
      <p>
        Wash trading has become a widespread problem in NFT markets, with little regulation, no common way to tie a wallet to a
        person, and no oversight body. On Tezos, artists usually use their wallet address as their public identity, which makes
        self-trading patterns easier to see - especially the high-volume trading on public leaderboards that seems to have no
        purpose outside of itself. This tool lays out the records so anyone can look at the same data. <a href="#/about">More about the tool</a>
      </p>
      <h2>What it looks for</h2>
      <ul className="patterns">
        <li>
          <strong>Within the group</strong>
          <span>A sale where the buyer and seller are the same wallet, or wallets that appear to share an owner.</span>
        </li>
        <li>
          <strong>Purchase after a transfer</strong>
          <span>A wallet receives tez from the group, then soon spends about that amount on the group&apos;s works.</span>
        </li>
        <li>
          <strong>Transfer after a sale</strong>
          <span>The group sells a work, then sends the buyer about the price.</span>
        </li>
        <li>
          <strong>Work returned</strong>
          <span>A buyer transfers a work back to the group with no payment in that operation.</span>
        </li>
      </ul>
      <p className="muted">
        Exactly how each pattern is detected, and what the tool cannot see, is on the <a href="#/methodology">Methodology</a> page.
      </p>
    </section>
  );
}

function Running({ steps, health }: { steps: Progress[]; health: NetHealth }) {
  return (
    <section className="progress" aria-live="polite">
      <h2 className="muted" style={{ fontSize: 15, margin: 0, fontWeight: 500 }}>
        Reading the ledger - usually under a minute, even for a busy wallet
      </h2>
      <SlowingDown health={health} />
      <ol>
        {steps.map((s, i) => (
          <li key={i} className={i === steps.length - 1 ? "current" : ""}>
            {s.step}
            {s.detail ? <span className="faint">- {s.detail}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

const STRENGTHS: Strength[] = ["definitive", "strong", "supporting"];
const KINDS: FindingKind[] = ["self-trade", "funded-purchase", "refunded-purchase", "token-returned", "buyback"];

function Report({ inv, retryAt, onRetry }: { inv: Investigation; retryAt: number; onRetry: () => void }) {
  const [strengths, setStrengths] = useState<Set<Strength>>(new Set(STRENGTHS));
  const [kind, setKind] = useState<FindingKind | "all">("all");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const patternSales = useMemo(() => {
    const byId = new Map<number, Sale>();
    for (const f of inv.findings) for (const s of f.sales) byId.set(s.id, s);
    return [...byId.values()];
  }, [inv]);
  const patternValue = patternSales.reduce((s, x) => s + x.total, 0);
  const patternUsd = patternSales.every((s) => s.usd != null) ? patternSales.reduce((s, x) => s + (x.usd ?? 0), 0) : null;
  const weighty = inv.findings.filter((f) => f.strength !== "supporting").length;
  const side = inv.links.filter((l) => l.role !== "associate");
  const topRatio = inv.findings.reduce<Finding | null>(
    (best, f) => (f.priceContext && (!best?.priceContext || f.priceContext.ratio > best.priceContext.ratio) ? f : best),
    null,
  );

  const visible = inv.findings.filter((f) => strengths.has(f.strength) && (kind === "all" || f.kind === kind));
  const kindsPresent = KINDS.filter((k) => inv.findings.some((f) => f.kind === k));

  function select(id: string) {
    setStrengths(new Set(STRENGTHS));
    setKind("all");
    setHighlight(id);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(caseReport(inv));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused.
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(inv, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trade-review-${inv.account.address}-${inv.generatedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <>
      <section className="case">
        <div>
          <div className="faint" style={{ fontSize: 13 }}>
            Wash-trade inspector report for
          </div>
          <h1>{inv.account.alias ?? "Unnamed wallet"}</h1>
          <a className="mono address" href={walletHref(inv.account.address)} target="_blank" rel="noreferrer">
            {inv.account.address}
          </a>
        </div>
        <div className="case-actions">
          <button type="button" className="btn-quiet" onClick={() => void copyReport()}>
            {copied ? "Copied" : "Copy report"}
          </button>
          <button type="button" className="btn-quiet" onClick={downloadJson}>
            Download records (JSON)
          </button>
        </div>
      </section>

      <IncompleteNotice completeness={inv.completeness} until={retryAt} onRetry={onRetry} />
      <Notice compact />

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{weighty}</div>
          <div className="stat-label">Patterns with a direct or close link</div>
          <div className="stat-sub">plus {plural(inv.findings.length - weighty, "loosely linked pattern")}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{formatTez(patternValue)}</div>
          <div className="stat-label">Recorded in sales that are part of a pattern</div>
          <div className="stat-sub">
            {plural(patternSales.length, "sale")}
            {patternUsd != null ? ` · ${formatUsd(patternUsd)} at the time` : ""}
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">{side.length}</div>
          <div className="stat-label">Wallets in the group</div>
          <div className="stat-sub">{plural(inv.links.length - side.length, "other connected wallet")}</div>
        </div>
        {topRatio?.priceContext ? (
          <div className="stat">
            <div className="stat-value">{topRatio.priceContext.ratio.toFixed(1)}×</div>
            <div className="stat-label">Highest pattern price vs. collection median</div>
            <div className="stat-sub">
              <button type="button" className="link-btn" onClick={() => select(topRatio.id)}>
                {topRatio.sales[0]?.tokenName ?? "view pattern"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <p className="coverage">
        {`Reviewed ${inv.counts.sales.toLocaleString("en-US")} sales of the group's works, ` +
          `${inv.counts.transfers.toLocaleString("en-US")} direct tez transfers and ${inv.counts.tokenMoves.toLocaleString("en-US")} token movements without payment · ${formatDate(inv.generatedAt)}`}
      </p>

      <nav className="nav" aria-label="Sections">
        <a href="#transactions">Patterns</a>
        <a href="#prices">Prices</a>
        <a href="#wallets">Linked wallets</a>
        <a href="#/methodology">Methodology</a>
        <a href="#/about">About this tool</a>
      </nav>

      <section className="section" id="transactions">
        <h2>Patterns</h2>
        <p className="section-lede">Each pattern is a chain of ledger records. Open any operation hash to confirm it on TzKT.</p>
        {inv.findings.length === 0 ? (
          <div className="panel">
            None of the patterns appear in this wallet&apos;s records. The tool only sees direct wallet-to-wallet tez transfers and
            sales of works whose token metadata names a creator, so this is a summary of those records, not a clean bill of health.
          </div>
        ) : (
          <>
            <div className="filters" role="group" aria-label="Filter patterns">
              <span className="filters-label">Strength</span>
              {STRENGTHS.map((s) => {
                const n = inv.findings.filter((f) => f.strength === s).length;
                if (!n) return null;
                return (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    aria-pressed={strengths.has(s)}
                    onClick={() =>
                      setStrengths((prev) => {
                        const next = new Set(prev);
                        if (next.has(s)) next.delete(s);
                        else next.add(s);
                        return next.size ? next : new Set(STRENGTHS);
                      })
                    }
                  >
                    {STRENGTH_LABEL[s]} {n}
                  </button>
                );
              })}
              <span className="filters-label" style={{ marginLeft: 10 }}>
                Pattern
              </span>
              <button type="button" className="chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
                All
              </button>
              {kindsPresent.map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {KIND_LABEL[k]} {inv.findings.filter((f) => f.kind === k).length}
                </button>
              ))}
            </div>
            <div className="findings">
              {visible.map((f) => (
                <FindingCard key={f.id} finding={f} names={inv.names} highlighted={highlight === f.id} />
              ))}
              {visible.length === 0 ? <p className="muted">No patterns match these filters.</p> : null}
            </div>
          </>
        )}
      </section>

      <section className="section" id="prices">
        <h2>Prices</h2>
        <p className="section-lede">
          Every sale of the group&apos;s works. Sales that are part of a pattern are highlighted, so you can see where their prices sat against the rest of the market.
        </p>
        <PriceChart works={inv.works} findings={inv.findings} names={inv.names} onSelect={select} />
      </section>

      <section className="section" id="wallets">
        <h2>Linked wallets</h2>
        <p className="section-lede">
          Wallets the ledger ties to the one you looked up. Those marked &quot;Likely the same owner&quot; are grouped with it for every
          pattern; the records behind each tie are listed with links. The same owner is an inference, not a certainty.
        </p>
        <LinkedWallets links={inv.links} findings={inv.findings} />
      </section>

      <section className="section" id="limits">
        <h2>Reading this report</h2>
        <div className="panel method">
          <p>
            This report lists sequences in public ledger records. It is not a finding of wrongdoing or evidence of guilt, and it
            makes no recommendation about legal action. Wash trading is not necessarily illegal, and money and tokens move between
            people for legitimate reasons - gifts, collaborations, refunds, payments for other work, or moving works between one&apos;s
            own wallets. Grouping wallets by owner is an inference, and the records can be incomplete.
          </p>
          <p>
            How each pattern is detected is on the <a href="#/methodology">Methodology</a> page; what the tool is and is not is on{" "}
            <a href="#/about">About</a>.
          </p>
        </div>
      </section>
    </>
  );
}

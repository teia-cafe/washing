// What the visitor sees when the free data service pushes back. Every query
// runs from the visitor's own browser to TzKT's public API, which limits how
// many requests one visitor (or one network) can make.

import { isIncomplete, type Completeness } from "@/lib/investigate";
import { useSecondsLeft } from "@/lib/limits";
import type { NetHealth } from "@/lib/net";
import { plural } from "@/lib/format";

function RetryButton({ until, onRetry }: { until: number; onRetry: () => void }) {
  const left = useSecondsLeft(until);
  return (
    <button type="button" className="btn-quiet" disabled={left > 0} onClick={onRetry}>
      {left > 0 ? `Run again in ${left}s` : "Run again"}
    </button>
  );
}

/** Shown while a lookup is running and the service has started pushing back. */
export function SlowingDown({ health }: { health: NetHealth }) {
  if (health.pushback === 0) return null;
  return (
    <aside className="limit-note" role="status">
      <strong>The data service is asking this lookup to slow down.</strong> The tool reads from TzKT&apos;s free public API
      directly from your browser, and that API limits how many requests one visitor can make. The lookup is continuing more
      slowly{health.failed > 0 ? `; ${plural(health.failed, "query", "queries")} could not be completed so far` : ""}.
    </aside>
  );
}

/** Shown when a lookup could not finish because of limits. */
export function LimitedError({ until, onRetry }: { until: number; onRetry: () => void }) {
  return (
    <div className="error" role="alert">
      <p>
        <strong>The lookup hit the data service&apos;s request limits.</strong> This tool reads from TzKT&apos;s free public API
        directly from your browser, and it limits how many requests can come from one visitor or network in a short time. Busy
        wallets take hundreds of requests.
      </p>
      <p>Wait a few minutes, then run the lookup again. If you have run several lookups in a row, a longer break helps.</p>
      <RetryButton until={until} onRetry={onRetry} />
    </div>
  );
}

/** Shown at the top of a finished report when some queries were not completed. */
export function IncompleteNotice({ completeness, until, onRetry }: { completeness: Completeness; until: number; onRetry: () => void }) {
  if (!isIncomplete(completeness)) return null;
  return (
    <aside className="incomplete" role="alert">
      <p>
        <strong>This report may be incomplete.</strong> TzKT&apos;s free public API limited or dropped requests during the
        lookup
        {completeness.failed > 0 ? `, and ${plural(completeness.failed, "query", "queries")} could not be completed` : ""}
        {completeness.skipped.length ? ` (left out: ${completeness.skipped.join("; ")})` : ""}. Sales, linked wallets, names or
        balances may be missing, so there may be fewer - or differently grouped - patterns than the full records would show.
      </p>
      <p>For more complete results, wait a few minutes and run the lookup again.</p>
      <RetryButton until={until} onRetry={onRetry} />
    </aside>
  );
}

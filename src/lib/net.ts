// Every request the inspector makes goes through here.
//
// There is no backend: the browser talks to TzKT, a public indexer shared by
// the whole Tezos community, directly. A single lookup for a busy wallet can
// take several hundred requests, so this module decides how politely:
//
//   - each host gets a cap on how many requests run at once
//   - requests time out instead of hanging a page forever
//   - "429 Too Many Requests", passing gateway errors and dropped connections
//     are retried after a backoff, honouring Retry-After when it is sent

export interface NetOptions {
  /** Milliseconds before a request is abandoned. */
  timeout?: number;
  /** Extra attempts after a 429, a 502-504, or a network failure. */
  retries?: number;
}

const DEFAULTS = { timeout: 20_000, retries: 2 } as const;

/* Per-host concurrency ---------------------------------------------------- */

const HOST_LIMITS: Record<string, number> = { "api.tzkt.io": 6 };
const DEFAULT_LIMIT = 6;

const active = new Map<string, number>();
const waiting = new Map<string, (() => void)[]>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

async function slot(host: string): Promise<() => void> {
  const limit = HOST_LIMITS[host] ?? DEFAULT_LIMIT;
  if ((active.get(host) ?? 0) >= limit) {
    await new Promise<void>((resolve) => {
      const q = waiting.get(host) ?? [];
      q.push(resolve);
      waiting.set(host, q);
    });
  }
  active.set(host, (active.get(host) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active.set(host, (active.get(host) ?? 1) - 1);
    waiting.get(host)?.shift()?.();
  };
}

/* Retries ------------------------------------------------------------------ */

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoff(attempt: number, res: Response | null): number {
  const after = res?.headers.get("retry-after");
  if (after) {
    const secs = Number(after);
    if (Number.isFinite(secs)) return Math.min(30_000, secs * 1000);
    const at = Date.parse(after);
    if (Number.isFinite(at)) return Math.min(30_000, Math.max(0, at - Date.now()));
  }
  // 0.6s, 1.8s, 5.4s ... with jitter so a batch does not retry in lockstep.
  return 600 * 3 ** attempt + Math.random() * 300;
}

/** fetch() with a host slot, a timeout and retries. */
export async function request(url: string, init: RequestInit = {}, opts: NetOptions = {}): Promise<Response> {
  const timeout = opts.timeout ?? DEFAULTS.timeout;
  const retries = opts.retries ?? DEFAULTS.retries;
  const host = hostOf(url);

  for (let attempt = 0; ; attempt++) {
    const release = await slot(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res: Response | null = null;
    try {
      res = await fetch(url, { ...init, signal: init.signal ?? ctrl.signal });
    } catch (err) {
      if (init.signal?.aborted || attempt >= retries) throw err;
    } finally {
      clearTimeout(timer);
      release();
    }
    if (res && (!RETRYABLE.has(res.status) || attempt >= retries)) return res;
    await sleep(backoff(attempt, res));
  }
}

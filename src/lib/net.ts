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
//   - when a host pushes back, every request to it pauses together and fewer
//     run at once for a while, rather than each one retrying into the limit
//   - pushback and requests that were given up on are counted, so the page can
//     tell the visitor their results may be incomplete
//
// Free public APIs limit requests per visitor. A limit response from an edge
// often lacks CORS headers, so the browser reports it as a failed connection:
// both count as pushback here.

export interface NetOptions {
  /** Milliseconds before a request is abandoned. */
  timeout?: number;
  /** Extra attempts after a 429, a 502-504, or a network failure. */
  retries?: number;
}

const DEFAULTS = { timeout: 20_000, retries: 2 } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Per-host concurrency ---------------------------------------------------- */

const HOST_LIMITS: Record<string, number> = { "api.tzkt.io": 6 };
const DEFAULT_LIMIT = 6;

const active = new Map<string, number>();
const waiting = new Map<string, (() => void)[]>();
/** A host's concurrency while it is pushing back, and when that ends. */
const throttled = new Map<string, { limit: number; until: number }>();
/** No request to a host starts before this time. */
const pausedUntil = new Map<string, number>();

/** How long a host stays throttled after its last pushback. */
const THROTTLE_MS = 30_000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function limitFor(host: string): number {
  const t = throttled.get(host);
  if (t && t.until > Date.now()) return t.limit;
  throttled.delete(host);
  return HOST_LIMITS[host] ?? DEFAULT_LIMIT;
}

async function slot(host: string): Promise<() => void> {
  for (let wait = (pausedUntil.get(host) ?? 0) - Date.now(); wait > 0; wait = (pausedUntil.get(host) ?? 0) - Date.now()) {
    await sleep(wait);
  }
  if ((active.get(host) ?? 0) >= limitFor(host)) {
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
    // Wake as many waiters as the (possibly reduced) limit allows.
    const q = waiting.get(host);
    if (q?.length && (active.get(host) ?? 0) < limitFor(host)) q.shift()?.();
  };
}

/* Pushback and health ------------------------------------------------------- */

export interface NetHealth {
  /** Responses asking to slow down, gateway errors and dropped connections. */
  pushback: number;
  /** Requests given up on after every retry because of pushback. */
  failed: number;
  /** When requests may start again, if a pause is in effect (ms since epoch). */
  pausedUntil: number;
}

const health: NetHealth = { pushback: 0, failed: 0, pausedUntil: 0 };
const listeners = new Set<(h: NetHealth) => void>();

/** Start counting afresh, e.g. at the start of a lookup. */
export function resetHealth(): void {
  health.pushback = 0;
  health.failed = 0;
}

export function netHealth(): NetHealth {
  return { ...health, pausedUntil: Math.max(0, ...pausedUntil.values()) };
}

/** Called whenever pushback is seen or a request is given up on. */
export function onNetHealth(fn: (h: NetHealth) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const emit = () => listeners.forEach((fn) => fn(netHealth()));

function pushback(host: string, wait: number) {
  health.pushback++;
  // Halve the requests running at once (down to one) until the host has been quiet for a while.
  throttled.set(host, { limit: Math.max(1, Math.floor(limitFor(host) / 2)), until: Date.now() + THROTTLE_MS });
  pausedUntil.set(host, Math.max(pausedUntil.get(host) ?? 0, Date.now() + wait));
  emit();
}

/* Retries ------------------------------------------------------------------ */

const RETRYABLE = new Set([429, 502, 503, 504]);

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
      if (init.signal?.aborted) throw err;
      if (attempt >= retries) {
        health.failed++;
        emit();
        throw err;
      }
    } finally {
      clearTimeout(timer);
      release();
    }
    if (res && !RETRYABLE.has(res.status)) return res;
    if (res && attempt >= retries) {
      health.failed++;
      emit();
      return res;
    }
    const wait = backoff(attempt, res);
    pushback(host, wait);
    await sleep(wait);
  }
}

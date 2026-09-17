// An optional cache of answers from the data service, kept in the visitor's own
// browser (IndexedDB) and nowhere else. It is off until someone turns it on.
//
// Looking up the same wallet twice, or two wallets that share history, repeats
// many identical queries. Keeping the answers locally means those queries are
// not made again, which is easier on the free public API and much faster.
//
// Ledger data keeps growing, so a stored answer is only reused while it is
// fresh (see MAX_AGE_MS); after that it is fetched again. The cache never holds
// more than the size the visitor picked: when it is full, the answers used
// longest ago are dropped first.

const DB_NAME = "wash-trade-inspector";
const STORE = "responses";
const SETTINGS_KEY = "wti.cache.settings";

/** How long a stored answer may be reused before it is fetched again. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Sizes offered in the interface. */
export const CACHE_SIZES = [
  { label: "25 MB", bytes: 25_000_000 },
  { label: "100 MB", bytes: 100_000_000 },
  { label: "500 MB", bytes: 500_000_000 },
];

export interface CacheSettings {
  /** Nothing is stored until this is true. */
  enabled: boolean;
  maxBytes: number;
}

const DEFAULTS: CacheSettings = { enabled: false, maxBytes: CACHE_SIZES[1].bytes };

/* Settings ------------------------------------------------------------------ */

let settings: CacheSettings | null = null;

export function cacheSettings(): CacheSettings {
  if (settings) return settings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<CacheSettings>) : {};
    settings = {
      enabled: saved.enabled === true,
      maxBytes: CACHE_SIZES.some((s) => s.bytes === saved.maxBytes) ? saved.maxBytes! : DEFAULTS.maxBytes,
    };
  } catch {
    settings = { ...DEFAULTS };
  }
  return settings;
}

/** Saves the choice and, when the cache is turned off or shrunk, applies it at once. */
export async function setCacheSettings(next: CacheSettings): Promise<void> {
  settings = { ...next };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage refused; the choice still applies to this page.
  }
  if (!next.enabled) await clearCache();
  else await evictTo(next.maxBytes);
}

/* The store ----------------------------------------------------------------- */

interface Entry {
  path: string;
  body: string;
  size: number;
  /** When it was stored. */
  at: number;
  /** When it was last read, for dropping the least recently used first. */
  used: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "path" }).createIndex("used", "used");
        }
      };
      req.onsuccess = () => resolve(req.result);
      // Private windows and blocked site data: carry on without a cache.
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const done = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function tx(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return db.transaction(STORE, mode).objectStore(STORE);
  } catch {
    return null;
  }
}

/** Whether this browser will store anything at all (private windows may not). */
export async function cacheAvailable(): Promise<boolean> {
  return (await openDb()) !== null;
}

export async function cacheStats(): Promise<{ count: number; bytes: number }> {
  const store = await tx("readonly");
  if (!store) return { count: 0, bytes: 0 };
  try {
    const entries = await done<Entry[]>(store.getAll() as IDBRequest<Entry[]>);
    return { count: entries.length, bytes: entries.reduce((n, e) => n + e.size, 0) };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function clearCache(): Promise<void> {
  const store = await tx("readwrite");
  if (!store) return;
  try {
    await done(store.clear());
  } catch {
    // Nothing to do: the cache is best-effort.
  }
}

/**
 * Which stored answers to drop so the rest fit `maxBytes`: the ones used
 * longest ago go first. Separate from the store so it can be tested on its own.
 */
export function evictionPlan(entries: { path: string; size: number; used: number }[], maxBytes: number): string[] {
  let total = entries.reduce((n, e) => n + e.size, 0);
  if (total <= maxBytes) return [];
  const drop: string[] = [];
  for (const e of [...entries].sort((a, b) => a.used - b.used)) {
    if (total <= maxBytes) break;
    drop.push(e.path);
    total -= e.size;
  }
  return drop;
}

/** Drops the answers used longest ago until the stored size fits `maxBytes`. */
async function evictTo(maxBytes: number): Promise<void> {
  const store = await tx("readwrite");
  if (!store) return;
  try {
    const entries = await done<Entry[]>(store.getAll() as IDBRequest<Entry[]>);
    for (const path of evictionPlan(entries, maxBytes)) store.delete(path);
  } catch {
    // Leave the cache as it is rather than failing a lookup.
  }
}

/* Reading through the cache -------------------------------------------------- */

const stats = { hits: 0, misses: 0 };

export const cacheRunStats = () => ({ ...stats });
export const resetCacheRunStats = () => {
  stats.hits = 0;
  stats.misses = 0;
};

/**
 * The stored answer for `key` when it is fresh, otherwise what `fetchText`
 * returns, stored for next time. Any trouble with the cache falls back to
 * fetching: a lookup never fails because of it.
 */
export async function cached(key: string, fetchText: () => Promise<string>): Promise<string> {
  const { enabled, maxBytes } = cacheSettings();
  if (!enabled) return fetchText();

  try {
    const store = await tx("readonly");
    const hit = store ? await done<Entry | undefined>(store.get(key) as IDBRequest<Entry | undefined>) : undefined;
    if (hit && Date.now() - hit.at < MAX_AGE_MS) {
      stats.hits++;
      // Mark it as used now, so a busy answer outlives an idle one. Not awaited.
      void tx("readwrite").then((s) => s?.put({ ...hit, used: Date.now() }));
      return hit.body;
    }
  } catch {
    // Fall through and fetch.
  }

  stats.misses++;
  const body = await fetchText();
  void putEntry(key, body, maxBytes);
  return body;
}

async function putEntry(key: string, body: string, maxBytes: number): Promise<void> {
  // Close enough to bytes for JSON, and it costs nothing to measure.
  const size = body.length;
  // One answer must never take more than a quarter of the space.
  if (size > maxBytes / 4) return;
  try {
    const s = await tx("readwrite");
    if (!s) return;
    const now = Date.now();
    await done(s.put({ path: key, body, size, at: now, used: now } satisfies Entry));
    await evictTo(maxBytes);
  } catch {
    // Out of space or storage refused: carry on without caching this answer.
  }
}

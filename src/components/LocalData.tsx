// Turning the local cache on or off, choosing how much room it may use, and
// clearing it. Everything it controls lives in the visitor's own browser.

import { useCallback, useEffect, useState } from "react";
import { cacheAvailable, cacheSettings, cacheStats, CACHE_SIZES, clearCache, setCacheSettings } from "@/lib/cache";

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;

export function LocalData() {
  const [settings, setSettings] = useState(cacheSettings);
  const [stats, setStats] = useState({ count: 0, bytes: 0 });
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setAvailable(await cacheAvailable());
    setStats(await cacheStats());
  }, []);

  // What is already stored is outside React, so it is read after mount.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [ok, s] = await Promise.all([cacheAvailable(), cacheStats()]);
      if (!alive) return;
      setAvailable(ok);
      setStats(s);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function change(next: { enabled?: boolean; maxBytes?: number }) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    setBusy(true);
    await setCacheSettings(merged);
    await refresh();
    setBusy(false);
  }

  async function clear() {
    setBusy(true);
    await clearCache();
    await refresh();
    setBusy(false);
  }

  return (
    <section className="local-data">
      <h2>Local data</h2>
      <p>
        Looking up the same wallet again, or wallets that share history, repeats many of the same queries. The inspector can keep
        the answers in this browser and reuse them for a day, which means fewer requests to the free public API and a much faster
        second look. Nothing is sent anywhere: the data stays on this device, in this browser, and no copy reaches this site or
        anyone else.
      </p>
      <div className="local-data-controls">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!available || busy}
            onChange={(e) => void change({ enabled: e.target.checked })}
          />
          <span>Store data in this browser while I use the tool</span>
        </label>
        <label className="field">
          <span>Space it may use</span>
          <select
            value={settings.maxBytes}
            disabled={!available || busy || !settings.enabled}
            onChange={(e) => void change({ maxBytes: Number(e.target.value) })}
          >
            {CACHE_SIZES.map((s) => (
              <option key={s.bytes} value={s.bytes}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-quiet" onClick={() => void clear()} disabled={!available || busy || stats.count === 0}>
          Clear local data
        </button>
      </div>
      <p className="faint local-data-status" aria-live="polite">
        {!available
          ? "This browser will not store data for the site (a private window, or site data is blocked). The tool works without it."
          : stats.count === 0
            ? settings.enabled
              ? "Nothing stored yet. Answers will be kept as you look wallets up."
              : "Nothing stored."
            : `Holding ${stats.count.toLocaleString("en-US")} stored answers, ${mb(stats.bytes)} of ${mb(settings.maxBytes)}. When it is full, the answers used longest ago are dropped first.`}
      </p>
    </section>
  );
}

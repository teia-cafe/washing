// Helpers for telling the visitor about the data service's request limits.

import { useEffect, useState } from "react";
import { ApiError } from "./api";
import { netHealth } from "./net";

/** How long to suggest waiting before running a limited lookup again. */
export const COOLDOWN_MS = 60_000;

/** Whether an error looks like the data service limiting or dropping requests. */
export function isLimitError(err: unknown): boolean {
  if (err instanceof ApiError) return [429, 502, 503, 504].includes(err.status);
  // A limit response without CORS headers, or a dropped connection, surfaces as a failed fetch or a timeout.
  const failedFetch = err instanceof TypeError && /fetch|network|load failed/i.test(err.message);
  const timedOut = err instanceof DOMException && err.name === "AbortError";
  return failedFetch || timedOut || netHealth().failed > 0;
}

/** Seconds left until `until` (ms since epoch), ticking once a second. */
export function useSecondsLeft(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

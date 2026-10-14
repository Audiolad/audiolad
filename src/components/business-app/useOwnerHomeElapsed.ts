"use client";

import { useEffect, useState } from "react";

import { OWNER_HOME_TICK_MS } from "@/lib/business-app/owner-home-live-refresh";

/**
 * Seconds since this signals object arrived; re-renders every OWNER_HOME_TICK_MS so
 * relative labels tick. Starts counting on the first tick (under-ages by ≤ one tick,
 * never over-ages fresh data). A new token (router.refresh result) resets to 0.
 */
export function useOwnerHomeElapsed(token: unknown): number {
  const [clock, setClock] = useState<{ token: unknown; at: number | null; now: number }>({ token, at: null, now: 0 });
  if (clock.token !== token) setClock({ token, at: null, now: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setClock((prev) => (prev.token !== token ? prev : { token, at: prev.at ?? now, now }));
    }, OWNER_HOME_TICK_MS);
    return () => clearInterval(id);
  }, [token]);
  return clock.token === token && clock.at != null ? Math.max(0, (clock.now - clock.at) / 1000) : 0;
}

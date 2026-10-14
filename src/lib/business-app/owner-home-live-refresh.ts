import type { BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";

/**
 * c02fe282 live home: same pattern as the ИИ-компания tablo (AiCompanyLiveRefresh):
 * a scoped soft router.refresh() that re-runs the authenticated server loader
 * (get_business_owner_player_live_state as the signed-in owner). No realtime
 * channel, no publication change, no client-side data access → no cross-owner leak.
 */
export const OWNER_HOME_LIVE_REFRESH_MS = 15_000;
/** Focus/visibility re-fetch is skipped if a refresh happened this recently. */
export const OWNER_HOME_MIN_REFRESH_GAP_MS = 3_000;
/** Relative labels («N мин назад») re-render this often. */
export const OWNER_HOME_TICK_MS = 5_000;

export type OwnerHomeRefreshEnv = {
  now: () => number;
  isHidden: () => boolean;
  schedule: (callback: () => void, ms: number) => unknown;
  cancel: (timerId: unknown) => void;
  addWakeListener: (callback: () => void) => () => void;
};

function browserEnv(): OwnerHomeRefreshEnv {
  return {
    now: () => Date.now(),
    isHidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
    schedule: (callback, ms) => setInterval(callback, ms),
    cancel: (timerId) => clearInterval(timerId as ReturnType<typeof setInterval>),
    addWakeListener: (callback) => {
      const onVisibility = () => {
        if (document.visibilityState === "visible") callback();
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", callback);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", callback);
      };
    },
  };
}

/**
 * Polls while mounted and the tab is visible; refreshes immediately when the tab
 * becomes visible/focused again. The returned stop() cancels everything and
 * ignores already-queued callbacks.
 */
export function startOwnerHomeLiveRefresh(
  refresh: () => void,
  intervalMs: number = OWNER_HOME_LIVE_REFRESH_MS,
  env: OwnerHomeRefreshEnv = browserEnv(),
): () => void {
  let stopped = false;
  let last = env.now();
  const run = (force: boolean) => {
    if (stopped || env.isHidden()) return;
    const now = env.now();
    if (!force && now - last < OWNER_HOME_MIN_REFRESH_GAP_MS) return;
    last = now;
    refresh();
  };
  const timerId = env.schedule(() => run(true), intervalMs);
  const removeWake = env.addWakeListener(() => run(false));
  return () => {
    stopped = true;
    env.cancel(timerId);
    removeWake();
  };
}

function add(value: number | null | undefined, delta: number): number | null {
  return value == null || !Number.isFinite(value) ? (value ?? null) : value + delta;
}

/**
 * Ages server-computed "seconds ago" fields by the time elapsed on the client since
 * the signals were received, so labels tick and freshness windows (5 min link,
 * confirmed-playback expiry) lapse without a reload. Pure; never invents data.
 */
export function ageOwnerHomeSignals(
  signals: BusinessOwnerHomeSignals | null,
  elapsedSeconds: number,
): BusinessOwnerHomeSignals | null {
  if (!signals || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return signals;
  const d = elapsedSeconds;
  const lastSeenSeconds = signals.lastSeenSeconds == null ? signals.lastSeenSeconds : add(signals.lastSeenSeconds, d);
  return {
    ...signals,
    secondsSinceHeartbeat: add(signals.secondsSinceHeartbeat, d),
    lastPlayMinutesAgo: add(signals.lastPlayMinutesAgo, d / 60),
    lastSeenSeconds,
    playbackConfirmedSecondsAgo:
      signals.playbackConfirmedSecondsAgo == null ? signals.playbackConfirmedSecondsAgo : add(signals.playbackConfirmedSecondsAgo, d),
    liveConnected:
      signals.liveConnected == null || lastSeenSeconds == null ? signals.liveConnected : signals.liveConnected && lastSeenSeconds <= 300,
  };
}

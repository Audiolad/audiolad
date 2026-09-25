/**
 * Trusted playback-usage MEDIA-TIME.
 * Mirrors public.apply_playback_usage_heartbeat. Rating eligibility stays on
 * practice_listen_stats and is not computed here.
 *
 * listened_ms is the server-accepted advance of HTMLMediaElement.currentTime.
 * Wall-clock is only an upper bound (× legal 1.5×). Client playback_rate is
 * not an input to the cap.
 */

export const PLAYBACK_USAGE_MAX_RATE = 1.5;

/**
 * A position jump this far beyond the wall-clock ceiling, and more than
 * twice that ceiling, is a seek or a fake catch-up — accept +0 and adopt
 * the new baseline. Smaller overshoot is capped, not discarded.
 */
export const PLAYBACK_USAGE_IMPOSSIBLE_ABS_MS = 2_000;

export type PlaybackUsagePhase =
  | "advance"
  | "seek"
  | "pause"
  | "ended"
  | "track_change";

export type PlaybackUsageState = {
  audioItemId: string | null;
  lastPositionMs: number;
  /** Null until the first accepted sample establishes a baseline. */
  lastReportedAtMs: number | null;
  createdAtMs: number;
  acceptedListenedMs: number;
};

export type PlaybackUsageTickInput = {
  audioItemId: string;
  positionMs: number;
  clientMediaDeltaMs?: number | null;
  nowMs: number;
  phase: PlaybackUsagePhase;
};

export type PlaybackUsageRejectReason =
  | "baseline"
  | "seek"
  | "track_change"
  | "non_positive"
  | "impossible";

export type PlaybackUsageTickResult = {
  acceptedMs: number;
  lastPositionMs: number;
  lastReportedAtMs: number;
  createdAtMs: number;
  acceptedListenedMs: number;
  audioItemId: string;
  rejectedReason: PlaybackUsageRejectReason | null;
};

function floorNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function evaluatePlaybackUsageTick(
  state: PlaybackUsageState | null,
  input: PlaybackUsageTickInput,
): PlaybackUsageTickResult {
  const positionMs = floorNonNegative(input.positionMs);
  const createdAtMs = state?.createdAtMs ?? input.nowMs;

  const finish = (
    acceptedMs: number,
    rejectedReason: PlaybackUsageRejectReason | null,
    acceptedListenedMs = state?.acceptedListenedMs ?? 0,
  ): PlaybackUsageTickResult => ({
    acceptedMs,
    lastPositionMs: positionMs,
    lastReportedAtMs: input.nowMs,
    createdAtMs,
    acceptedListenedMs: acceptedListenedMs + acceptedMs,
    audioItemId: input.audioItemId,
    rejectedReason,
  });

  if (!state || state.lastReportedAtMs == null) {
    return finish(0, "baseline", state?.acceptedListenedMs ?? 0);
  }

  if (input.phase === "seek") {
    return finish(0, "seek");
  }

  if (
    input.phase === "track_change" ||
    state.audioItemId !== input.audioItemId
  ) {
    return finish(0, "track_change");
  }

  const delta = positionMs - state.lastPositionMs;

  if (delta <= 0) {
    return finish(0, "non_positive");
  }

  const elapsedMs = Math.max(0, input.nowMs - state.lastReportedAtMs);
  const wallCapMs = Math.floor(elapsedMs * PLAYBACK_USAGE_MAX_RATE);
  let candidate = delta;

  if (
    typeof input.clientMediaDeltaMs === "number" &&
    Number.isFinite(input.clientMediaDeltaMs) &&
    input.clientMediaDeltaMs >= 0
  ) {
    candidate = Math.min(candidate, Math.floor(input.clientMediaDeltaMs));
  }

  const clearlyImpossible =
    candidate > wallCapMs + PLAYBACK_USAGE_IMPOSSIBLE_ABS_MS &&
    candidate > wallCapMs * 2;

  if (clearlyImpossible) {
    return finish(0, "impossible");
  }

  let acceptedMs = Math.min(candidate, wallCapMs);
  const lifeElapsedMs = Math.max(0, input.nowMs - state.createdAtMs);
  const lifetimeCapMs = Math.floor(lifeElapsedMs * PLAYBACK_USAGE_MAX_RATE);
  const budgetMs = Math.max(0, lifetimeCapMs - state.acceptedListenedMs);
  acceptedMs = Math.max(0, Math.min(acceptedMs, budgetMs));

  return finish(acceptedMs, acceptedMs > 0 ? null : "non_positive");
}

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  LISTEN_STATS_MAX_HEARTBEAT_GAP_MS,
  LISTEN_STATS_MAX_PLAYBACK_RATE,
  LISTEN_STATS_MAX_TICK_MS,
  LISTEN_STATS_MIN_PLAYBACK_RATE,
  LISTEN_STATS_SEEK_JUMP_MS,
  RATING_ELIGIBILITY_LISTEN_MS,
} from "@/lib/listen/listen-stats-constants";

export type PracticeListenStatsOwnState = {
  realListenedMs: number;
  ratingEligible: boolean;
  ratingEligibleAt: string | null;
};

export type ListenStatsTickState = {
  realListenedMs: number;
  ratingEligibleAt: string | null;
  lastAudioItemId: string | null;
  lastPositionMs: number;
  lastReportedAt: string | null;
  createdAt: string | null;
};

export type ListenStatsTickInput = {
  audioItemId: string;
  positionMs: number;
  clientMediaDeltaMs?: number | null;
  playbackRate?: number | null;
  nowMs: number;
  allowEligibility: boolean;
};

export type ListenStatsTickResult = {
  acceptedMs: number;
  realListenedMs: number;
  ratingEligibleAt: string | null;
  lastAudioItemId: string;
  lastPositionMs: number;
  lastReportedAt: string;
  createdAt: string;
};

export const EMPTY_LISTEN_STATS_OWN_STATE: PracticeListenStatsOwnState = {
  realListenedMs: 0,
  ratingEligible: false,
  ratingEligibleAt: null,
};

export function toListenStatsOwnState(input: {
  realListenedMs: number;
  ratingEligibleAt: string | null;
}): PracticeListenStatsOwnState {
  return {
    realListenedMs: Math.max(0, input.realListenedMs),
    ratingEligible: input.ratingEligibleAt != null,
    ratingEligibleAt: input.ratingEligibleAt,
  };
}

export function clampListenStatsPlaybackRate(
  rate: number | null | undefined,
): number {
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return 1;
  }

  return Math.min(
    LISTEN_STATS_MAX_PLAYBACK_RATE,
    Math.max(LISTEN_STATS_MIN_PLAYBACK_RATE, rate),
  );
}

function floorNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

/**
 * MEDIA-TIME tick: advancement of audio currentTime, not wall-clock.
 * Seek / rewind / track-change / pause → +0 and adopt the new position.
 * Server still re-applies the same rules atomically in SQL.
 */
export function evaluateListenStatsTick(
  state: ListenStatsTickState | null,
  input: ListenStatsTickInput,
): ListenStatsTickResult {
  const nowIso = new Date(input.nowMs).toISOString();
  const positionMs = floorNonNegative(input.positionMs);

  if (!state) {
    return {
      acceptedMs: 0,
      realListenedMs: 0,
      ratingEligibleAt: null,
      lastAudioItemId: input.audioItemId,
      lastPositionMs: positionMs,
      lastReportedAt: nowIso,
      createdAt: nowIso,
    };
  }

  let acceptedMs = 0;
  const sameItem = state.lastAudioItemId === input.audioItemId;
  const elapsedSinceLastMs = state.lastReportedAt
    ? Math.max(0, input.nowMs - Date.parse(state.lastReportedAt))
    : 0;
  const heartbeatGapExceeded =
    state.lastReportedAt != null &&
    elapsedSinceLastMs > LISTEN_STATS_MAX_HEARTBEAT_GAP_MS;

  if (sameItem && !heartbeatGapExceeded) {
    const positionDelta = positionMs - state.lastPositionMs;

    if (positionDelta > 0 && positionDelta <= LISTEN_STATS_SEEK_JUMP_MS) {
      acceptedMs = positionDelta;

      if (
        typeof input.clientMediaDeltaMs === "number" &&
        Number.isFinite(input.clientMediaDeltaMs) &&
        input.clientMediaDeltaMs >= 0
      ) {
        acceptedMs = Math.min(
          acceptedMs,
          Math.floor(input.clientMediaDeltaMs),
        );
      }

      acceptedMs = Math.min(acceptedMs, LISTEN_STATS_MAX_TICK_MS);

      // Security budget uses the server-known max legal rate only.
      // Client playback_rate is telemetry and must not expand the cap.
      if (state.lastReportedAt) {
        acceptedMs = Math.min(
          acceptedMs,
          Math.floor(elapsedSinceLastMs * LISTEN_STATS_MAX_PLAYBACK_RATE),
        );
      }

      if (state.createdAt) {
        const lifeElapsedMs = Math.max(
          0,
          input.nowMs - Date.parse(state.createdAt),
        );
        const lifetimeCap = Math.floor(
          lifeElapsedMs * LISTEN_STATS_MAX_PLAYBACK_RATE,
        );
        const budget = lifetimeCap - state.realListenedMs;
        acceptedMs = Math.min(acceptedMs, Math.max(0, budget));
      }
    }
  }

  const realListenedMs = state.realListenedMs + acceptedMs;
  let ratingEligibleAt = state.ratingEligibleAt;

  if (
    input.allowEligibility &&
    ratingEligibleAt == null &&
    realListenedMs >= RATING_ELIGIBILITY_LISTEN_MS
  ) {
    ratingEligibleAt = nowIso;
  }

  return {
    acceptedMs,
    realListenedMs,
    ratingEligibleAt,
    lastAudioItemId: input.audioItemId,
    lastPositionMs: positionMs,
    lastReportedAt: nowIso,
    createdAt: state.createdAt ?? nowIso,
  };
}

type ListenStatsRow = {
  real_listened_ms: number | string;
  rating_eligible_at: string | null;
};

function parseMs(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return 0;
}

export async function getOwnPracticeListenStats(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
): Promise<PracticeListenStatsOwnState> {
  const { data, error } = await supabase
    .from("practice_listen_stats")
    .select("real_listened_ms, rating_eligible_at")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (error) {
    throw new Error("listen_stats_get_failed");
  }

  const row = data as ListenStatsRow | null;

  if (!row) {
    return EMPTY_LISTEN_STATS_OWN_STATE;
  }

  return toListenStatsOwnState({
    realListenedMs: parseMs(row.real_listened_ms),
    ratingEligibleAt: row.rating_eligible_at,
  });
}

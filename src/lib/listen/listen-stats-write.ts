import "server-only";

import {
  toListenStatsOwnState,
  type PracticeListenStatsOwnState,
} from "@/lib/listen/listen-stats";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type HeartbeatRpcRow = {
  real_listened_ms: number | string;
  rating_eligible_at: string | null;
  accepted_ms: number | string;
  last_position_ms: number | string;
  last_audio_item_id: string | null;
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

export async function applyOwnPracticeListenStatsHeartbeat(input: {
  userId: string;
  practiceId: string;
  audioItemId: string;
  positionMs: number;
  allowEligibility: boolean;
  clientMediaDeltaMs?: number | null;
  playbackRate?: number | null;
}): Promise<PracticeListenStatsOwnState> {
  const writer = createServiceRoleClient();
  const { data, error } = await writer.rpc(
    "apply_practice_listen_stats_heartbeat",
    {
      p_user_id: input.userId,
      p_practice_id: input.practiceId,
      p_audio_item_id: input.audioItemId,
      p_position_ms: Math.max(0, Math.floor(input.positionMs)),
      p_allow_eligibility: input.allowEligibility,
      p_client_media_delta_ms:
        typeof input.clientMediaDeltaMs === "number" &&
        Number.isFinite(input.clientMediaDeltaMs) &&
        input.clientMediaDeltaMs >= 0
          ? Math.floor(input.clientMediaDeltaMs)
          : null,
      p_playback_rate:
        typeof input.playbackRate === "number" &&
        Number.isFinite(input.playbackRate)
          ? input.playbackRate
          : null,
    },
  );

  if (error) {
    throw new Error("listen_stats_heartbeat_failed");
  }

  const row = Array.isArray(data)
    ? (data[0] as HeartbeatRpcRow | undefined)
    : (data as HeartbeatRpcRow | null);

  if (!row) {
    throw new Error("listen_stats_heartbeat_failed");
  }

  return toListenStatsOwnState({
    realListenedMs: parseMs(row.real_listened_ms),
    ratingEligibleAt: row.rating_eligible_at,
  });
}

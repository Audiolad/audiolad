import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { PlaybackUsagePhase } from "@/lib/listen/playback-usage";

type UsageRpcRow = {
  accepted_ms: number | string;
  duplicate: boolean;
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

export async function applyPlaybackUsageHeartbeat(input: {
  clientEventId: string;
  listeningKey: string;
  userId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  practiceId: string;
  audioItemId: string;
  positionMs: number;
  clientMediaDeltaMs: number | null;
  playbackRate: number | null;
  phase: PlaybackUsagePhase;
}): Promise<{ acceptedMs: number; duplicate: boolean }> {
  const writer = createServiceRoleClient();
  const { data, error } = await writer.rpc("apply_playback_usage_heartbeat", {
    p_client_event_id: input.clientEventId,
    p_listening_key: input.listeningKey,
    p_user_id: input.userId,
    p_anonymous_id: input.anonymousId,
    p_session_id: input.sessionId,
    p_practice_id: input.practiceId,
    p_audio_item_id: input.audioItemId,
    p_position_ms: Math.max(0, Math.floor(input.positionMs)),
    p_client_media_delta_ms: input.clientMediaDeltaMs,
    p_playback_rate: input.playbackRate,
    p_phase: input.phase,
  });

  if (error) {
    throw new Error("playback_usage_heartbeat_failed");
  }

  const row = Array.isArray(data)
    ? (data[0] as UsageRpcRow | undefined)
    : (data as UsageRpcRow | null);

  if (!row) {
    throw new Error("playback_usage_heartbeat_failed");
  }

  return {
    acceptedMs: parseMs(row.accepted_ms),
    duplicate: row.duplicate === true,
  };
}

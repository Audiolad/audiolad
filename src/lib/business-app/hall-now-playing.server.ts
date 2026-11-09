import "server-only";

import { HALL_MIRROR_FRESH_SECONDS, hallQueueAheadCount, type HallNowPlaying } from "@/lib/business-app/hall-mirror";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Owner mirror read (t1283u). The caller must already have checked the location with the
 * owner's own RLS client (route `hall-now`). Null: no live hall device for the location, or the
 * tables are not migrated / unavailable – the owner keeps the local preview player then.
 */
export async function loadHallNowPlaying(input: { organizationId: string; locationId: string }, nowMs = Date.now()): Promise<HallNowPlaying | null> {
  try {
    const service = createServiceRoleClient();
    const { data: session, error: sessionError } = await service
      .from("business_point_sessions")
      .select("player_id, last_seen_at")
      .eq("organization_id", input.organizationId)
      .eq("location_id", input.locationId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError || !session?.player_id) return null;
    const seenAt = Date.parse(String(session.last_seen_at));
    if (!Number.isFinite(seenAt) || nowMs - seenAt > HALL_MIRROR_FRESH_SECONDS * 1000) return null;
    const { data: state, error: stateError } = await service
      .from("business_player_playback_state")
      .select("playback_state, audio_item_id, reported_at")
      .eq("player_id", session.player_id)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (stateError || !state) return null;
    const playbackState = state.playback_state;
    if (playbackState !== "playing" && playbackState !== "paused" && playbackState !== "stopped" && playbackState !== "error") return null;
    const audioItemId = typeof state.audio_item_id === "string" ? state.audio_item_id : null;
    const columns = "audio_item_id, position_ms, duration_ms, queue_audio_item_ids, reported_at";
    const readSnapshot = (select: string) => service
      .from("business_player_now_playing")
      .select(select)
      .eq("player_id", session.player_id)
      .eq("location_id", input.locationId)
      .maybeSingle();
    // queue_ahead_count is optional on older schemas; fall back to the preview ids alone.
    let snapshot = await readSnapshot(`${columns}, queue_ahead_count`);
    if (snapshot.error?.code === "42703" || snapshot.error?.code === "PGRST204") {
      snapshot = await readSnapshot(columns);
    }
    const now = snapshot.data as Record<string, unknown> | null;
    const sameTrack = !!now && now.audio_item_id === audioItemId;
    const reportedAt = Date.parse(String(sameTrack ? now.reported_at : state.reported_at));
    const queue = sameTrack && Array.isArray(now.queue_audio_item_ids)
      ? now.queue_audio_item_ids.filter((id: unknown): id is string => typeof id === "string") : [];
    return {
      state: playbackState,
      audioItemId,
      positionSec: sameTrack && typeof now.position_ms === "number" ? now.position_ms / 1000 : 0,
      durationSec: sameTrack && typeof now.duration_ms === "number" ? now.duration_ms / 1000 : null,
      queue,
      aheadCount: sameTrack ? hallQueueAheadCount(now.queue_ahead_count, queue.length) : 0,
      ageSec: Number.isFinite(reportedAt) ? Math.max(0, (nowMs - reportedAt) / 1000) : 0,
    };
  } catch {
    return null;
  }
}

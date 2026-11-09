import "server-only";

import {
  BUSINESS_LIVE_CONNECTIVITY_SECONDS,
  isPlaybackReportCurrent,
} from "@/lib/business-app/owner-home-signals";
import { deriveVenueStatusDot, type VenueStatusDotRow } from "@/lib/business-app/venue-status-dot";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type SessionRow = { location_id: string; player_id: string; last_seen_at: string };
type PlaybackRow = { player_id: string; playback_state: string; reported_at: string | null };

function asPlaybackState(value: unknown): "playing" | "paused" | "stopped" | "error" | null {
  return value === "playing" || value === "paused" || value === "stopped" || value === "error" ? value : null;
}

/**
 * Lightweight per-venue status for owner home dots (t1309u).
 * Caller must already have checked the owner can read the organization (RLS on locations).
 * No migration: reads business_point_sessions + business_player_playback_state only.
 * accessLive is left true here; the client overlays ended access from chrome.
 */
export async function loadVenueStatusDots(input: {
  organizationId: string;
  locationIds: readonly string[];
  nowMs?: number;
}): Promise<VenueStatusDotRow[]> {
  const locationIds = [...new Set(input.locationIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (locationIds.length === 0) return [];
  const nowMs = input.nowMs ?? Date.now();

  try {
    const service = createServiceRoleClient();
    const { data: sessions, error: sessionError } = await service
      .from("business_point_sessions")
      .select("location_id, player_id, last_seen_at")
      .eq("organization_id", input.organizationId)
      .in("location_id", locationIds)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });
    if (sessionError) {
      return locationIds.map((locationId) => ({
        locationId,
        ...deriveVenueStatusDot({ linked: false, secondsSinceSeen: null, playbackState: null, accessLive: true }),
      }));
    }

    const bestByLocation = new Map<string, SessionRow>();
    for (const raw of sessions ?? []) {
      const row = raw as SessionRow;
      if (!row?.location_id || !row.player_id) continue;
      if (!bestByLocation.has(row.location_id)) bestByLocation.set(row.location_id, row);
    }

    const playerIds = [...new Set([...bestByLocation.values()].map((s) => s.player_id))];
    const playbackByPlayer = new Map<string, PlaybackRow>();
    if (playerIds.length > 0) {
      const { data: states } = await service
        .from("business_player_playback_state")
        .select("player_id, playback_state, reported_at")
        .eq("organization_id", input.organizationId)
        .in("player_id", playerIds);
      for (const raw of states ?? []) {
        const row = raw as PlaybackRow;
        if (row?.player_id) playbackByPlayer.set(row.player_id, row);
      }
    }

    return locationIds.map((locationId) => {
      const session = bestByLocation.get(locationId);
      if (!session) {
        return {
          locationId,
          ...deriveVenueStatusDot({ linked: false, secondsSinceSeen: null, playbackState: null, accessLive: true }),
        };
      }
      const seenAt = Date.parse(String(session.last_seen_at));
      const secondsSinceSeen = Number.isFinite(seenAt) ? Math.max(0, (nowMs - seenAt) / 1000) : null;
      const playback = playbackByPlayer.get(session.player_id);
      const rawState = asPlaybackState(playback?.playback_state);
      const reportedAt = Date.parse(String(playback?.reported_at ?? ""));
      const reportedAgeSeconds = Number.isFinite(reportedAt) ? Math.max(0, (nowMs - reportedAt) / 1000) : null;
      const heartbeatFresh = secondsSinceSeen != null && secondsSinceSeen <= BUSINESS_LIVE_CONNECTIVITY_SECONDS;
      // Same rule as mapOwnerLiveState (isPlaybackReportCurrent): green/playing needs a fresh
      // reported_at – a heartbeat that only refreshes last_seen_at is not proof of sound.
      // errorNeedsFreshReport: overnight stale error must not stay red while the phone is online.
      const reportCurrent = isPlaybackReportCurrent({
        playbackState: rawState,
        reportedAgeSeconds,
        heartbeatFresh,
        freshSeconds: BUSINESS_LIVE_CONNECTIVITY_SECONDS,
        errorNeedsFreshReport: true,
      });
      const playbackState = reportCurrent ? rawState : null;
      // Device offline window for the circle itself stays HALL_MIRROR_FRESH_SECONDS via derive.
      return {
        locationId,
        ...deriveVenueStatusDot({
          linked: true,
          secondsSinceSeen,
          playbackState,
          accessLive: true,
        }),
      };
    });
  } catch {
    return locationIds.map((locationId) => ({
      locationId,
      ...deriveVenueStatusDot({ linked: false, secondsSinceSeen: null, playbackState: null, accessLive: true }),
    }));
  }
}

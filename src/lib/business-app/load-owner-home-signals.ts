import {
  deriveBusinessPointState,
  emptyBusinessOwnerHomeSignals,
  mapHealthRpcRows,
  mapOwnerLiveState,
  type BusinessOwnerHomeSignals,
} from "@/lib/business-app/owner-home-signals";
import { displayWorkspaceTrackTitle } from "@/lib/business-workspace/display-title";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function resolveDisplayedLiveTitle(organizationId: string, rpcTitle: string | null): Promise<string | null> {
  const ready = rpcTitle ? displayWorkspaceTrackTitle({ title: rpcTitle }) : null;
  if (ready && rpcTitle && ready === rpcTitle.trim()) return ready;
  try {
    const service = createServiceRoleClient();
    const { data: state } = await service
      .from("business_player_playback_state")
      .select("audio_item_id")
      .eq("organization_id", organizationId)
      .eq("playback_state", "playing")
      .order("reported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const audioItemId = state?.audio_item_id as string | undefined;
    if (!audioItemId) return ready;
    const { data: audio } = await service
      .from("audio_items")
      .select("title, practices(title)")
      .eq("id", audioItemId)
      .maybeSingle();
    const practice = Array.isArray(audio?.practices) ? audio.practices[0] : audio?.practices;
    const practiceTitle = practice && typeof practice.title === "string" ? practice.title : null;
    return displayWorkspaceTrackTitle({
      title: typeof audio?.title === "string" ? audio.title : (rpcTitle ?? ""),
      albumTitle: practiceTitle,
      practiceTitle,
    });
  } catch {
    return ready;
  }
}

/**
 * Authenticated member read: A2 health RPC + latest business PoP timestamp.
 * Fail-closed to stopped/empty on errors (no mock healthy).
 */
export async function loadBusinessOwnerHomeSignals(input: {
  organizationId: string;
  locationId: string | null;
  userId: string;
}): Promise<BusinessOwnerHomeSignals> {
  const supabase = await createClient();

  const { data: healthData, error: healthError } = await supabase.rpc(
    "get_business_player_health",
    { p_organization_id: input.organizationId },
  );

  if (healthError) {
    return emptyBusinessOwnerHomeSignals();
  }

  const players = mapHealthRpcRows(healthData);
  let live = mapOwnerLiveState(null, input.organizationId);
  // User RPC enforces the existing owner membership predicate and track eligibility.
  // Missing migration, permission errors and network failures remain neutral.
  if (input.locationId) {
    try {
      const { data, error } = await supabase.rpc("get_business_owner_player_live_state", {
        p_location_id: input.locationId,
      });
      if (!error) {
        live = mapOwnerLiveState(data, input.organizationId);
        if (live.playbackState === "playing") {
          const title = await resolveDisplayedLiveTitle(input.organizationId, live.currentTrack?.title ?? null);
          live = { ...live, currentTrack: title ? { title } : null };
        }
      }
    } catch { /* Not migrated yet or temporarily unavailable. */ }
  }

  let lastBusinessPlayAt: string | null = null;
  try {
    const { data: membership, error: membershipError } = await supabase
      .from("business_organization_members")
      .select("organization_id")
      .eq("user_id", input.userId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (!membershipError && membership?.organization_id) {
      const service = createServiceRoleClient();
      let query = service
        .from("playback_usage_facts")
        .select("occurred_at")
        .eq("usage_kind", "business")
        .eq("organization_id", input.organizationId)
        .order("occurred_at", { ascending: false })
        .limit(1);
      if (input.locationId) {
        query = query.eq("location_id", input.locationId);
      }
      const { data: fact, error: factError } = await query.maybeSingle();
      if (!factError && fact?.occurred_at) {
        lastBusinessPlayAt = String(fact.occurred_at);
      }
    }
  } catch {
    lastBusinessPlayAt = null;
  }

  const derived = deriveBusinessPointState({
    players,
    locationId: input.locationId,
    lastBusinessPlayAt,
  });

  return {
    pointState: derived.pointState,
    playerCount: players.length,
    primaryHealthStatus: derived.primaryHealthStatus,
    secondsSinceHeartbeat: derived.secondsSinceHeartbeat,
    stoppedMinutes: derived.stoppedMinutes,
    lastBusinessPlayAt,
    lastPlayMinutesAgo: derived.lastPlayMinutesAgo,
    ...live,
    source: "player_health",
  };
}

import {
  deriveBusinessPointState,
  emptyBusinessOwnerHomeSignals,
  mapHealthRpcRows,
  type BusinessOwnerHomeSignals,
} from "@/lib/business-app/owner-home-signals";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
    source: "player_health",
  };
}

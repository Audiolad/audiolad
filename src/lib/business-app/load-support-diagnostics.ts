import {
  anonymousSupportDiagnostics,
  buildSupportDiagnostics,
  mapSupportHealthRpcRows,
  type BusinessSupportDiagnostics,
  type BusinessSupportLastPlay,
} from "@/lib/business-app/support-diagnostics";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Authenticated member read for P1-07 Support diagnostic view.
 * Reuses A1 domain + A2 get_business_player_health + latest business PoP.
 * Fail-closed; never invents rights grants or catalog eligibility.
 */
export async function loadBusinessSupportDiagnostics(): Promise<BusinessSupportDiagnostics> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return anonymousSupportDiagnostics();
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.organization_id) {
    return buildSupportDiagnostics({
      hasUser: true,
      organizationId: null,
      organizationName: null,
      location: null,
      players: [],
      lastPlay: null,
    });
  }

  const organizationId = membership.organization_id as string;

  const { data: org } = await supabase
    .from("business_organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();

  const { data: location } = await supabase
    .from("business_locations")
    .select(
      "id, organization_id, name, business_category, country_code, timezone, status",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let defaultZoneId: string | null = null;
  if (location?.id) {
    const { data: zone } = await supabase
      .from("business_zones")
      .select("id")
      .eq("location_id", location.id)
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    defaultZoneId = zone?.id ?? null;
  }

  let players = [] as ReturnType<typeof mapSupportHealthRpcRows>;
  const { data: healthData, error: healthError } = await supabase.rpc(
    "get_business_player_health",
    { p_organization_id: organizationId },
  );
  if (!healthError) {
    players = mapSupportHealthRpcRows(healthData);
  }

  let lastPlay: BusinessSupportLastPlay | null = null;
  try {
    const service = createServiceRoleClient();
    let query = service
      .from("playback_usage_facts")
      .select("occurred_at, audio_item_id, player_id, location_id")
      .eq("usage_kind", "business")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (location?.id) {
      query = query.eq("location_id", location.id);
    }
    const { data: fact, error: factError } = await query.maybeSingle();
    if (!factError && fact?.occurred_at) {
      const occurredAt = String(fact.occurred_at);
      const t = Date.parse(occurredAt);
      lastPlay = {
        occurredAt,
        audioItemId:
          typeof fact.audio_item_id === "string" ? fact.audio_item_id : null,
        playerId: typeof fact.player_id === "string" ? fact.player_id : null,
        locationId:
          typeof fact.location_id === "string" ? fact.location_id : null,
        minutesAgo: Number.isFinite(t)
          ? Math.max(0, Math.floor((Date.now() - t) / 60_000))
          : null,
      };
    }
  } catch {
    lastPlay = null;
  }

  return buildSupportDiagnostics({
    hasUser: true,
    organizationId,
    organizationName: org?.name ?? null,
    location: location
      ? {
          id: location.id,
          name: location.name,
          timezone: location.timezone,
          countryCode: location.country_code,
          status: location.status,
          defaultZoneId,
        }
      : null,
    players,
    lastPlay,
  });
}

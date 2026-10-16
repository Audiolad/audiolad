import {
  buildPlaybackReport,
  clampWindowMinutes,
  isValidTimeZone,
  venueLocalToUtc,
  type PlaybackFactRow,
  type PlaybackReport,
} from "@/lib/business-app/client-documents";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PlaybackReportResult =
  | { kind: "anonymous" }
  | { kind: "no_location" }
  | { kind: "idle"; locationName: string; timezone: string }
  | { kind: "invalid_time"; locationName: string; timezone: string }
  | { kind: "error"; locationName: string; timezone: string }
  | { kind: "ok"; locationName: string; report: PlaybackReport };

const MAX_FACTS = 2000;

/**
 * Read-only. Membership is checked with the user's session (RLS); facts are
 * then read with the service role strictly scoped to that organization and
 * location, usage_kind = 'business'. Same pattern as load-support-diagnostics.
 */
export async function loadPlaybackReport(params: {
  at?: string;
  windowMinutes?: string;
}): Promise<PlaybackReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anonymous" };

  const { data: membership } = await supabase
    .from("business_organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership?.organization_id) return { kind: "no_location" };
  const organizationId = membership.organization_id as string;

  const { data: location } = await supabase
    .from("business_locations")
    .select("id, name, timezone")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!location?.id) return { kind: "no_location" };

  const locationName = String(location.name ?? "Точка");
  const timezone = isValidTimeZone(location.timezone)
    ? (location.timezone as string)
    : "Europe/Moscow";

  if (!params.at) return { kind: "idle", locationName, timezone };
  const at = venueLocalToUtc(params.at, timezone);
  if (!at) return { kind: "invalid_time", locationName, timezone };

  const windowMinutes = clampWindowMinutes(params.windowMinutes);
  const from = new Date(at.getTime() - windowMinutes * 60_000).toISOString();
  const to = new Date(at.getTime() + windowMinutes * 60_000).toISOString();

  try {
    const service = createServiceRoleClient();
    const { data: facts, error } = await service
      .from("playback_usage_facts")
      .select("occurred_at, audio_item_id, location_id, player_id, listened_ms")
      .eq("usage_kind", "business")
      .eq("organization_id", organizationId)
      .eq("location_id", location.id)
      .gte("occurred_at", from)
      .lte("occurred_at", to)
      .order("occurred_at", { ascending: true })
      .limit(MAX_FACTS);
    if (error) return { kind: "error", locationName, timezone };

    const rows = (facts ?? []) as PlaybackFactRow[];
    const ids = [
      ...new Set(rows.map((r) => r.audio_item_id).filter((x): x is string => !!x)),
    ];
    const titles = new Map<string, string>();
    if (ids.length > 0) {
      const { data: items } = await service
        .from("audio_items")
        .select("id, title")
        .in("id", ids);
      for (const it of items ?? []) {
        if (typeof it.id === "string" && typeof it.title === "string") {
          titles.set(it.id, it.title);
        }
      }
    }
    return {
      kind: "ok",
      locationName,
      report: buildPlaybackReport({ at, windowMinutes, timezone, facts: rows, titles }),
    };
  } catch {
    return { kind: "error", locationName, timezone };
  }
}

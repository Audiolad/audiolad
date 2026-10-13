import "server-only";

import { resolveMusicListenSource } from "@/lib/listen/music-delivery";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Business SPA pilot (0e05333f): server context for the allowlisted owner page.
 * Visibility = has_business_pilot_access (org member AND enabled allowlist row).
 * Rights are never decided here: the only track source is
 * business_spa_program_manifest (ELIGIBLE only) called as the user.
 */

export type SpaPilotContext = {
  userId: string;
  organizationId: string;
  programId: string;
  programName: string;
  locationId: string;
  zoneId: string | null;
  playerId: string | null;
};

export const SPA_SIGNED_URL_TTL_SECONDS = 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** null = not logged in or not on the pilot allowlist (page must look absent). */
export async function loadSpaPilotContext(): Promise<SpaPilotContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS returns only the caller's own enabled rows where has_business_pilot_access holds.
  const { data: allow } = await supabase
    .from("business_pilot_allowlist")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (!allow?.organization_id) return null;
  const orgId = allow.organization_id as string;

  const { data: program } = await supabase
    .from("business_programs")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("kind", "spa")
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!program) return null;

  // Topology lookups are org-scoped; service role used only after the access gate above.
  const db = createServiceRoleClient();
  const { data: location } = await db
    .from("business_locations")
    .select("id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!location) return null;

  const { data: zones } = await db.from("business_zones").select("id").eq("location_id", location.id);
  const zoneIds = (zones ?? []).map((z) => z.id as string);
  let zoneId: string | null = null;
  let playerId: string | null = null;
  if (zoneIds.length > 0) {
    const { data: assignment } = await db
      .from("business_player_assignments")
      .select("player_id, zone_id, business_players!inner(organization_id)")
      .in("zone_id", zoneIds)
      .is("unassigned_at", null)
      .eq("business_players.organization_id", orgId)
      .limit(1)
      .maybeSingle();
    if (assignment) {
      zoneId = assignment.zone_id as string;
      playerId = assignment.player_id as string;
    } else {
      zoneId = zoneIds[0];
    }
  }

  return {
    userId: user.id,
    organizationId: orgId,
    programId: program.id as string,
    programName: program.name as string,
    locationId: location.id as string,
    zoneId,
    playerId,
  };
}

/** Raw manifest JSON, fetched as the user (the RPC re-checks pilot access). */
export async function fetchSpaManifestRaw(ctx: SpaPilotContext): Promise<unknown> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_spa_program_manifest", {
    p_program_id: ctx.programId,
    p_location_id: ctx.locationId,
  });
  if (error) throw new Error("business_spa_manifest_failed");
  return data;
}

/** Signed URL for a track that is in the current ELIGIBLE manifest; anything else is refused. */
export async function signSpaTrack(ctx: SpaPilotContext, audioItemId: string): Promise<string> {
  const raw = (await fetchSpaManifestRaw(ctx)) as { items?: { audio_item_id?: string }[] } | null;
  const allowed = (raw?.items ?? []).some((i) => i.audio_item_id === audioItemId);
  if (!allowed) throw new Error("business_spa_track_not_in_manifest");

  const db = createServiceRoleClient();
  const { data: item } = await db
    .from("audio_items")
    .select("id, audio_path, active_music_delivery_asset_id")
    .eq("id", audioItemId)
    .maybeSingle();
  if (!item) throw new Error("business_spa_track_missing");

  let activeStream = null;
  if (item.active_music_delivery_asset_id) {
    const { data: asset } = await db
      .from("music_audio_assets")
      .select("audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
      .eq("id", item.active_music_delivery_asset_id)
      .maybeSingle();
    if (asset) {
      activeStream = {
        audioItemId: asset.audio_item_id as string,
        assetRole: asset.asset_role as string,
        lifecycleState: asset.lifecycle_state as string,
        storageBucket: asset.storage_bucket as string,
        storagePath: asset.storage_path as string,
      };
    }
  }
  const source = resolveMusicListenSource({
    productKind: "music",
    audioItemId,
    audioPath: item.audio_path as string | null,
    activeStream,
  });
  if (source.kind === "missing") throw new Error("business_spa_audio_missing");
  const { data: signed, error } = await db.storage.from(source.bucket).createSignedUrl(source.path, SPA_SIGNED_URL_TTL_SECONDS);
  const url = signed?.signedUrl ? normalizeStorageSignedUrl(signed.signedUrl) : null;
  if (error || !url) throw new Error("business_spa_sign_failed");
  return url;
}

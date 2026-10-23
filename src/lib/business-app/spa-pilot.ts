import "server-only";

import { resolveMusicListenSource } from "@/lib/listen/music-delivery";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { parseSpaManifest } from "./spa-manifest";
import { spaSignedUrlTtlSeconds } from "./spa-player-core";
import { BUSINESS_VENUE_PROGRAM_KINDS, pickVenueProgram, type VenueProgramCandidate } from "./venue-programs";

/**
 * Business SPA pilot (0e05333f): server context for the allowlisted owner page.
 * Program kinds: spa and cafe (venue-programs.ts); the venue category picks the kind.
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
    // Same deterministic choice as business_spa_session_player() in the DB.
    .order("organization_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!allow?.organization_id) return null;
  const orgId = allow.organization_id as string;

  // Spa and cafe programs (RLS: org members only). Final choice needs the venue category.
  const { data: programs } = await supabase
    .from("business_programs")
    .select("id, name, kind, created_at")
    .eq("organization_id", orgId)
    .in("kind", [...BUSINESS_VENUE_PROGRAM_KINDS])
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(20);
  if (!programs || programs.length === 0) return null;

  // Topology lookups are org-scoped; service role used only after the access gate above.
  const db = createServiceRoleClient();
  const { data: location } = await db
    .from("business_locations")
    .select("id, business_category")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!location) return null;

  const program = pickVenueProgram(programs as VenueProgramCandidate[], location.business_category as string | null);
  if (!program) return null;

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
      .eq("business_players.status", "active")
      .lte("assigned_at", new Date().toISOString())
      .order("assigned_at", { ascending: false })
      .order("player_id", { ascending: true })
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

export type SpaSignedTrack = { url: string; expiresAt: string; offlineCacheUntil: string | null };

/**
 * Signed URL for a track in the CURRENT ELIGIBLE manifest. TTL never outlives
 * playable_until / manifest expiry. purpose "offline" additionally requires a live
 * offline permission and bounds the TTL by offline_cache_until (review 2026-10-13).
 */
export async function signSpaTrack(
  ctx: SpaPilotContext,
  audioItemId: string,
  purpose: "stream" | "offline" = "stream",
): Promise<SpaSignedTrack> {
  const manifest = parseSpaManifest(await fetchSpaManifestRaw(ctx));
  const item = manifest.items.find((i) => i.audioItemId === audioItemId);
  if (!item) throw new Error("business_spa_track_not_in_manifest");
  const now = new Date();
  if (purpose === "offline" && !item.offlineAllowed) throw new Error("business_spa_offline_not_allowed");
  const ttl = spaSignedUrlTtlSeconds(
    {
      playableUntil: item.playableUntil,
      manifestExpiresAt: manifest.expiresAt,
      ...(purpose === "offline" ? { offlineCacheUntil: item.offlineCacheUntil } : {}),
    },
    now,
  );
  if (ttl <= 0) throw new Error("business_spa_track_expired");

  const db = createServiceRoleClient();
  const { data: row } = await db
    .from("audio_items")
    .select("id, audio_path, active_music_delivery_asset_id")
    .eq("id", audioItemId)
    .maybeSingle();
  if (!row) throw new Error("business_spa_track_missing");

  let activeStream = null;
  if (row.active_music_delivery_asset_id) {
    const { data: asset } = await db
      .from("music_audio_assets")
      .select("audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
      .eq("id", row.active_music_delivery_asset_id)
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
    audioPath: row.audio_path as string | null,
    activeStream,
  });
  if (source.kind === "missing") throw new Error("business_spa_audio_missing");
  const { data: signed, error } = await db.storage.from(source.bucket).createSignedUrl(source.path, ttl);
  const url = signed?.signedUrl ? normalizeStorageSignedUrl(signed.signedUrl) : null;
  if (error || !url) throw new Error("business_spa_sign_failed");
  return {
    url,
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    offlineCacheUntil: purpose === "offline" && item.offlineCacheUntil ? item.offlineCacheUntil.toISOString() : null,
  };
}

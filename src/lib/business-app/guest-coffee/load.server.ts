import "server-only";

import { businessGuestCoffeeCoverUrl, isBusinessPrivateCoverRef } from "@/lib/business-covers/private-cover";
import { loadCollectionCatalog } from "@/lib/business-collections/load.server";
import { soundAllowedTrackIds } from "@/lib/business/track-sound-review.server";
import { signWorkspaceAudio } from "@/lib/business-workspace/sign.server";
import { resolvePlayableAudioItemRows } from "@/lib/listen/validated-active-music-delivery";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { GuestCoffeePlaylist } from "./catalog";
import { buildGuestCoffeeClosedShelf, buildGuestCoffeePreview, type GuestCoffeeClosedAlbum, type GuestCoffeePreview } from "./closed-preview";
import { loadGuestCoffeeRecommendationPlan } from "./passport.server";
import { GUEST_COFFEE_BUSINESS_DIRECTION_KEY } from "./shelf";

/**
 * t1670u (Sergey 24.11.2026): the guest coffee preview plays the CLOSED catalogue «АудиоЛад
 * Кофейня». Source of truth: the existing venue-less closed-catalogue pool
 * business_personal_collection_tracks(NULL) (personal-collection preview) – business-only
 * albums, published, not deleted, approved Business passport, café sound gate (direction
 * admission included) and no blocking moderator review (blocked / proof_requested). Public
 * catalogue albums are no longer used here. Venue-specific commercial eligibility stays in the
 * cabinet, like for the personal-collection preview.
 *
 * Closed rows are invisible to anon/authenticated by RLS, so this module reads them with the
 * service role on the server only. The browser receives only the albums / tracks used by the 64
 * preset atmospheres (titles, durations, ids – no storage paths, no URLs) and the stream-URL
 * route signs only those tracks (short-lived, the same signer as the hall player), after a
 * fresh re-check against the same pool and under the 30-minute guest limit.
 */

const CACHE_MS = 5 * 60 * 1000;
const ID_CHUNK = 80;
let cache: { at: number; value: Promise<GuestCoffeePreview> } | null = null;

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

type ClosedPracticeRow = {
  id: string;
  business_only: boolean | null;
  business_has_vocals: boolean | null;
  authors?: { name?: string | null } | { name?: string | null }[] | null;
};

type ClosedAudioRow = {
  id: string;
  practice_id: string | null;
  audio_path: string | null;
  active_music_delivery_asset_id: string | null;
};

function embeddedName(value: ClosedPracticeRow["authors"]): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name?.trim() || null;
}

/** Closed albums of the guest preview with their pool tracks that have playable audio. */
async function loadClosedAlbums(db: ServiceDb): Promise<GuestCoffeeClosedAlbum[]> {
  // Ordered by album title, album, track position (SQL). Throws on error = empty preview.
  const pool = await loadCollectionCatalog(null);
  if (pool.length === 0) return [];
  const albumIds = [...new Set(pool.map((row) => row.album_id))];
  const practices = new Map<string, ClosedPracticeRow>();
  for (let i = 0; i < albumIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("practices")
      .select("id, business_only, business_has_vocals, authors!practices_author_id_fkey(name)")
      .eq("business_only", true)
      .in("id", albumIds.slice(i, i + ID_CHUNK));
    if (error || !Array.isArray(data)) throw new Error("guest_coffee_closed_albums_unavailable");
    for (const row of data as ClosedPracticeRow[]) if (row.business_only === true) practices.set(row.id, row);
  }
  const trackIds = pool.map((row) => row.audio_item_id);
  const audio: ClosedAudioRow[] = [];
  for (let i = 0; i < trackIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("audio_items")
      .select("id, practice_id, audio_path, active_music_delivery_asset_id")
      .in("id", trackIds.slice(i, i + ID_CHUNK));
    if (error || !Array.isArray(data)) throw new Error("guest_coffee_closed_tracks_unavailable");
    audio.push(...(data as ClosedAudioRow[]));
  }
  const playable = new Set<string>();
  for (let i = 0; i < audio.length; i += ID_CHUNK) {
    for (const row of await resolvePlayableAudioItemRows(audio.slice(i, i + ID_CHUNK), "music", { serviceRole: db })) playable.add(row.id);
  }

  const albums = new Map<string, GuestCoffeeClosedAlbum>();
  for (const row of pool) {
    const practice = practices.get(row.album_id);
    const title = row.title?.trim();
    if (!practice || !title || !playable.has(row.audio_item_id)) continue;
    let album = albums.get(row.album_id);
    if (!album) {
      album = {
        id: row.album_id,
        title: row.album_title?.trim() || "",
        authorName: embeddedName(practice.authors),
        hasVocals: practice.business_has_vocals === true,
        coverUrl: isBusinessPrivateCoverRef(row.cover_ref) ? businessGuestCoffeeCoverUrl(row.album_id) : null,
        tracks: [],
      };
      albums.set(row.album_id, album);
    }
    const duration = Number(row.duration_seconds);
    album.tracks.push({ audioItemId: row.audio_item_id, title, durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null });
  }
  return [...albums.values()].filter((album) => album.title && album.tracks.length > 0);
}

async function loadUncached(): Promise<GuestCoffeePreview> {
  const db = createServiceRoleClient();
  const shelf = buildGuestCoffeeClosedShelf(await loadClosedAlbums(db));
  if (shelf.length === 0) return { playlists: [], presets: {} };
  const plan = await loadGuestCoffeeRecommendationPlan(shelf);
  const preview = buildGuestCoffeePreview(shelf, plan);
  const tracks = preview.playlists.reduce((sum, p) => sum + p.tracks.length, 0);
  console.info(`[business-guest-coffee] closed preview albums=${preview.playlists.length}/${shelf.length} tracks=${tracks} presets=${Object.keys(preview.presets).length}`);
  return preview;
}

/**
 * The guest coffee preview (closed catalogue): trimmed playlists + the 64 preset atmospheres.
 * Short process cache (5 min) shared by the page, the stream-URL and the cover routes; an empty
 * result is not cached so a transient failure heals on the next request.
 */
export async function loadGuestCoffeePreview(): Promise<GuestCoffeePreview> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const value = loadUncached().catch((error) => {
    console.error("[business-guest-coffee] closed preview unavailable", error instanceof Error ? error.message : "unknown");
    return { playlists: [], presets: {} } as GuestCoffeePreview;
  });
  cache = { at: now, value };
  const result = await value;
  if (result.playlists.length === 0) cache = null;
  return result;
}

/** Signing allow-list of the guest stream-URL route: only tracks of the current preview. */
export async function loadGuestCoffeeShelf(): Promise<GuestCoffeePlaylist[]> {
  return (await loadGuestCoffeePreview()).playlists;
}

/**
 * Called by the stream-URL route immediately before signing (uncached, fails closed): THIS track
 * of THIS closed album is still in the venue-less closed-catalogue pool (published, approved
 * passport, sound gate, no blocking moderator review).
 */
export async function isGuestCoffeeClosedTrackStillLive(playlist: GuestCoffeePlaylist, audioItemId: string): Promise<boolean> {
  if (playlist.closed !== true) return false;
  try {
    const rows = await loadCollectionCatalog(null, audioItemId);
    return rows.some((row) => row.audio_item_id === audioItemId && row.album_id === playlist.id);
  } catch {
    return false;
  }
}

/**
 * Called by the stream-URL route immediately before signing (uncached): the track is still
 * admitted to AudioLad Business for cafés by the sound gate. Fails closed.
 */
export async function isGuestCoffeeTrackStillAdmitted(audioItemId: string): Promise<boolean> {
  try {
    return (await soundAllowedTrackIds([audioItemId], GUEST_COFFEE_BUSINESS_DIRECTION_KEY)).has(audioItemId);
  } catch {
    return false;
  }
}

/** Short-lived stream URL of one preview track – the hall player's signer (same TTL, no venue). */
export async function signGuestCoffeeClosedAudio(audioItemId: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const signed = await signWorkspaceAudio(audioItemId, new Set([audioItemId]), null);
  if (signed.ok) return signed;
  return { ok: false, reason: signed.reason === "not_in_manifest" ? "not_found" : signed.reason };
}

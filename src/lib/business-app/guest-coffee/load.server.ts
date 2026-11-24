import "server-only";

import { businessGuestCoffeeCoverUrl, isBusinessPrivateCoverRef } from "@/lib/business-covers/private-cover";
import { soundAllowedTrackIds } from "@/lib/business/track-sound-review.server";
import { signWorkspaceAudio } from "@/lib/business-workspace/sign.server";
import { resolvePlayableAudioItemRows } from "@/lib/listen/validated-active-music-delivery";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { GuestCoffeePlaylist, GuestCoffeeTrack } from "./catalog";
import { buildGuestCoffeeClosedShelf, buildGuestCoffeePreview, type GuestCoffeeClosedAlbum, type GuestCoffeePreview } from "./closed-preview";
import { loadGuestCoffeeRecommendationPlan } from "./passport.server";
import { GUEST_COFFEE_BUSINESS_DIRECTION_KEY } from "./shelf";

/**
 * t1670u (Sergey 24.11.2026): the guest coffee preview plays the CLOSED catalogue «АудиоЛад
 * Кофейня» – the same music source as the halls: business-only albums (published, not deleted)
 * admitted for cafés (business_content_admissions), only tracks with an APPROVED Business
 * passport, published and playable audio, and the fresh per-track café sound gate
 * (business_sound_allowed_tracks). Public catalogue albums are no longer used here.
 *
 * Closed rows are invisible to anon/authenticated by RLS, so this module reads them with the
 * service role on the server only. The browser receives only the albums / tracks used by the 64
 * preset atmospheres (titles, durations, ids – no storage paths, no URLs) and the stream-URL
 * route signs only those tracks (short-lived, the same signer as the hall player), after a
 * fresh re-check and under the 30-minute guest limit.
 */

const CACHE_MS = 5 * 60 * 1000;
const ID_CHUNK = 80;
let cache: { at: number; value: Promise<GuestCoffeePreview> } | null = null;

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

type ClosedPracticeRow = {
  id: string;
  title: string | null;
  author_id: string | null;
  business_only: boolean | null;
  business_has_vocals: boolean | null;
  cover_url: string | null;
  authors?: { name?: string | null } | { name?: string | null }[] | null;
};

type ClosedAudioRow = {
  id: string;
  practice_id: string | null;
  title: string | null;
  duration_seconds: number | null;
  position: number | null;
  status: string | null;
  audio_path: string | null;
  active_music_delivery_asset_id: string | null;
};

type AdmissionRow = { author_id: string | null; practice_id: string | null };

/** Allowed café admissions (artists / albums) – the same table the halls' candidate albums use. */
async function loadCafeAdmissions(db: ServiceDb): Promise<{ authorIds: Set<string>; practiceIds: Set<string> }> {
  const { data, error } = await db
    .from("business_content_admissions")
    .select("author_id, practice_id")
    .eq("direction_key", GUEST_COFFEE_BUSINESS_DIRECTION_KEY)
    .eq("allowed", true);
  if (error || !Array.isArray(data)) throw new Error("guest_coffee_admissions_unavailable");
  const rows = data as AdmissionRow[];
  return {
    authorIds: new Set(rows.flatMap((r) => (r.author_id ? [r.author_id] : []))),
    practiceIds: new Set(rows.flatMap((r) => (r.practice_id ? [r.practice_id] : []))),
  };
}

function embeddedName(value: ClosedPracticeRow["authors"]): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name?.trim() || null;
}

/** Approved Business passports of the given closed albums (audio item ids). */
async function loadApprovedPassportIds(db: ServiceDb, practiceIds: readonly string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let i = 0; i < practiceIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("business_track_passports")
      .select("audio_item_id")
      .in("practice_id", practiceIds.slice(i, i + ID_CHUNK))
      .eq("status", "approved")
      .range(0, 4999);
    if (error || !Array.isArray(data)) throw new Error("guest_coffee_passports_unavailable");
    for (const row of data as { audio_item_id: string }[]) ids.add(row.audio_item_id);
  }
  return ids;
}

/** Closed albums of the guest preview with their admitted, approved, playable tracks. */
async function loadClosedAlbums(db: ServiceDb): Promise<GuestCoffeeClosedAlbum[]> {
  const admissions = await loadCafeAdmissions(db);
  const { data, error } = await db
    .from("practices")
    .select("id, title, author_id, business_only, business_has_vocals, cover_url, authors!practices_author_id_fkey(name)")
    .eq("business_only", true)
    .eq("status", "published")
    .eq("product_kind", "music")
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .range(0, 999);
  if (error || !Array.isArray(data)) throw new Error("guest_coffee_closed_albums_unavailable");
  const practices = (data as ClosedPracticeRow[]).filter(
    (p) =>
      p.business_only === true &&
      (admissions.practiceIds.has(p.id) || (p.author_id != null && admissions.authorIds.has(p.author_id))),
  );
  if (practices.length === 0) return [];
  const practiceIds = practices.map((p) => p.id);
  const approved = await loadApprovedPassportIds(db, practiceIds);

  const audio: ClosedAudioRow[] = [];
  for (let i = 0; i < practiceIds.length; i += ID_CHUNK) {
    const page = await db
      .from("audio_items")
      .select("id, practice_id, title, duration_seconds, position, status, audio_path, active_music_delivery_asset_id")
      .in("practice_id", practiceIds.slice(i, i + ID_CHUNK))
      .eq("status", "published")
      .order("id", { ascending: true })
      .range(0, 4999);
    if (page.error || !Array.isArray(page.data)) throw new Error("guest_coffee_closed_tracks_unavailable");
    audio.push(...(page.data as ClosedAudioRow[]).filter((row) => approved.has(row.id)));
  }
  const playable: ClosedAudioRow[] = [];
  for (let i = 0; i < audio.length; i += ID_CHUNK) {
    playable.push(...(await resolvePlayableAudioItemRows(audio.slice(i, i + ID_CHUNK), "music", { serviceRole: db })));
  }
  // Fresh café sound gate – the same per-track gate as the halls' sound review. Throws = empty.
  const allowed = await soundAllowedTrackIds(playable.map((row) => row.id), GUEST_COFFEE_BUSINESS_DIRECTION_KEY, db);

  const tracksByAlbum = new Map<string, (GuestCoffeeTrack & { position: number })[]>();
  for (const row of playable) {
    if (!row.practice_id || !allowed.has(row.id)) continue;
    const title = row.title?.trim();
    if (!title) continue;
    const list = tracksByAlbum.get(row.practice_id) ?? [];
    list.push({
      audioItemId: row.id,
      title,
      durationSeconds: typeof row.duration_seconds === "number" && row.duration_seconds > 0 ? row.duration_seconds : null,
      position: typeof row.position === "number" && Number.isFinite(row.position) ? row.position : 1_000_000,
    });
    tracksByAlbum.set(row.practice_id, list);
  }
  return practices
    .map((p) => ({
      id: p.id,
      title: p.title?.trim() || "",
      authorName: embeddedName(p.authors),
      hasVocals: p.business_has_vocals === true,
      coverUrl: isBusinessPrivateCoverRef(p.cover_url) ? businessGuestCoffeeCoverUrl(p.id) : null,
      tracks: (tracksByAlbum.get(p.id) ?? [])
        .sort((a, b) => a.position - b.position || a.audioItemId.localeCompare(b.audioItemId))
        .map(({ position: _position, ...track }) => {
          void _position;
          return track;
        }),
    }))
    .filter((album) => album.title && album.tracks.length > 0)
    .sort((a, b) => a.title.localeCompare(b.title, "ru") || a.id.localeCompare(b.id));
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
 * Called by the stream-URL route immediately before signing (uncached, fails closed): the album
 * is still a published, not deleted closed album admitted for cafés and THIS track still has an
 * approved Business passport and is published.
 */
export async function isGuestCoffeeClosedTrackStillLive(playlist: GuestCoffeePlaylist, audioItemId: string): Promise<boolean> {
  if (playlist.closed !== true) return false;
  try {
    const db = createServiceRoleClient();
    const { data: practice, error } = await db
      .from("practices")
      .select("id, author_id, business_only, status, product_kind, deleted_at")
      .eq("id", playlist.id)
      .eq("business_only", true)
      .maybeSingle();
    const p = practice as { id: string; author_id: string | null; business_only: boolean | null; status: string | null; product_kind: string | null; deleted_at: string | null } | null;
    if (error || !p || p.business_only !== true || p.status !== "published" || p.product_kind !== "music" || p.deleted_at != null) return false;
    const admissions = await loadCafeAdmissions(db);
    if (!admissions.practiceIds.has(p.id) && !(p.author_id != null && admissions.authorIds.has(p.author_id))) return false;
    const [{ data: passport, error: passportError }, { data: audio, error: audioError }] = await Promise.all([
      db.from("business_track_passports").select("audio_item_id").eq("practice_id", p.id).eq("audio_item_id", audioItemId).eq("status", "approved").maybeSingle(),
      db.from("audio_items").select("id, practice_id, status").eq("id", audioItemId).maybeSingle(),
    ]);
    const a = audio as { id: string; practice_id: string | null; status: string | null } | null;
    return !passportError && !audioError && passport != null && a?.practice_id === p.id && a.status === "published";
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

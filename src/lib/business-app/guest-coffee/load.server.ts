import "server-only";

import { soundAllowedTrackIds } from "@/lib/business/track-sound-review.server";
import { loadCatalogPlaySession } from "@/lib/catalog/catalog-playback";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@supabase/supabase-js";

import type { GuestCoffeePlaylist } from "./catalog";
import { GUEST_COFFEE_BUSINESS_DIRECTION_KEY, buildGuestCoffeeShelf, guestCoffeeShelfArtistCount } from "./shelf";

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; value: Promise<GuestCoffeePlaylist[]> } | null = null;

/** Cookieless anonymous client: the shelf is exactly what a guest sees, shared safely by all requests. */
function createGuestClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type FreshPracticeRow = { id: string; is_free: boolean | null; status: string | null; catalog_visibility: string | null };

/** Ids (of the given ones) that are RIGHT NOW published, listed and free — raw columns, no cache. */
async function loadStillFreeIds(supabase: ReturnType<typeof createGuestClient>, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("practices")
    .select("id, is_free, status, catalog_visibility")
    .in("id", [...ids]);
  if (error || !Array.isArray(data)) throw new Error("guest_coffee_free_check_unavailable");
  return new Set(
    (data as FreshPracticeRow[])
      .filter((row) => row.is_free === true && row.status === "published" && row.catalog_visibility === "listed")
      .map((row) => row.id),
  );
}

/**
 * Called by the stream-URL route immediately before signing (uncached): fails closed.
 */
export async function isGuestCoffeePlaylistStillFree(playlist: GuestCoffeePlaylist): Promise<boolean> {
  try {
    return (await loadStillFreeIds(createGuestClient(), [playlist.id])).has(playlist.id);
  } catch {
    return false;
  }
}

/**
 * Called by the stream-URL route immediately before signing (uncached): the track is still
 * admitted to AudioLad Business for cafés. Fails closed.
 */
export async function isGuestCoffeeTrackStillAdmitted(audioItemId: string): Promise<boolean> {
  try {
    return (await soundAllowedTrackIds([audioItemId], GUEST_COFFEE_BUSINESS_DIRECTION_KEY)).has(audioItemId);
  } catch {
    return false;
  }
}

type AdmissionRow = { author_id: string | null; practice_id: string | null };

/** Allowed café admissions (artists / albums) – narrows the candidates; the track gate decides. */
async function loadCafeAdmissions(): Promise<{ authorIds: Set<string>; practiceIds: Set<string> }> {
  const { data, error } = await createServiceRoleClient()
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

async function loadUncached(): Promise<GuestCoffeePlaylist[]> {
  const supabase = createGuestClient();
  const shelf = await buildGuestCoffeeShelf({
    loadPublishedProducts: () => getPublishedCatalogProducts(supabase, { productKind: "music" }),
    loadAdmissions: loadCafeAdmissions,
    admittedTrackIds: (ids) => soundAllowedTrackIds(ids, GUEST_COFFEE_BUSINESS_DIRECTION_KEY),
    loadFullTracks: async ({ authorSlug, productSlug }) => {
      // Same loader as /api/catalog/play, as an anonymous guest (userId null).
      const loaded = await loadCatalogPlaySession(supabase, authorSlug, productSlug, null);
      if (!loaded.ok) return null;
      if (loaded.session.playbackMode === "preview") return null;
      return loaded.session.tracks.map((t) => ({
        audioItemId: t.id,
        title: t.title,
        durationSeconds: t.durationSeconds,
      }));
    },
  });
  // The catalogue's isFree may include temporary promo pricing; the guest shelf keeps only
  // albums that are free by their own is_free flag (same rule as the per-request re-check).
  const free = await loadStillFreeIds(supabase, shelf.map((p) => p.id));
  const result = shelf.filter((p) => free.has(p.id));
  const artists = guestCoffeeShelfArtistCount(result);
  if (result.length > 0 && artists < 3) {
    // The atmosphere then falls back to fewer artists (best matches) – visible in the logs.
    console.warn("[business-guest-coffee] admitted guest shelf has few artists", { artists, albums: result.length });
  }
  return result;
}

/**
 * The guest coffee shelf: free albums admitted to AudioLad Business for cafés (only their
 * admitted tracks), resolved against the live catalogue.
 * Short process cache (5 min) shared by the page and the stream-URL route; an empty
 * result is not cached so a transient failure heals on the next request.
 */
export async function loadGuestCoffeeShelf(): Promise<GuestCoffeePlaylist[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const value = loadUncached().catch((error) => {
    console.error("[business-guest-coffee] shelf unavailable", error instanceof Error ? error.name : "unknown");
    return [] as GuestCoffeePlaylist[];
  });
  cache = { at: now, value };
  const result = await value;
  if (result.length === 0) cache = null;
  return result;
}

import "server-only";
import { soundAllowedTrackIds } from "@/lib/business/track-sound-review.server";

import { loadCatalogPlaySession } from "@/lib/catalog/catalog-playback";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { createClient } from "@supabase/supabase-js";

import type { GuestCoffeePlaylist } from "./catalog";
import { buildGuestCoffeeShelf } from "./shelf";

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

async function loadUncached(): Promise<GuestCoffeePlaylist[]> {
  const supabase = createGuestClient();
  const shelf = await buildGuestCoffeeShelf({
    loadPublishedProducts: () => getPublishedCatalogProducts(supabase, { productKind: "music" }),
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
  return shelf.filter((p) => free.has(p.id));
}

/**
 * The guest coffee shelf: curated free albums resolved against the live catalogue.
 * Short process cache (5 min) shared by the page and the stream-URL route; an empty
 * result is not cached so a transient failure heals on the next request.
 */
export async function loadGuestCoffeeShelf(): Promise<GuestCoffeePlaylist[]> {
  const now = Date.now();
  if (!cache || now - cache.at >= CACHE_MS) {
    const value = loadUncached().catch((error) => {
      console.error("[business-guest-coffee] shelf unavailable", error instanceof Error ? error.name : "unknown");
      return [] as GuestCoffeePlaylist[];
    });
    cache = { at: now, value };
  }
  const result = await cache.value;
  if (result.length === 0) cache = null;
  // Refresh the manual gate even when public album metadata is cached.
  try {
    const allowed = await soundAllowedTrackIds(result.flatMap((album) => album.tracks.map((track) => track.audioItemId)), "cafe");
    return result.map((album) => ({ ...album, tracks: album.tracks.filter((track) => allowed.has(track.audioItemId)) }))
      .filter((album) => album.tracks.length > 0);
  } catch { return []; }
}

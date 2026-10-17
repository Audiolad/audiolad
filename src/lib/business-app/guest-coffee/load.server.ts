import "server-only";

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

async function loadUncached(): Promise<GuestCoffeePlaylist[]> {
  const supabase = createGuestClient();
  return buildGuestCoffeeShelf({
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
}

/**
 * The guest coffee shelf: curated free albums resolved against the live catalogue.
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

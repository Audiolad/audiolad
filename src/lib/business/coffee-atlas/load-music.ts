import "server-only";

import { loadCatalogPlaySession } from "@/lib/catalog/catalog-playback";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { createClient } from "@/lib/supabase/server";

import { buildCoffeeAtlasMusic, type CoffeeAtlasTrack } from "./music";

export type { CoffeeAtlasTrack };

/**
 * Resolve the shop → track mapping against the published music catalogue (guest viewer,
 * same source as the /b listen rail) and keep only tracks the existing player can start
 * for a guest — the same read-only session loader `/api/catalog/play` uses. On any error
 * the atlas simply shows no examples — never a fake or broken player.
 */
export async function loadCoffeeAtlasMusic(): Promise<Record<string, CoffeeAtlasTrack[]>> {
  try {
    const supabase = await createClient();
    return await buildCoffeeAtlasMusic({
      loadPublishedProducts: () =>
        getPublishedCatalogProducts(supabase, { productKind: "music" }),
      isPlayable: async (track) => {
        const session = await loadCatalogPlaySession(
          supabase,
          track.authorSlug,
          track.slug,
          null,
        );
        return session.ok;
      },
    });
  } catch (error) {
    console.error(
      "[coffee-atlas] music examples unavailable",
      error instanceof Error ? error.name : "unknown",
    );
    return {};
  }
}

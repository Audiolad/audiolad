import "server-only";

import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { releaseDueScheduledPublications } from "@/lib/products/release-due-scheduled-publications";
import { createClient } from "@/lib/supabase/server";

import {
  COFFEE_ATLAS_MUSIC,
  getCoffeeAtlasTrackRefs,
  resolveCoffeeAtlasTracks,
  type CoffeeAtlasTrack,
} from "./music";

export type { CoffeeAtlasTrack };

/**
 * Resolve the shop → track mapping against the published music catalogue.
 * Same source as the /b listen rail (guest catalogue viewer). On any error the
 * atlas simply shows no examples — never a fake player.
 */
export async function loadCoffeeAtlasMusic(): Promise<Record<string, CoffeeAtlasTrack[]>> {
  const result: Record<string, CoffeeAtlasTrack[]> = {};

  try {
    const supabase = await createClient();
    await releaseDueScheduledPublications();
    const products = await getPublishedCatalogProducts(supabase, {
      productKind: "music",
    });

    for (const shopSlug of Object.keys(COFFEE_ATLAS_MUSIC)) {
      result[shopSlug] = resolveCoffeeAtlasTracks(getCoffeeAtlasTrackRefs(shopSlug), products);
    }
  } catch (error) {
    console.error(
      "[coffee-atlas] music examples unavailable",
      error instanceof Error ? error.name : "unknown",
    );
  }

  return result;
}

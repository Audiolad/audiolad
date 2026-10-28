import "server-only";

import { loadCatalogPlaySession } from "@/lib/catalog/catalog-playback";
import {
  resolveCoffeeAtlasTracks,
  type CoffeeAtlasTrack,
  type CoffeeAtlasTrackRef,
} from "@/lib/business/coffee-atlas/music";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { createClient } from "@/lib/supabase/server";

/**
 * One published catalogue track for a guide article.
 * Same rule as the atlas: unpublished or unplayable tracks are omitted, never faked.
 */
export async function loadGuideTrack(ref: CoffeeAtlasTrackRef): Promise<CoffeeAtlasTrack | null> {
  try {
    const supabase = await createClient();
    const products = await getPublishedCatalogProducts(supabase, { productKind: "music" });
    const [track] = resolveCoffeeAtlasTracks([ref], products);
    if (!track) {
      return null;
    }
    const session = await loadCatalogPlaySession(supabase, track.authorSlug, track.slug, null);
    return session.ok ? track : null;
  } catch (error) {
    console.error(
      "[vertical-guide] track unavailable",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
}

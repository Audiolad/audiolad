/**
 * Stage-1 MAX Аудиотека.
 *
 * Linked MAX identity supplies an AudioLad user id, not a browser Supabase JWT.
 * Stage 1 gathers catalog entitlements, catalog saves, and saved public playlists.
 * Personal materials and private audio stay out of this loader.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadLibraryCollection } from "@/lib/library/collection";
import { loadSavedPlaylistSources } from "@/lib/library/saved-playlist-sources";
import {
  compareUnifiedLibraryEntries,
  mapCatalogLibraryEntry,
  mapPlaylistLibraryEntry,
  type UnifiedLibraryEntry,
} from "@/lib/library/unified-entry";
import {
  buildMaxLibraryCatalogItem,
  buildMaxLibraryPlaylistItem,
  readMaxLibraryPayload,
  type MaxLibraryItem,
} from "@/lib/max/library-dto";
import { listSavedPlaylists } from "@/lib/playlists/saved-listing";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { getProductPriceLabel } from "@/lib/products/price-format";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type MaxLibraryTestDeps = {
  createClient?: () => SupabaseClient;
  listSavedPlaylists?: typeof listSavedPlaylists;
};

let maxLibraryTestDeps: MaxLibraryTestDeps | null = null;

export function setMaxLibraryDepsForTests(deps: MaxLibraryTestDeps | null) {
  maxLibraryTestDeps = deps;
}

export function createMaxLibraryClient(): SupabaseClient {
  return maxLibraryTestDeps?.createClient?.() ?? createServiceRoleClient();
}

function projectMaxLibraryEntry(entry: UnifiedLibraryEntry): MaxLibraryItem | null {
  if (entry.kind === "catalog") {
    return buildMaxLibraryCatalogItem({
      practiceId: entry.practiceId,
      title: entry.title,
      coverUrl: getProductCoverDisplayUrl(
        entry.cover.url,
        entry.practice?.updatedAt,
        entry.cover.image,
      ),
      authorName: entry.author.name,
      authorSlug: entry.author.slug,
      productSlug: entry.practice?.slug ?? null,
      displayLabel: entry.displayLabel,
      duration: entry.duration,
      isSaved: entry.isSaved,
      canListen: entry.canListen,
      accessSource: entry.accessSource,
      isFree: entry.isFree,
      price: entry.price,
      priceLabel: getProductPriceLabel(entry.price, entry.isFree),
      sortAt: entry.sortAt,
    });
  }

  if (entry.kind === "playlist") {
    return buildMaxLibraryPlaylistItem({
      slug: entry.slug,
      title: entry.title,
      coverUrl: entry.cover.url,
      creator: entry.author.name ?? "",
      duration: entry.duration,
      sortAt: entry.sortAt,
    });
  }

  return null;
}

export async function loadMaxStage1Library(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ items: MaxLibraryItem[]; error: boolean }> {
  if (!userId) {
    return { items: [], error: false };
  }

  const [catalog, playlists] = await Promise.all([
    loadLibraryCollection(supabase, userId).catch((error) => {
      console.error(
        "max_library_catalog_error",
        error instanceof Error ? error.message : error,
      );
      return { items: [], error: true };
    }),
    loadSavedPlaylistSources(supabase, userId, {
      listSavedPlaylists: maxLibraryTestDeps?.listSavedPlaylists,
    }),
  ]);

  const entries = [
    ...catalog.items.map(mapCatalogLibraryEntry),
    ...playlists.items.map(mapPlaylistLibraryEntry),
  ].sort(compareUnifiedLibraryEntries);

  const items = readMaxLibraryPayload({
    items: entries.flatMap((entry) => {
      const projected = projectMaxLibraryEntry(entry);
      return projected ? [projected] : [];
    }),
  });

  return {
    items: items ?? [],
    error: catalog.error || playlists.error,
  };
}

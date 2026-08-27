/**
 * Unified Аудиотека loader (Stage 1).
 *
 * Loads four existing sources in parallel. One source failing does not
 * drop the others. Catalog half still goes through loadLibraryCollection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadLibraryCollection } from "@/lib/library/collection";
import {
  assembleUnifiedLibrary,
  type PlaylistUnifiedSource,
  type UnifiedLibraryEntry,
} from "@/lib/library/unified-entry";
import { listMyPersonalMaterials } from "@/lib/personal-materials/client-library/repository";
import type { MyPersonalMaterialListItemDto } from "@/lib/personal-materials/client-library/types";
import { PLAYLIST_LISTING_MAX_LIMIT } from "@/lib/playlists/listing-contract";
import { listSavedPlaylists } from "@/lib/playlists/saved-listing";
import { listPrivateAudioItems } from "@/lib/private-audio/server/repository";
import type { PrivateAudioListItemDto } from "@/lib/private-audio/types";

const SAVED_PLAYLIST_PAGE_CAP = 40;

function logUnifiedLibraryError(scope: string, error: unknown) {
  console.error(
    scope,
    error instanceof Error ? error.message : error,
  );
}

async function loadSavedPlaylistsForLibrary(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ items: PlaylistUnifiedSource[]; error: boolean }> {
  try {
    const listingItems: PlaylistUnifiedSource[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const page = await listSavedPlaylists(
        supabase,
        { cursor, limit: PLAYLIST_LISTING_MAX_LIMIT },
        { userId },
      );

      for (const item of page.items) {
        listingItems.push({
          id: item.id,
          slug: item.slug,
          href: item.href,
          title: item.title,
          coverUrl: item.coverUrl,
          creator: item.creator,
          durationSeconds: item.durationSeconds,
        });
      }

      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < SAVED_PLAYLIST_PAGE_CAP);

    const { data, error } = await supabase
      .from("playlist_saves")
      .select("playlist_id, created_at")
      .eq("user_id", userId);

    if (error) {
      logUnifiedLibraryError("unified_library_playlist_saves_error", error.message);
      return { items: listingItems, error: true };
    }

    const savedAtById = new Map<string, string>();

    for (const row of data ?? []) {
      const playlistId =
        typeof row.playlist_id === "string" ? row.playlist_id : "";
      const createdAt =
        typeof row.created_at === "string" ? row.created_at : "";

      if (playlistId && createdAt) {
        savedAtById.set(playlistId, createdAt);
      }
    }

    return {
      items: listingItems.map((item) => ({
        ...item,
        savedAt: savedAtById.get(item.id) ?? null,
      })),
      error: false,
    };
  } catch (error) {
    logUnifiedLibraryError("unified_library_playlists_error", error);
    return { items: [], error: true };
  }
}

export async function loadUnifiedLibrary(
  supabase: SupabaseClient,
  userId: string,
  options?: { now?: Date },
): Promise<{ entries: UnifiedLibraryEntry[]; error: boolean }> {
  if (!userId) {
    return { entries: [], error: false };
  }

  const [catalog, playlists, privateAudio, personal] = await Promise.all([
    loadLibraryCollection(supabase, userId, options).catch((error) => {
      logUnifiedLibraryError("unified_library_catalog_error", error);
      return { items: [], error: true };
    }),
    loadSavedPlaylistsForLibrary(supabase, userId),
    listPrivateAudioItems(supabase, userId)
      .then((items) => ({ items, error: false }))
      .catch((error) => {
        logUnifiedLibraryError("unified_library_private_audio_error", error);
        return {
          items: [] as PrivateAudioListItemDto[],
          error: true,
        };
      }),
    listMyPersonalMaterials(supabase)
      .then((items) => ({ items, error: false }))
      .catch((error) => {
        logUnifiedLibraryError("unified_library_personal_error", error);
        return {
          items: [] as MyPersonalMaterialListItemDto[],
          error: true,
        };
      }),
  ]);

  return assembleUnifiedLibrary({
    catalogItems: catalog.items,
    catalogError: catalog.error,
    playlistItems: playlists.items,
    playlistError: playlists.error,
    privateAudioItems: privateAudio.items,
    privateAudioError: privateAudio.error,
    personalItems: personal.items,
    personalError: personal.error,
  });
}

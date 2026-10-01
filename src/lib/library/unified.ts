/**
 * Unified Аудиотека loader (Stage 1).
 *
 * Loads four existing sources in parallel. One source failing does not
 * drop the others. Catalog half still goes through loadLibraryCollection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadLibraryCollection } from "@/lib/library/collection";
import { loadSavedPlaylistSources } from "@/lib/library/saved-playlist-sources";
import {
  assembleUnifiedLibrary,
  type UnifiedLibraryEntry,
} from "@/lib/library/unified-entry";
import { listMyPersonalMaterials } from "@/lib/personal-materials/client-library/repository";
import type { MyPersonalMaterialListItemDto } from "@/lib/personal-materials/client-library/types";
import { listPrivateAudioItems } from "@/lib/private-audio/server/repository";
import type { PrivateAudioListItemDto } from "@/lib/private-audio/types";

function logUnifiedLibraryError(scope: string, error: unknown) {
  console.error(
    scope,
    error instanceof Error ? error.message : error,
  );
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
    loadSavedPlaylistSources(supabase, userId),
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

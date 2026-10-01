/**
 * Saved public playlists for Аудиотека.
 * The user id is an explicit argument from the caller.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlaylistUnifiedSource } from "@/lib/library/unified-entry";
import { PLAYLIST_LISTING_MAX_LIMIT } from "@/lib/playlists/listing-contract";
import { listSavedPlaylists as listSavedPlaylistsDefault } from "@/lib/playlists/saved-listing";

const SAVED_PLAYLIST_PAGE_CAP = 40;

function logSavedPlaylistError(scope: string, error: unknown) {
  console.error(scope, error instanceof Error ? error.message : error);
}

export async function loadSavedPlaylistSources(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    listSavedPlaylists?: typeof listSavedPlaylistsDefault;
  },
): Promise<{ items: PlaylistUnifiedSource[]; error: boolean }> {
  if (!userId) {
    return { items: [], error: false };
  }

  const listSavedPlaylists = options?.listSavedPlaylists ?? listSavedPlaylistsDefault;

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
      logSavedPlaylistError("saved_playlist_sources_saves_error", error.message);
      return { items: listingItems, error: true };
    }

    const savedAtById = new Map<string, string>();

    for (const row of data ?? []) {
      const playlistId = typeof row.playlist_id === "string" ? row.playlist_id : "";
      const createdAt = typeof row.created_at === "string" ? row.created_at : "";

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
    logSavedPlaylistError("saved_playlist_sources_error", error);
    return { items: [], error: true };
  }
}

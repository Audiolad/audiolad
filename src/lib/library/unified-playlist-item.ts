/**
 * Library-only adapter: UnifiedPlaylistLibraryEntry → PlaylistListingItem.
 * Reuses PlaylistCard. Does not invent a catalog product.
 */

import { LISTING_ENTITY_CLASS } from "@/lib/listing/entity-class";
import type { UnifiedPlaylistLibraryEntry } from "@/lib/library/unified-entry";
import type { PlaylistListingItem } from "@/lib/playlists/listing-contract";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";

export function unifiedPlaylistEntryToListingItem(
  entry: UnifiedPlaylistLibraryEntry,
): PlaylistListingItem {
  const durationSeconds =
    entry.duration?.unit === "seconds" ? entry.duration.value : 0;
  const href = entry.href?.trim() || buildPublicPlaylistPath(entry.slug);

  return {
    class: LISTING_ENTITY_CLASS.PLAYLIST,
    id: entry.playlistId,
    slug: entry.slug,
    href,
    title: entry.title,
    coverUrl: entry.cover.url,
    creator: entry.author.name ?? "",
    trackCount: 0,
    durationSeconds,
    savesCount: 0,
    topics: [],
    access: "free",
    viewer: {
      saved: entry.isSaved,
      playing: false,
    },
  };
}

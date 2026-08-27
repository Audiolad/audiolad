/**
 * Аудиотека filter matching for the unified list.
 * Collection labels stay in filters.ts. Catalog semantics stay in matchesLibraryFilter.
 */

import {
  matchesLibraryFilter,
  type LibraryFilterId,
} from "@/lib/library/filters";
import {
  unifiedEntryToLibraryFilterItem,
  type UnifiedLibraryEntry,
} from "@/lib/library/unified-entry";

export function matchesUnifiedLibraryFilter(
  entry: UnifiedLibraryEntry,
  filter: LibraryFilterId,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "uploads") {
    return entry.kind === "private_audio";
  }

  if (filter === "playlists") {
    return entry.kind === "playlist";
  }

  if (filter === "personal") {
    return entry.kind === "personal";
  }

  if (entry.kind === "private_audio" || entry.kind === "personal") {
    return false;
  }

  return matchesLibraryFilter(unifiedEntryToLibraryFilterItem(entry), filter);
}

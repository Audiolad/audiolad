/**
 * Аудиотека filter matching for the unified list.
 * Chip labels stay in MyPracticesLibrary. Catalog semantics stay in filters.ts.
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

  if (entry.kind === "private_audio" || entry.kind === "personal") {
    return false;
  }

  return matchesLibraryFilter(unifiedEntryToLibraryFilterItem(entry), filter);
}

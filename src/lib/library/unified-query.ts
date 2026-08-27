/**
 * Client-side search, sort, and query URL for /my-practices.
 * Operates on the already-loaded unified list. Does not fetch.
 */

import { isLibraryFilterId, type LibraryFilterId } from "@/lib/library/filters";
import { matchesUnifiedLibraryFilter } from "@/lib/library/unified-filter";
import {
  compareUnifiedLibraryEntries,
  type UnifiedLibraryEntry,
} from "@/lib/library/unified-entry";

export const MY_PRACTICES_PATH = "/my-practices";
export const LIBRARY_SEARCH_DEBOUNCE_MS = 300;

export type LibrarySortId = "new" | "old" | "alpha";

export const LIBRARY_SORT_OPTIONS: readonly {
  id: LibrarySortId;
  label: string;
}[] = [
  { id: "new", label: "Сначала новые" },
  { id: "old", label: "Сначала старые" },
  { id: "alpha", label: "По алфавиту А–Я" },
];

export function parseLibrarySearchQuery(
  value: string | null | undefined,
): string {
  return value?.trim() ?? "";
}

export function parseLibrarySort(
  value: string | null | undefined,
): LibrarySortId {
  if (value === "old" || value === "alpha") {
    return value;
  }

  return "new";
}

export function parseLibraryFilter(
  value: string | null | undefined,
): LibraryFilterId {
  return isLibraryFilterId(value) ? value : "all";
}

export function matchesUnifiedLibrarySearch(
  entry: Pick<UnifiedLibraryEntry, "title" | "author">,
  query: string,
): boolean {
  const normalized = parseLibrarySearchQuery(query).toLocaleLowerCase("ru");

  if (!normalized) {
    return true;
  }

  if (entry.title.toLocaleLowerCase("ru").includes(normalized)) {
    return true;
  }

  const authorName = entry.author.name?.trim();

  return Boolean(
    authorName && authorName.toLocaleLowerCase("ru").includes(normalized),
  );
}

export function compareUnifiedLibrarySort(
  left: Pick<UnifiedLibraryEntry, "id" | "title" | "sortAt">,
  right: Pick<UnifiedLibraryEntry, "id" | "title" | "sortAt">,
  sort: LibrarySortId,
): number {
  if (sort === "old") {
    if (left.sortAt !== right.sortAt) {
      return left.sortAt - right.sortAt;
    }

    return left.id.localeCompare(right.id);
  }

  if (sort === "alpha") {
    const byTitle = left.title.localeCompare(right.title, "ru");

    if (byTitle !== 0) {
      return byTitle;
    }

    if (left.sortAt !== right.sortAt) {
      return right.sortAt - left.sortAt;
    }

    return left.id.localeCompare(right.id);
  }

  return compareUnifiedLibraryEntries(left, right);
}

export function applyUnifiedLibraryView(
  entries: readonly UnifiedLibraryEntry[],
  input: {
    filter: LibraryFilterId;
    query: string;
    sort: LibrarySortId;
  },
): UnifiedLibraryEntry[] {
  return entries
    .filter((entry) => matchesUnifiedLibraryFilter(entry, input.filter))
    .filter((entry) => matchesUnifiedLibrarySearch(entry, input.query))
    .slice()
    .sort((left, right) =>
      compareUnifiedLibrarySort(left, right, input.sort),
    );
}

export function formatLibraryMaterialsCount(count: number): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  let word = "материалов";

  if (mod10 === 1 && mod100 !== 11) {
    word = "материал";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "материала";
  }

  return `${count} ${word}`;
}

export function buildMyPracticesHref(input: {
  q?: string | null;
  filter?: string | null;
  sort?: string | null;
  purchased?: string | null;
} = {}): string {
  const params = new URLSearchParams();
  const query = parseLibrarySearchQuery(input.q);
  const filter = parseLibraryFilter(input.filter);
  const sort = parseLibrarySort(input.sort);
  const purchased = input.purchased?.trim() || null;

  if (query) {
    params.set("q", query);
  }

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (sort !== "new") {
    params.set("sort", sort);
  }

  if (purchased) {
    params.set("purchased", purchased);
  }

  const search = params.toString();
  return search ? `${MY_PRACTICES_PATH}?${search}` : MY_PRACTICES_PATH;
}

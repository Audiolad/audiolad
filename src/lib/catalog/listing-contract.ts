import {
  CATALOG_PUBLICATION_CLASSES,
  isPublicationClass,
  type CatalogCard,
  type PublicationClass,
} from "@/lib/catalog/dto";
import { CATALOG_SEARCH_MAX_LENGTH, normalizeCatalogSearchQuery } from "@/lib/catalog/search";
import { normalizeCatalogTopicParam } from "@/lib/catalog/topic-filter";

export const CATALOG_LISTING_PAGE_SIZE = 20;
export const CATALOG_LISTING_MAX_LIMIT = 50;

export const CATALOG_ACCESS_FILTERS = ["all", "free", "paid"] as const;
export const CATALOG_CLASS_FILTERS = ["all", ...CATALOG_PUBLICATION_CLASSES] as const;

/** @deprecated Use CATALOG_CLASS_FILTERS. Kept for URL/query aliases. */
export const CATALOG_KIND_FILTERS = CATALOG_CLASS_FILTERS;

export const CATALOG_SORTS = ["new", "price_asc", "price_desc"] as const;

export type CatalogAccessFilter = (typeof CATALOG_ACCESS_FILTERS)[number];
export type CatalogClassFilter = (typeof CATALOG_CLASS_FILTERS)[number];
/** @deprecated Use CatalogClassFilter. */
export type CatalogKindFilter = CatalogClassFilter;
export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogListingClass = PublicationClass;

const LEGACY_KIND_TO_CLASS: Record<string, PublicationClass> = {
  practice: "practice",
  course: "course",
  audiobook: "audiobook",
  release: "release",
  post: "post",
  music: "release",
  audio_post: "post",
  program: "practice",
};

export type CatalogListingItem = {
  id: string;
  slug: string;
  href: string;
  title: string;
  author: string;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  kind: "practice" | "music" | "audio_post" | "program";
  kindLabel: string;
  durationLabel: string | null;
  priceLabel: string;
  accessState: "free" | "paid";
  isSaved: boolean;
};

export type CatalogListingQuery = {
  q: string;
  topic: string | null;
  access: CatalogAccessFilter;
  class: CatalogClassFilter;
  sort: CatalogSort;
  cursor: string | null;
  limit: number;
};

export type CatalogListingResult = {
  items: CatalogCard[];
  nextCursor: string | null;
};

function isCatalogAccessFilter(value: string): value is CatalogAccessFilter {
  return (CATALOG_ACCESS_FILTERS as readonly string[]).includes(value);
}

function isCatalogSort(value: string): value is CatalogSort {
  return (CATALOG_SORTS as readonly string[]).includes(value);
}

export function parseCatalogAccessFilter(
  value: string | null | undefined,
): CatalogAccessFilter {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isCatalogAccessFilter(normalized) ? normalized : "all";
}

export function parseCatalogClassFilter(
  value: string | null | undefined,
): CatalogClassFilter {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized === "all") {
    return "all";
  }

  if (isPublicationClass(normalized)) {
    return normalized;
  }

  return LEGACY_KIND_TO_CLASS[normalized] ?? "all";
}

/** @deprecated Use parseCatalogClassFilter. Maps music/audio_post/program. */
export function parseCatalogKindFilter(
  value: string | null | undefined,
): CatalogClassFilter {
  return parseCatalogClassFilter(value);
}

export function parseCatalogSort(
  value: string | null | undefined,
): CatalogSort {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isCatalogSort(normalized) ? normalized : "new";
}

export function parseCatalogListingLimit(
  value: string | number | null | undefined,
): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return CATALOG_LISTING_PAGE_SIZE;
  }

  return Math.min(
    CATALOG_LISTING_MAX_LIMIT,
    Math.max(1, Math.floor(parsed)),
  );
}

export function parseCatalogListingQuery(params: {
  q?: string | null;
  topic?: string | null;
  access?: string | null;
  class?: string | null;
  kind?: string | null;
  sort?: string | null;
  cursor?: string | null;
  limit?: string | number | null;
}): CatalogListingQuery {
  const cursor = params.cursor?.trim() || null;

  return {
    q: normalizeCatalogSearchQuery(params.q).slice(0, CATALOG_SEARCH_MAX_LENGTH),
    topic: normalizeCatalogTopicParam(params.topic),
    access: parseCatalogAccessFilter(params.access),
    class: parseCatalogClassFilter(params.class ?? params.kind),
    sort: parseCatalogSort(params.sort),
    cursor,
    limit: parseCatalogListingLimit(params.limit),
  };
}

export function encodeCatalogCursor(
  sortTimestamp: number,
  id: string,
): string {
  return `${sortTimestamp}:${id}`;
}

export function decodeCatalogCursor(
  cursor: string | null | undefined,
): { sortTimestamp: number; id: string } | null {
  const raw = cursor?.trim();

  if (!raw) {
    return null;
  }

  const separator = raw.indexOf(":");

  if (separator <= 0) {
    return null;
  }

  const sortTimestamp = Number(raw.slice(0, separator));
  const id = raw.slice(separator + 1).trim();

  if (!id || !Number.isFinite(sortTimestamp)) {
    return null;
  }

  return { sortTimestamp, id };
}

export function buildCatalogListingApiUrl(
  query: Partial<CatalogListingQuery> & { cursor?: string | null },
): string {
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.topic) {
    params.set("topic", query.topic);
  }

  if (query.access && query.access !== "all") {
    params.set("access", query.access);
  }

  if (query.class && query.class !== "all") {
    params.set("class", query.class);
  }

  if (query.sort && query.sort !== "new") {
    params.set("sort", query.sort);
  }

  if (query.cursor) {
    params.set("cursor", query.cursor);
  }

  if (
    typeof query.limit === "number" &&
    query.limit !== CATALOG_LISTING_PAGE_SIZE
  ) {
    params.set("limit", String(query.limit));
  }

  const search = params.toString();
  return search ? `/api/catalog?${search}` : "/api/catalog";
}

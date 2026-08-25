import { normalizeCatalogTopicParam } from "@/lib/catalog/topic-filter";
import {
  LISTING_ENTITY_CLASS,
  type ListingEntityClass,
} from "@/lib/listing/entity-class";
import {
  EDITORIAL_PLAYLIST_LABEL,
  USER_PLAYLIST_OWNER_LABEL,
} from "@/lib/playlists/listing-labels";
import { isUuid } from "@/lib/playlists/validation";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";

export const PLAYLIST_LISTING_PAGE_SIZE = 20;
export const PLAYLIST_LISTING_MAX_LIMIT = 50;
export const PLAYLIST_LISTING_SEARCH_MAX_LENGTH = 100;

export const PLAYLIST_LISTING_ACCESS = ["free", "paid", "mixed"] as const;
export const PLAYLIST_LISTING_ACCESS_FILTERS = [
  "all",
  ...PLAYLIST_LISTING_ACCESS,
] as const;
export const PLAYLIST_LISTING_SORTS = ["newest", "popular"] as const;

export type PlaylistListingAccess = (typeof PLAYLIST_LISTING_ACCESS)[number];

export type PlaylistListingViewer = {
  saved: boolean;
  playing: boolean;
};

export type PlaylistListingItem = {
  class: typeof LISTING_ENTITY_CLASS.PLAYLIST;
  id: string;
  slug: string;
  href: string;
  title: string;
  coverUrl: string | null;
  creator: string;
  trackCount: number;
  durationSeconds: number;
  savesCount: number;
  topics: string[];
  access: PlaylistListingAccess;
  viewer: PlaylistListingViewer;
};

export type PlaylistListingSort = (typeof PLAYLIST_LISTING_SORTS)[number];
export type PlaylistListingAccessFilter =
  (typeof PLAYLIST_LISTING_ACCESS_FILTERS)[number];

export type PlaylistListingQuery = {
  q: string;
  topic: string | null;
  access: PlaylistListingAccessFilter;
  sort: PlaylistListingSort;
  cursor: string | null;
  limit: number;
};

export type PlaylistListingResult = {
  items: PlaylistListingItem[];
  nextCursor: string | null;
};

/**
 * Public listing source. Internal playlist columns stay off this type
 * so the mapper cannot leak them by spreading a row.
 */
export type PlaylistListingSource = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  items_count: number;
  duration_seconds: number;
  saves_count: number;
};

export type PlaylistListingMapInput = {
  source: PlaylistListingSource;
  creator: string;
  topics?: readonly string[];
  access: PlaylistListingAccess;
  viewer?: Partial<PlaylistListingViewer>;
};

export const PLAYLIST_LISTING_FORBIDDEN_FIELDS = [
  "user_id",
  "owner_type",
  "created_by",
  "cover_path",
  "direction_id",
  "playlist_items",
  "entitlement",
  "access_source",
] as const;

export function isPlaylistListingClass(
  value: string,
): value is typeof LISTING_ENTITY_CLASS.PLAYLIST {
  return value === LISTING_ENTITY_CLASS.PLAYLIST;
}

export function isProductListingClass(
  value: string,
): value is Extract<ListingEntityClass, "product"> {
  return value === LISTING_ENTITY_CLASS.PRODUCT;
}

export function isPlaylistListingAccess(
  value: string,
): value is PlaylistListingAccess {
  return (PLAYLIST_LISTING_ACCESS as readonly string[]).includes(value);
}

export function isPlaylistListingAccessFilter(
  value: string,
): value is PlaylistListingAccessFilter {
  return (PLAYLIST_LISTING_ACCESS_FILTERS as readonly string[]).includes(value);
}

export function isPlaylistListingSort(
  value: string,
): value is PlaylistListingSort {
  return (PLAYLIST_LISTING_SORTS as readonly string[]).includes(value);
}

export function normalizePlaylistListingSearchQuery(
  value: string | null | undefined,
): string {
  if (value == null) {
    return "";
  }

  const collapsed = value.trim().replace(/\s+/g, " ");

  if (!collapsed) {
    return "";
  }

  return collapsed.slice(0, PLAYLIST_LISTING_SEARCH_MAX_LENGTH);
}

export function parsePlaylistListingAccessFilter(
  value: string | null | undefined,
): PlaylistListingAccessFilter {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isPlaylistListingAccessFilter(normalized) ? normalized : "all";
}

export function parsePlaylistListingSort(
  value: string | null | undefined,
): PlaylistListingSort {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized === "new") {
    return "newest";
  }

  return isPlaylistListingSort(normalized) ? normalized : "newest";
}

export function parsePlaylistListingLimit(
  value: string | number | null | undefined,
): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return PLAYLIST_LISTING_PAGE_SIZE;
  }

  return Math.min(
    PLAYLIST_LISTING_MAX_LIMIT,
    Math.max(1, Math.floor(parsed)),
  );
}

export function parsePlaylistListingQuery(params: {
  q?: string | null;
  topic?: string | null;
  access?: string | null;
  sort?: string | null;
  cursor?: string | null;
  limit?: string | number | null;
}): PlaylistListingQuery {
  return {
    q: normalizePlaylistListingSearchQuery(params.q),
    topic: normalizeCatalogTopicParam(params.topic),
    access: parsePlaylistListingAccessFilter(params.access),
    sort: parsePlaylistListingSort(params.sort),
    cursor: params.cursor?.trim() || null,
    limit: parsePlaylistListingLimit(params.limit),
  };
}

export function buildPlaylistListingApiUrl(
  query: Partial<PlaylistListingQuery> & { cursor?: string | null },
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

  if (query.sort && query.sort !== "newest") {
    params.set("sort", query.sort);
  }

  if (query.cursor) {
    params.set("cursor", query.cursor);
  }

  if (
    typeof query.limit === "number" &&
    query.limit !== PLAYLIST_LISTING_PAGE_SIZE
  ) {
    params.set("limit", String(query.limit));
  }

  const search = params.toString();
  return search ? `/api/playlists/catalog?${search}` : "/api/playlists/catalog";
}

export type PlaylistListingNewestCursor = {
  sort: "newest";
  listedAtMs: number;
  id: string;
};

export type PlaylistListingPopularCursor = {
  sort: "popular";
  savesCount: number;
  listedAtMs: number;
  id: string;
};

export type PlaylistListingResolvedCursor =
  | PlaylistListingNewestCursor
  | PlaylistListingPopularCursor;

export function encodePlaylistListingCursor(
  listedAtMs: number,
  id: string,
): string {
  return `${listedAtMs}:${id}`;
}

export function encodePlaylistListingPopularCursor(
  savesCount: number,
  listedAtMs: number,
  id: string,
): string {
  return `${savesCount}:${listedAtMs}:${id}`;
}

export function decodePlaylistListingCursor(
  cursor: string | null | undefined,
): { listedAtMs: number; id: string } | null {
  const raw = cursor?.trim();

  if (!raw) {
    return null;
  }

  const separator = raw.indexOf(":");

  if (separator <= 0) {
    return null;
  }

  const listedAtMs = Number(raw.slice(0, separator));
  const id = raw.slice(separator + 1).trim();

  if (!id || !Number.isFinite(listedAtMs)) {
    return null;
  }

  return { listedAtMs, id };
}

export function decodePlaylistListingPopularCursor(
  cursor: string | null | undefined,
): { savesCount: number; listedAtMs: number; id: string } | null {
  const raw = cursor?.trim();

  if (!raw) {
    return null;
  }

  const parts = raw.split(":");

  if (parts.length !== 3) {
    return null;
  }

  const savesCount = Number(parts[0]);
  const listedAtMs = Number(parts[1]);
  const id = parts[2]?.trim() ?? "";

  if (
    !Number.isInteger(savesCount) ||
    savesCount < 0 ||
    !Number.isFinite(listedAtMs) ||
    !isUuid(id)
  ) {
    return null;
  }

  return { savesCount, listedAtMs, id };
}

export function resolvePlaylistListingCursor(
  cursor: string | null | undefined,
  sort: PlaylistListingSort,
): PlaylistListingResolvedCursor | null {
  if (sort === "popular") {
    const popular = decodePlaylistListingPopularCursor(cursor);
    return popular ? { sort: "popular", ...popular } : null;
  }

  if (decodePlaylistListingPopularCursor(cursor)) {
    return null;
  }

  const newest = decodePlaylistListingCursor(cursor);
  return newest ? { sort: "newest", ...newest } : null;
}

export function resolvePlaylistListingCreatorName(isEditorial: boolean): string {
  return isEditorial ? EDITORIAL_PLAYLIST_LABEL : USER_PLAYLIST_OWNER_LABEL;
}

function asNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export function toPlaylistListingItem(
  input: PlaylistListingMapInput,
): PlaylistListingItem {
  const slug = input.source.slug.trim();

  return {
    class: LISTING_ENTITY_CLASS.PLAYLIST,
    id: input.source.id,
    slug,
    href: buildPublicPlaylistPath(slug),
    title: input.source.title,
    coverUrl: input.source.coverUrl,
    creator: input.creator,
    trackCount: asNonNegativeInt(input.source.items_count),
    durationSeconds: asNonNegativeInt(input.source.duration_seconds),
    savesCount: asNonNegativeInt(input.source.saves_count),
    topics: [...(input.topics ?? [])],
    access: input.access,
    viewer: {
      saved: input.viewer?.saved === true,
      playing: input.viewer?.playing === true,
    },
  };
}

export function playlistListingItemHasForbiddenField(
  item: PlaylistListingItem,
): boolean {
  return PLAYLIST_LISTING_FORBIDDEN_FIELDS.some((field) => field in item);
}

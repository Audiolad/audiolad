import {
  LISTING_ENTITY_CLASS,
  type ListingEntityClass,
} from "@/lib/listing/entity-class";
import {
  EDITORIAL_PLAYLIST_LABEL,
  USER_PLAYLIST_OWNER_LABEL,
} from "@/lib/playlists/listing-labels";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";

export const PLAYLIST_LISTING_PAGE_SIZE = 20;
export const PLAYLIST_LISTING_MAX_LIMIT = 50;

export const PLAYLIST_LISTING_ACCESS = ["free", "paid", "mixed"] as const;

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

export type PlaylistListingQuery = {
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
  cursor?: string | null;
  limit?: string | number | null;
}): PlaylistListingQuery {
  return {
    cursor: params.cursor?.trim() || null,
    limit: parsePlaylistListingLimit(params.limit),
  };
}

export function encodePlaylistListingCursor(
  listedAtMs: number,
  id: string,
): string {
  return `${listedAtMs}:${id}`;
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

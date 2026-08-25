/**
 * Saved public playlist library (Stage 5B).
 *
 * Source: playlist_saves joined to listed public playlists.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyPlaylistListingSavedState,
  isPlaylistListedForCatalog,
  listedAtToMs,
  loadPlaylistListingAccessByIds,
  mapPlaylistCatalogRowToCandidate,
  PLAYLIST_CATALOG_LISTING_SELECT,
  signPlaylistListingCovers,
  toPublicPlaylistListingItem,
  type PlaylistCatalogRow,
  type PlaylistListingCandidate,
} from "@/lib/playlists/listing";
import {
  parsePlaylistListingLimit,
  PLAYLIST_LISTING_PAGE_SIZE,
  type PlaylistListingResult,
} from "@/lib/playlists/listing-contract";
import { listPlaylistTopicKeysByPlaylistIds } from "@/lib/playlists/playlist-topics";
import { isUuid } from "@/lib/playlists/validation";

export const PLAYLIST_SAVED_PAGE_PATH = "/playlists/saved";
export const PLAYLIST_SAVED_LISTING_PATH = "/api/playlists/saved";
export const PLAYLIST_SAVED_SIGN_IN_RETURN_PATH = PLAYLIST_SAVED_PAGE_PATH;

export const PLAYLIST_SAVED_LISTING_SELECT = [
  "created_at",
  "playlist_id",
  `playlists!inner(${PLAYLIST_CATALOG_LISTING_SELECT})`,
].join(", ");

export type PlaylistSavedListingQuery = {
  cursor: string | null;
  limit: number;
};

export type PlaylistSavedListingCursor = {
  createdAtMs: number;
  id: string;
};

export type PlaylistSavedJoinRow = {
  created_at: string;
  playlist_id?: string;
  playlists: unknown;
};

function quoteSavedListingFilterValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function parsePlaylistSavedListingQuery(params: {
  cursor?: string | null;
  limit?: string | number | null;
}): PlaylistSavedListingQuery {
  return {
    cursor: params.cursor?.trim() || null,
    limit: parsePlaylistListingLimit(params.limit),
  };
}

export function encodePlaylistSavedListingCursor(
  createdAtMs: number,
  id: string,
): string {
  return `${createdAtMs}:${id}`;
}

export function decodePlaylistSavedListingCursor(
  cursor: string | null | undefined,
): PlaylistSavedListingCursor | null {
  const raw = cursor?.trim();

  if (!raw) {
    return null;
  }

  const separator = raw.indexOf(":");

  if (separator <= 0) {
    return null;
  }

  const createdAtMs = Number(raw.slice(0, separator));
  const id = raw.slice(separator + 1).trim();

  if (!isUuid(id) || !Number.isFinite(createdAtMs)) {
    return null;
  }

  return { createdAtMs, id };
}

export function buildPlaylistSavedListingCursorFilter(
  cursor: PlaylistSavedListingCursor,
): string {
  const iso = quoteSavedListingFilterValue(
    new Date(cursor.createdAtMs).toISOString(),
  );

  return `created_at.lt.${iso},and(created_at.eq.${iso},playlist_id.lt.${cursor.id})`;
}

export function buildPlaylistSavedListingApiUrl(
  query: { cursor?: string | null; limit?: number },
): string {
  const params = new URLSearchParams();

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
  return search
    ? `${PLAYLIST_SAVED_LISTING_PATH}?${search}`
    : PLAYLIST_SAVED_LISTING_PATH;
}

export function unwrapPlaylistSavedEmbed(
  value: unknown,
): PlaylistCatalogRow | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as PlaylistCatalogRow)
      : null;
  }

  if (value && typeof value === "object") {
    return value as PlaylistCatalogRow;
  }

  return null;
}

export function mapPlaylistSavedJoinRow(
  row: PlaylistSavedJoinRow,
): { playlist: PlaylistCatalogRow; createdAt: string } | null {
  const playlist = unwrapPlaylistSavedEmbed(row.playlists);

  if (!playlist || !isPlaylistListedForCatalog(playlist)) {
    return null;
  }

  if (typeof row.created_at !== "string" || row.created_at.length === 0) {
    return null;
  }

  if (listedAtToMs(row.created_at) === null) {
    return null;
  }

  return {
    playlist,
    createdAt: row.created_at,
  };
}

export async function listSavedPlaylists(
  supabase: SupabaseClient,
  query: PlaylistSavedListingQuery,
  options: { userId: string },
): Promise<PlaylistListingResult> {
  if (!options.userId) {
    throw new Error("playlist_saved_listing_unauthorized");
  }

  let request = supabase
    .from("playlist_saves")
    .select(PLAYLIST_SAVED_LISTING_SELECT)
    .eq("user_id", options.userId)
    .eq("playlists.visibility", "public")
    .not("playlists.published_at", "is", null)
    .not("playlists.listed_at", "is", null)
    .not("playlists.slug", "is", null)
    .order("created_at", { ascending: false })
    .order("playlist_id", { ascending: false });

  const decoded = decodePlaylistSavedListingCursor(query.cursor);

  if (decoded) {
    request = request.or(buildPlaylistSavedListingCursorFilter(decoded));
  }

  const { data, error } = await request.limit(query.limit + 1);

  if (error) {
    throw new Error(error.message);
  }

  const fetchedRows = ((data as unknown as PlaylistSavedJoinRow[] | null) ?? [])
    .map(mapPlaylistSavedJoinRow)
    .filter(
      (row): row is { playlist: PlaylistCatalogRow; createdAt: string } =>
        row !== null,
    );
  const hasMore = fetchedRows.length > query.limit;
  const pageRows = fetchedRows.slice(0, query.limit);
  const lastPageRow = pageRows[pageRows.length - 1];
  const lastCreatedAtMs = lastPageRow
    ? listedAtToMs(lastPageRow.createdAt)
    : null;
  const nextCursor =
    hasMore && lastPageRow && lastCreatedAtMs !== null
      ? encodePlaylistSavedListingCursor(lastCreatedAtMs, lastPageRow.playlist.id)
      : null;

  if (pageRows.length === 0) {
    return {
      items: applyPlaylistListingSavedState([], new Set()),
      nextCursor: null,
    };
  }

  const catalogRows = pageRows.map((row) => row.playlist);
  const pageIds = catalogRows.map((row) => row.id);
  const [signedByPath, accessById, topicsById] = await Promise.all([
    signPlaylistListingCovers(catalogRows),
    loadPlaylistListingAccessByIds(supabase, pageIds),
    listPlaylistTopicKeysByPlaylistIds(supabase, pageIds),
  ]);

  const items = catalogRows
    .map((row) =>
      mapPlaylistCatalogRowToCandidate(row, {
        coverUrl: row.cover_path
          ? (signedByPath.get(row.cover_path) ?? null)
          : null,
        access: accessById.get(row.id) ?? "mixed",
        topics: topicsById.get(row.id) ?? [],
      }),
    )
    .filter((item): item is PlaylistListingCandidate => item !== null)
    .map(toPublicPlaylistListingItem);

  return {
    items: applyPlaylistListingSavedState(items, new Set(pageIds)),
    nextCursor,
  };
}

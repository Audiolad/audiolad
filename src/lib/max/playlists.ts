import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { toMaxPlaylistCard, toMaxPlaylistDetail } from "@/lib/max/playlist-dto";
import type { MaxPlaylistCardModel, MaxPlaylistDetail } from "@/lib/max/playlist-types";
import {
  listListedPlaylists,
  matchesPlaylistListingAccessFilter,
  type PlaylistListingQuery,
  type PlaylistListingResult,
} from "@/lib/playlists/listing";
import {
  loadPublicPlaylistBySlugWithClient,
  type PublicPlaylistLoadResult,
} from "@/lib/playlists/public-detail";

/** How many canonical pages to scan when an access filter is active. */
const MAX_PLAYLIST_ACCESS_PAGE_SCAN = 5;

export type ListMaxPublicPlaylistsFn = (
  query: PlaylistListingQuery,
  userId: string | null,
) => Promise<PlaylistListingResult>;

export type LoadMaxPublicPlaylistFn = (
  slug: string,
) => Promise<PublicPlaylistLoadResult>;

let listOverride: ListMaxPublicPlaylistsFn | null = null;
let detailOverride: LoadMaxPublicPlaylistFn | null = null;

export function setListMaxPublicPlaylistsForTests(
  fn: ListMaxPublicPlaylistsFn | null,
) {
  listOverride = fn;
}

export function setLoadMaxPublicPlaylistForTests(
  fn: LoadMaxPublicPlaylistFn | null,
) {
  detailOverride = fn;
}

export function createMaxPlaylistReadClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("max_playlist_read_client_unavailable");
  }

  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Public listed playlists for MAX.
 * Guest callers pass userId null so saved-state is not computed.
 * Access uses the canonical matcher; visibility stays inside listListedPlaylists.
 */
export async function listMaxPublicPlaylists(
  supabase: SupabaseClient,
  query: PlaylistListingQuery,
  userId: string | null,
): Promise<PlaylistListingResult> {
  if (query.access === "all") {
    return listListedPlaylists(supabase, query, { userId });
  }

  const items: PlaylistListingResult["items"] = [];
  const seenCursors = new Set<string>();
  let cursor = query.cursor;
  let nextCursor: string | null = null;

  if (cursor) {
    seenCursors.add(cursor);
  }

  for (let page = 0; page < MAX_PLAYLIST_ACCESS_PAGE_SCAN; page += 1) {
    const listed = await listListedPlaylists(
      supabase,
      { ...query, cursor },
      { userId },
    );
    for (const item of listed.items) {
      if (matchesPlaylistListingAccessFilter(item, query.access)) {
        items.push(item);
      }
    }

    nextCursor = listed.nextCursor;
    if (!listed.nextCursor || items.length >= query.limit) {
      break;
    }

    if (seenCursors.has(listed.nextCursor)) {
      nextCursor = null;
      break;
    }

    seenCursors.add(listed.nextCursor);
    cursor = listed.nextCursor;
  }

  return { items, nextCursor };
}

export async function loadMaxPlaylistCatalog(input: {
  query: PlaylistListingQuery;
  userId: string | null;
}): Promise<
  | { ok: true; items: MaxPlaylistCardModel[]; nextCursor: string | null }
  | { ok: false; reason: "storage_unavailable" }
> {
  try {
    const page = listOverride
      ? await listOverride(input.query, input.userId)
      : await listMaxPublicPlaylists(
          createMaxPlaylistReadClient(),
          input.query,
          input.userId,
        );

    return {
      ok: true,
      items: page.items.map(toMaxPlaylistCard),
      nextCursor: page.nextCursor,
    };
  } catch (error) {
    console.error(
      "max_playlist_catalog_error",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, reason: "storage_unavailable" };
  }
}

export async function loadMaxPlaylistDetail(
  slug: string,
): Promise<
  | { ok: true; detail: MaxPlaylistDetail }
  | { ok: false; reason: "not_found" | "storage_unavailable" }
> {
  try {
    const loaded = detailOverride
      ? await detailOverride(slug)
      : await loadPublicPlaylistBySlugWithClient(
          createMaxPlaylistReadClient(),
          slug,
        );

    if (!loaded.ok) {
      return loaded.reason === "not_found"
        ? { ok: false, reason: "not_found" }
        : { ok: false, reason: "storage_unavailable" };
    }

    return { ok: true, detail: toMaxPlaylistDetail(loaded.detail) };
  } catch (error) {
    console.error(
      "max_playlist_detail_error",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, reason: "storage_unavailable" };
  }
}

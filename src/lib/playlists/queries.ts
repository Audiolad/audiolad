import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPlaylistCoverSignedUrlsBatch,
} from "@/lib/playlists/covers";
import {
  arePracticesEligibleForPublicPlaylist,
  type PlaylistPublishPractice,
} from "@/lib/playlists/public-content";
import type { PlaylistListItem, PlaylistRow } from "@/lib/playlists/types";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type PlaylistCountEmbed = {
  count: number;
}[];

type PlaylistListRow = PlaylistRow & {
  playlist_items?: PlaylistCountEmbed | null;
};

type MosaicItemRow = {
  playlist_id: string;
  item_position: number;
  cover_url: string | null;
  practice_updated_at: string | null;
};

export async function listOwnedPlaylists(
  supabase: SupabaseClient,
  options: { userId: string },
): Promise<{ playlists: PlaylistListItem[]; error: string | null }> {
  const userId = options.userId.trim();

  if (!userId) {
    return { playlists: [], error: "playlist_list_user_required" };
  }

  const { data, error } = await supabase
    .from("playlists")
    .select(
      `
      id,
      title,
      visibility,
      slug,
      published_at,
      created_at,
      updated_at,
      cover_path,
      cover_updated_at,
      playlist_items(count)
    `,
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { playlists: [], error: error.message };
  }

  const rows = (data as PlaylistListRow[] | null) ?? [];
  const mosaicByPlaylist = new Map<string, Array<string | null>>();

  if (rows.length > 0) {
    const { data: mosaicRows, error: mosaicError } = await supabase.rpc(
      "get_owned_playlist_mosaic_covers",
    );

    if (mosaicError) {
      return { playlists: [], error: mosaicError.message };
    }

    for (const row of (mosaicRows as MosaicItemRow[] | null) ?? []) {
      const current = mosaicByPlaylist.get(row.playlist_id) ?? [];

      if (current.length >= 4) {
        continue;
      }

      current.push(
        getProductCoverDisplayUrl(row.cover_url, row.practice_updated_at),
      );
      mosaicByPlaylist.set(row.playlist_id, current);
    }
  }

  const coverPaths = rows
    .map((row) => row.cover_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  let signedByPath = new Map<string, string | null>();

  if (coverPaths.length > 0) {
    try {
      const storage = createServiceRoleClient();
      signedByPath = await createPlaylistCoverSignedUrlsBatch(
        storage,
        coverPaths,
        { userId },
      );
    } catch (signedError) {
      console.error(
        "playlist_list_cover_signed_batch_error",
        signedError instanceof Error ? signedError.message : signedError,
      );
    }
  }

  const playlists = rows.map((row) => ({
    id: row.id,
    title: row.title,
    visibility: row.visibility,
    slug: row.slug,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cover_path: row.cover_path ?? null,
    cover_updated_at: row.cover_updated_at ?? null,
    items_count: row.playlist_items?.[0]?.count ?? 0,
    coverUrl: row.cover_path
      ? (signedByPath.get(row.cover_path) ?? null)
      : null,
    mosaicCoverUrls: mosaicByPlaylist.get(row.id) ?? [],
  }));

  return { playlists, error: null };
}

export async function countOwnedPlaylists(
  supabase: SupabaseClient,
): Promise<{ count: number | null; error: string | null }> {
  const { count, error } = await supabase
    .from("playlists")
    .select("id", { count: "exact", head: true });

  if (error) {
    return { count: null, error: error.message };
  }

  return { count: count ?? 0, error: null };
}

export async function getOwnedPlaylistById(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ playlist: PlaylistRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("playlists")
    .select(
      "id, title, visibility, slug, published_at, created_at, updated_at, cover_path, cover_updated_at",
    )
    .eq("id", playlistId)
    .maybeSingle();

  if (error) {
    return { playlist: null, error: error.message };
  }

  if (!data) {
    return { playlist: null, error: null };
  }

  const row = data as PlaylistRow;

  return {
    playlist: {
      ...row,
      cover_path: row.cover_path ?? null,
      cover_updated_at: row.cover_updated_at ?? null,
    },
    error: null,
  };
}

export async function playlistSlugExists(
  supabase: SupabaseClient,
  slug: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("playlists")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error("playlist_slug_lookup_failed");
  }

  return Boolean(data?.id);
}

export async function loadPlaylistPracticesForPublishCheck(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ practices: PlaylistPublishPractice[]; error: string | null }> {
  const { data, error } = await supabase
    .from("playlist_items")
    .select(
      `
      practice_id,
      practices (
        id,
        status,
        is_free,
        price,
        is_catalog_listed
      )
    `,
    )
    .eq("playlist_id", playlistId);

  if (error) {
    return { practices: [], error: error.message };
  }

  const practices: PlaylistPublishPractice[] = [];

  for (const row of data ?? []) {
    const practice = Array.isArray(row.practices)
      ? row.practices[0]
      : row.practices;

    if (!practice || typeof practice !== "object") {
      return {
        practices: [],
        error: "playlist_item_practice_missing",
      };
    }

    practices.push(practice as PlaylistPublishPractice);
  }

  return { practices, error: null };
}

export async function assertPlaylistPublicContentAllowed(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "error" }> {
  const { practices, error } = await loadPlaylistPracticesForPublishCheck(
    supabase,
    playlistId,
  );

  if (error) {
    return { ok: false, reason: "error" };
  }

  if (!arePracticesEligibleForPublicPlaylist(practices)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}

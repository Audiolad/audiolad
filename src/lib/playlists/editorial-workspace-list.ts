import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPlaylistCoverSignedUrlsBatch,
} from "@/lib/playlists/covers";
import { loadProfileSummaries } from "@/lib/playlists/profile-summaries";
import { listVisibleEditorialDirections } from "@/lib/playlists/editorial-directions";
import { listEditablePlatformPlaylists } from "@/lib/playlists/queries";
import type { EditorialWorkspaceListItem } from "@/lib/playlists/types";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type MosaicItemRow = {
  playlist_id: string;
  position: number;
  practices:
    | { cover_url?: string | null; updated_at?: string | null }
    | { cover_url?: string | null; updated_at?: string | null }[]
    | null;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export async function listEditorialWorkspacePlaylists(
  supabase: SupabaseClient,
  options: {
    userId: string;
    canManageAll: boolean;
    directionIds?: string[];
  },
): Promise<{ playlists: EditorialWorkspaceListItem[]; error: string | null }> {
  const { playlists, error } = await listEditablePlatformPlaylists(supabase, {
    userId: options.userId,
    canManageAll: options.canManageAll,
    includePublished: true,
    directionIds: options.directionIds,
  });

  if (error) {
    return { playlists: [], error };
  }

  if (playlists.length === 0) {
    return { playlists: [], error: null };
  }

  const playlistIds = playlists.map((row) => row.id);
  const authorCountByPlaylist = new Map<string, number>();
  const mosaicByPlaylist = new Map<string, Array<string | null>>();

  const { data: itemRows, error: itemsError } = await supabase
    .from("playlist_items")
    .select(
      `
      playlist_id,
      position,
      practices (
        author_id,
        cover_url,
        updated_at
      )
    `,
    )
    .in("playlist_id", playlistIds)
    .order("position", { ascending: true });

  if (itemsError) {
    return { playlists: [], error: itemsError.message };
  }

  const authorsByPlaylist = new Map<string, Set<string>>();

  for (const row of (itemRows as MosaicItemRow[] | null) ?? []) {
    const playlistId =
      typeof row.playlist_id === "string" ? row.playlist_id : null;

    if (!playlistId) {
      continue;
    }

    const practice = normalizeOne(row.practices);
    const authorId =
      practice && typeof practice === "object"
        ? ((practice as { author_id?: string | null }).author_id ?? null)
        : null;

    if (authorId) {
      const authors = authorsByPlaylist.get(playlistId) ?? new Set<string>();
      authors.add(authorId);
      authorsByPlaylist.set(playlistId, authors);
    }

    const mosaic = mosaicByPlaylist.get(playlistId) ?? [];

    if (mosaic.length < 4) {
      mosaic.push(
        getProductCoverDisplayUrl(
          practice?.cover_url ?? null,
          practice?.updated_at ?? null,
        ),
      );
      mosaicByPlaylist.set(playlistId, mosaic);
    }
  }

  for (const [playlistId, authors] of authorsByPlaylist) {
    authorCountByPlaylist.set(playlistId, authors.size);
  }

  const creatorIds = playlists
    .map((row) => row.created_by)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  let profiles = new Map<string, { displayName: string }>();

  try {
    const service = createServiceRoleClient();
    profiles = await loadProfileSummaries(service, creatorIds);
  } catch (profileError) {
    console.error(
      "editorial_workspace_list_creator_error",
      profileError instanceof Error ? profileError.message : profileError,
    );
  }

  const coverPaths = playlists
    .map((row) => row.cover_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  let signedByPath = new Map<string, string | null>();

  if (coverPaths.length > 0) {
    try {
      const storage = createServiceRoleClient();
      signedByPath = await createPlaylistCoverSignedUrlsBatch(
        storage,
        coverPaths,
        { userId: options.userId },
      );
    } catch (signedError) {
      console.error(
        "editorial_workspace_list_cover_error",
        signedError instanceof Error ? signedError.message : signedError,
      );
    }
  }

  const directionIds = Array.from(
    new Set(
      playlists
        .map((row) => row.direction_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const directionNameById = new Map<string, string>();

  if (directionIds.length > 0) {
    const { directions, error: directionError } =
      await listVisibleEditorialDirections(supabase, { ids: directionIds });

    if (directionError) {
      console.error("editorial_workspace_list_direction_error", directionError);
    }

    for (const direction of directions) {
      directionNameById.set(direction.id, direction.name);
    }
  }

  const workspacePlaylists: EditorialWorkspaceListItem[] = playlists.map(
    (row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      visibility: row.visibility,
      published_at: row.published_at,
      first_published_at: row.first_published_at ?? null,
      updated_at: row.updated_at,
      items_count: row.items_count,
      unique_author_count: authorCountByPlaylist.get(row.id) ?? 0,
      created_by: row.created_by ?? null,
      creatorName: row.created_by
        ? (profiles.get(row.created_by)?.displayName ?? null)
        : null,
      coverUrl: row.cover_path
        ? (signedByPath.get(row.cover_path) ?? null)
        : null,
      mosaicCoverUrls: mosaicByPlaylist.get(row.id) ?? [],
      direction_id: row.direction_id ?? null,
      directionName: row.direction_id
        ? (directionNameById.get(row.direction_id) ?? null)
        : null,
    }),
  );

  return { playlists: workspacePlaylists, error: null };
}

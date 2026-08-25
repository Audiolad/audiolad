import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPlaylistCoverSignedUrlsBatch,
} from "@/lib/playlists/covers";
import {
  arePracticesEligibleForPublicPlaylist,
  type PlaylistPublishPractice,
} from "@/lib/playlists/public-content";
import { isPracticeEligibleForEditorialPlaylist } from "@/lib/playlists/editorial-content";
import type { PlaylistListItem, PlaylistRow, EditorialPlaylistListItem } from "@/lib/playlists/types";
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
      is_editorial,
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
    is_editorial: row.is_editorial === true,
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
  userId: string,
): Promise<{ count: number | null; error: string | null }> {
  const { count, error } = await supabase
    .from("playlists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("owner_type", "user");

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
      "id, title, visibility, slug, published_at, listed_at, created_at, updated_at, cover_path, cover_image, cover_updated_at, is_editorial, owner_type, user_id, created_by, description, first_published_at, direction_id",
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
      is_editorial: row.is_editorial === true,
      owner_type: row.owner_type === "platform" ? "platform" : "user",
      user_id: row.user_id ?? null,
      created_by: row.created_by ?? null,
      description: row.description ?? null,
      first_published_at: row.first_published_at ?? null,
      listed_at: row.listed_at ?? null,
      direction_id: row.direction_id ?? null,
    },
    error: null,
  };
}

export async function listEditorialPlaylists(
  supabase: SupabaseClient,
): Promise<{ playlists: EditorialPlaylistListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("playlists")
    .select(
      `
      id,
      title,
      slug,
      published_at,
      updated_at,
      cover_path,
      user_id,
      playlist_items(count)
    `,
    )
    .eq("is_editorial", true)
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .not("slug", "is", null)
    .order("published_at", { ascending: false });

  if (error) {
    return { playlists: [], error: error.message };
  }

  type EditorialRow = {
    id: string;
    title: string;
    slug: string | null;
    published_at: string | null;
    updated_at: string;
    cover_path: string | null;
    user_id: string;
    playlist_items?: PlaylistCountEmbed | null;
  };

  const rows = (data as EditorialRow[] | null) ?? [];
  const mosaicByPlaylist = new Map<string, Array<string | null>>();

  if (rows.length > 0) {
    const { data: mosaicRows, error: mosaicError } = await supabase
      .from("playlist_items")
      .select(
        `
        playlist_id,
        position,
        practices (
          cover_url,
          updated_at
        )
      `,
      )
      .in(
        "playlist_id",
        rows.map((row) => row.id),
      )
      .order("position", { ascending: true });

    if (mosaicError) {
      return { playlists: [], error: mosaicError.message };
    }

    for (const row of mosaicRows ?? []) {
      const playlistId =
        typeof row.playlist_id === "string" ? row.playlist_id : null;

      if (!playlistId) {
        continue;
      }

      const current = mosaicByPlaylist.get(playlistId) ?? [];

      if (current.length >= 4) {
        continue;
      }

      const practice = Array.isArray(row.practices)
        ? row.practices[0]
        : row.practices;

      if (practice && typeof practice === "object") {
        current.push(
          getProductCoverDisplayUrl(
            (practice as { cover_url?: string | null }).cover_url ?? null,
            (practice as { updated_at?: string | null }).updated_at ?? null,
          ),
        );
      } else {
        current.push(null);
      }

      mosaicByPlaylist.set(playlistId, current);
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
        rows[0]?.user_id ? { userId: rows[0].user_id } : undefined,
      );
    } catch (signedError) {
      console.error(
        "editorial_playlist_list_cover_signed_batch_error",
        signedError instanceof Error ? signedError.message : signedError,
      );
    }
  }

  const playlists: EditorialPlaylistListItem[] = rows.flatMap((row) => {
    if (!row.slug || !row.published_at) {
      return [];
    }

    return [
      {
        id: row.id,
        title: row.title,
        slug: row.slug,
        published_at: row.published_at,
        updated_at: row.updated_at,
        items_count: row.playlist_items?.[0]?.count ?? 0,
        coverUrl: row.cover_path
          ? (signedByPath.get(row.cover_path) ?? null)
          : null,
        mosaicCoverUrls: mosaicByPlaylist.get(row.id) ?? [],
      },
    ];
  });

  return { playlists, error: null };
}

export async function listEditablePlatformPlaylists(
  supabase: SupabaseClient,
  options: {
    userId: string;
    canManageAll: boolean;
    /** Stage 2 workspace: include published platform playlists the user can edit. */
    includePublished?: boolean;
    directionIds?: string[];
  },
): Promise<{ playlists: PlaylistListItem[]; error: string | null }> {
  const userId = options.userId.trim();

  if (!userId) {
    return { playlists: [], error: null };
  }

  let playlistIds: string[] | null = null;
  const directionIds = (options.directionIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  if (!options.canManageAll) {
    const { data: collabRows, error: collabError } = await supabase
      .from("playlist_collaborators")
      .select("playlist_id")
      .eq("user_id", userId);

    if (collabError) {
      return { playlists: [], error: collabError.message };
    }

    playlistIds = (collabRows ?? [])
      .map((row) => row.playlist_id)
      .filter((id): id is string => typeof id === "string");

    if (playlistIds.length === 0 && directionIds.length === 0) {
      return { playlists: [], error: null };
    }
  }

  let query = supabase
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
      is_editorial,
      owner_type,
      created_by,
      first_published_at,
      description,
      direction_id,
      playlist_items(count)
    `,
    )
    .eq("owner_type", "platform")
    .eq("is_editorial", true)
    .order("updated_at", { ascending: false });

  if (!options.includePublished) {
    query = query.eq("visibility", "private");
  }

  if (!options.canManageAll) {
    const filters: string[] = [];

    if (playlistIds && playlistIds.length > 0) {
      filters.push(`id.in.(${playlistIds.join(",")})`);
    }

    if (directionIds.length > 0) {
      filters.push(`direction_id.in.(${directionIds.join(",")})`);
    }

    if (filters.length === 0) {
      return { playlists: [], error: null };
    }

    query = query.or(filters.join(","));
  }

  const { data, error } = await query;

  if (error) {
    return { playlists: [], error: error.message };
  }

  const rows = (data as PlaylistListRow[] | null) ?? [];

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
    is_editorial: true,
    owner_type: "platform" as const,
    created_by: row.created_by ?? null,
    first_published_at: row.first_published_at ?? null,
    description: row.description ?? null,
    direction_id: row.direction_id ?? null,
    items_count: row.playlist_items?.[0]?.count ?? 0,
    coverUrl: null,
    mosaicCoverUrls: [],
  }));

  return { playlists, error: null };
}

export async function playlistSlugExists(
  supabase: SupabaseClient,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase.from("playlists").select("id").eq("slug", slug);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.maybeSingle();

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

export async function assertEditorialPlaylistPublishReady(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<
  | { ok: true; itemsCount: number }
  | { ok: false; reason: "empty" | "invalid" | "error" }
> {
  const { data, error } = await supabase
    .from("playlist_items")
    .select(
      `
      practice_id,
      practices (
        id,
        status,
        is_catalog_listed,
        slug,
        author_id,
        audio_url
      )
    `,
    )
    .eq("playlist_id", playlistId);

  if (error) {
    return { ok: false, reason: "error" };
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return { ok: false, reason: "empty" };
  }

  let eligibleCount = 0;

  for (const row of rows) {
    const practice = Array.isArray(row.practices)
      ? row.practices[0]
      : row.practices;

    if (!practice || typeof practice !== "object") {
      continue;
    }

    if (
      isPracticeEligibleForEditorialPlaylist(
        practice as {
          status: string | null;
          is_catalog_listed: boolean | null;
          slug: string | null;
          author_id: string | null;
          audio_url: string | null;
        },
        1,
      )
    ) {
      eligibleCount += 1;
    }
  }

  if (eligibleCount === 0) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, itemsCount: rows.length };
}

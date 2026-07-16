import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/auth/platform-admin";
import {
  assertPlaylistCoverPathForOwner,
  removePlaylistCoverObject,
} from "@/lib/playlists/covers";
import { PUBLIC_PLAYLIST_CONTENT_ERROR_MESSAGE } from "@/lib/playlists/public-content";
import {
  assertPlaylistPublicContentAllowed,
  getOwnedPlaylistById,
  playlistSlugExists,
} from "@/lib/playlists/queries";
import {
  canUserEditPlaylist,
  loadPlaylistForAccessCheck,
} from "@/lib/playlists/playlist-access";
import { allocateUniquePlaylistSlug } from "@/lib/playlists/slug";
import type { PlaylistRow } from "@/lib/playlists/types";
import {
  isUuid,
  parsePatchPlaylistBody,
} from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toPlaylistResponse(row: PlaylistRow) {
  return {
    id: row.id,
    title: row.title,
    visibility: row.visibility,
    slug: row.slug,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_editorial: row.is_editorial,
  };
}

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("playlists_patch_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parsePatchPlaylistBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { playlist, error: loadError } = await getOwnedPlaylistById(
    supabase,
    id,
  );

  if (loadError) {
    console.error("playlists_patch_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
  }

  const { playlist: accessRow, error: accessError } =
    await loadPlaylistForAccessCheck(supabase, id);

  if (accessError || !accessRow) {
    console.error("playlists_patch_access_error", accessError);
    return notFoundResponse();
  }

  const canEdit = await canUserEditPlaylist(supabase, user.id, accessRow);

  if (!canEdit) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (parsed.isEditorial !== undefined) {
    const adminCheck = await assertPlatformAdmin(supabase, user.id);

    if (!adminCheck.ok) {
      return NextResponse.json(
        { error: adminCheck.status === 403 ? "forbidden" : "internal_error" },
        { status: adminCheck.status },
      );
    }
  }

  const nextTitle = parsed.title ?? playlist.title;
  const nextVisibility = parsed.visibility ?? playlist.visibility;
  const nextIsEditorial =
    parsed.isEditorial !== undefined
      ? parsed.isEditorial
      : playlist.is_editorial;

  if (nextIsEditorial && nextVisibility === "private") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (playlist.is_editorial && nextVisibility === "private") {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Редакционный плейлист нельзя сделать приватным.",
      },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.title !== undefined) {
    updates.title = parsed.title;
  }

  if (parsed.isEditorial !== undefined) {
    updates.is_editorial = parsed.isEditorial;
  }

  if (nextVisibility === playlist.visibility) {
    // title-only or no-op visibility
  } else if (nextVisibility === "public") {
    if (!nextIsEditorial) {
      const contentCheck = await assertPlaylistPublicContentAllowed(
        supabase,
        id,
      );

      if (!contentCheck.ok) {
        if (contentCheck.reason === "invalid") {
          return NextResponse.json(
            {
              error: "public_content_invalid",
              message: PUBLIC_PLAYLIST_CONTENT_ERROR_MESSAGE,
            },
            { status: 400 },
          );
        }

        console.error("playlists_patch_public_content_check_error");
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }

    let slug = playlist.slug;

    if (!slug) {
      try {
        slug = await allocateUniquePlaylistSlug(nextTitle, (candidate) =>
          playlistSlugExists(supabase, candidate),
        );
      } catch (error) {
        console.error(
          "playlists_patch_slug_lookup_error",
          error instanceof Error ? error.message : error,
        );
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      if (!slug) {
        return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
      }
    }

    updates.visibility = "public";
    updates.slug = slug;
    updates.published_at = new Date().toISOString();
  } else {
    updates.visibility = "private";
    updates.slug = null;
    updates.published_at = null;
  }

  const { data, error } = await supabase
    .from("playlists")
    .update(updates)
    .eq("id", id)
    .select(
      "id, title, visibility, slug, published_at, created_at, updated_at, cover_path, cover_updated_at, is_editorial",
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }

    console.error("playlists_patch_update_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!data) {
    return notFoundResponse();
  }

  return NextResponse.json({
    playlist: toPlaylistResponse(data as PlaylistRow),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("playlists_delete_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { playlist, error: loadError } = await getOwnedPlaylistById(
    supabase,
    id,
  );

  if (loadError) {
    console.error("playlists_delete_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
  }

  const coverPathToRemove = playlist.cover_path;

  if (
    coverPathToRemove &&
    !assertPlaylistCoverPathForOwner(coverPathToRemove, user.id, id)
  ) {
    console.error("playlist_delete_invalid_cover_path");
    // Still allow playlist delete; skip unsafe storage cleanup.
  }

  const { error } = await supabase.from("playlists").delete().eq("id", id);

  if (error) {
    console.error("playlists_delete_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (
    coverPathToRemove &&
    assertPlaylistCoverPathForOwner(coverPathToRemove, user.id, id)
  ) {
    try {
      const storage = createServiceRoleClient();
      const removed = await removePlaylistCoverObject(
        storage,
        coverPathToRemove,
        user.id,
        id,
      );

      if (!removed.ok) {
        console.error(
          "playlist_delete_cover_cleanup_error",
          removed.error,
        );
      }
    } catch (cleanupError) {
      console.error(
        "playlist_delete_cover_cleanup_exception",
        cleanupError instanceof Error
          ? cleanupError.message
          : cleanupError,
      );
    }
  }

  return new NextResponse(null, { status: 204 });
}

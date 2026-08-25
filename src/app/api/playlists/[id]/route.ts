import { NextResponse } from "next/server";

import {
  assertPlaylistCoverPathForOwner,
  removePlaylistCoverObject,
} from "@/lib/playlists/covers";
import { PUBLIC_PLAYLIST_CONTENT_ERROR_MESSAGE } from "@/lib/playlists/public-content";
import {
  assertEditorialPlaylistPublishReady,
  assertPlaylistPublicContentAllowed,
  getOwnedPlaylistById,
  playlistSlugExists,
} from "@/lib/playlists/queries";
import { hasPermission } from "@/lib/auth/platform-access";
import {
  canUserDeletePlaylist,
  canUserEditPlaylist,
  isPlatformPlaylist,
  loadPlaylistForAccessCheck,
  logPlaylistAudit,
} from "@/lib/playlists/playlist-access";
import { resolveListedAtOnPublish } from "@/lib/playlists/listed-at";
import { allocateUniquePlaylistSlug } from "@/lib/playlists/slug";
import type { PlaylistRow } from "@/lib/playlists/types";
import { isUuid, parsePatchPlaylistBody } from "@/lib/playlists/validation";
import {
  playlistCanonicalFromSlug,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { resolvePlaylistIndexNowEvent } from "@/lib/seo/indexnow/public-fields";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
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
    owner_type: row.owner_type ?? (row.is_editorial ? "platform" : "user"),
    description: row.description ?? null,
    first_published_at: row.first_published_at ?? null,
    created_by: row.created_by ?? null,
    direction_id: row.direction_id ?? null,
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
    return NextResponse.json(
      {
        error: "invalid_request",
        ...(parsed.message ? { message: parsed.message } : {}),
      },
      { status: 400 },
    );
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

  if (
    parsed.isEditorial !== undefined &&
    parsed.isEditorial !== playlist.is_editorial
  ) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Тип владения плейлиста нельзя изменить.",
      },
      { status: 400 },
    );
  }

  const nextTitle = parsed.title ?? playlist.title;
  const nextVisibility = parsed.visibility ?? playlist.visibility;
  const platform = isPlatformPlaylist(accessRow);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.title !== undefined) {
    updates.title = parsed.title;
  }

  if (parsed.description !== undefined) {
    updates.description = parsed.description;
  }

  if (parsed.directionId !== undefined) {
    if (!platform) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const canMoveDirection = await hasPermission(
      supabase,
      user.id,
      "playlists.manage",
    );

    if (!canMoveDirection) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (parsed.directionId !== (playlist.direction_id ?? null)) {
      updates.direction_id = parsed.directionId;
    }
  }

  if (parsed.slug !== undefined) {
    if (!platform) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (playlist.first_published_at) {
      return NextResponse.json(
        {
          error: "slug_locked",
          message: "После публикации slug редакционного плейлиста нельзя менять.",
        },
        { status: 409 },
      );
    }

    if (parsed.slug !== playlist.slug) {
      try {
        if (await playlistSlugExists(supabase, parsed.slug, id)) {
          return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
        }
      } catch (error) {
        console.error(
          "playlists_patch_slug_lookup_error",
          error instanceof Error ? error.message : error,
        );
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      updates.slug = parsed.slug;
    }
  }

  if (nextVisibility === playlist.visibility) {
    // title/description-only or no-op visibility
  } else if (nextVisibility === "public") {
    if (platform) {
      const publishCheck = await assertEditorialPlaylistPublishReady(
        supabase,
        id,
      );

      if (!publishCheck.ok) {
        if (publishCheck.reason === "empty" || publishCheck.reason === "invalid") {
          return NextResponse.json(
            {
              error: "invalid_request",
              message:
                "Чтобы опубликовать плейлист, добавьте хотя бы один материал из каталога.",
            },
            { status: 400 },
          );
        }

        console.error("playlists_patch_editorial_publish_check_error");
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    } else {
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

    let slug =
      typeof updates.slug === "string" ? updates.slug : playlist.slug;

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
    updates.first_published_at =
      playlist.first_published_at ?? updates.published_at;
    const listedAt = resolveListedAtOnPublish({
      ownerType: playlist.owner_type,
      isEditorial: playlist.is_editorial === true,
      currentListedAt: playlist.listed_at,
      publishedAt: String(updates.published_at),
    });
    if (listedAt !== undefined) {
      updates.listed_at = listedAt;
    }
  } else if (platform) {
    updates.visibility = "private";
    updates.published_at = null;
    // Keep allocated editorial slug after unpublish / while drafting.
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
      "id, title, visibility, slug, published_at, created_at, updated_at, cover_path, cover_updated_at, is_editorial, owner_type, created_by, description, first_published_at, direction_id",
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }

    if ((error.message ?? "").includes("editorial_slug_locked")) {
      return NextResponse.json(
        {
          error: "slug_locked",
          message: "После публикации slug редакционного плейлиста нельзя менять.",
        },
        { status: 409 },
      );
    }

    console.error("playlists_patch_update_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!data) {
    return notFoundResponse();
  }

  const updated = data as PlaylistRow;
  const becamePublic =
    playlist.visibility !== "public" && updated.visibility === "public";
  const becamePrivate =
    playlist.visibility === "public" && updated.visibility === "private";

  if (becamePublic) {
    await logPlaylistAudit(supabase, id, "published", {
      slug: updated.slug,
    });
  } else if (becamePrivate) {
    await logPlaylistAudit(supabase, id, "unpublished", {
      slug: updated.slug,
    });
  } else {
    await logPlaylistAudit(supabase, id, "metadata_updated", {
      title: parsed.title !== undefined,
      description: parsed.description !== undefined,
    });
  }

  const event = resolvePlaylistIndexNowEvent({
    previousVisibility: playlist.visibility,
    nextVisibility: updated.visibility,
    previousSlug: playlist.slug,
    nextSlug: updated.slug,
    titleChanged: parsed.title !== undefined && parsed.title !== playlist.title,
    editorialChanged: false,
  });

  if (event.reason && event.slugs.length > 0) {
    const absoluteUrls = event.slugs
      .map((slug) => playlistCanonicalFromSlug(slug))
      .filter((url): url is string => Boolean(url));

    if (absoluteUrls.length > 0) {
      scheduleIndexNowNotification(
        absoluteUrls,
        INDEXNOW_REASONS[event.reason],
      );
    }
  }

  return NextResponse.json({
    playlist: toPlaylistResponse(updated),
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

  const { playlist: accessRow, error: accessError } =
    await loadPlaylistForAccessCheck(supabase, id);

  if (accessError || !accessRow) {
    return notFoundResponse();
  }

  const canDelete = await canUserDeletePlaylist(supabase, user.id, accessRow);

  if (!canDelete) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const coverPathToRemove = playlist.cover_path;
  const coverOwnerId = accessRow.user_id ?? user.id;

  if (
    coverPathToRemove &&
    !assertPlaylistCoverPathForOwner(coverPathToRemove, coverOwnerId, id)
  ) {
    console.error("playlist_delete_invalid_cover_path");
  }

  const { error } = await supabase.from("playlists").delete().eq("id", id);

  if (error) {
    console.error("playlists_delete_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (
    coverPathToRemove &&
    assertPlaylistCoverPathForOwner(coverPathToRemove, coverOwnerId, id)
  ) {
    try {
      const storage = createServiceRoleClient();
      const removed = await removePlaylistCoverObject(
        storage,
        coverPathToRemove,
        coverOwnerId,
        id,
      );

      if (!removed.ok) {
        console.error("playlist_delete_cover_cleanup_error", removed.error);
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

  if (playlist.visibility === "public" && playlist.slug) {
    const url = playlistCanonicalFromSlug(playlist.slug);

    if (url) {
      scheduleIndexNowNotification(
        [url],
        INDEXNOW_REASONS.playlist_unpublished,
      );
    }
  }

  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/platform-access";
import { logPlaylistAudit } from "@/lib/playlists/playlist-access";
import { allocateUniquePlaylistSlug } from "@/lib/playlists/slug";
import {
  countOwnedPlaylists,
  playlistSlugExists,
} from "@/lib/playlists/queries";
import { PLAYLIST_MAX_PER_USER, type PlaylistRow } from "@/lib/playlists/types";
import { parseCreatePlaylistBody } from "@/lib/playlists/validation";
import {
  playlistCanonicalFromSlug,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import { createClientFromRequest } from "@/lib/supabase/request-client";

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
  };
}

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("playlists_create_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseCreatePlaylistBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (parsed.isEditorial) {
    const createCheck = await assertPermission(
      supabase,
      user.id,
      "playlists.create_editorial",
    );

    if (!createCheck.ok) {
      return NextResponse.json(
        { error: createCheck.status === 403 ? "forbidden" : "internal_error" },
        { status: createCheck.status },
      );
    }

    let slug: string | null = parsed.slug ?? null;

    if (slug) {
      try {
        if (await playlistSlugExists(supabase, slug)) {
          return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
        }
      } catch (error) {
        console.error(
          "playlists_create_slug_lookup_error",
          error instanceof Error ? error.message : error,
        );
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    } else {
      try {
        slug = await allocateUniquePlaylistSlug(parsed.title, (candidate) =>
          playlistSlugExists(supabase, candidate),
        );
      } catch (error) {
        console.error(
          "playlists_create_slug_lookup_error",
          error instanceof Error ? error.message : error,
        );
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      if (!slug) {
        return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from("playlists")
      .insert({
        user_id: null,
        owner_type: "platform",
        created_by: user.id,
        title: parsed.title,
        description: parsed.description,
        visibility: "private",
        slug,
        published_at: null,
        is_editorial: true,
      })
      .select(
        "id, title, visibility, slug, published_at, created_at, updated_at, cover_path, cover_updated_at, is_editorial, owner_type, created_by, description",
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
      }

      console.error("playlists_create_editorial_insert_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const created = data as PlaylistRow;

    const { error: attachError } = await supabase.rpc(
      "attach_playlist_creator_as_manager",
      { p_playlist_id: created.id },
    );

    if (attachError) {
      console.error(
        "playlists_create_editorial_attach_error",
        attachError.message,
      );

      const { error: deleteError } = await supabase
        .from("playlists")
        .delete()
        .eq("id", created.id);

      if (deleteError) {
        console.error(
          "playlists_create_editorial_attach_rollback_error",
          deleteError.message,
        );
      }

      const { error: rollbackError } = await supabase.rpc(
        "rollback_unpublished_editorial_create",
        { p_playlist_id: created.id },
      );

      if (
        rollbackError &&
        !/playlist_not_found/i.test(rollbackError.message ?? "")
      ) {
        console.error(
          "playlists_create_editorial_attach_rollback_rpc_error",
          rollbackError.message,
        );
      }

      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    await logPlaylistAudit(supabase, created.id, "playlist_created", {
      owner_type: "platform",
      visibility: "private",
    });

    return NextResponse.json(
      { playlist: toPlaylistResponse(created) },
      { status: 201 },
    );
  }

  const { count, error: countError } = await countOwnedPlaylists(
    supabase,
    user.id,
  );

  if (countError || count === null) {
    console.error("playlists_create_count_error", countError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (count >= PLAYLIST_MAX_PER_USER) {
    return NextResponse.json(
      {
        error: "limit_reached",
        message: "Можно создать не больше 50 плейлистов.",
      },
      { status: 409 },
    );
  }

  let insertPayload: Record<string, unknown> = {
    user_id: user.id,
    owner_type: "user",
    created_by: user.id,
    title: parsed.title,
    description: parsed.description,
    visibility: parsed.visibility,
    slug: null,
    published_at: null,
    is_editorial: false,
  };

  if (parsed.visibility === "public") {
    let slug: string | null;

    try {
      slug = await allocateUniquePlaylistSlug(parsed.title, (candidate) =>
        playlistSlugExists(supabase, candidate),
      );
    } catch (error) {
      console.error(
        "playlists_create_slug_lookup_error",
        error instanceof Error ? error.message : error,
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!slug) {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }

    insertPayload = {
      ...insertPayload,
      visibility: "public",
      slug,
      published_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from("playlists")
    .insert(insertPayload)
    .select(
      "id, title, visibility, slug, published_at, created_at, updated_at, cover_path, cover_updated_at, is_editorial, owner_type, created_by, description",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }

    console.error("playlists_create_insert_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const created = data as PlaylistRow;

  await logPlaylistAudit(supabase, created.id, "playlist_created", {
    owner_type: "user",
    visibility: created.visibility,
  });

  if (created.visibility === "public" && created.slug) {
    const url = playlistCanonicalFromSlug(created.slug);

    if (url) {
      scheduleIndexNowNotification([url], INDEXNOW_REASONS.playlist_published);
    }
  }

  return NextResponse.json(
    { playlist: toPlaylistResponse(created) },
    { status: 201 },
  );
}

import { NextResponse } from "next/server";

import { allocateUniquePlaylistSlug } from "@/lib/playlists/slug";
import {
  countOwnedPlaylists,
  playlistSlugExists,
} from "@/lib/playlists/queries";
import { PLAYLIST_MAX_PER_USER, type PlaylistRow } from "@/lib/playlists/types";
import { parseCreatePlaylistBody } from "@/lib/playlists/validation";
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

  const { count, error: countError } = await countOwnedPlaylists(supabase);

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
    title: parsed.title,
    visibility: parsed.visibility,
    slug: null,
    published_at: null,
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
      slug,
      published_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from("playlists")
    .insert(insertPayload)
    .select(
      "id, title, visibility, slug, published_at, created_at, updated_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }

    console.error("playlists_create_insert_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(
    { playlist: toPlaylistResponse(data as PlaylistRow) },
    { status: 201 },
  );
}

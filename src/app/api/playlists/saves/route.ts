import { NextResponse } from "next/server";

import {
  handleCreatePlaylistSave,
  handleDeletePlaylistSave,
} from "@/lib/playlists/playlist-saves-api";
import { createSupabasePlaylistSavesStore } from "@/lib/playlists/playlist-saves";
import { createClientFromRequest } from "@/lib/supabase/request-client";

async function resolveRequestUser(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("playlist_saves_auth_error", authError.message);
  }

  return {
    userId: user?.id ?? null,
    store: createSupabasePlaylistSavesStore(supabase),
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  return request.json();
}

export async function POST(request: Request) {
  const { userId, store } = await resolveRequestUser(request);

  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await handleCreatePlaylistSave({
    userId,
    body,
    store,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(request: Request) {
  const { userId, store } = await resolveRequestUser(request);

  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await handleDeletePlaylistSave({
    userId,
    body,
    store,
  });

  return NextResponse.json(result.body, { status: result.status });
}

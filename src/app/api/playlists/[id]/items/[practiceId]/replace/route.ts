import { NextResponse } from "next/server";

import {
  isEditorialReplaceRpcResult,
  mapEditorialReplaceRpcError,
} from "@/lib/playlists/editorial-practices";
import {
  canUserEditEditorialPlaylist,
  loadPlaylistForAccessCheck,
} from "@/lib/playlists/playlist-access";
import { isUuid, parseReplacePlaylistItemBody } from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ id: string; practiceId: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function POST(request: Request, context: RouteContext) {
  const { id, practiceId } = await context.params;

  if (!isUuid(id) || !isUuid(practiceId)) {
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
    console.error("playlist_item_replace_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseReplacePlaylistItemBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { playlist, error: loadError } = await loadPlaylistForAccessCheck(
    supabase,
    id,
  );

  if (loadError) {
    console.error("playlist_item_replace_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
  }

  const canEdit = await canUserEditEditorialPlaylist(supabase, user.id, playlist);

  if (!canEdit) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("replace_playlist_item", {
    p_playlist_id: id,
    p_old_practice_id: practiceId,
    p_new_practice_id: parsed.practiceId,
  });

  if (error) {
    const mapped = mapEditorialReplaceRpcError(error.message ?? "");
    console.error("playlist_item_replace_rpc_error", error.message);
    return NextResponse.json(
      {
        error: mapped.error,
        message: mapped.message,
      },
      { status: mapped.status },
    );
  }

  if (!isEditorialReplaceRpcResult(data)) {
    console.error("playlist_item_replace_invalid_rpc_result");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({
    replaced: data.replaced,
    position: data.position,
    oldPracticeId: data.old_practice_id,
    newPracticeId: data.new_practice_id,
  });
}

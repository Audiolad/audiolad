import { NextResponse } from "next/server";

import {
  canUserEditPlaylist,
  loadPlaylistForAccessCheck,
} from "@/lib/playlists/playlist-access";
import { isUuid, parseOptionalUuidQueryValue } from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ id: string; practiceId: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function DELETE(request: Request, context: RouteContext) {
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
    console.error("playlist_item_delete_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { playlist: accessRow, error: accessError } =
    await loadPlaylistForAccessCheck(supabase, id);

  if (accessError) {
    console.error("playlist_item_delete_access_error", accessError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!accessRow) {
    return notFoundResponse();
  }

  const canEdit = await canUserEditPlaylist(supabase, user.id, accessRow);

  if (!canEdit) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const audioItemIdResult = parseOptionalUuidQueryValue(
    new URL(request.url).searchParams.get("audioItemId"),
  );

  if (!audioItemIdResult.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { error } = await supabase.rpc("remove_playlist_item", {
    p_playlist_id: id,
    p_practice_id: practiceId,
    p_audio_item_id: audioItemIdResult.id,
  });

  if (error) {
    const message = error.message ?? "";
    const code = error.code ?? "";

    if (code === "28000" || message.includes("not_authenticated")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (code === "P0002" || message.includes("playlist_or_item_not_found")) {
      return notFoundResponse();
    }

    if (
      code === "23505" ||
      code === "40P01" ||
      code === "55P03" ||
      message.includes("reorder_conflict") ||
      message.toLowerCase().includes("unique") ||
      message.toLowerCase().includes("deadlock")
    ) {
      return NextResponse.json(
        {
          error: "reorder_conflict",
          message:
            "Порядок уже изменился. Обновите страницу и попробуйте ещё раз.",
        },
        { status: 409 },
      );
    }

    console.error("playlist_item_delete_rpc_error", code, message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

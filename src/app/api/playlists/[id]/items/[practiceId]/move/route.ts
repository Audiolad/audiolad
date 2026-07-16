import { NextResponse } from "next/server";

import {
  isUuid,
  parseMovePlaylistItemBody,
} from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ id: string; practiceId: string }>;
};

function notFoundResponse() {
  return NextResponse.json(
    {
      error: "playlist_or_item_not_found",
      message: "Материал не найден в этом плейлисте.",
    },
    { status: 404 },
  );
}

type MoveRpcRow = {
  moved: boolean;
  from_position: number;
  to_position: number;
};

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
    console.error("playlist_item_move_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseMovePlaylistItemBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("move_playlist_item", {
    p_playlist_id: id,
    p_practice_id: practiceId,
    p_direction: parsed.direction,
  });

  if (error) {
    const message = error.message ?? "";
    const code = error.code ?? "";

    if (
      code === "28000" ||
      message.includes("not_authenticated")
    ) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (
      code === "22023" ||
      message.includes("invalid_direction")
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (
      code === "P0002" ||
      message.includes("playlist_or_item_not_found")
    ) {
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

    console.error("playlist_item_move_rpc_error", code, message);
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Не удалось изменить порядок. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as MoveRpcRow | null;

  if (!row || typeof row.moved !== "boolean") {
    console.error("playlist_item_move_empty_rpc_result");
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Не удалось изменить порядок. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    moved: row.moved,
    fromPosition: row.from_position,
    toPosition: row.to_position,
  });
}

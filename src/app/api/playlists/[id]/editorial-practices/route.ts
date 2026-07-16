import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/auth/platform-admin";
import {
  isEditorialAddRpcResult,
  listEditorialPracticeOptions,
  mapEditorialAddRpcError,
} from "@/lib/playlists/editorial-practices";
import {
  canUserEditEditorialPlaylist,
  loadPlaylistForAccessCheck,
} from "@/lib/playlists/playlist-access";
import {
  isUuid,
  parseEditorialPracticesPostBody,
} from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function GET(request: Request, context: RouteContext) {
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
    console.error("editorial_practices_get_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const adminCheck = await assertPlatformAdmin(supabase, user.id);

  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.status === 403 ? "forbidden" : "internal_error" },
      { status: adminCheck.status },
    );
  }

  const { playlist, error: loadError } = await loadPlaylistForAccessCheck(
    supabase,
    id,
  );

  if (loadError) {
    console.error("editorial_practices_get_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
  }

  const canManage = await canUserEditEditorialPlaylist(
    supabase,
    user.id,
    playlist,
  );

  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { practices, error } = await listEditorialPracticeOptions(
    supabase,
    id,
  );

  if (error) {
    console.error("editorial_practices_get_list_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ practices });
}

export async function POST(request: Request, context: RouteContext) {
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
    console.error("editorial_practices_post_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const adminCheck = await assertPlatformAdmin(supabase, user.id);

  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.status === 403 ? "forbidden" : "internal_error" },
      { status: adminCheck.status },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseEditorialPracticesPostBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { playlist, error: loadError } = await loadPlaylistForAccessCheck(
    supabase,
    id,
  );

  if (loadError) {
    console.error("editorial_practices_post_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
  }

  const canManage = await canUserEditEditorialPlaylist(
    supabase,
    user.id,
    playlist,
  );

  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("add_editorial_playlist_practices", {
    p_playlist_id: id,
    p_practice_ids: parsed.practiceIds,
  });

  if (error) {
    const mapped = mapEditorialAddRpcError(error.message ?? "");
    console.error("editorial_practices_post_rpc_error", error.message);
    return NextResponse.json(
      {
        error: mapped.error,
        message: mapped.message,
      },
      { status: mapped.status },
    );
  }

  if (!isEditorialAddRpcResult(data)) {
    console.error("editorial_practices_post_invalid_rpc_result");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({
    added: data.added,
    skipped: data.skipped,
    practiceIds: data.practice_ids,
  });
}

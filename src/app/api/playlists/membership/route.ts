import { NextResponse } from "next/server";

import {
  isMembershipRpcResult,
  listPlaylistMembershipForPractice,
  mapMembershipRpcError,
} from "@/lib/playlists/membership";
import { isUuid, parseMembershipPutBody } from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export async function GET(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("playlists_membership_get_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const practiceId = searchParams.get("practiceId");

  if (!practiceId || !isUuid(practiceId)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const { playlists, error } = await listPlaylistMembershipForPractice(
      supabase,
      user.id,
      practiceId,
    );

    if (error === "practice_not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (error) {
      console.error("playlists_membership_get_error", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ playlists });
  } catch (error) {
    console.error(
      "playlists_membership_get_unexpected",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("playlists_membership_put_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseMembershipPutBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc(
    "set_practice_playlist_membership",
    {
      p_practice_id: parsed.practiceId,
      p_playlist_ids: parsed.playlistIds,
    },
  );

  if (error) {
    const mapped = mapMembershipRpcError(error.message);

    if (mapped.status >= 500) {
      console.error("playlists_membership_put_rpc_error", error.message);
    }

    return NextResponse.json(
      {
        error: mapped.error,
        ...(mapped.message ? { message: mapped.message } : {}),
        ...(mapped.playlistId ? { playlistId: mapped.playlistId } : {}),
      },
      { status: mapped.status },
    );
  }

  if (!isMembershipRpcResult(data)) {
    console.error("playlists_membership_put_empty_result");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({
    practiceId: data.practice_id,
    playlistIds: data.playlist_ids,
    added: data.added,
    removed: data.removed,
    changed: data.changed,
  });
}

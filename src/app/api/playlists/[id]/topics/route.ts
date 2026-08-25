import { NextResponse } from "next/server";

import {
  canUserEditEditorialPlaylist,
  loadPlaylistForAccessCheck,
} from "@/lib/playlists/playlist-access";
import { handleSetPlaylistTopics } from "@/lib/playlists/playlist-topics-api";
import {
  getActiveTopicIdsByKeys,
  setPlaylistTopics,
} from "@/lib/playlists/playlist-topics";
import { isUuid } from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("playlist_topics_put_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await handleSetPlaylistTopics({
    userId: user?.id ?? null,
    playlistId: id,
    body,
    deps: {
      loadPlaylist: (playlistId) =>
        loadPlaylistForAccessCheck(supabase, playlistId),
      canEditEditorial: (userId, playlist) =>
        canUserEditEditorialPlaylist(supabase, userId, playlist),
      resolveActiveTopicIds: (keys) => getActiveTopicIdsByKeys(supabase, keys),
      replaceTopics: (playlistId, keys) =>
        setPlaylistTopics(createServiceRoleClient(), playlistId, keys),
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}

import { NextResponse } from "next/server";

import { getOwnedPlaylistById } from "@/lib/playlists/queries";
import { isUuid } from "@/lib/playlists/validation";
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

  const { playlist, error: loadError } = await getOwnedPlaylistById(
    supabase,
    id,
  );

  if (loadError) {
    console.error("playlist_item_delete_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
  }

  const { data: existing, error: existingError } = await supabase
    .from("playlist_items")
    .select("id")
    .eq("playlist_id", id)
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (existingError) {
    console.error("playlist_item_delete_lookup_error", existingError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!existing) {
    return notFoundResponse();
  }

  const { error: deleteError } = await supabase
    .from("playlist_items")
    .delete()
    .eq("playlist_id", id)
    .eq("practice_id", practiceId);

  if (deleteError) {
    console.error("playlist_item_delete_error", deleteError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { error: touchError } = await supabase
    .from("playlists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (touchError) {
    console.error("playlist_item_delete_touch_error", touchError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

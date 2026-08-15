import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/platform-access";
import { isAnyDirectionEditor } from "@/lib/playlists/playlist-access";
import { searchAudioladProfiles } from "@/lib/playlists/profile-summaries";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
    console.error("editorial_user_search_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let canSearch = false;

  try {
    canSearch =
      (await hasPermission(supabase, user.id, "playlists.manage")) ||
      (await isAnyDirectionEditor(supabase, user.id));
  } catch (error) {
    console.error(
      "editorial_user_search_access_error",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!canSearch) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  if (query.trim().length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    const service = createServiceRoleClient();
    const users = await searchAudioladProfiles(service, query, { limit: 8 });

    return NextResponse.json({
      users: users.map((row) => ({
        id: row.userId,
        displayName: row.displayName,
        email: row.email,
      })),
    });
  } catch (error) {
    console.error(
      "editorial_user_search_error",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

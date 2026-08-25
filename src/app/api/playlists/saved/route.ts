import { NextResponse } from "next/server";

import {
  listSavedPlaylists,
  parsePlaylistSavedListingQuery,
} from "@/lib/playlists/saved-listing";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = parsePlaylistSavedListingQuery({
    cursor: searchParams.get("cursor"),
    limit: searchParams.get("limit"),
  });

  try {
    const supabase = await createClientFromRequest(request);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("playlist_saved_listing_auth_error", authError.message);
    }

    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", items: [], nextCursor: null },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const result = await listSavedPlaylists(supabase, query, {
      userId: user.id,
    });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error(
      "playlist_saved_listing_error",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      { error: "playlist_saved_unavailable", items: [], nextCursor: null },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

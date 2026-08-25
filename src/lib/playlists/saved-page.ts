import { createClient } from "@/lib/supabase/server";
import {
  listSavedPlaylists,
  parsePlaylistSavedListingQuery,
  type PlaylistSavedListingQuery,
} from "@/lib/playlists/saved-listing";
import type { PlaylistListingResult } from "@/lib/playlists/listing-contract";

export async function loadPlaylistSavedPage(
  params: {
    cursor?: string | null;
    limit?: string | number | null;
  } = {},
): Promise<{
  userId: string | null;
  query: PlaylistSavedListingQuery;
  listing: PlaylistListingResult;
}> {
  const query = parsePlaylistSavedListingQuery(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      query,
      listing: { items: [], nextCursor: null },
    };
  }

  const listing = await listSavedPlaylists(supabase, query, {
    userId: user.id,
  });

  return {
    userId: user.id,
    query,
    listing,
  };
}

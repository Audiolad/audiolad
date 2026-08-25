import {
  listListedPlaylists,
  parsePlaylistListingQuery,
  type PlaylistListingQuery,
  type PlaylistListingResult,
} from "@/lib/playlists/listing";
import { createClient } from "@/lib/supabase/server";

export async function loadPlaylistCatalogPage(
  params: {
    q?: string | null;
    topic?: string | null;
    access?: string | null;
    sort?: string | null;
    cursor?: string | null;
    limit?: string | number | null;
  } = {},
): Promise<{ query: PlaylistListingQuery; listing: PlaylistListingResult }> {
  const query = parsePlaylistListingQuery(params);
  const supabase = await createClient();
  const listing = await listListedPlaylists(supabase, query);

  return { query, listing };
}

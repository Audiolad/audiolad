import {
  listListedPlaylists,
  parsePlaylistListingQuery,
  type PlaylistListingQuery,
  type PlaylistListingResult,
} from "@/lib/playlists/listing";
import type { PlaylistCatalogTopicOption } from "@/lib/playlists/listing-filters";
import { createClient } from "@/lib/supabase/server";
import { listActiveTopics } from "@/lib/topics/queries";

export async function loadPlaylistCatalogPage(
  params: {
    q?: string | null;
    topic?: string | null;
    access?: string | null;
    sort?: string | null;
    cursor?: string | null;
    limit?: string | number | null;
  } = {},
): Promise<{
  query: PlaylistListingQuery;
  listing: PlaylistListingResult;
  topics: PlaylistCatalogTopicOption[];
  isAuthenticated: boolean;
}> {
  const query = parsePlaylistListingQuery(params);
  const supabase = await createClient();
  const [listing, userResult, topicRows] = await Promise.all([
    listListedPlaylists(supabase, query),
    supabase.auth.getUser(),
    listActiveTopics(supabase).catch(() => []),
  ]);

  return {
    query,
    listing,
    topics: topicRows.map((topic) => ({
      key: topic.key,
      title: topic.title,
    })),
    isAuthenticated: Boolean(userResult.data.user),
  };
}

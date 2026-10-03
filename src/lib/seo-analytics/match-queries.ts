import { chunkIds } from "@/lib/supabase/chunk";

/** POST body batch. Stays well under a single RPC payload and the SQL cap of 1000. */
export const SEO_QUERY_MATCH_RPC_BATCH = 800;

export type SeoQueryMatchRpc = {
  rpc: (
    fn: "count_matching_seo_queries",
    args: { p_normalized_queries: string[] },
  ) => PromiseLike<{ data: number | string | null; error: { message: string } | null }>;
};

export function seoQueryMatchBatches(normalizedQueries: readonly string[]): string[][] {
  const unique = [...new Set(normalizedQueries.filter((query) => query.length > 0))];
  return chunkIds(unique, SEO_QUERY_MATCH_RPC_BATCH);
}

/**
 * Match normalized Webmaster queries to seo_queries via count_matching_seo_queries.
 * The list travels in the RPC JSON body, not in a GET query string.
 */
export async function countMatchingSeoQueries(
  supabase: SeoQueryMatchRpc,
  normalizedQueries: readonly string[],
): Promise<number> {
  let matched = 0;
  for (const batch of seoQueryMatchBatches(normalizedQueries)) {
    const { data, error } = await supabase.rpc("count_matching_seo_queries", {
      p_normalized_queries: batch,
    });
    if (error) throw new Error(error.message);
    const count = typeof data === "number" ? data : Number(data);
    if (!Number.isInteger(count) || count < 0 || count > batch.length) {
      throw new Error("seo_map_match_failed");
    }
    matched += count;
  }
  return matched;
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  indexPublishedSeoOccupancy,
  type CatalogSeoQueryRef,
  type PublishedPracticeSeoRow,
  type SeoOccupancyHit,
} from "@/lib/seo-queries/published-query-occupancy";

const PAGE_SIZE = 1000;
const ID_CHUNK = 40;
const PRACTICE_COLUMNS =
  "id, author_id, title, status, deleted_at, primary_seo_query_id, seo_primary_query";

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

function mapPractice(row: Record<string, unknown>): PublishedPracticeSeoRow {
  return {
    id: String(row.id),
    authorId: typeof row.author_id === "string" ? row.author_id : "",
    title: typeof row.title === "string" ? row.title : null,
    status: typeof row.status === "string" ? row.status : "",
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    primarySeoQueryId:
      typeof row.primary_seo_query_id === "string"
        ? row.primary_seo_query_id
        : null,
    seoPrimaryQuery:
      typeof row.seo_primary_query === "string" ? row.seo_primary_query : null,
  };
}

/**
 * One batched FK lookup plus one paged read of published text-only rows.
 * Legacy rows are matched in memory by exact normalized equality.
 * This is not a per-card scan and does not use ILIKE similarity.
 */
export async function loadPublishedSeoOccupancyForQueries(
  supabase: SupabaseClient,
  queries: readonly CatalogSeoQueryRef[],
): Promise<Map<string, SeoOccupancyHit>> {
  const unique = new Map<string, CatalogSeoQueryRef>();
  for (const query of queries) {
    if (query.id && !unique.has(query.id)) unique.set(query.id, query);
  }
  const list = [...unique.values()];
  if (list.length === 0) return new Map();

  const practices: PublishedPracticeSeoRow[] = [];

  for (const ids of chunkIds(
    list.map((query) => query.id),
    ID_CHUNK,
  )) {
    const { data, error } = await supabase
      .from("practices")
      .select(PRACTICE_COLUMNS)
      .eq("status", "published")
      .is("deleted_at", null)
      .in("primary_seo_query_id", ids);
    if (error) throw new Error("seo_published_occupancy_load_failed");
    for (const row of data ?? []) {
      practices.push(mapPractice(row as Record<string, unknown>));
    }
  }

  // Legacy compatibility until backfill sets primary_seo_query_id.
  // Exact normalized equality is applied in indexPublishedSeoOccupancy.
  for (let from = 0; from < 50_000; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("practices")
      .select(PRACTICE_COLUMNS)
      .eq("status", "published")
      .is("deleted_at", null)
      .is("primary_seo_query_id", null)
      .not("seo_primary_query", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("seo_published_occupancy_load_failed");
    const batch = data ?? [];
    for (const row of batch) {
      practices.push(mapPractice(row as Record<string, unknown>));
    }
    if (batch.length < PAGE_SIZE) break;
  }

  return indexPublishedSeoOccupancy({ queries: list, practices });
}

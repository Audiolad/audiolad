import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isFixtureMarkedPractice,
  isPublicCatalogPracticeRow,
} from "@/lib/fixtures/test-fixture-marker";
import {
  getPublishedPracticeIdsForTopicKey,
  mapPracticeRowsToCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";

export const CATALOG_SEARCH_MAX_LENGTH = 100;
export const CATALOG_SEARCH_RESULT_LIMIT = 50;
export const CATALOG_PRODUCT_SUGGEST_LIMIT = 5;
/** @deprecated Use CATALOG_PRODUCT_SUGGEST_LIMIT */
export const CATALOG_SEARCH_SUGGESTION_LIMIT = CATALOG_PRODUCT_SUGGEST_LIMIT;
export const CATALOG_SEARCH_SUGGEST_MIN_LENGTH = 2;

const CATALOG_PRACTICE_SEARCH_SELECT = `
  id,
  author_id,
  title,
  slug,
  subtitle,
  description,
  format,
  duration_minutes,
  price,
  is_free,
  cover_url,
  cover_image,
  status,
  is_catalog_listed,
  updated_at,
  published_at,
  created_at,
  authors!practices_author_id_fkey (
    name,
    slug
  )
`;

export type PublicCatalogPracticeVisibilityInput = {
  status: string | null;
  is_catalog_listed: boolean | null;
  slug: string | null;
  author_id: string | null;
  cover_image?: unknown;
};

export function normalizeCatalogSearchQuery(
  value: string | null | undefined,
): string {
  if (value == null) {
    return "";
  }

  const collapsed = value.trim().replace(/\s+/g, " ");

  if (!collapsed) {
    return "";
  }

  return collapsed.slice(0, CATALOG_SEARCH_MAX_LENGTH);
}

/**
 * Escape user input for PostgreSQL ILIKE patterns (% and _ are wildcards).
 */
export function escapeIlikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Build a PostgREST `.or()` filter for practice text fields.
 * Values are double-quoted so commas/parentheses in the query do not break parsing.
 */
export function buildPracticeFieldsOrIlikeFilter(pattern: string): string {
  const escaped = escapeIlikePattern(pattern);
  const quotedPattern = `"%${escaped.replace(/"/g, '""')}%"`;
  const fields = ["title", "subtitle", "description", "format"];

  return fields
    .map((field) => `${field}.ilike.${quotedPattern}`)
    .join(",");
}

export function isPublicCatalogSearchPractice(
  practice: PublicCatalogPracticeVisibilityInput,
): boolean {
  return isPublicCatalogPracticeRow(practice);
}

export function dedupePracticeRowsById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();

  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.set(row.id, row);
    }
  }

  return [...seen.values()];
}

type CatalogPracticeSearchRow = {
  id: string;
  author_id: string | null;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  cover_image?: unknown;
  status: string | null;
  is_catalog_listed: boolean | null;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
  authors:
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
};

async function loadMatchingAuthorIds(
  supabase: SupabaseClient,
  pattern: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("authors")
    .select("id")
    .ilike("name", `%${pattern}%`);

  if (error) {
    return [];
  }

  return (data ?? [])
    .map((row) => row.id as string)
    .filter((id) => id.length > 0);
}

async function loadPracticesMatchingFields(
  supabase: SupabaseClient,
  pattern: string,
  practiceIdsForTopic: string[] | null,
  limit: number,
): Promise<CatalogPracticeSearchRow[]> {
  let query = supabase
    .from("practices")
    .select(CATALOG_PRACTICE_SEARCH_SELECT)
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .not("slug", "is", null)
    .not("author_id", "is", null)
    .or(buildPracticeFieldsOrIlikeFilter(pattern));

  if (practiceIdsForTopic) {
    query = query.in("id", practiceIdsForTopic);
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []) as CatalogPracticeSearchRow[];
}

async function loadPracticesMatchingAuthors(
  supabase: SupabaseClient,
  authorIds: string[],
  practiceIdsForTopic: string[] | null,
  limit: number,
): Promise<CatalogPracticeSearchRow[]> {
  if (authorIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("practices")
    .select(CATALOG_PRACTICE_SEARCH_SELECT)
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .not("slug", "is", null)
    .not("author_id", "is", null)
    .in("author_id", authorIds);

  if (practiceIdsForTopic) {
    query = query.in("id", practiceIdsForTopic);
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []) as CatalogPracticeSearchRow[];
}

export type CatalogProductSearchOptions = {
  query: string;
  topicKey?: string | null;
  limit?: number;
};

/**
 * Search published catalog-listed products by practice fields and author name.
 *
 * Uses two bounded server queries (practice fields + author name) with deduplication,
 * because PostgREST `.or()` cannot safely combine practice columns and joined author
 * name in one filter string.
 */
export async function searchPublishedCatalogProducts(
  supabase: SupabaseClient,
  options: CatalogProductSearchOptions,
): Promise<CatalogProduct[]> {
  const normalizedQuery = normalizeCatalogSearchQuery(options.query);

  if (!normalizedQuery) {
    return [];
  }

  const resultLimit = options.limit ?? CATALOG_SEARCH_RESULT_LIMIT;
  const topicKey = options.topicKey?.trim().toLowerCase() || null;
  let practiceIdsForTopic: string[] | null = null;

  if (topicKey) {
    practiceIdsForTopic = await getPublishedPracticeIdsForTopicKey(
      supabase,
      topicKey,
    );

    if (practiceIdsForTopic.length === 0) {
      return [];
    }
  }

  const ilikePattern = escapeIlikePattern(normalizedQuery);

  const [fieldMatches, matchingAuthorIds] = await Promise.all([
    loadPracticesMatchingFields(
      supabase,
      normalizedQuery,
      practiceIdsForTopic,
      resultLimit,
    ),
    loadMatchingAuthorIds(supabase, ilikePattern),
  ]);

  const authorMatches = await loadPracticesMatchingAuthors(
    supabase,
    matchingAuthorIds,
    practiceIdsForTopic,
    resultLimit,
  );

  const mergedRows = dedupePracticeRowsById([
    ...fieldMatches,
    ...authorMatches,
  ])
    .filter((row) => !isFixtureMarkedPractice(row))
    .slice(0, resultLimit);

  if (mergedRows.length === 0) {
    return [];
  }

  const products = await mapPracticeRowsToCatalogProducts(supabase, mergedRows);

  return products.slice(0, resultLimit);
}

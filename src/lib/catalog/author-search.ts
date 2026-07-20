import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorCardPositioningText } from "@/lib/authors/brand-assets";
import {
  isFixtureMarkedPractice,
} from "@/lib/fixtures/test-fixture-marker";
import {
  escapeIlikePattern,
  normalizeCatalogSearchQuery,
} from "@/lib/catalog/search";
import { getPublishedPracticeIdsForTopicKey } from "@/lib/products/catalog";
import { resolveAuthorAvatarUrl } from "@/lib/images/resolve-display";
import { buildAuthorPublicPath } from "@/lib/products/paths";

export const CATALOG_AUTHOR_SEARCH_RESULT_LIMIT = 50;
export const CATALOG_AUTHOR_SUGGEST_LIMIT = 3;
export const CATALOG_AUTHOR_SEARCH_CANDIDATE_LIMIT = 50;
export const CATALOG_AUTHOR_THEME_TITLE_SEARCH_IS_OPTIONAL = true;

export type CatalogAuthorSearchResult = {
  id: string;
  name: string;
  slug: string;
  positioningText: string | null;
  avatarUrl: string | null;
  avatarImage?: unknown;
  publishedCount: number;
  href: string;
};

export type CatalogAuthorPracticeVisibilityInput = {
  status: string | null;
  is_catalog_listed: boolean | null;
  slug: string | null;
  author_id: string | null;
  cover_image?: unknown;
};

export type CatalogAuthorSearchRankInput = {
  name: string;
  positioningText: string | null;
  fullBio: string | null;
  themeTitles: string[];
};

export type CatalogAuthorSearchOptions = {
  query: string;
  topicKey?: string | null;
  limit?: number;
};

type AuthorSearchRow = {
  id: string;
  name: string;
  slug: string;
  short_positioning: string | null;
  full_bio: string | null;
  avatar_url: string | null;
  avatar_image?: unknown;
  updated_at: string | null;
};

const AUTHOR_SEARCH_SELECT =
  "id, name, slug, short_positioning, full_bio, avatar_url, avatar_image, updated_at";

export function isEligibleCatalogAuthorPractice(
  practice: CatalogAuthorPracticeVisibilityInput,
): boolean {
  if (isFixtureMarkedPractice(practice)) {
    return false;
  }

  return (
    practice.status === "published" &&
    practice.is_catalog_listed === true &&
    typeof practice.slug === "string" &&
    practice.slug.trim().length > 0 &&
    practice.author_id != null
  );
}

export function isPublicCatalogSearchAuthor(
  author: { name: string | null; slug: string | null },
): boolean {
  return (
    typeof author.name === "string" &&
    author.name.trim().length > 0 &&
    typeof author.slug === "string" &&
    author.slug.trim().length > 0
  );
}

export function collectEligibleAuthorIdsFromPractices(
  practices: CatalogAuthorPracticeVisibilityInput[],
): Set<string> {
  const ids = new Set<string>();

  for (const practice of practices) {
    if (isEligibleCatalogAuthorPractice(practice) && practice.author_id) {
      ids.add(practice.author_id);
    }
  }

  return ids;
}

export function buildAuthorFieldsOrIlikeFilter(pattern: string): string {
  const escaped = escapeIlikePattern(pattern);
  const quotedPattern = `"%${escaped.replace(/"/g, '""')}%"`;
  const fields = ["name", "short_positioning", "full_bio"];

  return fields
    .map((field) => `${field}.ilike.${quotedPattern}`)
    .join(",");
}

export function rankCatalogAuthorSearchMatch(
  query: string,
  input: CatalogAuthorSearchRankInput,
): number {
  const normalizedQuery = normalizeCatalogSearchQuery(query).toLowerCase();

  if (!normalizedQuery) {
    return Number.MAX_SAFE_INTEGER;
  }

  const name = input.name.trim().toLowerCase();
  const positioning = input.positioningText?.trim().toLowerCase() ?? "";
  const fullBio = input.fullBio?.trim().toLowerCase() ?? "";

  if (name === normalizedQuery) {
    return 0;
  }

  if (name.startsWith(normalizedQuery)) {
    return 1;
  }

  if (name.includes(normalizedQuery)) {
    return 2;
  }

  if (positioning.includes(normalizedQuery)) {
    return 3;
  }

  if (fullBio.includes(normalizedQuery)) {
    return 4;
  }

  for (const themeTitle of input.themeTitles) {
    if (themeTitle.trim().toLowerCase().includes(normalizedQuery)) {
      return 5;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

export function compareCatalogAuthorSearchRank(
  query: string,
  left: CatalogAuthorSearchRankInput & { name: string },
  right: CatalogAuthorSearchRankInput & { name: string },
): number {
  const leftRank = rankCatalogAuthorSearchMatch(query, left);
  const rightRank = rankCatalogAuthorSearchMatch(query, right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.name.localeCompare(right.name, "ru");
}

function isSafeCatalogAuthorHref(href: string): boolean {
  return href.startsWith("/authors/") && !href.includes("//");
}

function mapAuthorRowToSearchResult(
  author: AuthorSearchRow,
  publishedCount: number,
): CatalogAuthorSearchResult | null {
  const name = author.name?.trim();
  const slug = author.slug?.trim();

  if (!isPublicCatalogSearchAuthor({ name, slug })) {
    return null;
  }

  const href = buildAuthorPublicPath(slug);

  if (!isSafeCatalogAuthorHref(href)) {
    return null;
  }

  return {
    id: author.id,
    name,
    slug,
    positioningText: resolveAuthorCardPositioningText(author.short_positioning),
    avatarUrl: resolveAuthorAvatarUrl(
      {
        avatar_url: author.avatar_url,
        avatar_image: author.avatar_image,
        updated_at: author.updated_at,
      },
      112,
      "md",
    ),
    avatarImage: author.avatar_image,
    publishedCount,
    href,
  };
}

async function loadEligibleAuthorCounts(
  supabase: SupabaseClient,
  practiceIdsForTopic: string[] | null,
): Promise<Map<string, number>> {
  let query = supabase
    .from("practices")
    .select("author_id, cover_image")
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .not("slug", "is", null)
    .not("author_id", "is", null);

  if (practiceIdsForTopic) {
    query = query.in("id", practiceIdsForTopic);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("catalog_author_eligible_practices_failed");
  }

  const counts = new Map<string, number>();

  for (const row of data ?? []) {
    if (isFixtureMarkedPractice(row)) {
      continue;
    }

    const authorId = row.author_id as string;

    if (!authorId) {
      continue;
    }

    counts.set(authorId, (counts.get(authorId) ?? 0) + 1);
  }

  return counts;
}

async function loadAuthorsMatchingFields(
  supabase: SupabaseClient,
  pattern: string,
  limit: number,
): Promise<AuthorSearchRow[]> {
  const { data, error } = await supabase
    .from("authors")
    .select(AUTHOR_SEARCH_SELECT)
    .or(buildAuthorFieldsOrIlikeFilter(pattern))
    .limit(limit);

  if (error) {
    throw new Error("catalog_author_field_search_failed");
  }

  return (data ?? []) as AuthorSearchRow[];
}

/** Optional theme-title match: failures degrade to empty matches only. */
async function loadAuthorIdsMatchingTopicTitles(
  supabase: SupabaseClient,
  pattern: string,
  limit: number,
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("author_topics")
      .select(
        `
      author_id,
      topics!inner (
        title,
        is_active
      )
    `,
      )
      .ilike("topics.title", `%${pattern}%`)
      .limit(limit);

    if (error) {
      return [];
    }

    const ids = new Set<string>();

    for (const row of data ?? []) {
      const topics = row.topics as
        | { title: string; is_active: boolean }
        | { title: string; is_active: boolean }[]
        | null;
      const topic = Array.isArray(topics) ? topics[0] : topics;

      if (!topic?.is_active) {
        continue;
      }

      const authorId = row.author_id as string;

      if (authorId) {
        ids.add(authorId);
      }
    }

    return [...ids];
  } catch {
    return [];
  }
}

async function loadAuthorsByIds(
  supabase: SupabaseClient,
  authorIds: string[],
): Promise<AuthorSearchRow[]> {
  if (authorIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("authors")
    .select(AUTHOR_SEARCH_SELECT)
    .in("id", authorIds);

  if (error) {
    throw new Error("catalog_author_lookup_failed");
  }

  return (data ?? []) as AuthorSearchRow[];
}

/** Optional ranking metadata: theme titles may fail without breaking search. */
async function loadAuthorThemeTitlesByIds(
  supabase: SupabaseClient,
  authorIds: string[],
): Promise<Map<string, string[]>> {
  if (authorIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("author_topics")
    .select(
      `
      author_id,
      topics!inner (
        title,
        is_active
      )
    `,
    )
    .in("author_id", authorIds);

  if (error) {
    return new Map();
  }

  const themeMap = new Map<string, string[]>();

  for (const row of data ?? []) {
    const topics = row.topics as
      | { title: string; is_active: boolean }
      | { title: string; is_active: boolean }[]
      | null;
    const topic = Array.isArray(topics) ? topics[0] : topics;

    if (!topic?.is_active || !topic.title?.trim()) {
      continue;
    }

    const authorId = row.author_id as string;
    const existing = themeMap.get(authorId) ?? [];
    existing.push(topic.title.trim());
    themeMap.set(authorId, existing);
  }

  return themeMap;
}

function dedupeAuthorRowsById(rows: AuthorSearchRow[]): AuthorSearchRow[] {
  const seen = new Map<string, AuthorSearchRow>();

  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.set(row.id, row);
    }
  }

  return [...seen.values()];
}

/**
 * Search authors visible in catalog list/home: must have published catalog-listed
 * product(s), optionally within active product topic.
 */
export async function searchPublishedCatalogAuthors(
  supabase: SupabaseClient,
  options: CatalogAuthorSearchOptions,
): Promise<CatalogAuthorSearchResult[]> {
  const normalizedQuery = normalizeCatalogSearchQuery(options.query);

  if (!normalizedQuery) {
    return [];
  }

  const resultLimit = options.limit ?? CATALOG_AUTHOR_SEARCH_RESULT_LIMIT;
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

  const eligibleCounts = await loadEligibleAuthorCounts(
    supabase,
    practiceIdsForTopic,
  );

  if (eligibleCounts.size === 0) {
    return [];
  }

  const ilikePattern = escapeIlikePattern(normalizedQuery);

  const fieldMatches = await loadAuthorsMatchingFields(
    supabase,
    normalizedQuery,
    CATALOG_AUTHOR_SEARCH_CANDIDATE_LIMIT,
  );

  const topicMatchAuthorIds = await loadAuthorIdsMatchingTopicTitles(
    supabase,
    ilikePattern,
    CATALOG_AUTHOR_SEARCH_CANDIDATE_LIMIT,
  );

  let topicMatchedAuthors: AuthorSearchRow[] = [];

  if (topicMatchAuthorIds.length > 0) {
    const eligibleTopicAuthorIds = topicMatchAuthorIds.filter((id) =>
      eligibleCounts.has(id),
    );

    if (eligibleTopicAuthorIds.length > 0) {
      try {
        topicMatchedAuthors = await loadAuthorsByIds(
          supabase,
          eligibleTopicAuthorIds,
        );
      } catch {
        topicMatchedAuthors = [];
      }
    }
  }

  const mergedCandidates = dedupeAuthorRowsById([
    ...fieldMatches,
    ...topicMatchedAuthors,
  ]).filter((author) => eligibleCounts.has(author.id));

  if (mergedCandidates.length === 0) {
    return [];
  }

  const themeTitlesByAuthorId = await loadAuthorThemeTitlesByIds(
    supabase,
    mergedCandidates.map((author) => author.id),
  );

  const ranked = mergedCandidates
    .map((author) => ({
      author,
      rankInput: {
        name: author.name,
        positioningText: resolveAuthorCardPositioningText(
          author.short_positioning,
        ),
        fullBio: author.full_bio,
        themeTitles: themeTitlesByAuthorId.get(author.id) ?? [],
      },
    }))
    .sort((left, right) =>
      compareCatalogAuthorSearchRank(
        normalizedQuery,
        left.rankInput,
        right.rankInput,
      ),
    )
    .slice(0, resultLimit);

  return ranked
    .map(({ author }) =>
      mapAuthorRowToSearchResult(
        author,
        eligibleCounts.get(author.id) ?? 0,
      ),
    )
    .filter((item): item is CatalogAuthorSearchResult => item !== null);
}

export function mapCatalogAuthorSearchResultToPublicAuthorCard(
  author: CatalogAuthorSearchResult,
): {
  id: string;
  name: string;
  slug: string;
  positioningText: string | null;
  avatarUrl: string | null;
  avatarImage?: unknown;
  publishedCount: number;
  createdAt: string | null;
  href: string;
} {
  return {
    ...author,
    createdAt: null,
  };
}

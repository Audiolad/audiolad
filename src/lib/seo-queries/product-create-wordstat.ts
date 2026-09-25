import {
  AUTHOR_SEO_DISCOVERY_SURFACES,
  type AuthorSeoDiscoverySurface,
} from "@/lib/seo-queries/author-discovery-status";
import {
  PRODUCT_CREATE_WORDSTAT_CANDIDATE_LIMIT,
  PRODUCT_CREATE_WORDSTAT_MAX_COUNT,
  PRODUCT_CREATE_WORDSTAT_MIN_COUNT,
  PRODUCT_CREATE_WORDSTAT_RESULT_LIMIT,
  WORDSTAT_NUM_PHRASES,
} from "@/lib/seo/wordstat/types";

export {
  PRODUCT_CREATE_WORDSTAT_CANDIDATE_LIMIT,
  PRODUCT_CREATE_WORDSTAT_MAX_COUNT,
  PRODUCT_CREATE_WORDSTAT_MIN_COUNT,
  PRODUCT_CREATE_WORDSTAT_RESULT_LIMIT,
};

export function wordstatNumPhrasesForDiscoverySurface(
  surface: AuthorSeoDiscoverySurface,
): number {
  return surface === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE
    ? PRODUCT_CREATE_WORDSTAT_CANDIDATE_LIMIT
    : WORDSTAT_NUM_PHRASES;
}

export function isProductCreateWordstatCountInRange(count: number): boolean {
  return (
    count >= PRODUCT_CREATE_WORDSTAT_MIN_COUNT &&
    count <= PRODUCT_CREATE_WORDSTAT_MAX_COUNT
  );
}

/**
 * After omit/dedupe: keep 50..2000, sort frequency DESC, cap at 20.
 * Does not change databaseMatches or opportunities.
 */
export function selectProductCreateWordstatAdditions<T extends { count: number }>(
  suggestions: readonly T[],
): T[] {
  return suggestions
    .filter((item) => isProductCreateWordstatCountInRange(item.count))
    .slice()
    .sort((left, right) => right.count - left.count)
    .slice(0, PRODUCT_CREATE_WORDSTAT_RESULT_LIMIT);
}

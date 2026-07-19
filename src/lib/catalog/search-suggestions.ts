import { getDisplayFormat } from "@/lib/author-products/format";
import { buildCatalogHref } from "@/lib/catalog/topic-filter";
import {
  CATALOG_SEARCH_SUGGEST_MIN_LENGTH,
  CATALOG_SEARCH_SUGGESTION_LIMIT,
  normalizeCatalogSearchQuery,
} from "@/lib/catalog/search";
import type { CatalogProduct } from "@/lib/products/catalog";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { buildPracticePublicPath } from "@/lib/products/paths";

export type CatalogSearchSuggestion = {
  id: string;
  title: string;
  authorName: string;
  subtitle: string | null;
  format: string | null;
  coverUrl: string | null;
  href: string;
  isFree: boolean;
  priceLabel: string;
};

export const CATALOG_SEARCH_SUGGESTION_RESPONSE_KEYS = [
  "id",
  "title",
  "authorName",
  "subtitle",
  "format",
  "coverUrl",
  "href",
  "isFree",
  "priceLabel",
] as const;

export function shouldFetchCatalogSuggestions(
  rawQuery: string | null | undefined,
): boolean {
  return (
    normalizeCatalogSearchQuery(rawQuery).length >= CATALOG_SEARCH_SUGGEST_MIN_LENGTH
  );
}

export function buildCatalogSuggestApiUrl(
  rawQuery: string,
  topicKey: string | null,
): string {
  const params = new URLSearchParams();
  params.set("q", normalizeCatalogSearchQuery(rawQuery));

  if (topicKey) {
    params.set("topic", topicKey);
  }

  return `/api/catalog/search/suggest?${params.toString()}`;
}

export function buildCatalogSearchResultsHref(
  rawQuery: string,
  topicKey: string | null,
): string {
  return buildCatalogHref({
    q: normalizeCatalogSearchQuery(rawQuery),
    topic: topicKey,
  });
}

export function isCatalogSuggestAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.name === "AbortError";
}

export function shouldApplyCatalogSuggestResponse(
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId;
}

/** Active index stops at list boundaries (no wrap). */
export function moveCatalogSuggestActiveIndex(
  currentIndex: number,
  direction: "down" | "up",
  itemCount: number,
): number {
  if (itemCount <= 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction === "down" ? 0 : -1;
  }

  if (direction === "down") {
    return Math.min(currentIndex + 1, itemCount - 1);
  }

  return Math.max(currentIndex - 1, 0);
}

export function resolveCatalogSuggestEnterAction(input: {
  activeIndex: number;
  suggestions: ReadonlyArray<{ href: string }>;
}): { type: "open"; href: string } | { type: "submit" } {
  if (
    input.activeIndex >= 0 &&
    input.activeIndex < input.suggestions.length &&
    input.suggestions[input.activeIndex]?.href
  ) {
    return {
      type: "open",
      href: input.suggestions[input.activeIndex].href,
    };
  }

  return { type: "submit" };
}

function isSafeCatalogSuggestionHref(href: string): boolean {
  return href.startsWith("/practice/") && !href.includes("//");
}

export function mapCatalogProductToSuggestion(
  product: CatalogProduct,
): CatalogSearchSuggestion | null {
  const authorName = product.authorName?.trim();
  const authorSlug = product.authorSlug?.trim();
  const productSlug = product.slug?.trim();

  if (!authorName || !authorSlug || !productSlug) {
    return null;
  }

  const href = product.href?.trim() || buildPracticePublicPath(authorSlug, productSlug);

  if (!isSafeCatalogSuggestionHref(href)) {
    return null;
  }

  return {
    id: product.id,
    title: product.title.trim(),
    authorName,
    subtitle: product.subtitle?.trim() || null,
    format: getDisplayFormat(product.format),
    coverUrl: getProductCoverDisplayUrl(
      product.coverUrl,
      product.updatedAt,
      product.coverImage,
    ),
    href,
    isFree: product.isFree,
    priceLabel: product.priceLabel,
  };
}

export function mapCatalogProductsToSuggestions(
  products: CatalogProduct[],
): CatalogSearchSuggestion[] {
  return products
    .map(mapCatalogProductToSuggestion)
    .filter((item): item is CatalogSearchSuggestion => item !== null)
    .slice(0, CATALOG_SEARCH_SUGGESTION_LIMIT);
}

export function getCatalogSuggestOptionId(index: number): string {
  return `catalog-search-option-${index}`;
}

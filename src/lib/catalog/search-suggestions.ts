import {
  CATALOG_AUTHOR_SUGGEST_LIMIT,
  type CatalogAuthorSearchResult,
} from "@/lib/catalog/author-search";
import { buildCatalogHref } from "@/lib/catalog/topic-filter";
import {
  CATALOG_PRODUCT_SUGGEST_LIMIT,
  CATALOG_SEARCH_SUGGEST_MIN_LENGTH,
  normalizeCatalogSearchQuery,
} from "@/lib/catalog/search";
import type { CatalogProduct } from "@/lib/products/catalog";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { getDisplayFormat } from "@/lib/author-products/format";

export type CatalogAuthorSuggestion = {
  id: string;
  name: string;
  positioningText: string | null;
  avatarUrl: string | null;
  href: string;
};

export type CatalogProductSuggestion = {
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

/** @deprecated Use CatalogProductSuggestion */
export type CatalogSearchSuggestion = CatalogProductSuggestion;

export type CatalogSearchSuggestResponse = {
  authors: CatalogAuthorSuggestion[];
  products: CatalogProductSuggestion[];
};

export type CatalogSuggestOption =
  | { kind: "author"; href: string; optionId: string }
  | { kind: "product"; href: string; optionId: string };

export const CATALOG_AUTHOR_SUGGESTION_RESPONSE_KEYS = [
  "id",
  "name",
  "positioningText",
  "avatarUrl",
  "href",
] as const;

export const CATALOG_PRODUCT_SUGGESTION_RESPONSE_KEYS = [
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

/** @deprecated Use CATALOG_PRODUCT_SUGGESTION_RESPONSE_KEYS */
export const CATALOG_SEARCH_SUGGESTION_RESPONSE_KEYS =
  CATALOG_PRODUCT_SUGGESTION_RESPONSE_KEYS;

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

export function isCatalogSuggestResponseEmpty(
  response: CatalogSearchSuggestResponse,
): boolean {
  return response.authors.length === 0 && response.products.length === 0;
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

export function flattenCatalogSuggestOptions(input: {
  authors: ReadonlyArray<{ href: string }>;
  products: ReadonlyArray<{ href: string }>;
}): CatalogSuggestOption[] {
  const options: CatalogSuggestOption[] = [];

  input.authors.forEach((author, index) => {
    if (author.href) {
      options.push({
        kind: "author",
        href: author.href,
        optionId: getCatalogSuggestAuthorOptionId(index),
      });
    }
  });

  input.products.forEach((product, index) => {
    if (product.href) {
      options.push({
        kind: "product",
        href: product.href,
        optionId: getCatalogSuggestProductOptionId(index),
      });
    }
  });

  return options;
}

export function resolveCatalogSuggestEnterAction(input: {
  activeIndex: number;
  options: ReadonlyArray<{ href: string }>;
}): { type: "open"; href: string } | { type: "submit" } {
  if (
    input.activeIndex >= 0 &&
    input.activeIndex < input.options.length &&
    input.options[input.activeIndex]?.href
  ) {
    return {
      type: "open",
      href: input.options[input.activeIndex].href,
    };
  }

  return { type: "submit" };
}

function isSafeCatalogAuthorSuggestionHref(href: string): boolean {
  return href.startsWith("/authors/") && !href.includes("//");
}

function isSafeCatalogProductSuggestionHref(href: string): boolean {
  return href.startsWith("/practice/") && !href.includes("//");
}

export function mapCatalogAuthorToSuggestion(
  author: CatalogAuthorSearchResult,
): CatalogAuthorSuggestion | null {
  const name = author.name?.trim();
  const slug = author.slug?.trim();
  const href = author.href?.trim() || (slug ? `/authors/${slug}` : "");

  if (!name || !slug || !isSafeCatalogAuthorSuggestionHref(href)) {
    return null;
  }

  return {
    id: author.id,
    name,
    positioningText: author.positioningText,
    avatarUrl: author.avatarUrl,
    href,
  };
}

export function mapCatalogAuthorsToSuggestions(
  authors: CatalogAuthorSearchResult[],
): CatalogAuthorSuggestion[] {
  return authors
    .map(mapCatalogAuthorToSuggestion)
    .filter((item): item is CatalogAuthorSuggestion => item !== null)
    .slice(0, CATALOG_AUTHOR_SUGGEST_LIMIT);
}

export function mapCatalogProductToSuggestion(
  product: CatalogProduct,
): CatalogProductSuggestion | null {
  const authorName = product.authorName?.trim();
  const authorSlug = product.authorSlug?.trim();
  const productSlug = product.slug?.trim();

  if (!authorName || !authorSlug || !productSlug) {
    return null;
  }

  const href = product.href?.trim() || buildPracticePublicPath(authorSlug, productSlug);

  if (!isSafeCatalogProductSuggestionHref(href)) {
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
): CatalogProductSuggestion[] {
  return products
    .map(mapCatalogProductToSuggestion)
    .filter((item): item is CatalogProductSuggestion => item !== null)
    .slice(0, CATALOG_PRODUCT_SUGGEST_LIMIT);
}

export function getCatalogSuggestAuthorOptionId(index: number): string {
  return `catalog-search-author-option-${index}`;
}

export function getCatalogSuggestProductOptionId(index: number): string {
  return `catalog-search-product-option-${index}`;
}

/** @deprecated Use getCatalogSuggestProductOptionId with flattenCatalogSuggestOptions */
export function getCatalogSuggestOptionId(index: number): string {
  return getCatalogSuggestProductOptionId(index);
}

export function getCatalogSuggestActiveOptionId(
  activeIndex: number,
  options: ReadonlyArray<CatalogSuggestOption>,
): string | undefined {
  if (activeIndex < 0 || activeIndex >= options.length) {
    return undefined;
  }

  return options[activeIndex]?.optionId;
}

function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

export function formatCatalogSearchResultsSummary(
  authorCount: number,
  productCount: number,
): string | null {
  if (authorCount === 0 && productCount === 0) {
    return null;
  }

  const parts: string[] = [];

  if (authorCount > 0) {
    parts.push(
      `${authorCount} ${pluralRu(authorCount, "автор", "автора", "авторов")}`,
    );
  }

  if (productCount > 0) {
    parts.push(
      `${productCount} ${pluralRu(productCount, "аудиопродукт", "аудиопродукта", "аудиопродуктов")}`,
    );
  }

  return `Найдено: ${parts.join(" и ")}`;
}

export function isCatalogGroupedSearchEmpty(
  authorCount: number,
  productCount: number,
): boolean {
  return authorCount === 0 && productCount === 0;
}

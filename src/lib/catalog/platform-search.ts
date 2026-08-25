import {
  buildCatalogSearchResultsHref,
  getCatalogSuggestProductOptionId,
  resolveCatalogSuggestEnterAction,
  type CatalogProductSuggestion,
  type CatalogSuggestOption,
} from "@/lib/catalog/search-suggestions";
import {
  buildCatalogClearSearchHref,
  buildCatalogHref,
  normalizeCatalogTopicParam,
  type CatalogHrefOptions,
} from "@/lib/catalog/topic-filter";
import { normalizeCatalogSearchQuery } from "@/lib/catalog/search";

export type PlatformSearchListingState = Pick<
  CatalogHrefOptions,
  "access" | "class" | "sort"
>;

export const PLATFORM_SEARCH_DEBOUNCE_MS = 275;
export const PLATFORM_SEARCH_CATALOG_URL_DEBOUNCE_MS = 300;

export type PlatformSearchMode = "suggest" | "catalog-inline";

export function resolvePlatformSearchMode(pathname: string): PlatformSearchMode {
  return pathname === "/catalog" ? "catalog-inline" : "suggest";
}

export function readPlatformSearchQueryFromParams(
  params: Pick<URLSearchParams, "get">,
): string {
  return normalizeCatalogSearchQuery(params.get("q"));
}

export function readPlatformSearchTopicFromParams(
  params: Pick<URLSearchParams, "get">,
): string | null {
  return normalizeCatalogTopicParam(params.get("topic"));
}

export function readPlatformSearchListingFromParams(
  params: Pick<URLSearchParams, "get">,
): PlatformSearchListingState {
  return {
    access: params.get("access"),
    class: params.get("class") ?? params.get("kind"),
    sort: params.get("sort"),
  };
}

export function buildPlatformSearchCatalogHref(
  rawQuery: string,
  topicKey: string | null,
  listing?: PlatformSearchListingState,
): string {
  return buildCatalogHref({
    q: normalizeCatalogSearchQuery(rawQuery),
    topic: topicKey,
    ...listing,
  });
}

export function buildPlatformSearchClearHref(
  topicKey: string | null,
  listing?: PlatformSearchListingState,
): string {
  return buildCatalogClearSearchHref(topicKey, listing);
}

export function buildPlatformSearchResultsHref(
  rawQuery: string,
  topicKey: string | null,
  listing?: PlatformSearchListingState,
): string {
  return buildCatalogSearchResultsHref(rawQuery, topicKey, listing);
}

export function flattenPlatformProductSuggestOptions(
  products: ReadonlyArray<{ href: string }>,
): CatalogSuggestOption[] {
  return products
    .filter((product) => product.href)
    .map((product, index) => ({
      kind: "product" as const,
      href: product.href,
      optionId: getCatalogSuggestProductOptionId(index),
    }));
}

export function resolvePlatformSearchEnterAction(input: {
  mode: PlatformSearchMode;
  rawQuery: string;
  topicKey: string | null;
  activeIndex: number;
  options: ReadonlyArray<{ href: string }>;
  isDropdownOpen: boolean;
  listing?: PlatformSearchListingState;
}): { type: "open"; href: string } | { type: "submit"; href: string } {
  if (input.mode === "catalog-inline") {
    return {
      type: "submit",
      href: buildPlatformSearchCatalogHref(
        input.rawQuery,
        input.topicKey,
        input.listing,
      ),
    };
  }

  const suggestAction = resolveCatalogSuggestEnterAction({
    activeIndex: input.isDropdownOpen ? input.activeIndex : -1,
    options: input.isDropdownOpen ? input.options : [],
  });

  if (suggestAction.type === "open") {
    return suggestAction;
  }

  return {
    type: "submit",
    href: buildPlatformSearchResultsHref(
      input.rawQuery,
      input.topicKey,
      input.listing,
    ),
  };
}

export function isPlatformProductSuggestEmpty(
  products: ReadonlyArray<CatalogProductSuggestion>,
): boolean {
  return products.length === 0;
}

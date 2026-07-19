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
} from "@/lib/catalog/topic-filter";
import { normalizeCatalogSearchQuery } from "@/lib/catalog/search";

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

export function buildPlatformSearchCatalogHref(
  rawQuery: string,
  topicKey: string | null,
): string {
  return buildCatalogHref({
    q: normalizeCatalogSearchQuery(rawQuery),
    topic: topicKey,
  });
}

export function buildPlatformSearchClearHref(topicKey: string | null): string {
  return buildCatalogClearSearchHref(topicKey);
}

export function buildPlatformSearchResultsHref(
  rawQuery: string,
  topicKey: string | null,
): string {
  return buildCatalogSearchResultsHref(rawQuery, topicKey);
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
}): { type: "open"; href: string } | { type: "submit"; href: string } {
  if (input.mode === "catalog-inline") {
    return {
      type: "submit",
      href: buildPlatformSearchCatalogHref(input.rawQuery, input.topicKey),
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
    href: buildPlatformSearchResultsHref(input.rawQuery, input.topicKey),
  };
}

export function isPlatformProductSuggestEmpty(
  products: ReadonlyArray<CatalogProductSuggestion>,
): boolean {
  return products.length === 0;
}

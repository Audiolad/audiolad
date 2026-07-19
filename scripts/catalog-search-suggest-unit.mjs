#!/usr/bin/env node
/**
 * Catalog search suggest dropdown unit checks (no DB).
 */
import {
  CATALOG_SEARCH_SUGGEST_MIN_LENGTH,
  CATALOG_SEARCH_SUGGESTION_LIMIT,
  normalizeCatalogSearchQuery,
} from "../src/lib/catalog/search.ts";
import {
  buildCatalogSearchResultsHref,
  buildCatalogSuggestApiUrl,
  CATALOG_SEARCH_SUGGESTION_RESPONSE_KEYS,
  isCatalogSuggestAbortError,
  mapCatalogProductToSuggestion,
  moveCatalogSuggestActiveIndex,
  resolveCatalogSuggestEnterAction,
  shouldApplyCatalogSuggestResponse,
  shouldFetchCatalogSuggestions,
} from "../src/lib/catalog/search-suggestions.ts";
import { isPublicCatalogSearchPractice } from "../src/lib/catalog/search.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(!shouldFetchCatalogSuggestions(""), "empty query does not fetch");
assert(!shouldFetchCatalogSuggestions(" "), "whitespace does not fetch");
assert(!shouldFetchCatalogSuggestions("а"), "1 char does not fetch");
assert(shouldFetchCatalogSuggestions("аб"), "2 chars fetch");
assert(
  normalizeCatalogSearchQuery("  деньги  ") === "деньги",
  "normalizer reuse",
);

assert(
  buildCatalogSuggestApiUrl("деньги", null) ===
    "/api/catalog/search/suggest?q=%D0%B4%D0%B5%D0%BD%D1%8C%D0%B3%D0%B8",
  "suggest api q only",
);
assert(
  buildCatalogSuggestApiUrl("деньги", "money").includes("topic=money"),
  "suggest api q + topic",
);
assert(
  !buildCatalogSuggestApiUrl("деньги", "money").includes("limit="),
  "client cannot set limit",
);

assert(
  buildCatalogSearchResultsHref("деньги", "money") ===
    "/catalog?q=%D0%B4%D0%B5%D0%BD%D1%8C%D0%B3%D0%B8&topic=money",
  "show all href",
);

assert(
  CATALOG_SEARCH_SUGGEST_MIN_LENGTH === 2,
  "min length constant",
);
assert(CATALOG_SEARCH_SUGGESTION_LIMIT === 6, "server suggest limit");

assert(
  moveCatalogSuggestActiveIndex(-1, "down", 3) === 0,
  "arrow down from none selects first",
);
assert(
  moveCatalogSuggestActiveIndex(0, "up", 3) === 0,
  "arrow up stops at first",
);
assert(
  moveCatalogSuggestActiveIndex(2, "down", 3) === 2,
  "arrow down stops at last",
);
assert(
  moveCatalogSuggestActiveIndex(1, "down", 3) === 2,
  "arrow down moves",
);
assert(
  moveCatalogSuggestActiveIndex(1, "up", 3) === 0,
  "arrow up moves",
);

assert(
  resolveCatalogSuggestEnterAction({ activeIndex: -1, suggestions: [{ href: "/practice/a/b" }] })
    .type === "submit",
  "enter without active item submits",
);
assert(
  resolveCatalogSuggestEnterAction({
    activeIndex: 0,
    suggestions: [{ href: "/practice/author/product" }],
  }).type === "open",
  "enter with active item opens",
);
assert(
  resolveCatalogSuggestEnterAction({
    activeIndex: 0,
    suggestions: [{ href: "/practice/author/product" }],
  }).href === "/practice/author/product",
  "enter active href",
);

assert(shouldApplyCatalogSuggestResponse(2, 2), "matching request id applies");
assert(!shouldApplyCatalogSuggestResponse(1, 2), "stale request rejected");

const abortError = new Error("Aborted");
abortError.name = "AbortError";
assert(isCatalogSuggestAbortError(abortError), "abort error detected");

const suggestion = mapCatalogProductToSuggestion({
  id: "p1",
  title: "Практика",
  slug: "practice",
  subtitle: "Коротко",
  description: "secret description",
  format: "Аудиопрактика",
  price: 100,
  isFree: false,
  authorName: "Автор",
  authorSlug: "author",
  href: "/practice/author/practice",
  meta: null,
  statsLabel: null,
  productTypeLabel: "Аудиопрактика",
  priceLabel: "100 ₽",
  sortTimestamp: 0,
  coverUrl: null,
  coverImage: null,
  updatedAt: null,
});

assert(suggestion?.title === "Практика", "maps title");
assert(suggestion?.href === "/practice/author/practice", "maps href");
assert(!("description" in (suggestion ?? {})), "no description in dto");
assert(
  CATALOG_SEARCH_SUGGESTION_RESPONSE_KEYS.every((key) => key in (suggestion ?? {})),
  "dto keys only",
);
assert(
  mapCatalogProductToSuggestion({
    id: "p2",
    title: "X",
    slug: "x",
    subtitle: null,
    description: null,
    format: null,
    price: null,
    isFree: true,
    authorName: null,
    authorSlug: "author",
    href: "/practice/author/x",
    meta: null,
    statsLabel: null,
    productTypeLabel: "Аудиопрактика",
    priceLabel: "Подарок",
    sortTimestamp: 0,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
  }) === null,
  "missing author rejected",
);

assert(
  isPublicCatalogSearchPractice({
    status: "published",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "author-1",
  }),
  "visibility helper still enforced in search layer",
);

console.log("catalog-search-suggest-unit: ok");

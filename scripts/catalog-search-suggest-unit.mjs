#!/usr/bin/env node
/**
 * Catalog search suggest dropdown unit checks (no DB).
 */
import { CATALOG_AUTHOR_SUGGEST_LIMIT } from "../src/lib/catalog/author-search.ts";
import {
  CATALOG_PRODUCT_SUGGEST_LIMIT,
  CATALOG_SEARCH_SUGGEST_MIN_LENGTH,
  normalizeCatalogSearchQuery,
} from "../src/lib/catalog/search.ts";
import {
  buildCatalogSearchResultsHref,
  buildCatalogSuggestApiUrl,
  CATALOG_AUTHOR_SUGGESTION_RESPONSE_KEYS,
  CATALOG_PRODUCT_SUGGESTION_RESPONSE_KEYS,
  flattenCatalogSuggestOptions,
  getCatalogSuggestAuthorOptionId,
  getCatalogSuggestProductOptionId,
  isCatalogSuggestAbortError,
  isCatalogSuggestResponseEmpty,
  mapCatalogAuthorToSuggestion,
  mapCatalogProductToSuggestion,
  moveCatalogSuggestActiveIndex,
  resolveCatalogSuggestEnterAction,
  shouldApplyCatalogSuggestResponse,
  shouldFetchCatalogSuggestions,
  formatCatalogSearchResultsSummary,
  isCatalogGroupedSearchEmpty,
} from "../src/lib/catalog/search-suggestions.ts";
import { isPublicCatalogSearchPractice } from "../src/lib/catalog/search.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(!shouldFetchCatalogSuggestions(""), "empty query does not fetch");
assert(!shouldFetchCatalogSuggestions("а"), "1 char does not fetch");
assert(shouldFetchCatalogSuggestions("аб"), "2 chars fetch");
assert(
  normalizeCatalogSearchQuery("  деньги  ") === "деньги",
  "normalizer reuse",
);

assert(
  buildCatalogSuggestApiUrl("деньги", "money").includes("topic=money"),
  "suggest api q + topic",
);
assert(
  !buildCatalogSuggestApiUrl("деньги", "money").includes("limit="),
  "client cannot set limit",
);

assert(CATALOG_SEARCH_SUGGEST_MIN_LENGTH === 2, "min length constant");
assert(CATALOG_AUTHOR_SUGGEST_LIMIT === 3, "author suggest limit");
assert(CATALOG_PRODUCT_SUGGEST_LIMIT === 5, "product suggest limit");

assert(
  isCatalogSuggestResponseEmpty({ authors: [], products: [] }),
  "empty response",
);
assert(
  !isCatalogSuggestResponseEmpty({
    authors: [{ id: "1", name: "A", positioningText: null, avatarUrl: null, href: "/authors/a" }],
    products: [],
  }),
  "authors only not empty",
);

const flat = flattenCatalogSuggestOptions({
  authors: [{ href: "/authors/a" }, { href: "/authors/b" }],
  products: [{ href: "/practice/a/p1" }],
});

assert(flat.length === 3, "flatten count");
assert(flat[0]?.kind === "author" && flat[0].optionId === getCatalogSuggestAuthorOptionId(0));
assert(flat[2]?.kind === "product" && flat[2].optionId === getCatalogSuggestProductOptionId(0));

assert(
  moveCatalogSuggestActiveIndex(1, "down", 3) === 2,
  "arrow down across sections",
);
assert(
  moveCatalogSuggestActiveIndex(0, "up", 3) === 0,
  "arrow up stops at first",
);

assert(
  resolveCatalogSuggestEnterAction({
    activeIndex: 0,
    options: [{ href: "/authors/sergey" }],
  }).href === "/authors/sergey",
  "enter author",
);
assert(
  resolveCatalogSuggestEnterAction({
    activeIndex: 1,
    options: [{ href: "/authors/a" }, { href: "/practice/a/p" }],
  }).href === "/practice/a/p",
  "enter product",
);
assert(
  resolveCatalogSuggestEnterAction({ activeIndex: -1, options: [{ href: "/authors/a" }] })
    .type === "submit",
  "enter without active item submits",
);

assert(shouldApplyCatalogSuggestResponse(2, 2), "stale guard apply");
assert(!shouldApplyCatalogSuggestResponse(1, 2), "stale guard reject");

const abortError = new Error("Aborted");
abortError.name = "AbortError";
assert(isCatalogSuggestAbortError(abortError), "abort error detected");

const productSuggestion = mapCatalogProductToSuggestion({
  id: "p1",
  title: "Практика",
  slug: "practice",
  subtitle: "Коротко",
  description: "secret",
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

assert(
  CATALOG_PRODUCT_SUGGESTION_RESPONSE_KEYS.every((key) => key in (productSuggestion ?? {})),
  "product dto keys",
);
assert(!("description" in (productSuggestion ?? {})), "no description in product dto");

const authorSuggestion = mapCatalogAuthorToSuggestion({
  id: "a1",
  name: "Автор",
  slug: "author",
  positioningText: "Текст",
  avatarUrl: null,
  publishedCount: 2,
  href: "/authors/author",
});

assert(
  CATALOG_AUTHOR_SUGGESTION_RESPONSE_KEYS.every((key) => key in (authorSuggestion ?? {})),
  "author dto keys",
);

assert(
  formatCatalogSearchResultsSummary(2, 8) ===
    "Найдено: 2 автора и 8 аудиопродуктов",
  "grouped summary",
);
assert(isCatalogGroupedSearchEmpty(0, 0), "grouped empty");
assert(!isCatalogGroupedSearchEmpty(1, 0), "authors only not grouped empty");

assert(
  isPublicCatalogSearchPractice({
    status: "published",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "author-1",
  }),
  "product visibility helper preserved",
);

console.log("catalog-search-suggest-unit: ok");

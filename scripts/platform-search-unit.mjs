#!/usr/bin/env node
/**
 * Platform unified search unit checks (no DB).
 */
import {
  buildPlatformSearchCatalogHref,
  buildPlatformSearchClearHref,
  buildPlatformSearchResultsHref,
  flattenPlatformProductSuggestOptions,
  readPlatformSearchQueryFromParams,
  readPlatformSearchTopicFromParams,
  resolvePlatformSearchEnterAction,
  resolvePlatformSearchMode,
} from "../src/lib/catalog/platform-search.ts";
import {
  buildCatalogSuggestApiUrl,
  shouldApplyCatalogSuggestResponse,
} from "../src/lib/catalog/search-suggestions.ts";
import {
  isPublicCatalogSearchPractice,
  normalizeCatalogSearchQuery,
} from "../src/lib/catalog/search.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  resolvePlatformSearchMode("/catalog") === "catalog-inline",
  "catalog path uses inline mode",
);
assert(
  resolvePlatformSearchMode("/") === "suggest",
  "home path uses suggest mode",
);
assert(
  resolvePlatformSearchMode("/my-practices") === "suggest",
  "library path uses suggest mode",
);

const catalogParams = new URLSearchParams("q=%D0%B8%D0%B7%D0%BE%D0%B1%D0%B8%D0%BB%D0%B8%D0%B5&topic=money");
assert(
  readPlatformSearchQueryFromParams(catalogParams) === "изобилие",
  "catalog reads q from URL params",
);
assert(
  readPlatformSearchTopicFromParams(catalogParams) === "money",
  "catalog reads topic from URL params",
);

assert(
  buildPlatformSearchClearHref("money") === "/catalog?topic=money",
  "clear removes q but keeps topic",
);
assert(buildPlatformSearchClearHref(null) === "/catalog", "clear without topic");

const enterHref = resolvePlatformSearchEnterAction({
  mode: "suggest",
  rawQuery: "деньги",
  topicKey: null,
  activeIndex: -1,
  options: [],
  isDropdownOpen: false,
}).href;

assert(
  enterHref === buildPlatformSearchResultsHref("деньги", null),
  "Enter forms catalog results href",
);
assert(enterHref === "/catalog?q=%D0%B4%D0%B5%D0%BD%D1%8C%D0%B3%D0%B8", "Enter encodes query");

assert(
  buildPlatformSearchCatalogHref("изобилие", "money") ===
    "/catalog?q=%D0%B8%D0%B7%D0%BE%D0%B1%D0%B8%D0%BB%D0%B8%D0%B5&topic=money",
  "catalog inline href preserves topic",
);

const productOptions = flattenPlatformProductSuggestOptions([
  { href: "/practice/a/p1" },
  { href: "/practice/a/p2" },
]);
assert(productOptions.length === 2, "product-only flatten count");
assert(productOptions.every((item) => item.kind === "product"), "products only");

const selected = resolvePlatformSearchEnterAction({
  mode: "suggest",
  rawQuery: "деньги",
  topicKey: null,
  activeIndex: 0,
  options: productOptions,
  isDropdownOpen: true,
});
assert(
  selected.type === "open" && selected.href === "/practice/a/p1",
  "active product opens product page",
);

assert(
  !isPublicCatalogSearchPractice({
    status: "draft",
    is_catalog_listed: true,
    slug: "x",
    author_id: "1",
  }),
  "draft products excluded",
);
assert(
  !isPublicCatalogSearchPractice({
    status: "published",
    is_catalog_listed: false,
    slug: "x",
    author_id: "1",
  }),
  "unlisted products excluded",
);

assert(
  shouldApplyCatalogSuggestResponse(2, 2) && !shouldApplyCatalogSuggestResponse(1, 2),
  "stale async responses ignored",
);

assert(
  buildCatalogSuggestApiUrl("деньги", null).startsWith("/api/catalog/search/suggest?q="),
  "shell suggest uses shared API builder",
);
assert(
  normalizeCatalogSearchQuery("  деньги  ") === "деньги",
  "shared query normalizer",
);

console.log("platform-search-unit: ok");

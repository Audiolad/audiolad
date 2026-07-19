#!/usr/bin/env node
/**
 * Catalog search unit checks (no DB).
 */
import {
  buildCatalogClearSearchHref,
  buildCatalogHref,
  buildCatalogTopicHref,
} from "../src/lib/catalog/topic-filter.ts";
import {
  buildPracticeFieldsOrIlikeFilter,
  CATALOG_SEARCH_MAX_LENGTH,
  dedupePracticeRowsById,
  escapeIlikePattern,
  isPublicCatalogSearchPractice,
  normalizeCatalogSearchQuery,
} from "../src/lib/catalog/search.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(normalizeCatalogSearchQuery(undefined) === "", "undefined -> empty");
assert(normalizeCatalogSearchQuery(null) === "", "null -> empty");
assert(normalizeCatalogSearchQuery("   ") === "", "whitespace -> empty");
assert(normalizeCatalogSearchQuery("  деньги  ") === "деньги", "trim + collapse");
assert(
  normalizeCatalogSearchQuery("деньги   и   спокойствие") === "деньги и спокойствие",
  "collapse spaces",
);
assert(
  normalizeCatalogSearchQuery("a".repeat(CATALOG_SEARCH_MAX_LENGTH + 25)).length ===
    CATALOG_SEARCH_MAX_LENGTH,
  "max length",
);
assert(
  normalizeCatalogSearchQuery("Ёлка-2024") === "Ёлка-2024",
  "preserve cyrillic, hyphen, digits",
);

assert(escapeIlikePattern("100%") === "100\\%", "escape percent");
assert(escapeIlikePattern("a_b") === "a\\_b", "escape underscore");
assert(escapeIlikePattern("a\\b") === "a\\\\b", "escape backslash");
assert(
  escapeIlikePattern('quote"test') === 'quote"test',
  "preserve quotes in ilike value",
);

const commaFilter = buildPracticeFieldsOrIlikeFilter("деньги, спокойствие");
assert(
  commaFilter.includes('title.ilike."%деньги, спокойствие%"'),
  "quoted or filter keeps comma",
);
assert(
  buildPracticeFieldsOrIlikeFilter('paren(test)').includes(
    'title.ilike."%paren(test)%"',
  ),
  "quoted or filter keeps parentheses",
);
assert(
  buildPracticeFieldsOrIlikeFilter("it's fine").includes(
    'title.ilike."%it\'s fine%"',
  ),
  "quoted or filter keeps single quote",
);
assert(
  buildPracticeFieldsOrIlikeFilter('say "hello"').includes(
    'title.ilike."%say ""hello""%"',
  ),
  "quoted or filter escapes double quotes",
);

function parseCatalogHref(href) {
  const url = new URL(href, "https://audiolad.test");
  return {
    q: url.searchParams.get("q"),
    topic: url.searchParams.get("topic"),
  };
}

assert(buildCatalogHref({}) === "/catalog", "empty href");
assert(parseCatalogHref(buildCatalogHref({ q: "деньги" })).q === "деньги", "q only");
assert(
  parseCatalogHref(buildCatalogHref({ q: "деньги", topic: "money" })).q === "деньги" &&
    parseCatalogHref(buildCatalogHref({ q: "деньги", topic: "money" })).topic === "money",
  "q + topic",
);
assert(
  parseCatalogHref(buildCatalogTopicHref("money", "деньги")).q === "деньги" &&
    parseCatalogHref(buildCatalogTopicHref("money", "деньги")).topic === "money",
  "topic href preserves q",
);
assert(
  parseCatalogHref(buildCatalogTopicHref(null, "деньги")).q === "деньги" &&
    parseCatalogHref(buildCatalogTopicHref(null, "деньги")).topic === null,
  "all topics preserves q",
);
assert(
  buildCatalogClearSearchHref("money") === "/catalog?topic=money",
  "clear q keeps topic",
);
assert(buildCatalogClearSearchHref(null) === "/catalog", "clear q without topic");

assert(
  isPublicCatalogSearchPractice({
    status: "published",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "author-1",
  }),
  "published catalog-listed passes",
);
assert(
  !isPublicCatalogSearchPractice({
    status: "draft",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "author-1",
  }),
  "draft rejected",
);
assert(
  !isPublicCatalogSearchPractice({
    status: "unpublished",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "author-1",
  }),
  "unpublished rejected",
);
assert(
  !isPublicCatalogSearchPractice({
    status: "archived",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "author-1",
  }),
  "archived rejected",
);
assert(
  !isPublicCatalogSearchPractice({
    status: "published",
    is_catalog_listed: false,
    slug: "practice",
    author_id: "author-1",
  }),
  "unlisted rejected",
);
assert(
  !isPublicCatalogSearchPractice({
    status: "published",
    is_catalog_listed: true,
    slug: null,
    author_id: "author-1",
  }),
  "missing slug rejected",
);

const deduped = dedupePracticeRowsById([
  { id: "a", title: "one" },
  { id: "b", title: "two" },
  { id: "a", title: "duplicate" },
]);
assert(deduped.length === 2, "dedupe count");
assert(deduped[0].title === "one", "dedupe keeps first row");

console.log("catalog-search-unit: ok");

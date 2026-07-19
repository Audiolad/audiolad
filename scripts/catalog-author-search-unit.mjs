#!/usr/bin/env node
/**
 * Catalog author search unit checks (no DB).
 */
import {
  CATALOG_AUTHOR_SEARCH_CANDIDATE_LIMIT,
  CATALOG_AUTHOR_SEARCH_RESULT_LIMIT,
  CATALOG_AUTHOR_SUGGEST_LIMIT,
  collectEligibleAuthorIdsFromPractices,
  compareCatalogAuthorSearchRank,
  isEligibleCatalogAuthorPractice,
  isPublicCatalogSearchAuthor,
  rankCatalogAuthorSearchMatch,
} from "../src/lib/catalog/author-search.ts";
import { normalizeCatalogSearchQuery } from "../src/lib/catalog/search.ts";
import { mapCatalogAuthorToSuggestion } from "../src/lib/catalog/search-suggestions.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  normalizeCatalogSearchQuery("  сергей  ") === "сергей",
  "normalizer reuse",
);

assert(
  isPublicCatalogSearchAuthor({ name: "Сергей", slug: "sergey" }),
  "valid public author",
);
assert(
  !isPublicCatalogSearchAuthor({ name: " ", slug: "sergey" }),
  "empty name rejected",
);
assert(
  !isPublicCatalogSearchAuthor({ name: "Сергей", slug: " " }),
  "empty slug rejected",
);

assert(
  isEligibleCatalogAuthorPractice({
    status: "published",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "a1",
  }),
  "published listed product eligible",
);
assert(
  !isEligibleCatalogAuthorPractice({
    status: "draft",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "a1",
  }),
  "draft excluded",
);
assert(
  !isEligibleCatalogAuthorPractice({
    status: "published",
    is_catalog_listed: false,
    slug: "practice",
    author_id: "a1",
  }),
  "unlisted excluded",
);
assert(
  !isEligibleCatalogAuthorPractice({
    status: "archived",
    is_catalog_listed: true,
    slug: "practice",
    author_id: "a1",
  }),
  "archived excluded",
);
assert(
  !isEligibleCatalogAuthorPractice({
    status: "published",
    is_catalog_listed: true,
    slug: null,
    author_id: "a1",
  }),
  "missing slug excluded",
);

const eligibleIds = collectEligibleAuthorIdsFromPractices([
  {
    status: "published",
    is_catalog_listed: true,
    slug: "p1",
    author_id: "author-1",
  },
  {
    status: "draft",
    is_catalog_listed: true,
    slug: "p2",
    author_id: "author-2",
  },
  {
    status: "published",
    is_catalog_listed: true,
    slug: "p3",
    author_id: "author-1",
  },
]);

assert(eligibleIds.size === 1 && eligibleIds.has("author-1"), "dedupe eligible authors");

assert(
  rankCatalogAuthorSearchMatch("сергей", {
    name: "Сергей Петров",
    positioningText: null,
    fullBio: null,
    themeTitles: [],
  }) === 1,
  "name starts with query",
);
assert(
  rankCatalogAuthorSearchMatch("сергей", {
    name: "Сергей",
    positioningText: null,
    fullBio: null,
    themeTitles: [],
  }) === 0,
  "exact name highest",
);
assert(
  rankCatalogAuthorSearchMatch("сер", {
    name: "Сергей",
    positioningText: null,
    fullBio: null,
    themeTitles: [],
  }) === 1,
  "name starts with",
);
assert(
  rankCatalogAuthorSearchMatch("энерг", {
    name: "Сергей",
    positioningText: "Энергия и рост",
    fullBio: null,
    themeTitles: [],
  }) === 3,
  "positioning below name",
);
assert(
  rankCatalogAuthorSearchMatch("сергей", {
    name: "Сергей",
    positioningText: null,
    fullBio: null,
    themeTitles: [],
  }) <
    rankCatalogAuthorSearchMatch("сергей", {
      name: "Другой",
      positioningText: "Сергей в positioning",
      fullBio: null,
      themeTitles: [],
    }),
  "exact name above positioning match",
);

assert(
  compareCatalogAuthorSearchRank(
    "сер",
    {
      name: "Сергей",
      positioningText: null,
      fullBio: null,
      themeTitles: [],
    },
    {
      name: "Анна",
      positioningText: "сергей",
      fullBio: null,
      themeTitles: [],
    },
  ) < 0,
  "deterministic ranking",
);

assert(CATALOG_AUTHOR_SUGGEST_LIMIT === 3, "author suggest limit");
assert(CATALOG_AUTHOR_SEARCH_RESULT_LIMIT === 50, "full author limit");
assert(CATALOG_AUTHOR_SEARCH_CANDIDATE_LIMIT === 50, "candidate bound");

assert(
  (await import("../src/lib/catalog/author-search.ts")).CATALOG_AUTHOR_THEME_TITLE_SEARCH_IS_OPTIONAL ===
    true,
  "theme title search is optional",
);

const authorSuggestion = mapCatalogAuthorToSuggestion({
  id: "a1",
  name: "Сергей Петров",
  slug: "sergey-petrov",
  positioningText: "Психолог",
  avatarUrl: null,
  publishedCount: 3,
  href: "/authors/sergey-petrov",
});

assert(authorSuggestion?.href === "/authors/sergey-petrov", "author href");
assert(!("publishedCount" in (authorSuggestion ?? {})), "no publishedCount in suggest dto");
assert(!("email" in (authorSuggestion ?? {})), "no private fields");
assert(
  mapCatalogAuthorToSuggestion({
    id: "a2",
    name: "X",
    slug: "x",
    positioningText: null,
    avatarUrl: null,
    publishedCount: 1,
    href: "https://evil.com/x",
  }) === null,
  "external href rejected",
);

console.log("catalog-author-search-unit: ok");

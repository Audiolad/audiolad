#!/usr/bin/env node
import {
  isEligibleCatalogAuthorPractice,
} from "../src/lib/catalog/author-search.ts";
import { isPublicCatalogSearchPractice } from "../src/lib/catalog/search.ts";
import {
  filterPublicCatalogPracticeRows,
  filterPublicPracticeRows,
  isFixtureMarkedPractice,
  isPublicCatalogPracticeRow,
  shouldBlockPublicPracticeAccess,
} from "../src/lib/fixtures/test-fixture-marker.ts";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const marked = {
  id: "practice-1",
  status: "published",
  is_catalog_listed: true,
  slug: "fixture-product",
  author_id: "author-1",
  cover_image: {
    _audiolad_fixture: {
      test_fixture: true,
      namespace: "unit",
      run_id: "abc",
    },
  },
};

const real = {
  id: "practice-2",
  status: "published",
  is_catalog_listed: true,
  slug: "real-product",
  author_id: "author-2",
  cover_image: null,
};

assert(shouldBlockPublicPracticeAccess(marked), "practice page lookup must block fixture");
assert(!shouldBlockPublicPracticeAccess(real), "real practice must remain accessible");
assert(isPublicCatalogPracticeRow(marked) === false, "catalog marker helper must exclude fixture");
assert(isPublicCatalogSearchPractice(marked) === false, "search helper must exclude fixture");
assert(isEligibleCatalogAuthorPractice(marked) === false, "author search must exclude fixture");
assert(filterPublicPracticeRows([marked, real]).length === 1, "filterPublicPracticeRows must drop fixture");
assert(
  filterPublicCatalogPracticeRows([marked, real]).length === 1,
  "filterPublicCatalogPracticeRows must drop fixture",
);
assert(isFixtureMarkedPractice(marked) === true, "marker detect");

if (failures.length) {
  console.error("public-feed-fixture-guard-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("public-feed-fixture-guard-unit: all checks passed");

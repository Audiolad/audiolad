#!/usr/bin/env node
import {
  hasFixtureMarker,
  isFixtureMarkedPractice,
  isPublicCatalogPracticeRow,
} from "../src/lib/fixtures/test-fixture-marker.ts";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const marked = {
  status: "published",
  is_catalog_listed: true,
  slug: "demo",
  author_id: "author-id",
  cover_image: {
    _audiolad_fixture: {
      test_fixture: true,
      namespace: "unit",
      run_id: "abc",
    },
  },
};

assert(isFixtureMarkedPractice(marked), "fixture practice must be detected by marker");
assert(
  !isPublicCatalogPracticeRow(marked),
  "fixture-marked practice must be excluded from public catalog rows",
);

const real = {
  status: "published",
  is_catalog_listed: true,
  slug: "real-product",
  author_id: "author-id",
  cover_image: null,
};

assert(isPublicCatalogPracticeRow(real), "real published practice must remain public");
assert(!hasFixtureMarker(null), "null must not be fixture marker");

if (failures.length) {
  console.error("test-fixture-marker-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("test-fixture-marker-unit: all checks passed");

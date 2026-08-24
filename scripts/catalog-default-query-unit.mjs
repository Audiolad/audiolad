#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(
  join(root, "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx"),
  "utf8",
);

assert.match(
  page,
  /canLoadDefaultListingInParallel/,
  "default catalog path is named",
);
assert.match(
  page,
  /Promise\.all\(\[\s*listTopicsWithCatalogCounts\(supabase\),\s*canLoadDefaultListingInParallel\s*\?[\s\S]*listPublishedCatalog\(supabase, \{ \.\.\.listingQuery, topic: null \}\)/,
  "default path overlaps topics with unfiltered listing",
);
assert.match(
  page,
  /defaultListing \?\?[\s\S]*listPublishedCatalog\(supabase, resolvedListingQuery\)/,
  "topic-filtered path still loads listing after validated key",
);
assert.match(page, /export const dynamic = "force-dynamic"/, "catalog stays dynamic");
assert.doesNotMatch(
  page,
  /listPublishedCatalog\(supabase, \{ \.\.\.listingQuery, topic: topicSearchParam \}\)/,
  "raw topic param is never passed to listing",
);
assert.doesNotMatch(
  page,
  /getPublishedCatalogSections/,
  "sections/carousels are no longer the default listing",
);

console.log("catalog-default-query-unit: ok");

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
  /canLoadDefaultSectionsInParallel/,
  "default catalog path is named",
);
assert.match(
  page,
  /Promise\.all\(\[\s*listTopicsWithCatalogCounts\(supabase\),\s*canLoadDefaultSectionsInParallel\s*\?[\s\S]*getPublishedCatalogSections\(supabase, \{ topicKey: null \}\)/,
  "default path overlaps topics with unfiltered sections",
);
assert.match(
  page,
  /defaultSections \?\?[\s\S]*getPublishedCatalogSections\(supabase, \{ topicKey: activeTopicKey \}\)/,
  "topic-filtered path still loads sections after validated key",
);
assert.match(page, /export const dynamic = "force-dynamic"/, "catalog stays dynamic");
assert.doesNotMatch(
  page,
  /getPublishedCatalogSections\(supabase, \{ topicKey: topicSearchParam \}\)/,
  "raw topic param is never passed to sections",
);

console.log("catalog-default-query-unit: ok");

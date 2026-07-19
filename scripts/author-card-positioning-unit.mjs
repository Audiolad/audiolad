#!/usr/bin/env node
/**
 * Author card positioning regression — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  resolveAuthorCardPositioningText,
  resolveAuthorPositioningText,
} from "../src/lib/authors/brand-assets.ts";

const LEGACY_SEED_TEXT =
  "Медитации, энергопрактики и программы для внутренней гармонии.";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testCardPositioningResolver() {
  assert(
    resolveAuthorCardPositioningText("  Энергопрактики  ") === "Энергопрактики",
    "positioning trimmed",
  );
  assert(resolveAuthorCardPositioningText("") === null, "empty string -> null");
  assert(resolveAuthorCardPositioningText("   ") === null, "whitespace -> null");
  assert(resolveAuthorCardPositioningText(null) === null, "null -> null");
  assert(
    resolveAuthorPositioningText(null) !== null,
    "header resolver still has default fallback",
  );
}

function testPublicListLoader() {
  const source = read("src/lib/authors/public-list-data.ts");

  assert(
    source.includes("resolveAuthorCardPositioningText"),
    "public list uses card positioning resolver",
  );
  assert(
    source.includes("positioningText:"),
    "public list exposes positioningText",
  );
  assert(!source.includes("short_bio"), "public list no longer selects short_bio");
  assert(!source.includes("description"), "public list no longer selects description");
  assert(!source.includes("resolveAuthorShortBio"), "short bio resolver removed");
}

function testSimilarAuthorsLoader() {
  const source = read("src/lib/authors/similar-authors.ts");

  assert(
    source.includes("short_positioning"),
    "similar authors select short_positioning",
  );
  assert(
    source.includes("positioningText:"),
    "similar authors expose positioningText",
  );
  assert(!source.includes("short_bio"), "similar authors no longer select short_bio");
  assert(!source.includes("description"), "similar authors no longer select description");
  assert(!source.includes("resolveAuthorShortBio"), "short bio resolver removed");
}

function testCardComponents() {
  const similar = read("src/components/authors/SimilarAuthorsSection.tsx");
  const listCard = read("src/components/authors/AuthorListCard.tsx");
  const rail = read("src/components/home/AuthorsRail.tsx");

  for (const [name, source] of [
    ["SimilarAuthorsSection", similar],
    ["AuthorListCard", listCard],
    ["AuthorsRail", rail],
  ]) {
    assert(
      source.includes("author.positioningText ?"),
      `${name} conditionally renders positioningText`,
    );
    assert(!source.includes("shortBio"), `${name} no longer uses shortBio`);
  }

  assert(!listCard.includes("shortPositioning"), "AuthorListCard no duplicate positioning field");
}

function testLegacyFallbackRemoved() {
  const profile = read("src/lib/authors/profile.ts");

  assert(
    !profile.includes("resolveAuthorShortBio"),
    "resolveAuthorShortBio removed from profile module",
  );
  assert(
    !profile.includes("legacyDescription"),
    "description fallback removed from profile module",
  );
}

function testBaselineSeed() {
  const seed = read("supabase/baseline/0005_required_seed.sql");

  assert(
    !seed.includes(LEGACY_SEED_TEXT),
    "baseline seed no longer inserts legacy author copy",
  );
}

function testDataMigration() {
  const migration = read(
    "supabase/migrations/20260719140000_clear_legacy_author_seed_description.sql",
  );

  assert(
    migration.includes(`btrim(short_bio) =\n  '${LEGACY_SEED_TEXT}'`) ||
      migration.includes(`btrim(short_bio) =\n  '${LEGACY_SEED_TEXT.replace(/'/g, "''")}'`) ||
      migration.includes(`'${LEGACY_SEED_TEXT}'`),
    "migration clears short_bio by exact legacy match",
  );
  assert(
    migration.includes(`btrim(description) =`) &&
      migration.includes(LEGACY_SEED_TEXT),
    "migration clears description by exact legacy match",
  );
  assert(!migration.includes("short_bio = NULL\nWHERE short_bio IS NOT NULL"), "no broad short_bio wipe");
}

function testRuntimeCodeHasNoLegacyCopy() {
  const files = [
    "src/lib/authors/public-list-data.ts",
    "src/lib/authors/similar-authors.ts",
    "src/components/authors/SimilarAuthorsSection.tsx",
    "src/components/authors/AuthorListCard.tsx",
    "src/components/home/AuthorsRail.tsx",
    "src/lib/home/data.ts",
  ];

  for (const file of files) {
    assert(!read(file).includes(LEGACY_SEED_TEXT), `${file} has no legacy seed copy`);
  }
}

const tests = [
  ["card positioning resolver", testCardPositioningResolver],
  ["public list loader", testPublicListLoader],
  ["similar authors loader", testSimilarAuthorsLoader],
  ["card components", testCardComponents],
  ["legacy fallback removed", testLegacyFallbackRemoved],
  ["baseline seed", testBaselineSeed],
  ["data migration", testDataMigration],
  ["runtime code has no legacy copy", testRuntimeCodeHasNoLegacyCopy],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok - ${name}`);
}

console.log(`\n${tests.length} author card positioning checks passed.`);

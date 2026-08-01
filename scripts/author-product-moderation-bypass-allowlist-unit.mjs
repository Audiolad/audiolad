#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase/migrations");

/** Stable platform author workspace UUIDs allowed to bypass product moderation. */
const PLATFORM_BYPASS_AUTHOR_IDS = Object.freeze([
  "50ee125c-8951-4ac6-819a-3f6b11150008", // Сергей и Зоя
  "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c", // Сергей Петров
  "8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0", // Зоя Петрова
  "59c7e5b8-eae4-4394-82fb-b815a10be6c2", // Аурофон / Аурафон
]);

/** External author — must never receive bypass via migrations. */
const GERMAN_SEMENYUK_AUTHOR_ID = "d748e735-c705-45ac-92aa-665a06e773e4";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

/**
 * Collect author UUIDs that migrations set can_bypass_product_moderation = true for.
 * Matches UPDATE ... SET can_bypass_product_moderation = true ... WHERE id ...
 */
function collectBypassSeedUuidsFromMigrations() {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const seeded = new Set();

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    const statements = sql.split(/;(?=\s*(?:--|\n|$))/);

    for (const statement of statements) {
      if (
        !/can_bypass_product_moderation\s*=\s*true/i.test(statement) ||
        !/\bUPDATE\b/i.test(statement)
      ) {
        continue;
      }

      for (const match of statement.matchAll(UUID_RE)) {
        seeded.add(match[0].toLowerCase());
      }
    }

    // Also catch UUID inside DO $$ ... UPDATE blocks that may not split cleanly.
    if (
      /can_bypass_product_moderation\s*=\s*true/i.test(sql) &&
      /\bUPDATE\s+public\.authors\b/i.test(sql)
    ) {
      const updateChunks = sql.split(/UPDATE\s+public\.authors/i).slice(1);
      for (const chunk of updateChunks) {
        const untilSemicolon = chunk.split(";")[0] ?? "";
        if (!/can_bypass_product_moderation\s*=\s*true/i.test(untilSemicolon)) {
          continue;
        }
        for (const match of untilSemicolon.matchAll(UUID_RE)) {
          seeded.add(match[0].toLowerCase());
        }
      }
    }
  }

  return seeded;
}

function testAllowlistContract() {
  assert.equal(PLATFORM_BYPASS_AUTHOR_IDS.length, 4);
  assert.deepEqual(
    [...PLATFORM_BYPASS_AUTHOR_IDS].sort(),
    [
      "50ee125c-8951-4ac6-819a-3f6b11150008",
      "59c7e5b8-eae4-4394-82fb-b815a10be6c2",
      "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c",
      "8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0",
    ].sort(),
  );
  assert.equal(
    PLATFORM_BYPASS_AUTHOR_IDS.includes(GERMAN_SEMENYUK_AUTHOR_ID),
    false,
    "German must not be in platform bypass allowlist",
  );
}

function testMigrationsSeedExactlyAllowlist() {
  const seeded = collectBypassSeedUuidsFromMigrations();
  const expected = new Set(
    PLATFORM_BYPASS_AUTHOR_IDS.map((id) => id.toLowerCase()),
  );

  assert.deepEqual(
    [...seeded].sort(),
    [...expected].sort(),
    "migrations must seed bypass=true for exactly the four platform projects",
  );

  assert.equal(
    seeded.has(GERMAN_SEMENYUK_AUTHOR_ID.toLowerCase()),
    false,
    "no migration may seed bypass for German Semenyuk",
  );
}

function testAurafonMigrationIsolated() {
  const migration = read(
    "supabase/migrations/20260801120000_aurafon_bypass_product_moderation.sql",
  );

  assert.match(
    migration,
    /Платформенный проект Аурофон — публикация без внешней модерации/,
  );
  assert.match(
    migration,
    /59c7e5b8-eae4-4394-82fb-b815a10be6c2/,
    "Aurafon stable UUID",
  );
  assert.match(migration, /can_bypass_product_moderation\s*=\s*true/);
  assert.match(
    migration,
    /information_schema\.columns/,
    "idempotent column existence check",
  );
  assert.match(
    migration,
    /WHERE id = '59c7e5b8-eae4-4394-82fb-b815a10be6c2'::uuid/,
    "UPDATE targets exact UUID only",
  );

  const uuids = [...migration.matchAll(UUID_RE)].map((m) => m[0].toLowerCase());
  assert.deepEqual(
    [...new Set(uuids)],
    ["59c7e5b8-eae4-4394-82fb-b815a10be6c2"],
    "Aurafon migration must not touch other author UUIDs",
  );

  assert.doesNotMatch(migration, /german-semenuk/i);
  assert.doesNotMatch(migration, /d748e735-c705-45ac-92aa-665a06e773e4/);
  // Runtime must not key off slug — slug may appear only as a comment.
  assert.doesNotMatch(
    migration,
    /WHERE\s+slug\s*=/i,
    "must not UPDATE by slug",
  );
  assert.doesNotMatch(migration, /WHERE\s+name\s*=/i);
  assert.doesNotMatch(migration, /WHERE\s+email\s*=/i);
}

function testInitialSeedStillPresent() {
  const schema = read(
    "supabase/migrations/20260731180000_practice_moderation_mvp_schema.sql",
  );

  for (const id of [
    "50ee125c-8951-4ac6-819a-3f6b11150008",
    "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c",
    "8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0",
  ]) {
    assert.match(schema, new RegExp(id), `initial seed retains ${id}`);
  }

  assert.doesNotMatch(
    schema,
    /59c7e5b8-eae4-4394-82fb-b815a10be6c2/,
    "Aurafon is added by the dedicated follow-up migration, not the initial seed",
  );
}

testAllowlistContract();
testMigrationsSeedExactlyAllowlist();
testAurafonMigrationIsolated();
testInitialSeedStillPresent();

console.log("author-product-moderation-bypass-allowlist-unit: ok");

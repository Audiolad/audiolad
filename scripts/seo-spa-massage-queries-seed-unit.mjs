#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath =
  "supabase/migrations/20261022120000_seo_spa_massage_queries_seed.sql";
const migration = readFileSync(path.join(root, migrationPath), "utf8");

const phrases = [
  "фоновая музыка для спа",
  "музыка для спа-процедур",
  "музыка для релаксации и массажа",
  "успокаивающая музыка для массажа",
  "красивая музыка для массажа",
  "спокойная музыка для массажа",
  "музыка для массажа расслабляющая час",
];

assert.equal(phrases.length, 7);
for (const phrase of phrases) {
  assert.match(migration, new RegExp(`'${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
}

const valueRows = [...migration.matchAll(/\('(?:фоновая|музыка|успокаивающая|красивая|спокойная)[^']*',\s*'manual'/g)];
assert.equal(valueRows.length, 7, "exactly 7 seed value rows");

assert.match(migration, /analysis_status/);
assert.match(migration, /'analyzed'/);
assert.match(migration, /'music'/);
assert.match(migration, /'Музыка'/);
assert.match(migration, /'high'/);
assert.match(migration, /source,\s*\n\s*frequency/);
assert.match(migration, /NULL,\s*NULL,\s*'music'/);
assert.doesNotMatch(migration, /frequency,\s*\d+/);
assert.doesNotMatch(migration, /frequency_checked_at,\s*'20/);

assert.match(migration, /ON CONFLICT \(normalized_query\) DO UPDATE/);
assert.match(migration, /analysis_status = 'analyzed'/);
assert.match(
  migration,
  /intent = COALESCE\(public\.seo_queries\.intent, EXCLUDED\.intent\)/,
);
assert.match(
  migration,
  /recommended_format = COALESCE\(public\.seo_queries\.recommended_format, EXCLUDED\.recommended_format\)/,
);
assert.match(
  migration,
  /audio_fit = COALESCE\(public\.seo_queries\.audio_fit, EXCLUDED\.audio_fit\)/,
);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*frequency\s*=/);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*frequency_checked_at\s*=/);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*source\s*=/);
assert.doesNotMatch(migration, /DO UPDATE SET[\s\S]*query_text\s*=/);
assert.doesNotMatch(migration, /CREATE TABLE|ADD COLUMN/);

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(
  pkg.scripts["test:seo-spa-massage-queries-seed"],
  "npx tsx scripts/seo-spa-massage-queries-seed-unit.mjs",
);

console.log("seo-spa-massage-queries-seed-unit: ok");

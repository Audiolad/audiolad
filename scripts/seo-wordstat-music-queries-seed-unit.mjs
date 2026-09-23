#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = "supabase/migrations/20261101120000_seo_wordstat_music_queries_seed.sql";
const migration = readFileSync(path.join(root, migrationPath), "utf8");
const valuePattern = /\('((?:[^']|'')*)',\s*(\d+),\s*DATE '([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g;
const rows = [...migration.matchAll(valuePattern)].map((match) => ({
  query_text: match[1].replaceAll("''", "'"),
  frequency: Number(match[2]),
  frequency_checked_at: match[3],
  intent: match[4],
  recommended_format: match[5],
  audio_fit: match[6],
  analysis_status: match[7],
  source: match[8],
}));

const normalize = (value) => value
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(/[\p{P}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

assert.equal(rows.length, 213, "curated seed must contain exactly 213 input rows");
assert.equal(new Set(rows.map((row) => row.query_text)).size, 213, "query_text must be unique");
assert.equal(
  new Set(rows.map((row) => normalize(row.query_text))).size,
  213,
  "canonical normalized_query must be unique",
);
assert.ok(rows.every((row) => row.query_text.trim().length > 0), "query_text must be non-empty");
assert.ok(rows.every((row) => row.frequency >= 50 && row.frequency <= 2000), "frequency must be 50–2000");
assert.ok(rows.every((row) => row.frequency_checked_at === "2026-09-23"));
assert.ok(rows.every((row) => row.intent === "music"));
assert.ok(rows.every((row) => row.recommended_format === "Музыка"));
assert.ok(rows.every((row) => row.audio_fit === "high"));
assert.ok(rows.every((row) => row.analysis_status === "analyzed"));
assert.ok(rows.every((row) => row.source === "manual"));

const canonicalRows = [...rows].sort((a, b) => a.query_text.localeCompare(b.query_text, "ru"));
const digest = createHash("sha256")
  .update(JSON.stringify(canonicalRows), "utf8")
  .digest("hex");
assert.equal(digest, "95dd1e3e8e4c55c2712c05a562a2ec1628212b4ac592ec45b4dd4e779f6b8f48", "seed rows must exactly match the approved curated input");

const expectedFrequencies = new Map([
  ["музыка для засыпания взрослых", 1032],
  ["расслабляющая музыка для медитации", 1812],
  ["спокойная музыка для снятия стресса", 1928],
  ["музыка для глубокого сна без слов", 53],
  ["музыка для хатха-йоги", 83],
  ["lo-fi музыка для работы", 151],
  ["релакс-музыка для салона красоты", 54],
  ["музыка для расслабления для детей", 146],
]);
for (const [queryText, frequency] of expectedFrequencies) {
  assert.equal(rows.find((row) => row.query_text === queryText)?.frequency, frequency);
}

assert.match(migration, /ON CONFLICT \(normalized_query\) DO UPDATE SET/);
const conflictClause = migration.slice(migration.indexOf("ON CONFLICT (normalized_query)"));
assert.match(conflictClause, /frequency = COALESCE\(public\.seo_queries\.frequency, EXCLUDED\.frequency\)/);
assert.match(conflictClause, /frequency_checked_at = COALESCE\(/);
assert.doesNotMatch(conflictClause, /(?:^|\n)\s*(?:query_text|source)\s*=/);
assert.doesNotMatch(conflictClause, /analysis_status\s*=/);
assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|ADD COLUMN/);

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(pkg.scripts["test:seo-wordstat-music-queries-seed"], "node scripts/seo-wordstat-music-queries-seed-unit.mjs");

console.log("seo-wordstat-music-queries-seed-unit: ok");

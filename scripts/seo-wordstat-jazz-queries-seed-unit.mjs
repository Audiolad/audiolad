#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = "supabase/migrations/20261102120000_seo_wordstat_jazz_queries_seed.sql";
const migration = readFileSync(path.join(root, migrationPath), "utf8");
const valuePattern = /\('((?:[^']|'')*)',\s*(\d+),\s*DATE '([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g;
const rows = [...migration.matchAll(valuePattern)].map((match) => ({
  query_text: match[1].replaceAll("''", "'"), frequency: Number(match[2]), frequency_checked_at: match[3],
  intent: match[4], recommended_format: match[5], audio_fit: match[6], analysis_status: match[7], source: match[8],
}));
const normalize = (value) => value.toLowerCase().replaceAll("ё", "е").replace(/[\p{P}]+/gu, " ").replace(/\s+/g, " ").trim();

assert.equal(rows.length, 60, "curated jazz seed must contain exactly 60 input rows");
assert.equal(new Set(rows.map((row) => row.query_text)).size, 60, "query_text must be unique");
assert.equal(new Set(rows.map((row) => normalize(row.query_text))).size, 60, "canonical normalized_query must be unique");
assert.ok(rows.every((row) => row.query_text.trim().length > 0));
assert.ok(rows.every((row) => row.frequency >= 50 && row.frequency <= 2000));
assert.equal(Math.min(...rows.map((row) => row.frequency)), 51);
assert.equal(Math.max(...rows.map((row) => row.frequency)), 1926);
assert.ok(rows.every((row) => row.frequency_checked_at === "2026-09-23"));
assert.ok(rows.every((row) => row.intent === "music" && row.recommended_format === "Музыка" && row.audio_fit === "high" && row.analysis_status === "analyzed" && row.source === "manual"));

const canonicalRows = [...rows].sort((a, b) => a.query_text < b.query_text ? -1 : a.query_text > b.query_text ? 1 : 0);
const digest = createHash("sha256").update(JSON.stringify(canonicalRows), "utf8").digest("hex");
assert.equal(digest, "7ac5401a41ffaa2e15441ae98a364b1309f9396422b36f097ad9c541a88d40b2", "seed rows must exactly match the approved curated input");
const expectedFrequencies = new Map([
  ["джаз без слов", 1926], ["фоновый джаз", 1743], ["джаз для ресторана", 1740], ["мягкий джаз", 1584],
  ["вечерний джаз", 1381], ["джаз для отдыха", 971], ["джаз лаунж", 824], ["джаз для работы", 795], ["джаз для сна", 296],
]);
for (const [queryText, frequency] of expectedFrequencies) assert.equal(rows.find((row) => row.query_text === queryText)?.frequency, frequency);

assert.match(migration, /ON CONFLICT \(normalized_query\) DO UPDATE SET/);
const conflictClause = migration.slice(migration.indexOf("ON CONFLICT (normalized_query)"));
assert.match(conflictClause, /frequency = COALESCE\(public\.seo_queries\.frequency, EXCLUDED\.frequency\)/);
assert.match(conflictClause, /frequency_checked_at = COALESCE\(/);
assert.doesNotMatch(conflictClause, /(?:^|\n)\s*(?:query_text|source|analysis_status)\s*=/);
assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|ADD COLUMN/);
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(pkg.scripts["test:seo-wordstat-jazz-queries-seed"], "node scripts/seo-wordstat-jazz-queries-seed-unit.mjs");
console.log("seo-wordstat-jazz-queries-seed-unit: ok");

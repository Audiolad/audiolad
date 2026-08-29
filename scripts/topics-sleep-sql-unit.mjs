#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const filename = "20260910120000_topics_sleep.sql";
const path = join(root, "supabase/migrations", filename);
const sql = readFileSync(path, "utf8");
const docs = readFileSync(join(root, "docs/TOPICS.md"), "utf8");

assert.equal(existsSync(path), true, "sleep migration exists");
assert.match(filename, /^20260910120000_/, "timestamp is 20260910120000");
assert.match(sql, /'sleep'/, "seed has sleep key");
assert.match(sql, /'Сон'/, "seed has Сон title");
assert.match(sql, /INSERT INTO public\.topics/);
assert.match(sql, /ON CONFLICT \(key\) DO NOTHING/);
assert.match(sql, /35/);
assert.doesNotMatch(sql, /publication_class/, "does not add publication_class as a new class");
assert.doesNotMatch(sql, /UPDATE\s+public\.practices/i, "no practice backfill");
assert.doesNotMatch(sql, /UPDATE\s+public\.practice_topics/i, "no existing topic reassignment");
assert.doesNotMatch(sql, /product_kind/);
assert.doesNotMatch(sql, /CREATE TABLE/);
assert.doesNotMatch(sql, /ALTER TABLE/);
assert.doesNotMatch(sql, /Сон и расслабление|Расслабление/);
assert.doesNotMatch(sql, /Спокойствие/);

assert.match(docs, /20260910120000_topics_sleep\.sql/);
assert.match(docs, /`sleep` \| Сон \| 35/);
assert.match(docs, /`calm` \| Спокойствие \| 30/);
assert.doesNotMatch(docs, /Сон и расслабление/);
assert.doesNotMatch(docs, /\| `relax` /);

console.log("topics-sleep-sql-unit: ok");

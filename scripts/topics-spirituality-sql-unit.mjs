#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const filename = "20260826120000_topics_spirituality.sql";
const path = join(root, "supabase/migrations", filename);
const sql = readFileSync(path, "utf8");

assert.equal(existsSync(path), true, "spirituality migration exists");
assert.match(filename, /^20260826120000_/, "timestamp is 20260826120000");
assert.match(sql, /'spirituality'/, "seed has spirituality key");
assert.match(sql, /'Духовность'/, "seed has Духовность title");
assert.match(sql, /INSERT INTO public\.topics/);
assert.match(sql, /ON CONFLICT \(key\) DO NOTHING/);
assert.match(sql, /sort_order[\s\S]*110|110[\s\S]*true[\s\S]*true/);
assert.doesNotMatch(sql, /publication_class/, "does not add publication_class as a new class");
assert.doesNotMatch(sql, /UPDATE\s+public\.practices/i, "no practice backfill");
assert.doesNotMatch(sql, /product_kind/);
assert.doesNotMatch(sql, /CREATE TABLE/);
assert.doesNotMatch(sql, /ALTER TABLE/);

console.log("topics-spirituality-sql-unit: ok");

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261213120000_practices_realtime_publication.sql";
const sql = readFileSync(join(root, "supabase/migrations", migrationName), "utf8");
const versions = readdirSync(join(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.slice(0, 14));

assert.equal(new Set(versions).size, versions.length, "migration versions stay unique");
assert.ok(versions.includes("20261213120000"));

assert.match(sql, /ALTER TABLE public\.practices REPLICA IDENTITY FULL/);
assert.match(sql, /pubname = 'supabase_realtime'/);
assert.match(sql, /tablename = 'practices'/);
assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.practices/);
assert.match(sql, /NOT EXISTS/);
assert.doesNotMatch(sql, /CREATE POLICY|DROP POLICY|ALTER POLICY/i);
assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/i);
assert.doesNotMatch(sql, /\bGRANT\b/i);
assert.doesNotMatch(sql, /\bREVOKE\b/i);
assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
assert.doesNotMatch(sql, /selected_users/);

console.log("practices-realtime-publication-sql-unit: ok");

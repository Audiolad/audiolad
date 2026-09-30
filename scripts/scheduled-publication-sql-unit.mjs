#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261210120000_practice_scheduled_publication.sql";
const sql = readFileSync(
  join(repoRoot, "supabase/migrations", migrationName),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const names = readdirSync(join(repoRoot, "supabase/migrations")).filter((name) =>
  name.endsWith(".sql"),
);
const versions = names
  .map((name) => name.match(/^(\d{14})_/)?.[1])
  .filter(Boolean);
assert(new Set(versions).size === versions.length, "no duplicate migration timestamps");
assert(versions.includes("20261210120000"), "scheduled publication version listed");
assert(sql.includes("ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz"), "column");
assert(sql.includes("practice_is_publicly_available"), "visibility function");
assert(sql.includes("scheduled_publish_after_release"), "hide-after-release guard");
assert(sql.includes("NEW.published_at := CASE"), "published_at stays the real go-live");
assert(!sql.includes("approve_and_publish_practice"), "moderation RPC is unchanged");
assert(!/CREATE TYPE|ADD VALUE/i.test(sql), "no new moderation enum");
assert(
  sql.includes('POLICY "Public can read published practices"'),
  "public read policy",
);
assert(
  sql.includes('POLICY "Selected users can read allowlisted practices"'),
  "selected users policy",
);
assert(sql.includes("can_current_viewer_read_practice"), "viewer read gate");
assert(sql.includes("viewer_can_commercially_access_practice"), "commercial gate");
assert(sql.includes("is_public_listed_practice"), "listed SEO gate");
assert(
  !sql.includes("Author members can read author practices"),
  "author read policy stays as it is",
);
assert(sql.includes("p_status = 'published'"), "moderation status still required");
assert(
  sql.includes("p_scheduled_publish_at IS NULL") &&
    sql.includes("p_scheduled_publish_at <= p_at") &&
    sql.includes("p_published_at <= p_at"),
  "computed availability predicate",
);

console.log("scheduled-publication-sql-unit: ok");

#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(
  join(root, "supabase/migrations/20260825120000_publication_gallery_slides.sql"),
  "utf8",
);

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.publication_gallery_slides/);
assert.match(sql, /publication_id uuid NOT NULL/);
assert.match(sql, /REFERENCES public\.practices \(id\)/);
assert.match(sql, /image_url text NOT NULL/);
assert.match(sql, /image_manifest jsonb NOT NULL/);
assert.match(sql, /position integer NOT NULL/);
assert.match(sql, /position >= 0 AND position < 30/);
assert.match(sql, /enforce_publication_gallery_slide_limit/);
assert.match(sql, /slide_count >= 30/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /GRANT SELECT ON TABLE public\.publication_gallery_slides TO anon/);
assert.match(
  sql,
  /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.publication_gallery_slides TO authenticated/,
);
assert.match(sql, /Public can read published publication gallery slides/);
assert.match(sql, /Author members can insert publication gallery slides/);
assert.match(sql, /Author members can update publication gallery slides/);
assert.match(sql, /Author members can delete publication gallery slides/);
assert.doesNotMatch(sql, /CREATE TABLE[\s\S]*practice_gallery/i);
assert.doesNotMatch(sql, /CREATE TABLE[\s\S]*course_gallery/i);
assert.doesNotMatch(sql, /product_kind/);
assert.doesNotMatch(sql, /CREATE TABLE[\s\S]*public\.products\b/i);

console.log("publication-gallery-migration-sql-unit: ok");

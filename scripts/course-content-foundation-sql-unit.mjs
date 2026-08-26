#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase/migrations");
const filename = "20260827120000_course_content_foundation.sql";
const sql = readFileSync(join(migrationsDir, filename), "utf8");

assert.equal(existsSync(join(migrationsDir, filename)), true);
assert.equal(
  existsSync(join(migrationsDir, "20260826120000_topics_spirituality.sql")),
  true,
  "latest previous migration stays intact",
);

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert.equal(new Set(versions).size, versions.length, "no duplicate timestamps");
assert.ok(versions.includes("20260827120000"));
assert.ok(
  versions.includes("20260826120000"),
  "topics_spirituality stamp remains the previous latest",
);

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.course_lessons/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.course_lesson_blocks/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.publication_files/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.course_completion_ctas/);

assert.match(sql, /publication_id uuid NOT NULL/);
assert.match(sql, /REFERENCES public\.practices \(id\)/);
assert.match(sql, /course_lessons_position_check/);
assert.match(sql, /position >= 0/);
assert.match(sql, /course_lessons_publication_position_idx/);
assert.match(sql, /course_lesson_blocks_lesson_position_idx/);

assert.match(
  sql,
  /CONSTRAINT course_lesson_blocks_type_check[\s\S]*type IN \('audio', 'text', 'file'\)/,
);
assert.match(sql, /course_lesson_blocks_text_semantics_check/);
assert.match(sql, /jsonb_typeof\(payload -> 'text'\) = 'string'/);
assert.match(sql, /course_lesson_block_audio_publication_mismatch/);
assert.match(sql, /course_lesson_block_file_publication_mismatch/);
assert.match(sql, /enforce_course_lesson_block_asset/);

assert.match(sql, /CONSTRAINT publication_files_mime_check/);
assert.match(sql, /mime = 'application\/pdf'/);
assert.match(sql, /size_bytes <= 20971520/);

assert.match(sql, /enforce_course_content_parent_is_course/);
assert.match(sql, /course_content_parent_must_be_course/);
assert.match(sql, /parent_class IS DISTINCT FROM 'course'/);
assert.match(
  sql,
  /Legacy NULL\+practice is not a course/,
  "SQL documents that only explicit course parents are accepted",
);

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.course_completion_ctas/);
assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
assert.doesNotMatch(sql, /promo_enabled|promo_title|promo_text|promo_button_text|promo_url/);
assert.match(sql, /Independent of practices\.promo_\*/);

assert.match(sql, /ALTER TABLE public\.course_lessons ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /ALTER TABLE public\.course_lesson_blocks ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /ALTER TABLE public\.publication_files ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /ALTER TABLE public\.course_completion_ctas ENABLE ROW LEVEL SECURITY/);

assert.match(sql, /REVOKE ALL ON TABLE public\.course_lessons FROM PUBLIC/);
assert.match(sql, /REVOKE ALL ON TABLE public\.course_lessons FROM anon/);
assert.match(sql, /REVOKE ALL ON TABLE public\.course_lesson_blocks FROM PUBLIC/);
assert.match(sql, /REVOKE ALL ON TABLE public\.publication_files FROM PUBLIC/);
assert.match(sql, /REVOKE ALL ON TABLE public\.course_completion_ctas FROM PUBLIC/);
assert.match(sql, /REVOKE ALL ON TABLE public\.course_lessons FROM anon/);
assert.match(sql, /REVOKE ALL ON TABLE public\.course_lesson_blocks FROM anon/);
assert.match(sql, /REVOKE ALL ON TABLE public\.publication_files FROM anon/);
assert.match(sql, /REVOKE ALL ON TABLE public\.course_completion_ctas FROM anon/);

assert.doesNotMatch(sql, /Public can read course/);
assert.doesNotMatch(sql, /Public can read publication files/);
assert.doesNotMatch(sql, /GRANT SELECT ON TABLE public\.course_lessons TO anon/);
assert.doesNotMatch(sql, /GRANT SELECT ON TABLE public\.course_lesson_blocks TO anon/);
assert.doesNotMatch(sql, /GRANT SELECT ON TABLE public\.publication_files TO anon/);
assert.doesNotMatch(sql, /GRANT SELECT ON TABLE public\.course_completion_ctas TO anon/);
assert.doesNotMatch(
  sql,
  /TO public[\s\S]*USING/,
  "no public SELECT policy on the new tables",
);

assert.match(sql, /GRANT ALL ON TABLE public\.course_lessons TO service_role/);
assert.match(sql, /Author members can insert course lessons/);
assert.match(sql, /Author members can insert course lesson blocks/);
assert.match(sql, /Author members can insert publication files/);
assert.match(sql, /Author members can insert course completion ctas/);
assert.match(sql, /no policy that lets a learner SELECT by entitlement/);
assert.match(sql, /Presence of a row never grants read/);

assert.match(sql, /publication-files/);
assert.match(sql, /file_size_limit,\s*allowed_mime_types/);
assert.match(sql, /'publication-files',\s*'publication-files',\s*false,/);
assert.match(sql, /20971520/);
assert.match(sql, /ARRAY\['application\/pdf'\]/);
assert.match(sql, /not personal-materials/);
assert.match(sql, /not practice-audio/);

assert.doesNotMatch(sql, /UPDATE\s+public\.practices/i);
assert.doesNotMatch(sql, /ALTER TABLE public\.practices/);
assert.doesNotMatch(sql, /INSERT INTO public\.audio_items/i);
assert.doesNotMatch(sql, /lesson_1/);
assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.\w*section/i);
assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.course_sections/i);
assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.course_modules/i);
assert.doesNotMatch(sql, /personal-materials'/);
assert.match(sql, /audio_items are not auto-migrated into lessons/);
assert.match(sql, /No backfill/);

console.log("course-content-foundation-sql-unit: ok");

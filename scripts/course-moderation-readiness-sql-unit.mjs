#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase/migrations");
const filename = "20260901120000_course_moderation_readiness.sql";
const previous = "20260805193000_audio_post_optional_description.sql";
const sql = readFileSync(join(migrationsDir, filename), "utf8");
const previousSql = readFileSync(join(migrationsDir, previous), "utf8");

assert.equal(existsSync(join(migrationsDir, filename)), true);
assert.equal(existsSync(join(migrationsDir, previous)), true);

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert.equal(new Set(versions).size, versions.length, "no duplicate timestamps");
assert.ok(versions.includes("20260901120000"));
assert.ok(
  versions.includes("20260805193000"),
  "previous readiness REPLACE stays intact",
);

assert.match(sql, /CREATE OR REPLACE FUNCTION public\.assert_practice_moderation_ready/);
assert.match(sql, /internal-moderation-readiness:v4/);
assert.doesNotMatch(sql, /internal-moderation-readiness:v3;/);
assert.match(previousSql, /internal-moderation-readiness:v3/);

assert.match(sql, /publication_class = 'course'/);
assert.match(sql, /DETAIL = 'missing_course_lessons'/);
assert.match(sql, /DETAIL = 'empty_course_lesson'/);
assert.match(sql, /DETAIL = 'incomplete_course_audio'/);
assert.match(sql, /DETAIL = 'missing_course_file'/);
assert.match(sql, /HINT = v_lesson\.title/);
assert.match(sql, /FROM public\.course_lessons/);
assert.match(sql, /FROM public\.course_lesson_blocks/);
assert.match(sql, /FROM public\.publication_files/);
assert.match(sql, /payload->>'text'/);
assert.match(sql, /duration_seconds, 0\) > 0/);
assert.match(
  sql,
  /Orphan leftover tracks must not fail the course/,
);

const courseBranch = sql.slice(
  sql.indexOf("IF v_practice.publication_class = 'course'"),
  sql.indexOf("ELSE"),
);
assert.doesNotMatch(
  courseBranch,
  /DETAIL = 'missing_audio'/,
  "course branch must not raise missing_audio",
);
assert.doesNotMatch(
  courseBranch,
  /DETAIL = 'incomplete_audio'/,
  "course branch must not raise incomplete_audio on leftover tracks",
);

const elseBranch = sql.slice(sql.indexOf("ELSE"));
assert.match(elseBranch, /DETAIL = 'missing_audio'/);
assert.match(elseBranch, /DETAIL = 'incomplete_audio'/);
assert.match(elseBranch, /audio_post_requires_single_audio/);

assert.doesNotMatch(sql, /UPDATE\s+public\.practices/i);
assert.doesNotMatch(sql, /ALTER TABLE/);
assert.doesNotMatch(sql, /DROP TABLE/);

console.log("course-moderation-readiness-sql-unit: ok");

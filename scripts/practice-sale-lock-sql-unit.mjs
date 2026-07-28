#!/usr/bin/env node
/**
 * Isolated SQL smoke for practice content sale-lock migration.
 * Creates a scratch database; never writes to production `postgres`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_practice_sale_lock_test";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const AUTHOR_ID = "22222222-2222-2222-2222-222222222222";
const PRACTICE_SOLD = "33333333-3333-3333-3333-333333333333";
const PRACTICE_DRAFT = "44444444-4444-4444-4444-444444444444";
const AUDIO_SOLD = "55555555-5555-5555-5555-555555555555";
const AUDIO_DRAFT = "66666666-6666-6666-6666-666666666666";
const ORDER_ID = "77777777-7777-7777-7777-777777777777";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function psql(database, sql, { tuples = false } = {}) {
  const args = [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
  ];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psqlFile(database, absolutePath) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      encoding: "utf8",
      input: readFileSync(absolutePath, "utf8"),
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}

function scalar(sql) {
  return psql(TEST_DB, sql, { tuples: true }).trim();
}

function expectError(sql, expectedFragment, label) {
  let failed = false;
  try {
    psql(TEST_DB, sql, { tuples: true });
  } catch (error) {
    failed = true;
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
    assert(
      text.includes(expectedFragment),
      `${label}: expected "${expectedFragment}", got ${text.slice(0, 500)}`,
    );
  }
  assert(failed, `${label}: expected failure but succeeded`);
}

function bootstrap() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  psql(
    TEST_DB,
    `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END
$roles$;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  is_catalog_listed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  access_source text NOT NULL DEFAULT 'purchase',
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE RESTRICT,
  status text NOT NULL
);

CREATE TABLE public.audio_items (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Аудио',
  audio_path text NULL,
  status text NOT NULL DEFAULT 'draft',
  position integer NOT NULL DEFAULT 1
);

CREATE TABLE public.author_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL
);

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`,
  );

  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260728120000_practice_content_sale_lock.sql"),
  );

  // Idempotency: re-apply migration.
  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260728120000_practice_content_sale_lock.sql"),
  );

  psql(
    TEST_DB,
    `
INSERT INTO auth.users (id) VALUES ('${USER_ID}');
INSERT INTO public.authors (id, name, slug) VALUES ('${AUTHOR_ID}', 'Author', 'author-sale-lock');
INSERT INTO public.practices (id, author_id, title, slug, status)
VALUES
  ('${PRACTICE_SOLD}', '${AUTHOR_ID}', 'Sold', 'sold-product', 'published'),
  ('${PRACTICE_DRAFT}', '${AUTHOR_ID}', 'Draft', 'draft-product', 'draft');
INSERT INTO public.audio_items (id, practice_id, title, audio_path, status, position)
VALUES
  ('${AUDIO_SOLD}', '${PRACTICE_SOLD}', 'Track 1', 'practices/${PRACTICE_SOLD}/${AUDIO_SOLD}.mp3', 'published', 1),
  ('${AUDIO_DRAFT}', '${PRACTICE_DRAFT}', 'Track 1', 'practices/${PRACTICE_DRAFT}/${AUDIO_DRAFT}.mp3', 'draft', 1);
INSERT INTO public.user_practices (user_id, practice_id, access_source)
VALUES ('${USER_ID}', '${PRACTICE_SOLD}', 'purchase');
INSERT INTO public.orders (id, user_id, practice_id, status)
VALUES ('${ORDER_ID}', '${USER_ID}', '${PRACTICE_SOLD}', 'paid');
`,
  );
}

function runAssertions() {
  assert(
    scalar(
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.user_practices'::regclass
         AND conname = 'user_practices_practice_id_fkey'`,
    ).includes("ON DELETE RESTRICT"),
    "user_practices FK is RESTRICT",
  );

  assert(
    scalar(
      `SELECT public.practice_is_content_locked_after_sale('${PRACTICE_SOLD}'::uuid)`,
    ) === "t",
    "sold practice is locked",
  );
  assert(
    scalar(
      `SELECT public.practice_is_content_locked_after_sale('${PRACTICE_DRAFT}'::uuid)`,
    ) === "f",
    "draft practice is unlocked",
  );

  expectError(
    `DELETE FROM public.practices WHERE id = '${PRACTICE_SOLD}'`,
    "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
    "delete sold practice",
  );

  expectError(
    `DELETE FROM public.audio_items WHERE id = '${AUDIO_SOLD}'`,
    "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
    "delete sold audio item",
  );

  expectError(
    `UPDATE public.audio_items SET audio_path = NULL WHERE id = '${AUDIO_SOLD}'`,
    "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
    "clear sold audio_path",
  );

  expectError(
    `UPDATE public.audio_items
     SET audio_path = 'practices/${PRACTICE_SOLD}/replaced.mp3'
     WHERE id = '${AUDIO_SOLD}'`,
    "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
    "replace sold audio_path",
  );

  expectError(
    `UPDATE public.audio_items SET status = 'draft' WHERE id = '${AUDIO_SOLD}'`,
    "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
    "demote sold audio status",
  );

  expectError(
    `UPDATE public.practices SET status = 'draft' WHERE id = '${PRACTICE_SOLD}'`,
    "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
    "demote sold practice to draft",
  );

  psql(
    TEST_DB,
    `
UPDATE public.practices
SET status = 'unpublished', is_catalog_listed = false
WHERE id = '${PRACTICE_SOLD}';
`,
  );
  assert(
    scalar(`SELECT status FROM public.practices WHERE id = '${PRACTICE_SOLD}'`) ===
      "unpublished",
    "unpublish sold practice",
  );
  assert(
    scalar(
      `SELECT count(*)::text FROM public.user_practices WHERE practice_id = '${PRACTICE_SOLD}'`,
    ) === "1",
    "entitlement remains after unpublish",
  );

  psql(
    TEST_DB,
    `
UPDATE public.practices
SET status = 'archived', is_catalog_listed = false
WHERE id = '${PRACTICE_SOLD}';
`,
  );
  assert(
    scalar(`SELECT status FROM public.practices WHERE id = '${PRACTICE_SOLD}'`) ===
      "archived",
    "archive sold practice",
  );
  assert(
    scalar(
      `SELECT count(*)::text FROM public.user_practices WHERE practice_id = '${PRACTICE_SOLD}'`,
    ) === "1",
    "entitlement remains after archive",
  );

  psql(TEST_DB, `DELETE FROM public.practices WHERE id = '${PRACTICE_DRAFT}'`);
  assert(
    scalar(
      `SELECT count(*)::text FROM public.practices WHERE id = '${PRACTICE_DRAFT}'`,
    ) === "0",
    "unsold draft can be deleted",
  );

  // RESTRICT: removing entitlement then still blocked by paid order.
  psql(
    TEST_DB,
    `DELETE FROM public.user_practices WHERE practice_id = '${PRACTICE_SOLD}'`,
  );
  expectError(
    `DELETE FROM public.practices WHERE id = '${PRACTICE_SOLD}'`,
    "PRODUCT_CONTENT_LOCKED_AFTER_SALE",
    "delete blocked by paid order after entitlement removed",
  );

  // Safe metadata update still allowed.
  psql(
    TEST_DB,
    `UPDATE public.audio_items SET title = 'Updated title' WHERE id = '${AUDIO_SOLD}'`,
  );
  assert(
    scalar(`SELECT title FROM public.audio_items WHERE id = '${AUDIO_SOLD}'`) ===
      "Updated title",
    "safe audio metadata update allowed",
  );
}

function cleanup() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
}

function main() {
  bootstrap();
  try {
    runAssertions();
    console.log("practice-sale-lock-sql-unit: ok");
  } finally {
    cleanup();
  }
}

main();

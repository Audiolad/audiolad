#!/usr/bin/env node
/**
 * SQL contract checks for author multi-project limits (requires local/docker DB).
 * Set AUDIOLAD_TEST_DATABASE=1 to run; otherwise exits 0 as skipped.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_CONTAINER =
  process.env.AUDIOLAD_DB_CONTAINER?.trim() || "audiolad-test-db";

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

function main() {
  if (process.env.AUDIOLAD_TEST_DATABASE !== "1") {
    console.log("author-multi-project-sql-unit: skipped (set AUDIOLAD_TEST_DATABASE=1)");
    return;
  }

  const migration = readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260730120000_author_multi_project_limits.sql",
    ),
    "utf8",
  );
  assert.match(migration, /create_author_project/);

  const hasOverride = psql(`
    SELECT count(*)::text
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'author_project_limit_override';
  `);
  assert.equal(hasOverride, "1", "profiles.author_project_limit_override missing");

  const sergeyLimit = psql(`
    SELECT coalesce(author_project_limit_override::text, 'null')
    FROM public.profiles
    WHERE id = 'e5d273d0-9b4d-4e0e-836a-bdcf0332b9bb';
  `);
  assert.equal(sergeyLimit, "5", "Sergey override must be 5");

  const owned = psql(`
    SELECT count(*)::text
    FROM public.author_members
    WHERE user_id = 'e5d273d0-9b4d-4e0e-836a-bdcf0332b9bb'
      AND role = 'owner';
  `);
  assert.equal(owned, "3", "Sergey must own 3 projects");

  assert.match(
    psql(`
      SELECT proname
      FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('create_author_project', 'resolve_user_author_project_limit')
      ORDER BY 1;
    `),
    /create_author_project/,
  );
  assert.match(
    psql(`
      SELECT proname
      FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname = 'resolve_user_author_project_limit';
    `),
    /resolve_user_author_project_limit/,
  );

  // Effective limit without calling auth-gated RPC as postgres superuser.
  const effective = psql(`
    SELECT CASE
      WHEN author_project_limit_override IS NOT NULL AND author_project_limit_override >= 1
        THEN author_project_limit_override
      WHEN coalesce(author_premium_enabled, false) THEN 3
      ELSE 1
    END::text
    FROM public.profiles
    WHERE id = 'e5d273d0-9b4d-4e0e-836a-bdcf0332b9bb';
  `);
  assert.equal(effective, "5");
  assert.ok(Number(owned) < Number(effective), "Sergey should have free slots (3 of 5)");

  console.log("author-multi-project-sql-unit: ok");
}

main();

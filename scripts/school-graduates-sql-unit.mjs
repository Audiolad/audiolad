#!/usr/bin/env node
/**
 * Applies the graduates migration on a throwaway database and runs
 * supabase/tests/school_graduates.sql. Never uses a remote database.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runScratchPostgresSmoke } from "./lib/scratch-postgres.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20270130120000_school_graduates.sql"),
  "utf8",
);
const testSql = readFileSync(join(repoRoot, "supabase/tests/school_graduates.sql"), "utf8");

const stub = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);
CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL,
  catalog_visibility text NOT NULL,
  is_catalog_listed boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  published_at timestamptz,
  scheduled_publish_at timestamptz,
  duration_minutes integer
);
`;

runScratchPostgresSmoke("school-graduates", (runPsql) => {
  runPsql(stub);
  runPsql(migration);
  runPsql(testSql);
});

#!/usr/bin/env node
/**
 * Parse-only tests for public.external_identities + touch_external_identity.
 * Does not require a live database.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const migrationName = "20260822200000_external_identities.sql";
const migrationPath = join(migrationsDir, migrationName);
const migration = readFileSync(migrationPath, "utf8");

const priorMigrations = readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith(".sql") && name < migrationName)
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

assert.doesNotMatch(
  priorMigrations,
  /CREATE TABLE[\s\S]*external_identities/i,
  "preflight: no prior external_identities table",
);

assert.match(migration, /CREATE TABLE public\.external_identities/);
assert.match(migration, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
assert.match(migration, /provider text NOT NULL/);
assert.match(migration, /provider_user_id text NOT NULL/);
assert.match(
  migration,
  /user_id uuid NULL REFERENCES auth\.users \(id\) ON DELETE CASCADE/,
);
assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(migration, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(migration, /last_verified_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(migration, /linked_at timestamptz NULL/);
assert.match(
  migration,
  /CONSTRAINT external_identities_provider_user_unique\s+UNIQUE \(provider, provider_user_id\)/,
);
assert.match(
  migration,
  /CREATE UNIQUE INDEX external_identities_provider_linked_user_uidx\s+ON public\.external_identities \(provider, user_id\)\s+WHERE user_id IS NOT NULL/,
);
assert.match(
  migration,
  /CONSTRAINT external_identities_provider_nonempty\s+CHECK \(char_length\(provider\) > 0 AND provider = btrim\(provider\)\)/,
);
assert.match(
  migration,
  /CONSTRAINT external_identities_provider_user_id_nonempty/,
);
assert.match(migration, /char_length\(provider_user_id\) > 0/);

assert.match(
  migration,
  /ALTER TABLE public\.external_identities ENABLE ROW LEVEL SECURITY/,
);
assert.doesNotMatch(
  migration,
  /CREATE POLICY|CREATE POLICY IF NOT EXISTS/i,
  "no RLS policies for anon/authenticated",
);
assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/);

assert.match(
  migration,
  /REVOKE ALL ON TABLE public\.external_identities FROM PUBLIC/,
);
assert.match(
  migration,
  /REVOKE ALL ON TABLE public\.external_identities FROM anon/,
);
assert.match(
  migration,
  /REVOKE ALL ON TABLE public\.external_identities FROM authenticated/,
);
assert.doesNotMatch(
  migration,
  /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON TABLE public\.external_identities TO (PUBLIC|anon|authenticated)/i,
);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.touch_external_identity\(\s*p_provider text,\s*p_provider_user_id text\s*\)/,
);
assert.match(migration, /RETURNS TABLE \(linked boolean\)/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /SET search_path = public, pg_temp/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.touch_external_identity\(text, text\) FROM PUBLIC/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.touch_external_identity\(text, text\) FROM anon/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.touch_external_identity\(text, text\) FROM authenticated/,
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.touch_external_identity\(text, text\) TO service_role/,
);
assert.doesNotMatch(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.touch_external_identity\(text, text\) TO (PUBLIC|anon|authenticated)/,
);

const insertConflict = migration.match(
  /INSERT INTO public\.external_identities \(provider, provider_user_id\)[\s\S]*?ON CONFLICT \(provider, provider_user_id\) DO UPDATE SET([\s\S]*?)RETURNING/,
);
assert.ok(insertConflict, "atomic INSERT ... ON CONFLICT must exist");
const updateClause = insertConflict[1];
assert.match(updateClause, /last_verified_at = now\(\)/);
assert.match(updateClause, /updated_at = now\(\)/);
assert.doesNotMatch(updateClause, /\buser_id\s*=/);
assert.doesNotMatch(updateClause, /\blinked_at\s*=/);

assert.match(
  migration,
  /RETURNING \(external_identities\.user_id IS NOT NULL\)/,
);
assert.match(migration, /RAISE EXCEPTION 'invalid_provider'/);
assert.match(migration, /RAISE EXCEPTION 'invalid_provider_user_id'/);

assert.doesNotMatch(migration, /DROP TABLE\s+auth\./i);
assert.doesNotMatch(migration, /DROP SCHEMA\s+auth/i);
assert.doesNotMatch(migration, /TRUNCATE\s+auth\./i);
assert.doesNotMatch(migration, /DELETE FROM\s+auth\./i);
assert.doesNotMatch(migration, /first_name|last_name|photo_url|initData/i);
assert.doesNotMatch(migration, /NEXT_PUBLIC_MAX_BOT/);
assert.doesNotMatch(migration, /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/);
assert.doesNotMatch(migration, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(
  migration,
  /INSERT INTO auth\.users|CREATE USER|signUp|sign_in/i,
);

console.log("external-identities-migration-sql-unit: ok");

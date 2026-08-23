#!/usr/bin/env node
/**
 * Parse-only + in-memory RPC semantics for public.link_external_identity.
 * Does not require a live database and does not apply SQL.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const stage2Name = "20260822200000_external_identities.sql";
const migrationName = "20260823120000_link_external_identity.sql";
const migrationPath = join(migrationsDir, migrationName);
const migration = readFileSync(migrationPath, "utf8");
const stage2 = readFileSync(join(migrationsDir, stage2Name), "utf8");

const priorMigrations = readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith(".sql") && name !== migrationName)
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

assert.match(stage2, /CREATE TABLE public\.external_identities/);
assert.doesNotMatch(
  priorMigrations,
  /CREATE OR REPLACE FUNCTION public\.link_external_identity/i,
  "preflight: no prior link_external_identity",
);
assert.doesNotMatch(
  migration,
  /CREATE TABLE|ALTER TABLE|DROP TABLE|DROP INDEX/i,
  "Stage 3A must not alter the Stage 2 table",
);
assert.doesNotMatch(migration, /DROP FUNCTION public\.touch_external_identity/);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.link_external_identity\(\s*p_provider text,\s*p_provider_user_id text,\s*p_user_id uuid\s*\)/,
);
assert.match(migration, /RETURNS TABLE \(status text\)/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /SET search_path = public, pg_temp/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.link_external_identity\(text, text, uuid\) FROM PUBLIC/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.link_external_identity\(text, text, uuid\) FROM anon/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.link_external_identity\(text, text, uuid\) FROM authenticated/,
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.link_external_identity\(text, text, uuid\) TO service_role/,
);
assert.doesNotMatch(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.link_external_identity\(text, text, uuid\) TO (PUBLIC|anon|authenticated)/,
);

assert.match(
  migration,
  /INSERT INTO public\.external_identities \(provider, provider_user_id\)/,
);
assert.match(
  migration,
  /ON CONFLICT \(provider, provider_user_id\) DO NOTHING/,
);
assert.match(
  migration,
  /UPDATE public\.external_identities\s+SET\s+user_id = p_user_id,\s+linked_at = COALESCE\(linked_at, now\(\)\),\s+updated_at = now\(\)/,
);
assert.match(
  migration,
  /AND \(user_id IS NULL OR user_id = p_user_id\)/,
);
assert.match(migration, /AND NOT EXISTS \(/);
assert.match(migration, /WHEN unique_violation THEN/);
assert.match(migration, /GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME/);
assert.match(migration, /'identity_already_linked'/);
assert.match(migration, /'user_already_has_max_identity'/);
assert.match(migration, /'invalid_args'/);
assert.match(migration, /'linked'/);
assert.match(migration, /DROP FUNCTION public\.link_external_identity\(text, text, uuid\)/);
assert.doesNotMatch(
  migration.replace(/--[^\n]*/g, ""),
  /DROP TABLE\s+public\.external_identities/i,
);
const executableSql = migration
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ")
  .replace(/'[^']*'/g, "''");
assert.doesNotMatch(executableSql, /user_id\s*=\s*NULL/);
assert.doesNotMatch(
  executableSql,
  /UPDATE public\.external_identities\s+SET[\s\S]*?provider_user_id\s*=/,
);
assert.doesNotMatch(executableSql, /SET\s+user_id\s*=\s*NULL/i);
assert.doesNotMatch(executableSql, /\bunlink\b/i);
assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.unlink/i);
assert.doesNotMatch(migration, /first_name|last_name|photo_url|initData/i);
assert.doesNotMatch(migration, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(migration, /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/);
assert.doesNotMatch(migration, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(
  migration,
  /INSERT INTO auth\.users|CREATE USER|signUp|sign_in/i,
);

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MAX_X = "101";
const MAX_Y = "202";
const PROVIDER = "max";

function keyOf(provider, providerUserId) {
  return `${provider}:${providerUserId}`;
}

function createStore(seed = []) {
  const rows = new Map();
  for (const row of seed) {
    rows.set(keyOf(row.provider, row.provider_user_id), {
      ...row,
      created_at: row.created_at ?? 1,
      updated_at: row.updated_at ?? 1,
      last_verified_at: row.last_verified_at ?? 1,
    });
  }
  return { rows, clock: 10 };
}

function now(store) {
  store.clock += 1;
  return store.clock;
}

function touchExternalIdentity(store, provider, providerUserId) {
  const key = keyOf(provider, providerUserId);
  const existing = store.rows.get(key);
  const ts = now(store);
  if (!existing) {
    store.rows.set(key, {
      provider,
      provider_user_id: providerUserId,
      user_id: null,
      linked_at: null,
      created_at: ts,
      updated_at: ts,
      last_verified_at: ts,
    });
    return { linked: false };
  }
  existing.last_verified_at = ts;
  existing.updated_at = ts;
  return { linked: existing.user_id != null };
}

function mapUniqueViolation(constraintName, store, provider, providerUserId, userId) {
  if (constraintName === "external_identities_provider_linked_user_uidx") {
    return "user_already_has_max_identity";
  }
  if (constraintName === "external_identities_provider_user_unique") {
    return "identity_already_linked";
  }
  const existing = store.rows.get(keyOf(provider, providerUserId));
  if (existing?.user_id && existing.user_id !== userId) {
    return "identity_already_linked";
  }
  return "user_already_has_max_identity";
}

function linkExternalIdentity(
  store,
  provider,
  providerUserId,
  userId,
  { raceSkipExistsCheck = false } = {},
) {
  const trimmedProvider = (provider ?? "").trim();
  const trimmedProviderUserId = (providerUserId ?? "").trim();
  if (!trimmedProvider || !trimmedProviderUserId || !userId) {
    return "invalid_args";
  }

  const key = keyOf(trimmedProvider, trimmedProviderUserId);
  if (!store.rows.has(key)) {
    const ts = now(store);
    store.rows.set(key, {
      provider: trimmedProvider,
      provider_user_id: trimmedProviderUserId,
      user_id: null,
      linked_at: null,
      created_at: ts,
      updated_at: ts,
      last_verified_at: ts,
    });
  }

  const otherLinked = [...store.rows.values()].some(
    (row) =>
      row.provider === trimmedProvider &&
      row.user_id === userId &&
      row.provider_user_id !== trimmedProviderUserId,
  );

  try {
    if (otherLinked && !raceSkipExistsCheck) {
      const existing = store.rows.get(key);
      if (existing.user_id && existing.user_id !== userId) {
        return "identity_already_linked";
      }
      return "user_already_has_max_identity";
    }

    const existing = store.rows.get(key);
    if (existing.user_id && existing.user_id !== userId) {
      return "identity_already_linked";
    }

    if (otherLinked && raceSkipExistsCheck) {
      throw Object.assign(new Error("unique_violation"), {
        code: "23505",
        constraint: "external_identities_provider_linked_user_uidx",
      });
    }

    const ts = now(store);
    existing.user_id = userId;
    existing.linked_at = existing.linked_at ?? ts;
    existing.updated_at = ts;
    return "linked";
  } catch (error) {
    if (error && error.code === "23505") {
      return mapUniqueViolation(
        error.constraint,
        store,
        trimmedProvider,
        trimmedProviderUserId,
        userId,
      );
    }
    throw error;
  }
}

const caseA = createStore();
const aStatus = linkExternalIdentity(caseA, PROVIDER, MAX_X, USER_A);
assert.equal(aStatus, "linked");
const rowA = caseA.rows.get(keyOf(PROVIDER, MAX_X));
assert.equal(rowA.user_id, USER_A);
assert.equal(typeof rowA.linked_at, "number");
const linkedAtA = rowA.linked_at;

const caseB = caseA;
const bStatus = linkExternalIdentity(caseB, PROVIDER, MAX_X, USER_A);
assert.equal(bStatus, "linked");
assert.equal(caseB.rows.get(keyOf(PROVIDER, MAX_X)).user_id, USER_A);
assert.equal(caseB.rows.get(keyOf(PROVIDER, MAX_X)).linked_at, linkedAtA);

const caseC = createStore();
assert.equal(linkExternalIdentity(caseC, PROVIDER, MAX_X, USER_A), "linked");
const afterCFirst = { ...caseC.rows.get(keyOf(PROVIDER, MAX_X)) };
assert.equal(linkExternalIdentity(caseC, PROVIDER, MAX_X, USER_B), "identity_already_linked");
assert.equal(caseC.rows.get(keyOf(PROVIDER, MAX_X)).user_id, USER_A);
assert.equal(caseC.rows.get(keyOf(PROVIDER, MAX_X)).linked_at, afterCFirst.linked_at);
assert.equal(caseC.rows.size, 1);

const caseD = createStore();
assert.equal(linkExternalIdentity(caseD, PROVIDER, MAX_X, USER_A), "linked");
touchExternalIdentity(caseD, PROVIDER, MAX_Y);
const yBefore = { ...caseD.rows.get(keyOf(PROVIDER, MAX_Y)) };
assert.equal(
  linkExternalIdentity(caseD, PROVIDER, MAX_Y, USER_A),
  "user_already_has_max_identity",
);
assert.equal(caseD.rows.get(keyOf(PROVIDER, MAX_Y)).user_id, null);
assert.equal(caseD.rows.get(keyOf(PROVIDER, MAX_Y)).linked_at, null);
assert.equal(caseD.rows.get(keyOf(PROVIDER, MAX_X)).user_id, USER_A);
assert.equal(yBefore.user_id, null);

const afterLink = createStore();
assert.equal(linkExternalIdentity(afterLink, PROVIDER, MAX_X, USER_A), "linked");
const linkedRow = { ...afterLink.rows.get(keyOf(PROVIDER, MAX_X)) };
const touchAfter = touchExternalIdentity(afterLink, PROVIDER, MAX_X);
assert.equal(touchAfter.linked, true);
assert.equal(afterLink.rows.get(keyOf(PROVIDER, MAX_X)).user_id, linkedRow.user_id);
assert.equal(afterLink.rows.get(keyOf(PROVIDER, MAX_X)).linked_at, linkedRow.linked_at);
assert.ok(
  afterLink.rows.get(keyOf(PROVIDER, MAX_X)).last_verified_at > linkedRow.last_verified_at,
);

const race = createStore();
assert.equal(linkExternalIdentity(race, PROVIDER, MAX_X, USER_A), "linked");
touchExternalIdentity(race, PROVIDER, MAX_Y);
assert.equal(
  linkExternalIdentity(race, PROVIDER, MAX_Y, USER_A, { raceSkipExistsCheck: true }),
  "user_already_has_max_identity",
);
assert.equal(race.rows.get(keyOf(PROVIDER, MAX_Y)).user_id, null);
assert.notEqual(
  mapUniqueViolation(
    "external_identities_provider_linked_user_uidx",
    race,
    PROVIDER,
    MAX_Y,
    USER_A,
  ),
  "storage_error",
);
assert.equal(
  mapUniqueViolation(
    "external_identities_provider_user_unique",
    race,
    PROVIDER,
    MAX_X,
    USER_B,
  ),
  "identity_already_linked",
);

assert.equal(linkExternalIdentity(createStore(), "  ", MAX_X, USER_A), "invalid_args");
assert.equal(linkExternalIdentity(createStore(), PROVIDER, MAX_X, null), "invalid_args");

console.log("link-external-identity-sql-unit: ok");

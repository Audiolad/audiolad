#!/usr/bin/env node
/**
 * Isolated SQL contract + optional scratch-DB smoke for author partner foundation.
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261023120000_author_partner_program_foundation.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/author-partner-program-sql-stub.sql");
const smokePath = join(
  repoRoot,
  "supabase/tests/author_partner_program_foundation_smoke.sql",
);
const dbName = "audiolad_author_partner_foundation_test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function localPostgresAvailable() {
  try {
    execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function resolveDockerDbContainer() {
  if (process.env.AUDIOLAD_SUPABASE_DB_CONTAINER?.trim()) {
    return process.env.AUDIOLAD_SUPABASE_DB_CONTAINER.trim();
  }
  const candidates = [
    "supabase-db",
    "audiolad-seo-attach-pg",
    "audiolad-test-db",
  ];
  for (const name of candidates) {
    try {
      execFileSync(
        "docker",
        ["exec", name, "psql", "-U", "postgres", "-c", "SELECT 1"],
        { stdio: "ignore" },
      );
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

const migration = readFileSync(migrationPath, "utf8");

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_profiles"), "profiles table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_code_aliases"), "aliases table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_code_claims"), "claims namespace");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_referrals"), "referrals table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_reserved_codes"), "reserved codes");
assert(migration.includes("author_partner_code_claims_one_primary_per_author_uidx") || migration.includes("author_partner_code_claims_one_primary_per_author"), "one primary index");
assert(migration.includes("UNIQUE (invitee_user_id)"), "invitee user unique");
assert(migration.includes("invitee_user_id IS DISTINCT FROM referrer_owner_user_id"), "self-ref check");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
assert(migration.includes("resolve_author_partner_code"), "resolve rpc");
assert(migration.includes("ensure_author_partner_profile"), "ensure rpc");
assert(migration.includes("change_author_partner_code"), "change rpc");
assert(migration.includes("get_author_partner_profile"), "get rpc");
assert(migration.includes("author_partner_assert_not_self_referral"), "self-ref helper");
assert(migration.includes("SET search_path = public, pg_temp"), "search_path lock");
assert(migration.includes("SECURITY DEFINER"), "security definer rpcs");
assert(!/partner_commission|sale_accrual|author_ledger_entries/.test(migration), "must not touch finance ledger");
assert(!/author_project_slots|capacity_grant|author_projects_unlimited/.test(migration), "must not touch capacity");
assert(migration.includes("referrer_author_id"), "referral keyed by author_id");
assert(migration.includes("claim_kind IN ('primary', 'alias')"), "unified claim kinds");

const stub = readFileSync(stubPath, "utf8");
assert(stub.includes("CREATE TABLE IF NOT EXISTS public.author_members"), "stub members");
assert(stub.includes("CREATE OR REPLACE FUNCTION auth.uid()"), "stub auth.uid");

const smoke = readFileSync(smokePath, "utf8");
assert(smoke.includes("ensure_author_partner_profile"), "smoke ensure");
assert(smoke.includes("change_author_partner_code"), "smoke change");
assert(smoke.includes("resolve_author_partner_code"), "smoke resolve");
assert(smoke.includes("self-referral") || smoke.includes("self_referral"), "smoke self-ref");
assert(smoke.includes("author_referral_activated_immutable") || smoke.includes("activated referral must be immutable"), "smoke immutability");

function runIsolatedSql() {
  const sql = [stub, migration, smoke].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;

  if (container) {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `CREATE DATABASE ${dbName};`,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        dbName,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, stdio: ["pipe", "pipe", "inherit"] },
    );
    return `docker:${container}`;
  }

  if (localPostgresAvailable()) {
    execFileSync(
      "sudo",
      [
        "-n",
        "-u",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "sudo",
      ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`],
      { stdio: "ignore" },
    );
    execFileSync(
      "sudo",
      ["-n", "-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1"],
      { input: sql, stdio: ["pipe", "pipe", "inherit"] },
    );
    return "local-postgres";
  }

  return null;
}

const runtime = runIsolatedSql();
if (runtime) {
  console.log(`author-partner-program-sql-unit: parse + isolated smoke ok (${runtime})`);
} else {
  console.log("author-partner-program-sql-unit: parse-only ok (no local postgres)");
}

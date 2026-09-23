#!/usr/bin/env node
/**
 * Static contract + isolated SQL smoke for allowlisted test-user reset.
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261030120000_allowlisted_test_user_reset_db_cleanup.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/allowlisted-test-user-reset-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/allowlisted_test_user_reset_smoke.sql");
const dbName = "audiolad_allowlisted_test_user_reset";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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

const migration = readFileSync(migrationPath, "utf8");

assert(migration.includes("CREATE OR REPLACE FUNCTION public.reset_allowlisted_test_user_db(p_target_user_id uuid)"), "rpc signature");
assert(migration.includes("SECURITY DEFINER"), "security definer");
assert(migration.includes("SET search_path = ''"), "empty search_path");
assert(migration.includes("audiolad@mail.ru"), "hard-coded allowlist");
assert(migration.includes("set_config('audiolad.allowlisted_test_user_reset', p_target_user_id::text, true)"), "transaction-local GUC");
assert(migration.includes("author_referral_activated_immutable"), "ordinary immutability remains");
assert(migration.includes("REVOKE ALL ON FUNCTION public.reset_allowlisted_test_user_db(uuid) FROM PUBLIC"), "revoke public");
assert(migration.includes("REVOKE ALL ON FUNCTION public.reset_allowlisted_test_user_db(uuid) FROM anon"), "revoke anon");
assert(migration.includes("REVOKE ALL ON FUNCTION public.reset_allowlisted_test_user_db(uuid) FROM authenticated"), "revoke authenticated");
assert(migration.includes("GRANT EXECUTE ON FUNCTION public.reset_allowlisted_test_user_db(uuid) TO service_role"), "grant service_role");
assert(!migration.includes("DELETE FROM auth.users"), "rpc does not delete auth.users");
assert(!migration.includes("DROP CONSTRAINT"), "migration does not drop constraints");
assert(!/invitee_user_id[\s\S]{0,120}ON DELETE CASCADE/.test(migration), "invitee FK not switched to cascade");
assert(migration.includes("author_referrals RESTRICT FKs must stay unchanged"), "migration asserts RESTRICT FKs");
assert(migration.includes("test_as_referrer"), "referrer block");
assert(migration.includes("7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c"), "sergey author id guard");
assert(migration.includes("primary_code_normalized = 'sergey'"), "sergey code guard");

function runPsql(database, sql) {
  execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { input: sql, stdio: ["pipe", "pipe", "inherit"] },
  );
}

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") {
    return null;
  }

  const sql = [
    readFileSync(stubPath, "utf8"),
    migration,
    readFileSync(smokePath, "utf8"),
  ].join("\n");

  if (!localPostgresAvailable()) {
    return null;
  }

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
    [
      "-n",
      "-u",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `CREATE DATABASE ${dbName};`,
    ],
    { stdio: "ignore" },
  );
  runPsql(dbName, sql);
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
  return "local-postgres";
}

const runtime = runIsolatedSql();

if (!runtime) {
  if (process.env.AUDIOLAD_REQUIRE_ALLOWLISTED_RESET_SQL === "1") {
    throw new Error("isolated allowlisted reset SQL did not run");
  }
  console.log("allowlisted-test-user-reset-sql-unit: parse-only ok");
} else {
  console.log(`allowlisted-test-user-reset-sql-unit: parse + isolated smoke ok (${runtime})`);
}

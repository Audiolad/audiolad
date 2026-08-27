#!/usr/bin/env node
/**
 * Isolated SQL RLS/constraint tests for author_contacts.
 * Uses a scratch database only. Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20260827180000_author_contacts.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/author-contacts-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/author_contacts_rls_smoke.sql");
const dbName = "audiolad_author_contacts_rls_test";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

const migration = readFileSync(migrationPath, "utf8");

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_contacts"), "table");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
assert(migration.includes("REFERENCES public.authors (id) ON DELETE CASCADE"), "FK cascade");
assert(migration.includes("sort_order >= 0 AND sort_order < 6"), "sort_order 0..5");
assert(migration.includes("char_length(description) <= 120"), "description 120 check");
assert(migration.includes("'telegram', 'max', 'custom'"), "platform catalog");
assert(migration.includes("created_at timestamptz"), "created_at");
assert(migration.includes("updated_at timestamptz"), "updated_at");
assert(migration.includes("author_contacts_author_id_sort_idx"), "sort index");
assert(migration.includes("author_contacts_author_visible_sort_idx"), "visible index");
assert(migration.includes("is_visible = true"), "public reads visible only");
assert(migration.includes("author_members"), "membership RLS");

function runIsolatedSql() {
  if (!existsSync(stubPath) || !existsSync(smokePath)) {
    throw new Error("author contacts SQL stub or smoke file is missing");
  }

  const sql = [
    readFileSync(stubPath, "utf8"),
    migration,
    readFileSync(smokePath, "utf8"),
  ].join("\n");

  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
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
        `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE); CREATE DATABASE ${dbName};`,
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
    return;
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
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`],
    { stdio: "ignore" },
  );
  execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1"],
    { input: sql, stdio: ["pipe", "pipe", "inherit"] },
  );
}

if (dockerAvailable() || localPostgresAvailable()) {
  runIsolatedSql();
  console.log("author-contacts-sql-unit: parse + isolated RLS/constraints ok");
} else {
  console.log("author-contacts-sql-unit: parse-only ok (no local postgres)");
}

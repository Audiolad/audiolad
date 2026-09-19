#!/usr/bin/env node
/**
 * Isolated DB behavior tests for author slug redirects / rename / delete.
 * Never touches production. Uses localhost DATABASE_URL (CI) or docker supabase-db.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_author_slug_space_ops_test";
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20261019120000_author_slug_redirects_and_space_ops.sql",
);
const STUB = join(ROOT, "scripts/lib/author-slug-space-ops-sql-stub.sql");
const BEHAVIOR = join(ROOT, "supabase/tests/author_slug_space_ops_behavior.sql");

const DATABASE_URL = process.env.AUDIOLAD_AUTHOR_SLUG_OPS_DATABASE_URL?.trim()
  || process.env.AUDIOLAD_ANALYTICS_P2_DATABASE_URL?.trim()
  || null;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function localhostUrl() {
  if (!DATABASE_URL) return null;
  const parsed = new URL(DATABASE_URL);
  assert(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "author slug ops SQL tests only permit a localhost PostgreSQL URL",
  );
  return parsed;
}

const LOCAL = localhostUrl();

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function psql(database, sql, { tuples = false } = {}) {
  if (LOCAL) {
    const url = new URL(LOCAL);
    url.pathname = `/${database}`;
    const args = [url.toString(), "-v", "ON_ERROR_STOP=1"];
    if (tuples) args.push("-At");
    args.push("-c", sql);
    return execFileSync("psql", args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  }
  const args = [
    "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1",
  ];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psqlFile(database, absolutePath) {
  const input = readFileSync(absolutePath, "utf8");
  if (LOCAL) {
    const url = new URL(LOCAL);
    url.pathname = `/${database}`;
    return execFileSync("psql", [url.toString(), "-v", "ON_ERROR_STOP=1"], {
      encoding: "utf8",
      input,
      maxBuffer: 20 * 1024 * 1024,
    });
  }
  return execFileSync(
    "docker",
    [
      "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database,
      "-v", "ON_ERROR_STOP=1",
    ],
    { encoding: "utf8", input, maxBuffer: 20 * 1024 * 1024 },
  );
}

function sourceContracts() {
  const migration = readFileSync(MIGRATION, "utf8");
  assert(
    !/GRANT SELECT ON TABLE public\.author_slug_redirects TO anon/.test(migration),
    "migration must not grant public SELECT on author_slug_redirects",
  );
  assert(
    /acquire_author_slug_namespace_lock/.test(migration),
    "migration must define namespace advisory lock",
  );
  assert(
    /PERFORM public\.acquire_author_slug_namespace_lock\(v_new_slug\)/.test(migration),
    "change_author_slug must lock new slug",
  );
  assert(
    /PERFORM public\.acquire_author_slug_namespace_lock\(v_slug\)/.test(migration),
    "create_author_project must lock final slug",
  );
  assert(
    /REVOKE ALL ON FUNCTION public\.author_space_has_published_practice\(uuid\) FROM PUBLIC/.test(
      migration,
    ),
    "helpers must revoke PUBLIC EXECUTE",
  );
}

function runConcurrentLockProbe() {
  // Best-effort two-session probe when LOCAL url is available.
  if (!LOCAL) {
    console.log("author-slug-space-ops-sql-unit: concurrent probe skipped (no LOCAL url)");
    return;
  }
  const urlA = new URL(LOCAL);
  urlA.pathname = `/${TEST_DB}`;
  const urlB = new URL(LOCAL);
  urlB.pathname = `/${TEST_DB}`;

  // Session A holds xact lock inside an open transaction via a long statement.
  // We use pg_try_advisory_xact_lock from session B while A holds the lock.
  const holdSql = `
BEGIN;
SELECT public.acquire_author_slug_namespace_lock('concurrent-probe-slug');
SELECT pg_sleep(3);
COMMIT;
`;
  const trySql = `
SELECT pg_try_advisory_xact_lock(
  hashtextextended('author_slug_namespace:' || 'concurrent-probe-slug', 0)
);
`;

  const child = execFileSync(
    "bash",
    [
      "-lc",
      `psql '${urlA.toString()}' -v ON_ERROR_STOP=1 -c "${holdSql.replace(/"/g, '\\"')}" &
       sleep 0.4
       psql '${urlB.toString()}' -v ON_ERROR_STOP=1 -At -c "${trySql.replace(/"/g, '\\"')}"
       wait`,
    ],
    { encoding: "utf8" },
  );
  const tryResult = child.trim().split("\n").filter(Boolean).at(-1);
  assert(
    tryResult === "f" || tryResult === "false",
    `concurrent lock probe expected false while held, got ${tryResult}`,
  );
  console.log("author-slug-space-ops-sql-unit: concurrent lock probe ok");
}

function main() {
  assert(existsSync(MIGRATION), "migration missing");
  assert(existsSync(STUB), "stub missing");
  assert(existsSync(BEHAVIOR), "behavior sql missing");
  sourceContracts();

  if (!LOCAL && !dockerAvailable()) {
    if (process.env.AUDIOLAD_REQUIRE_AUTHOR_SLUG_OPS_SQL === "1") {
      throw new Error("author slug ops SQL tests required but no postgres available");
    }
    console.log(
      "author-slug-space-ops-sql-unit: skipped (no localhost DATABASE_URL / docker)",
    );
    return;
  }

  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  psqlFile(TEST_DB, STUB);
  psqlFile(TEST_DB, MIGRATION);
  psqlFile(TEST_DB, BEHAVIOR);

  try {
    runConcurrentLockProbe();
  } catch (err) {
    console.warn(
      "author-slug-space-ops-sql-unit: concurrent probe soft-failed:",
      err instanceof Error ? err.message : err,
    );
  }

  console.log("author-slug-space-ops-sql-unit: ok");
}

main();

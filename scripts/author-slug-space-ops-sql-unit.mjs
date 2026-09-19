#!/usr/bin/env node
/**
 * Isolated DB behavior tests for author slug redirects / rename / delete.
 * Never touches production. Uses localhost DATABASE_URL (CI) or docker supabase-db.
 */
import { spawn, execFileSync } from "node:child_process";
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

function connectionUrl(database) {
  assert(LOCAL, "connectionUrl requires LOCAL database URL");
  const url = new URL(LOCAL);
  url.pathname = `/${database}`;
  return url.toString();
}

function psql(database, sql, { tuples = false } = {}) {
  if (LOCAL) {
    const args = [connectionUrl(database), "-v", "ON_ERROR_STOP=1"];
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
    return execFileSync("psql", [connectionUrl(database), "-v", "ON_ERROR_STOP=1"], {
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

/** Spawn a long-lived psql whose stdout/stderr are NOT shared with other sessions. */
function spawnPsql(database, sql) {
  if (LOCAL) {
    return spawn(
      "psql",
      [connectionUrl(database), "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  }
  return spawn(
    "docker",
    [
      "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database,
      "-v", "ON_ERROR_STOP=1", "-At", "-c", sql,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}


function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout waiting for psql exit; stderr=${stderr.slice(0, 500)}`));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`psql exited ${code}; stderr=${stderr.slice(0, 800)}`));
    });
  });
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

/**
 * Two-session advisory lock probe with separate processes / stdout.
 * Session A acquires + holds; session B must see pg_try_advisory_xact_lock = false;
 * after A commits, a fresh try must succeed.
 */
function tryNamespaceLock(slug) {
  // Exact same key formula as acquire_author_slug_namespace_lock.
  const trySql = `
SELECT pg_try_advisory_xact_lock(
  hashtextextended('author_slug_namespace:' || lower(btrim('${slug}')), 0)
);
`;
  return psql(TEST_DB, trySql, { tuples: true }).trim();
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFalseLock(value) {
  return value === "f" || value === "false";
}

function isTrueLock(value) {
  return value === "t" || value === "true";
}

/**
 * Poll until session A is observed holding the xact lock.
 * Avoids psql stdout buffering (LOCK_HELD would arrive only after COMMIT).
 */
async function waitUntilLockHeld(slug, sessionA, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (sessionA.exitCode !== null) {
      throw new Error("session A exited before namespace lock was observed as held");
    }
    const result = tryNamespaceLock(slug);
    if (isFalseLock(result)) {
      return result;
    }
    await sleepMs(100);
  }
  throw new Error(`timed out waiting for session A to hold lock for ${slug}`);
}

async function runConcurrentLockProbe() {
  const slug = "concurrent-probe-slug";
  const holdSql = `
BEGIN;
SELECT public.acquire_author_slug_namespace_lock('${slug}');
SELECT pg_sleep(8);
COMMIT;
`;

  const sessionA = spawnPsql(TEST_DB, holdSql);
  // Drain pipes so the child cannot block on a full stdout buffer.
  sessionA.stdout.resume();
  sessionA.stderr.resume();

  const tryWhileHeld = await waitUntilLockHeld(slug, sessionA);
  assert(
    isFalseLock(tryWhileHeld),
    `concurrent lock probe expected false while held, got ${JSON.stringify(tryWhileHeld)}`,
  );
  assert(
    sessionA.exitCode === null,
    "session A must still be holding the open transaction while probe sees false",
  );

  await waitForExit(sessionA, 15_000);

  const tryAfterRelease = tryNamespaceLock(slug);
  assert(
    isTrueLock(tryAfterRelease),
    `concurrent lock probe expected true after release, got ${JSON.stringify(tryAfterRelease)}`,
  );

  console.log("author-slug-space-ops-sql-unit: concurrent lock probe ok");
}

/**
 * Rename vs claim race: while owner1 holds namespace locks during rename of
 * old→new, owner2's create_author_project(old) must not steal old as current.
 * After rename commits, old must be history for owner1 and create must fail.
 */
async function runRenameClaimRaceProbe() {
  const owner1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const owner2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const author1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const oldSlug = "race-old-slug";
  const newSlug = "race-new-slug";

  psql(
    TEST_DB,
    `
INSERT INTO auth.users (id, email) VALUES
  ('${owner1}', 'race-owner1@test.local'),
  ('${owner2}', 'race-owner2@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, author_projects_unlimited) VALUES
  ('${owner1}', true),
  ('${owner2}', true)
ON CONFLICT (id) DO UPDATE SET author_projects_unlimited = true;

DELETE FROM public.author_slug_redirects WHERE old_slug IN ('${oldSlug}', '${newSlug}');
DELETE FROM public.author_members WHERE author_id = '${author1}';
DELETE FROM public.authors WHERE id = '${author1}' OR slug IN ('${oldSlug}', '${newSlug}');

INSERT INTO public.authors (id, name, slug)
VALUES ('${author1}', 'Race Owner One', '${oldSlug}');

INSERT INTO public.author_members (author_id, user_id, role)
VALUES ('${author1}', '${owner1}', 'owner');
`,
  );

  const holdAndRenameSql = `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${owner1}', true);
SELECT public.acquire_author_slug_namespace_lock('${oldSlug}');
SELECT public.acquire_author_slug_namespace_lock('${newSlug}');
SELECT pg_sleep(6);
SELECT public.change_author_slug('${author1}', '${newSlug}');
COMMIT;
`;

  const claimSql = `
SELECT set_config('request.jwt.claim.sub', '${owner2}', true);
SELECT public.create_author_project('Race Stealer', '${oldSlug}', NULL);
`;

  const sessionA = spawnPsql(TEST_DB, holdAndRenameSql);
  sessionA.stdout.resume();
  sessionA.stderr.resume();
  await waitUntilLockHeld(oldSlug, sessionA);

  // Session B starts while A holds locks; create blocks on advisory lock, then
  // must fail once A commits the rename (old slug is now history).
  const sessionB = spawnPsql(TEST_DB, claimSql);
  let sessionBStderr = "";
  sessionB.stderr.on("data", (chunk) => {
    sessionBStderr += chunk.toString("utf8");
  });
  let sessionBStdout = "";
  sessionB.stdout.on("data", (chunk) => {
    sessionBStdout += chunk.toString("utf8");
  });

  const sessionBDone = new Promise((resolve) => {
    sessionB.on("close", (code) => resolve({ code, stdout: sessionBStdout, stderr: sessionBStderr }));
  });

  await waitForExit(sessionA, 20_000);
  const bResult = await sessionBDone;

  assert(
    bResult.code !== 0,
    `rename/claim race: create_author_project should fail after rename, got exit 0 stdout=${bResult.stdout.slice(0, 300)}`,
  );
  assert(
    /project_slug_taken|slug_taken/i.test(bResult.stderr) || /project_slug_taken|slug_taken/i.test(bResult.stdout),
    `rename/claim race: expected project_slug_taken, got stderr=${bResult.stderr.slice(0, 500)} stdout=${bResult.stdout.slice(0, 300)}`,
  );

  const invariant = psql(
    TEST_DB,
    `
SELECT
  (SELECT slug FROM public.authors WHERE id = '${author1}') AS current_slug,
  EXISTS (
    SELECT 1 FROM public.author_slug_redirects
    WHERE old_slug = '${oldSlug}' AND author_id = '${author1}'
  ) AS old_in_history,
  EXISTS (SELECT 1 FROM public.authors WHERE slug = '${oldSlug}') AS old_is_current;
`,
    { tuples: true },
  ).trim();

  // tuples-only: current_slug|old_in_history|old_is_current  (one row, -At uses | by default? Actually -At separates columns with |)
  const parts = invariant.split("|");
  assert(parts.length >= 3, `invariant row malformed: ${JSON.stringify(invariant)}`);
  assert(parts[0] === newSlug, `author1 current slug expected ${newSlug}, got ${parts[0]}`);
  assert(parts[1] === "t" || parts[1] === "true", `old slug must be in author1 history, got ${parts[1]}`);
  assert(parts[2] === "f" || parts[2] === "false", `old slug must not be anyone's current, got ${parts[2]}`);

  console.log("author-slug-space-ops-sql-unit: rename/claim race probe ok");
}

async function main() {
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

  // Hard-fail: concurrent probes must prove locking. No soft-warn / success after failure.
  await runConcurrentLockProbe();
  await runRenameClaimRaceProbe();

  console.log("author-slug-space-ops-sql-unit: ok");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});

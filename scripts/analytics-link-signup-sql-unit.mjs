#!/usr/bin/env node
/**
 * Isolated Postgres 16 harness for 20260901120000 link/signup idempotency.
 * Uses local cluster postgres 16 only. Never touches production supabase-db.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STUB = join(ROOT, "scripts/lib/analytics-link-signup-sql-stub.sql");
const OLD_RPCS = join(ROOT, "scripts/lib/analytics-link-signup-old-rpcs.sql");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260901120000_analytics_link_signup_idempotent.sql",
);
const LINK_ROUTE = join(ROOT, "src/app/api/analytics/session/link/route.ts");
const SIGNUP_ROUTE = join(ROOT, "src/app/api/analytics/signup/complete/route.ts");

const CLEAN_DB = "audiolad_link_signup_clean";
const UPGRADE_DB = "audiolad_link_signup_upgrade";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const USER_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
const SESSION_LINKED = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
const SESSION_FIRST = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
const SESSION_SIGNUP_A = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3";
const SESSION_SIGNUP_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4";
const SESSION_CONCURRENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5";
const EVENT_ORPHAN = "cccccccc-cccc-cccc-cccc-ccccccccccc1";
const EVENT_FIRST = "cccccccc-cccc-cccc-cccc-ccccccccccc2";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
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

function postgresVersion() {
  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-At", "-c", "SHOW server_version;"],
    { encoding: "utf8" },
  ).trim();
}

function psql(database, sql, { tuples = false } = {}) {
  const args = ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1"];
  if (tuples) args.push("-At");
  return execFileSync("sudo", args, {
    encoding: "utf8",
    input: `${sql}\n`,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psqlFile(database, absolutePath) {
  return psql(database, readFileSync(absolutePath, "utf8"));
}

function dropCreateDb(name) {
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
      `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`,
    ],
    { encoding: "utf8" },
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
      `CREATE DATABASE ${name};`,
    ],
    { encoding: "utf8" },
  );
}

function scalar(database, sql) {
  return psql(database, sql, { tuples: true }).trim();
}

function asBool(value) {
  if (value === "t" || value === "true") return "t";
  if (value === "f" || value === "false") return "f";
  return value;
}

function functionConfigs(database) {
  const raw = psql(
    database,
    `
SELECT p.proname || E'\\t' || coalesce(array_to_string(p.proconfig, ','), '')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('link_analytics_session_user', 'record_platform_signup_completed')
ORDER BY p.proname;
`,
    { tuples: true },
  );
  const map = new Map();
  for (const line of raw.split(/\r?\n/).map((row) => row.trim()).filter(Boolean)) {
    const [name, config = ""] = line.split("\t");
    map.set(name, config);
  }
  return map;
}

function assertLockTimeout250(database, label) {
  const configs = functionConfigs(database);
  assertEqual(configs.size, 2, `${label} function count`);
  for (const name of ["link_analytics_session_user", "record_platform_signup_completed"]) {
    const config = configs.get(name) || "";
    assert(
      config.includes("lock_timeout=250ms"),
      `${label} ${name} proconfig must contain lock_timeout=250ms, got ${config}`,
    );
    assert(
      config.includes("search_path=public, pg_temp") ||
        config.includes("search_path=public,pg_temp"),
      `${label} ${name} must keep search_path, got ${config}`,
    );
    assert(
      !config.includes("lock_timeout=8s") && !config.includes("lock_timeout=8000"),
      `${label} ${name} must not use the historical 8s timeout, got ${config}`,
    );
    console.log(`  ${label} ${name} proconfig=${config}`);
  }
}

function assertNoLockTimeout(database, label) {
  const configs = functionConfigs(database);
  for (const name of ["link_analytics_session_user", "record_platform_signup_completed"]) {
    const config = configs.get(name) || "";
    assert(
      !config.includes("lock_timeout"),
      `${label} ${name} should not have lock_timeout yet, got ${config}`,
    );
  }
}

function resetLogs(database) {
  psql(
    database,
    `TRUNCATE public.analytics_write_log RESTART IDENTITY;
     TRUNCATE public.analytics_identity_link_calls RESTART IDENTITY;`,
  );
}

function sessionWriteCount(database, sessionId) {
  return Number(
    scalar(
      database,
      `SELECT count(*)::text FROM public.analytics_write_log
       WHERE tbl = 'analytics_sessions' AND session_id = '${sessionId}'`,
    ),
  );
}

function eventWriteCount(database, sessionId) {
  return Number(
    scalar(
      database,
      `SELECT count(*)::text FROM public.analytics_write_log
       WHERE tbl = 'analytics_events' AND session_id = '${sessionId}'`,
    ),
  );
}

function identityCallCount(database) {
  return Number(scalar(database, `SELECT count(*)::text FROM public.analytics_identity_link_calls`));
}

function seedUser(database, userId, createdAt = "2026-08-01 00:00:00+00") {
  psql(
    database,
    `INSERT INTO public.profiles (id, created_at)
     VALUES ('${userId}', timestamptz '${createdAt}')
     ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at;`,
  );
}

function seedSession(database, { id, anonymousId, userId = null }) {
  psql(
    database,
    `INSERT INTO public.analytics_sessions (id, anonymous_id, user_id)
     VALUES ('${id}', '${anonymousId}', ${userId ? `'${userId}'` : "NULL"});`,
  );
}

function seedIdentity(database, anonymousId, userId) {
  psql(
    database,
    `INSERT INTO public.analytics_identity_links (anonymous_id, user_id, source)
     VALUES ('${anonymousId}', '${userId}', 'session_link');`,
  );
}

function seedEvent(database, { id, sessionId, anonymousId, userId = null, name = "page_view" }) {
  psql(
    database,
    `INSERT INTO public.analytics_events (
       id, event_name, user_id, anonymous_session_id, session_id, path, payload
     ) VALUES (
       '${id}', '${name}', ${userId ? `'${userId}'` : "NULL"},
       '${anonymousId}', '${sessionId}', '/', '{}'::jsonb
     );`,
  );
}

function callLink(database, userId, sessionId, anonymousId) {
  return asBool(
    scalar(
      database,
      `SELECT public.test_call_link_analytics_session_user(
         '${userId}'::uuid, '${sessionId}'::uuid, '${anonymousId}'
       )::text;`,
    ),
  );
}

function callSignup(database, userId, sessionId, anonymousId) {
  return scalar(
    database,
    `SELECT public.test_call_record_platform_signup_completed(
       '${userId}'::uuid, '${sessionId}'::uuid, '${anonymousId}'
     )::text;`,
  );
}

function testAlreadyLinkedNoHeavyPath(database, label) {
  seedUser(database, USER_A);
  seedSession(database, {
    id: SESSION_LINKED,
    anonymousId: "anon-linked",
    userId: USER_A,
  });
  seedIdentity(database, "anon-linked", USER_A);
  seedEvent(database, {
    id: EVENT_ORPHAN,
    sessionId: SESSION_LINKED,
    anonymousId: "anon-linked",
    userId: null,
  });
  resetLogs(database);

  const linked = callLink(database, USER_A, SESSION_LINKED, "anon-linked");
  assertEqual(linked, "t", `${label} D already-linked returns true`);
  assertEqual(sessionWriteCount(database, SESSION_LINKED), 0, `${label} D no analytics_sessions UPDATE`);
  assertEqual(eventWriteCount(database, SESSION_LINKED), 0, `${label} D no analytics_events UPDATE`);
  assertEqual(identityCallCount(database), 0, `${label} D no identity/advisory heavy path`);
  assertEqual(
    asBool(
      scalar(
        database,
        `SELECT (user_id IS NULL)::text FROM public.analytics_events WHERE id = '${EVENT_ORPHAN}'`,
      ),
    ),
    "t",
    `${label} D leftover unlinked events stay untouched`,
  );
  console.log(`  ${label} D already-linked: no session/event UPDATE, no identity call`);
}

function testFirstTimeLink(database, label) {
  seedUser(database, USER_A);
  seedSession(database, { id: SESSION_FIRST, anonymousId: "anon-first" });
  seedEvent(database, {
    id: EVENT_FIRST,
    sessionId: SESSION_FIRST,
    anonymousId: "anon-first",
  });
  resetLogs(database);

  const linked = callLink(database, USER_A, SESSION_FIRST, "anon-first");
  assertEqual(linked, "t", `${label} E first-time returns true`);
  assertEqual(
    scalar(database, `SELECT user_id::text FROM public.analytics_sessions WHERE id = '${SESSION_FIRST}'`),
    USER_A,
    `${label} E session attached`,
  );
  assertEqual(
    scalar(database, `SELECT user_id::text FROM public.analytics_events WHERE id = '${EVENT_FIRST}'`),
    USER_A,
    `${label} E events attached`,
  );
  assertEqual(
    scalar(
      database,
      `SELECT count(*)::text FROM public.analytics_identity_links
       WHERE anonymous_id = 'anon-first' AND user_id = '${USER_A}' AND unlinked_at IS NULL`,
    ),
    "1",
    `${label} E identity created`,
  );
  assert(sessionWriteCount(database, SESSION_FIRST) >= 1, `${label} E session UPDATE on first link`);
  assert(eventWriteCount(database, SESSION_FIRST) >= 1, `${label} E events UPDATE on first link`);
  assertEqual(identityCallCount(database), 1, `${label} E identity called once`);
  console.log(`  ${label} E first-time: events attached, identity created`);
}

function testRepeatSignupCanStillLinkCurrentSession(database, label) {
  seedUser(database, USER_B, "2026-08-20 00:00:00+00");
  seedSession(database, { id: SESSION_SIGNUP_A, anonymousId: "anon-signup-a" });
  seedSession(database, { id: SESSION_SIGNUP_B, anonymousId: "anon-signup-b" });
  resetLogs(database);

  const first = JSON.parse(callSignup(database, USER_B, SESSION_SIGNUP_A, "anon-signup-a"));
  assertEqual(first.recorded, true, `${label} F first signup records`);
  assertEqual(
    scalar(
      database,
      `SELECT count(*)::text FROM public.analytics_events
       WHERE event_name = 'signup_completed' AND user_id = '${USER_B}'`,
    ),
    "1",
    `${label} F one signup_completed after first`,
  );

  const repeat = JSON.parse(callSignup(database, USER_B, SESSION_SIGNUP_B, "anon-signup-b"));
  assertEqual(repeat.recorded, false, `${label} F repeat is not recorded`);
  assertEqual(repeat.reason, "already_recorded", `${label} F repeat reason`);
  assertEqual(
    scalar(
      database,
      `SELECT count(*)::text FROM public.analytics_events
       WHERE event_name = 'signup_completed' AND user_id = '${USER_B}'`,
    ),
    "1",
    `${label} F signup_completed not duplicated`,
  );
  assertEqual(
    scalar(database, `SELECT user_id::text FROM public.analytics_sessions WHERE id = '${SESSION_SIGNUP_B}'`),
    USER_B,
    `${label} F current session still linked`,
  );
  console.log(`  ${label} F repeat signup: no duplicate event, current session linked`);
}

function testConcurrentRepeats(database, label) {
  seedUser(database, USER_A);
  seedSession(database, {
    id: SESSION_CONCURRENT,
    anonymousId: "anon-concurrent",
    userId: USER_A,
  });
  seedIdentity(database, "anon-concurrent", USER_A);
  resetLogs(database);

  psql(
    database,
    `
DO $$
DECLARE
  i int;
  conn text;
  dsn text := 'dbname=${database} user=postgres host=/var/run/postgresql';
BEGIN
  FOR i IN 1..8 LOOP
    conn := 'link_repeat_' || i;
    PERFORM dblink_connect(conn, dsn);
    PERFORM dblink_send_query(
      conn,
      format(
        $q$SELECT public.test_call_link_analytics_session_user(%L::uuid, %L::uuid, %L);$q$,
        '${USER_A}',
        '${SESSION_CONCURRENT}',
        'anon-concurrent'
      )
    );
  END LOOP;

  FOR i IN 1..8 LOOP
    conn := 'link_repeat_' || i;
    PERFORM * FROM dblink_get_result(conn) AS t(linked boolean);
    PERFORM * FROM dblink_get_result(conn) AS t(linked boolean);
    PERFORM dblink_disconnect(conn);
  END LOOP;
END $$;
`,
  );

  assertEqual(sessionWriteCount(database, SESSION_CONCURRENT), 0, `${label} G no session UPDATE`);
  assertEqual(eventWriteCount(database, SESSION_CONCURRENT), 0, `${label} G no event UPDATE`);
  assertEqual(identityCallCount(database), 0, `${label} G no identity/advisory heavy path`);
  console.log(`  ${label} G 8 concurrent repeats: all fast no-op`);
}

function testFailSoftAppRoutes() {
  const linkRoute = readFileSync(LINK_ROUTE, "utf8");
  const signupRoute = readFileSync(SIGNUP_ROUTE, "utf8");
  assert(linkRoute.includes("status: 204"), "H link route fail-soft 204");
  assert(signupRoute.includes("status: 204"), "H signup route fail-soft 204");
  assert(!linkRoute.includes("status: 500"), "H link must not 500 on RPC error");
  assert(!signupRoute.includes("status: 500"), "H signup must not 500 on RPC error");
  console.log("  H app-unit contract: analytics RPC errors return 204, not 500");
}

function applyClean(database) {
  dropCreateDb(database);
  psqlFile(database, STUB);
  psqlFile(database, MIGRATION);
}

function applyUpgrade(database) {
  dropCreateDb(database);
  psqlFile(database, STUB);
  psqlFile(database, OLD_RPCS);
  assertNoLockTimeout(database, "upgrade-before");
  psqlFile(database, MIGRATION);
}

function runBehavioral(database, label) {
  testAlreadyLinkedNoHeavyPath(database, label);
  testFirstTimeLink(database, label);
  testRepeatSignupCanStillLinkCurrentSession(database, label);
  testConcurrentRepeats(database, label);
}

function main() {
  if (process.env.AUDIOLAD_ALLOW_PRODUCTION_SUPABASE === "1") {
    throw new Error("refusing to run: AUDIOLAD_ALLOW_PRODUCTION_SUPABASE is set");
  }
  if (!localPostgresAvailable()) {
    throw new Error(
      "isolated Postgres 16 is required. Tried: sudo -n -u postgres psql -c 'SELECT 1'. Docker is not used (production supabase-db must not be touched).",
    );
  }

  const version = postgresVersion();
  assert(version.startsWith("16."), `need Postgres 16, got ${version}`);
  console.log(`analytics-link-signup-sql-unit: local Postgres ${version}`);
  console.log("backend: sudo -u postgres (throwaway DBs, not supabase-db)");

  applyClean(CLEAN_DB);
  assertLockTimeout250(CLEAN_DB, "clean");
  runBehavioral(CLEAN_DB, "clean");
  console.log("A/C/D/E/F/G clean apply: ok");

  applyUpgrade(UPGRADE_DB);
  assertLockTimeout250(UPGRADE_DB, "upgrade");
  runBehavioral(UPGRADE_DB, "upgrade");
  console.log("B/C/D/E/F/G upgrade apply: ok");

  testFailSoftAppRoutes();
  console.log("analytics-link-signup-sql-unit: ok");
}

main();

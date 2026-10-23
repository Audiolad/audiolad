#!/usr/bin/env node
/**
 * Two real PostgreSQL connections on a disposable cluster.
 * Never writes to production postgres, Docker supabase-db, or an existing server.
 * Prefers a private initdb cluster (unix socket only). If initdb is unavailable,
 * starts a private postgres:16 container published on 127.0.0.1 and removes it.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = join(
  repoRoot,
  "supabase/migrations/20270119120000_business_player_live_claim_atomic.sql",
);
const migration = readFileSync(migrationPath, "utf8");

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.business_player_live_claim\(p_player_id uuid, p_device_secret text, p_now timestamptz\)/,
);
assert.match(migration, /WHERE h\.device_session_hash = EXCLUDED\.device_session_hash\s+OR h\.last_seen_at <= p_now - interval '5 minutes'/);
assert.match(migration, /IF NOT FOUND THEN\s+RAISE EXCEPTION 'device_session_conflict'/);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.business_player_live_claim\(uuid, text, timestamptz\) FROM PUBLIC, anon, authenticated/,
);
assert.doesNotMatch(migration, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.business_player_live_claim/i);
assert.doesNotMatch(migration, /\b(?:DROP |TRUNCATE|DELETE FROM|ALTER TABLE|CREATE TABLE)\b/i);

const USER = "10000000-0000-4000-8000-000000000001";
const ORG = "20000000-0000-4000-8000-000000000002";
const LOC = "30000000-0000-4000-8000-000000000003";
const SECRET_A = "a".repeat(40);
const SECRET_B = "b".repeat(40);
const SECRET_C = "c".repeat(40);
const T0 = "2026-10-23 12:00:00+00";
const T1 = "2026-10-23 12:01:00+00";
const T2 = "2026-10-23 12:02:00+00";
// Freshness is measured from last_seen_at. After the T1 refresh that is T1.
const T_BEFORE_EXPIRY = "2026-10-23 12:05:59.999999+00";
const T_EXPIRY = "2026-10-23 12:06:00+00";
const T_AFTER = "2026-10-23 12:12:00+00";

function findPgBin() {
  const candidates = [];
  if (process.env.AUDIOLAD_PG_BINDIR) candidates.push(process.env.AUDIOLAD_PG_BINDIR);
  try {
    candidates.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim());
  } catch {
    /* ignore */
  }
  try {
    for (const version of readdirSync("/usr/lib/postgresql").sort().reverse()) {
      candidates.push(`/usr/lib/postgresql/${version}/bin`);
    }
  } catch {
    /* ignore */
  }
  return candidates.find((dir) => existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mustOk(result, label) {
  assert.equal(
    result.code,
    0,
    `${label} failed (${result.code}): ${result.stderr || result.stdout}`,
  );
}

let cluster = null;

function psqlArgs(sql, { tuples = true } = {}) {
  const args = cluster.mode === "initdb"
    ? [cluster.psql, "-X", "-h", cluster.dir, "-p", cluster.port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
    : ["docker", "exec", "-i", cluster.name, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (tuples) args.push("-At");
  if (sql !== undefined) args.push("-c", sql);
  return args;
}

function runSql(sql, options = {}) {
  const args = psqlArgs(sql, options);
  const command = cluster.mode === "initdb" ? args[0] : "docker";
  const commandArgs = cluster.mode === "initdb" ? args.slice(1) : args.slice(1);
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    input: options.input,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function spawnSql(sql) {
  const args = psqlArgs(sql);
  const command = cluster.mode === "initdb" ? args[0] : "docker";
  const commandArgs = args.slice(1);
  return spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
}

function waitChild(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function waitForOverlap() {
  const started = Date.now();
  let seen = 0;
  while (Date.now() - started < 4000) {
    const result = runSql(
      "SELECT count(*)::text FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state = 'active' AND query LIKE '%business_player_live_claim%';",
    );
    mustOk(result, "overlap probe");
    seen = Math.max(seen, Number(result.stdout.trim()));
    if (seen >= 2) return seen;
    await sleep(40);
  }
  return seen;
}

function claimSql({ playerId, secret, at, pause, userId = USER, sessionPlayer = playerId }) {
  return `
BEGIN;
SET LOCAL statement_timeout = '15s';
SELECT set_config('request.jwt.claim.sub', '${userId}', true);
SELECT set_config('test.player_id', '${sessionPlayer}', true);
SELECT set_config('test.organization_id', '${ORG}', true);
SELECT set_config('test.location_id', '${LOC}', true);
SELECT set_config('test.pause_claim', '${pause ? "on" : "off"}', true);
SELECT organization_id::text || '|' || location_id::text
FROM public.business_player_live_claim('${playerId}'::uuid, '${secret}', timestamptz '${at}');
COMMIT;
`;
}

function assertRow(playerId, secret, claimedAt, seenAt) {
  const result = runSql(`
    SELECT (
      count(*) = 1
      AND bool_and(encode(device_session_hash, 'hex') = encode(sha256(convert_to('${secret}', 'UTF8')), 'hex'))
      AND bool_and(claimed_at = timestamptz '${claimedAt}')
      AND bool_and(last_seen_at = timestamptz '${seenAt}')
    )::text
    FROM public.business_player_device_heartbeat
    WHERE player_id = '${playerId}'::uuid;
  `);
  mustOk(result, `row ${playerId}`);
  assert.equal(result.stdout.trim(), "true", `row ${playerId}: ${result.stdout} ${result.stderr}`);
}

function assertAbsent(playerId) {
  const result = runSql(
    `SELECT count(*)::text FROM public.business_player_device_heartbeat WHERE player_id = '${playerId}'::uuid;`,
  );
  mustOk(result, `absent ${playerId}`);
  assert.equal(result.stdout.trim(), "0");
}

function expectError(sql, message) {
  const result = runSql(sql);
  assert.notEqual(result.code, 0, `expected ${message}, got success: ${result.stdout}`);
  assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(message));
}

async function race(playerId, secretA, secretB, at) {
  const left = spawnSql(claimSql({ playerId, secret: secretA, at, pause: true }));
  const right = spawnSql(claimSql({ playerId, secret: secretB, at, pause: true }));
  const done = Promise.all([waitChild(left), waitChild(right)]);
  const overlap = await waitForOverlap();
  const [ra, rb] = await done;
  return { overlap, results: [{ secret: secretA, ...ra }, { secret: secretB, ...rb }] };
}

function startInitdb(bin) {
  const dir = mkdtempSync(join(tmpdir(), "al-live-claim-pg-"));
  const data = join(dir, "data");
  const port = String(20000 + Math.floor(Math.random() * 20000));
  cluster = {
    mode: "initdb",
    dir,
    data,
    port,
    bin,
    psql: existsSync(join(bin, "psql")) ? join(bin, "psql") : "psql",
    started: false,
  };
  execFileSync(join(bin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-sync"], { stdio: "ignore" });
  execFileSync(join(bin, "pg_ctl"), [
    "-D", data, "-w", "-l", join(dir, "pg.log"),
    "-o", `-k ${dir} -p ${port} -c listen_addresses=''`,
    "start",
  ], { stdio: "ignore" });
  cluster.started = true;
  return cluster;
}

function startDocker() {
  const port = String(20000 + Math.floor(Math.random() * 20000));
  const name = `al-live-claim-test-${port}`;
  // Register the container before `docker run` so stopCluster() removes it even
  // if `docker run` fails after the container was created (e.g. port bind error).
  cluster = { mode: "docker", name, port, started: false };
  execFileSync("docker", [
    "run", "-d", "--name", name,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "-p", `127.0.0.1:${port}:5432`,
    "postgres:16",
  ], { stdio: "pipe" });
  cluster.started = true;
  const started = Date.now();
  while (Date.now() - started < 60000) {
    const probe = spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (probe.status === 0) return cluster;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`disposable postgres container ${name} did not become ready`);
}

function stopCluster() {
  if (!cluster) return;
  if (cluster.mode === "initdb") {
    if (cluster.started) {
      try {
        execFileSync(join(cluster.bin, "pg_ctl"), ["-D", cluster.data, "-m", "immediate", "stop"], { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    }
    rmSync(cluster.dir, { recursive: true, force: true });
  } else if (cluster.name) {
    try {
      execFileSync("docker", ["rm", "-f", cluster.name], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
  cluster.started = false;
}

const setupSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE TABLE public.business_player_device_heartbeat (
  player_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  device_session_hash bytea NOT NULL CHECK (octet_length(device_session_hash) = 32),
  claimed_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);
CREATE FUNCTION public.business_spa_session_player(p_now timestamptz)
RETURNS TABLE (player_id uuid, organization_id uuid, location_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT
    NULLIF(current_setting('test.player_id', true), '')::uuid,
    NULLIF(current_setting('test.organization_id', true), '')::uuid,
    NULLIF(current_setting('test.location_id', true), '')::uuid
$$;
`;

async function main() {
  const bin = findPgBin();
  if (bin) {
    cluster = startInitdb(bin);
    console.log("business-player-live-claim-concurrency: disposable initdb cluster");
  } else {
    cluster = startDocker();
    console.log("business-player-live-claim-concurrency: disposable postgres:16 container");
  }

  let setup = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    setup = runSql(setupSql, { tuples: false });
    if (setup.code === 0) break;
    await sleep(250);
  }
  mustOk(setup, "setup");
  mustOk(runSql(undefined, { tuples: false, input: migration }), "migration");

  const signature = runSql(`
    SELECT has_function_privilege('public', 'public.business_player_live_claim(uuid, text, timestamptz)', 'execute')::text
      || '|' || has_function_privilege('anon', 'public.business_player_live_claim(uuid, text, timestamptz)', 'execute')::text
      || '|' || has_function_privilege('authenticated', 'public.business_player_live_claim(uuid, text, timestamptz)', 'execute')::text
      || '|' || prosecdef::text
      || '|' || proconfig::text
      || '|' || pg_get_function_identity_arguments(p.oid)
      || '|' || pg_get_function_result(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'business_player_live_claim';
  `);
  mustOk(signature, "signature");
  assert.equal(
    signature.stdout.trim(),
    'false|false|false|true|{"search_path=public, pg_temp"}|p_player_id uuid, p_device_secret text, p_now timestamp with time zone|TABLE(organization_id uuid, location_id uuid)',
  );

  mustOk(runSql(`
    CREATE FUNCTION public.pause_first_claim() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('test.pause_claim', true) = 'on' THEN
        PERFORM pg_sleep(1.5);
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER pause_first_claim
    BEFORE INSERT ON public.business_player_device_heartbeat
    FOR EACH ROW EXECUTE FUNCTION public.pause_first_claim();
  `, { tuples: false }), "pause trigger");

  const freshPlayer = "40000000-0000-4000-8000-000000000041";
  expectError(
    `
    BEGIN;
    SELECT set_config('test.player_id', '${freshPlayer}', true);
    SELECT set_config('test.organization_id', '${ORG}', true);
    SELECT set_config('test.location_id', '${LOC}', true);
    SELECT organization_id FROM public.business_player_live_claim('${freshPlayer}'::uuid, '${SECRET_A}', timestamptz '${T0}');
    COMMIT;
    `,
    "not_authenticated",
  );
  expectError(claimSql({ playerId: freshPlayer, secret: "short", at: T0, pause: false }), "invalid_device_session");
  expectError(
    claimSql({
      playerId: "40000000-0000-4000-8000-000000000099",
      sessionPlayer: freshPlayer,
      secret: SECRET_A,
      at: T0,
      pause: false,
    }),
    "no_access",
  );
  assertAbsent(freshPlayer);

  for (const playerId of [
    "40000000-0000-4000-8000-000000000011",
    "40000000-0000-4000-8000-000000000012",
    "40000000-0000-4000-8000-000000000013",
  ]) {
    const raced = await race(playerId, SECRET_A, SECRET_B, T0);
    assert.ok(raced.overlap >= 2, `expected overlapping claims, saw ${raced.overlap}`);
    const winners = raced.results.filter((result) => result.code === 0);
    const losers = raced.results.filter((result) => result.code !== 0);
    assert.equal(winners.length, 1, JSON.stringify(raced.results));
    assert.equal(losers.length, 1, JSON.stringify(raced.results));
    assert.match(losers[0].stderr, /device_session_conflict/);
    assert.match(winners[0].stdout, new RegExp(`${ORG}\\|${LOC}`));
    assertRow(playerId, winners[0].secret, T0, T0);
  }

  const samePlayer = "40000000-0000-4000-8000-000000000021";
  const same = await race(samePlayer, SECRET_C, SECRET_C, T0);
  assert.ok(same.overlap >= 2, `expected overlapping same-secret claims, saw ${same.overlap}`);
  assert.equal(same.results.filter((result) => result.code === 0).length, 2, JSON.stringify(same.results));
  assertRow(samePlayer, SECRET_C, T0, T0);

  const later = "40000000-0000-4000-8000-000000000031";
  const first = runSql(claimSql({ playerId: later, secret: SECRET_A, at: T0, pause: false }));
  mustOk(first, "first sequential claim");
  assert.match(first.stdout, new RegExp(`${ORG}\\|${LOC}`));
  assertRow(later, SECRET_A, T0, T0);

  mustOk(runSql(claimSql({ playerId: later, secret: SECRET_A, at: T1, pause: false })), "same secret refresh");
  assertRow(later, SECRET_A, T0, T1);

  expectError(claimSql({ playerId: later, secret: SECRET_B, at: T2, pause: false }), "device_session_conflict");
  assertRow(later, SECRET_A, T0, T1);

  expectError(
    claimSql({ playerId: later, secret: SECRET_B, at: T_BEFORE_EXPIRY, pause: false }),
    "device_session_conflict",
  );
  assertRow(later, SECRET_A, T0, T1);

  mustOk(runSql(claimSql({ playerId: later, secret: SECRET_B, at: T_EXPIRY, pause: false })), "expired takeover");
  assertRow(later, SECRET_B, T_EXPIRY, T_EXPIRY);

  mustOk(runSql(claimSql({ playerId: later, secret: SECRET_B, at: T_AFTER, pause: false })), "same secret after expiry");
  assertRow(later, SECRET_B, T_EXPIRY, T_AFTER);

  console.log("business-player-live-claim-concurrency: ok");
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    stopCluster();
    process.exit(128 + (signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : 1));
  });
}

try {
  await main();
} finally {
  stopCluster();
}

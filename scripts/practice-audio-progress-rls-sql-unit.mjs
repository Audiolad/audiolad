#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) RLS tests for
 * practice_audio_progress security hardening.
 * Scratch database only. Never writes to production postgres.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const originalName = "20260715200000_practice_audio_progress.sql";
const hardenName = "20260919120000_harden_practice_audio_progress_rls.sql";
const originalPath = join(repoRoot, "supabase/migrations", originalName);
const hardenPath = join(repoRoot, "supabase/migrations", hardenName);
const stubPath = join(repoRoot, "scripts/lib/practice-audio-progress-rls-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/practice-audio-progress-rls-seed.sql");
const smokePath = join(
  repoRoot,
  "supabase/tests/practice_audio_progress_rls_smoke.sql",
);
const dbName = "audiolad_practice_audio_progress_rls_test";

const original = readFileSync(originalPath, "utf8");
const harden = readFileSync(hardenPath, "utf8");

assert.match(original, /CREATE TABLE IF NOT EXISTS public\.practice_audio_progress/);
assert.match(original, /Users manage own practice audio progress/);
assert.match(original, /FOR ALL/);
assert.match(
  original,
  /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.practice_audio_progress TO authenticated/,
);
assert.doesNotMatch(original, /real_listened_ms|rating_eligible/);

assert.match(harden, /DROP POLICY IF EXISTS "Users manage own practice audio progress"/);
assert.match(harden, /Users select own practice audio progress/);
assert.match(harden, /FOR SELECT/);
assert.match(harden, /REVOKE ALL ON TABLE public\.practice_audio_progress FROM anon/);
assert.match(
  harden,
  /REVOKE ALL ON TABLE public\.practice_audio_progress FROM authenticated/,
);
assert.match(
  harden,
  /GRANT SELECT ON TABLE public\.practice_audio_progress TO authenticated/,
);
assert.match(
  harden,
  /GRANT ALL ON TABLE public\.practice_audio_progress TO service_role/,
);
assert.doesNotMatch(harden, /DELETE FROM public\.practice_audio_progress/);
assert.doesNotMatch(harden, /DROP TABLE/);
assert.doesNotMatch(harden, /real_listened_ms|rating_eligible|practice_listen_stats/);
assert.doesNotMatch(harden, /CREATE(?: OR REPLACE)? FUNCTION/);

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

function runIsolatedSql() {
  if (
    !existsSync(stubPath) ||
    !existsSync(seedPath) ||
    !existsSync(smokePath)
  ) {
    throw new Error("practice_audio_progress RLS stub, seed, or smoke is missing");
  }

  const sql = [
    readFileSync(stubPath, "utf8"),
    original,
    readFileSync(seedPath, "utf8"),
    harden,
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

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";

if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  runIsolatedSql();
  console.log("practice-audio-progress-rls-sql-unit: parse + isolated RLS ok");
} else {
  console.log(
    skipIsolatedSql
      ? "practice-audio-progress-rls-sql-unit: parse-only ok (isolated SQL disabled)"
      : "practice-audio-progress-rls-sql-unit: parse-only ok (no local postgres)",
  );
}

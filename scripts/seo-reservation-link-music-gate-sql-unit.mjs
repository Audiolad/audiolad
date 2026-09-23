#!/usr/bin/env node
/**
 * Isolated DB behavior for the reservation → product music gate.
 * Never touches production. Uses localhost DATABASE_URL or docker postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER =
  process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_seo_reservation_link_music_gate_test";
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20261031120200_seo_reservation_link_music_gate.sql",
);
const STUB = join(ROOT, "scripts/lib/seo-reservation-link-music-gate-sql-stub.sql");
const BEHAVIOR = join(
  ROOT,
  "supabase/tests/seo_reservation_link_music_gate_behavior.sql",
);

const DATABASE_URL =
  process.env.AUDIOLAD_SEO_RESERVATION_LINK_DATABASE_URL?.trim() ||
  process.env.AUDIOLAD_ANALYTICS_P2_DATABASE_URL?.trim() ||
  null;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function localhostUrl() {
  if (!DATABASE_URL) return null;
  const parsed = new URL(DATABASE_URL);
  assert(
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname),
    "reservation link SQL tests only permit a localhost PostgreSQL URL",
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

function dockerContainerRunning() {
  try {
    const out = execFileSync(
      "docker",
      ["inspect", "-f", "{{.State.Running}}", CONTAINER],
      { encoding: "utf8" },
    ).trim();
    return out === "true";
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

function psql(database, sql) {
  if (LOCAL) {
    return execFileSync(
      "psql",
      [connectionUrl(database), "-v", "ON_ERROR_STOP=1", "-c", sql],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  }
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function psqlFile(database, absolutePath) {
  const input = readFileSync(absolutePath, "utf8");
  if (LOCAL) {
    return execFileSync(
      "psql",
      [connectionUrl(database), "-v", "ON_ERROR_STOP=1"],
      { encoding: "utf8", input, maxBuffer: 20 * 1024 * 1024 },
    );
  }
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { encoding: "utf8", input, maxBuffer: 20 * 1024 * 1024 },
  );
}

function main() {
  assert(existsSync(MIGRATION), "migration missing");
  assert(existsSync(STUB), "stub missing");
  assert(existsSync(BEHAVIOR), "behavior sql missing");

  const useDocker = !LOCAL && dockerAvailable() && dockerContainerRunning();
  if (!LOCAL && !useDocker) {
    if (process.env.AUDIOLAD_REQUIRE_SEO_RESERVATION_LINK_SQL === "1") {
      throw new Error(
        "reservation link SQL tests required but no localhost PostgreSQL / docker available",
      );
    }
    console.log(
      "seo-reservation-link-music-gate-sql-unit: skipped (no localhost DATABASE_URL / docker)",
    );
    return;
  }

  const mode = LOCAL ? `localhost:${LOCAL.port || 5432}` : `docker:${CONTAINER}`;
  console.log(`seo-reservation-link-music-gate-sql-unit: mode=${mode}`);

  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  try {
    psqlFile(TEST_DB, STUB);
    psqlFile(TEST_DB, MIGRATION);
    const out = psqlFile(TEST_DB, BEHAVIOR);
    if (!/seo_reservation_link_music_gate_behavior: ALL PASS/.test(out)) {
      throw new Error(`behavior SQL did not pass:\n${out}`);
    }
    console.log("seo-reservation-link-music-gate-sql-unit: ok");
  } finally {
    try {
      psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    } catch (err) {
      console.warn("cleanup warning:", err instanceof Error ? err.message : err);
    }
  }
}

main();

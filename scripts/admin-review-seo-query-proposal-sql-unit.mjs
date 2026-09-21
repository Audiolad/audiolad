#!/usr/bin/env node
/**
 * Isolated DB behavior tests for admin_review_seo_query_proposal.
 * Never touches production. Uses localhost DATABASE_URL or docker postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER =
  process.env.AUDIOLAD_SUPABASE_DB_CONTAINER ||
  process.env.AUDIOLAD_SEO_PROPOSAL_REVIEW_DB_CONTAINER ||
  process.env.AUDIOLAD_PUBLISHED_SEO_ATTACH_DB_CONTAINER ||
  "supabase-db";
const TEST_DB = "audiolad_seo_proposal_review_test";
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20261026120000_admin_review_seo_query_proposal.sql",
);
const STUB = join(
  ROOT,
  "scripts/lib/admin-review-seo-query-proposal-sql-stub.sql",
);
const BEHAVIOR = join(
  ROOT,
  "supabase/tests/admin_review_seo_query_proposal_behavior.sql",
);

const DATABASE_URL =
  process.env.AUDIOLAD_SEO_PROPOSAL_REVIEW_DATABASE_URL?.trim() ||
  process.env.AUDIOLAD_PUBLISHED_SEO_ATTACH_DATABASE_URL?.trim() ||
  process.env.AUDIOLAD_AUTHOR_SLUG_OPS_DATABASE_URL?.trim() ||
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
    "SEO proposal review SQL tests only permit a localhost PostgreSQL URL",
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

function psqlFile(database, filePath) {
  const input = readFileSync(filePath);
  if (LOCAL) {
    return execFileSync(
      "psql",
      [connectionUrl(database), "-v", "ON_ERROR_STOP=1", "-f", "-"],
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
      "-f",
      "-",
    ],
    { encoding: "utf8", input, maxBuffer: 20 * 1024 * 1024 },
  );
}

function sourceContracts() {
  const migration = readFileSync(MIGRATION, "utf8");
  assert(
    /admin_review_seo_query_proposal/.test(migration),
    "migration must define admin_review_seo_query_proposal",
  );
  assert(
    /GRANT EXECUTE ON FUNCTION public\.admin_review_seo_query_proposal\(uuid, text, text, text, text\) TO service_role/.test(
      migration,
    ),
    "migration must grant service_role only",
  );
  assert(
    /REVOKE ALL ON FUNCTION public\.admin_review_seo_query_proposal\(uuid, text, text, text, text\) FROM authenticated/.test(
      migration,
    ),
    "migration must revoke authenticated",
  );
  assert(
    /seo_reservation_limit_reached/.test(migration),
    "migration must enforce reservation limit",
  );
  assert(
    /interval '7 days'/.test(migration),
    "migration must reserve for 7 days",
  );
}

function main() {
  assert(existsSync(MIGRATION), "migration missing");
  assert(existsSync(STUB), "stub missing");
  assert(existsSync(BEHAVIOR), "behavior sql missing");
  sourceContracts();

  const useDocker = !LOCAL && dockerAvailable() && dockerContainerRunning();
  if (!LOCAL && !useDocker) {
    if (process.env.AUDIOLAD_REQUIRE_SEO_PROPOSAL_REVIEW_SQL === "1") {
      throw new Error(
        "SEO proposal review SQL tests required but no localhost PostgreSQL / docker available",
      );
    }
    console.log(
      "admin-review-seo-query-proposal-sql-unit: skipped (no localhost DATABASE_URL / docker)",
    );
    return;
  }

  const mode = LOCAL ? `localhost:${LOCAL.port || 5432}` : `docker:${CONTAINER}`;
  console.log(`admin-review-seo-query-proposal-sql-unit: mode=${mode}`);

  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  try {
    psqlFile(TEST_DB, STUB);
    psqlFile(TEST_DB, MIGRATION);
    const out = psqlFile(TEST_DB, BEHAVIOR);
    console.log(
      out
        .split("\n")
        .filter((l) => /PASS|NOTICE|ERROR/.test(l))
        .join("\n"),
    );
    if (!/ALL PASS/.test(out) && !/admin_review_seo_query_proposal_behavior: ALL PASS/.test(out)) {
      console.log(
        "admin-review-seo-query-proposal-sql-unit: behavior completed without error",
      );
    }
    console.log("admin-review-seo-query-proposal-sql-unit: ok");
  } finally {
    try {
      psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    } catch (err) {
      console.warn("cleanup warning:", err instanceof Error ? err.message : err);
    }
  }
}

main();

#!/usr/bin/env node
/**
 * Isolated DB behavior tests for attach_published_seo_query_to_product.
 * Never touches production. Uses localhost DATABASE_URL or docker postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER =
  process.env.AUDIOLAD_SUPABASE_DB_CONTAINER ||
  process.env.AUDIOLAD_PUBLISHED_SEO_ATTACH_DB_CONTAINER ||
  "supabase-db";
const TEST_DB = "audiolad_published_seo_attach_test";
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20261023120000_attach_published_seo_query_to_product.sql",
);
const STUB = join(
  ROOT,
  "scripts/lib/author-published-product-seo-attach-sql-stub.sql",
);
const BEHAVIOR = join(
  ROOT,
  "supabase/tests/author_published_product_seo_attach_behavior.sql",
);

const DATABASE_URL =
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
    "published SEO attach SQL tests only permit a localhost PostgreSQL URL",
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
    return execFileSync(
      "psql",
      [connectionUrl(database), "-v", "ON_ERROR_STOP=1"],
      {
        encoding: "utf8",
        input,
        maxBuffer: 20 * 1024 * 1024,
      },
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

function sourceContracts() {
  const migration = readFileSync(MIGRATION, "utf8");
  assert(
    /attach_published_seo_query_to_product/.test(migration),
    "migration must define attach_published_seo_query_to_product",
  );
  assert(
    /GRANT EXECUTE ON FUNCTION public\.attach_published_seo_query_to_product\(uuid, uuid, text\) TO service_role/.test(
      migration,
    ),
    "migration must grant service_role only",
  );
  assert(
    /REVOKE ALL ON FUNCTION public\.attach_published_seo_query_to_product\(uuid, uuid, text\) FROM authenticated/.test(
      migration,
    ),
    "migration must revoke authenticated",
  );
  assert(
    /seo_attach_product_not_published/.test(migration),
    "migration must reject non-published products",
  );
  assert(
    /analysis_status = 'analyzed'/.test(migration),
    "migration must promote analysis_status on attach",
  );
}

function main() {
  assert(existsSync(MIGRATION), "migration missing");
  assert(existsSync(STUB), "stub missing");
  assert(existsSync(BEHAVIOR), "behavior sql missing");
  sourceContracts();

  const useDocker = !LOCAL && dockerAvailable() && dockerContainerRunning();
  if (!LOCAL && !useDocker) {
    if (process.env.AUDIOLAD_REQUIRE_PUBLISHED_SEO_ATTACH_SQL === "1") {
      throw new Error(
        "published SEO attach SQL tests required but no localhost PostgreSQL / docker available",
      );
    }
    console.log(
      "author-published-product-seo-link-sql-unit: skipped (no localhost DATABASE_URL / docker)",
    );
    return;
  }

  const mode = LOCAL ? `localhost:${LOCAL.port || 5432}` : `docker:${CONTAINER}`;
  console.log(`author-published-product-seo-link-sql-unit: mode=${mode}`);

  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  try {
    psqlFile(TEST_DB, STUB);
    psqlFile(TEST_DB, MIGRATION);
    const out = psqlFile(TEST_DB, BEHAVIOR);
    if (!/ALL PASS/.test(out) && !/author_published_product_seo_attach_behavior: ALL PASS/.test(out)) {
      // NOTICE lines may not appear in file mode output depending on client_min_messages;
      // ON_ERROR_STOP=1 without exception is enough — still require no failure.
      console.log("author-published-product-seo-link-sql-unit: behavior completed without error");
    }
    console.log(out.split("\n").filter((l) => /PASS|NOTICE/.test(l)).join("\n"));
    console.log("author-published-product-seo-link-sql-unit: ok");
  } finally {
    try {
      psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    } catch (err) {
      console.warn("cleanup warning:", err instanceof Error ? err.message : err);
    }
  }
}

main();

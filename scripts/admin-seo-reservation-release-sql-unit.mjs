#!/usr/bin/env node
/**
 * Reproduces SQLSTATE 23514 on v2 admin release of a linked reservation,
 * then applies the fix and checks the reservation and practice SEO fields.
 * Never touches production.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB = "audiolad_admin_seo_reservation_release_test";
const V2 = join(
  ROOT,
  "supabase/migrations/20261021120000_seo_reservation_product_primary_sync.sql",
);
const FIX = join(
  ROOT,
  "supabase/migrations/20261217120100_admin_release_seo_reservation_clear_product.sql",
);
const STUB = join(ROOT, "scripts/lib/admin-seo-reservation-release-sql-stub.sql");
const FAILING = join(
  ROOT,
  "supabase/tests/admin_release_seo_reservation_v2_fails.sql",
);
const BEHAVIOR = join(
  ROOT,
  "supabase/tests/admin_release_seo_reservation_behavior.sql",
);

const DATABASE_URL =
  process.env.AUDIOLAD_ADMIN_SEO_RELEASE_DATABASE_URL?.trim() ||
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
    "admin SEO release SQL tests only permit a localhost PostgreSQL URL",
  );
  return parsed;
}

const LOCAL = localhostUrl();

function sudoPostgres() {
  try {
    execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
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

function psql(database, sql) {
  if (LOCAL) {
    return execFileSync(
      "psql",
      [connectionUrl(database), "-v", "ON_ERROR_STOP=1", "-c", sql],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  }
  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function psqlInput(database, input) {
  if (LOCAL) {
    return execFileSync(
      "psql",
      [connectionUrl(database), "-v", "ON_ERROR_STOP=1"],
      { encoding: "utf8", input, maxBuffer: 20 * 1024 * 1024 },
    );
  }
  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input, maxBuffer: 20 * 1024 * 1024 },
  );
}

function extractV2Function(sql) {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.admin_release_seo_query_reservation",
  );
  const end = sql.indexOf("COMMENT ON FUNCTION public.link_seo_reservation_to_product");
  assert(start >= 0 && end > start, "v2 admin release function not found");
  return sql.slice(start, end);
}

function main() {
  for (const file of [V2, FIX, STUB, FAILING, BEHAVIOR]) {
    assert(existsSync(file), `missing ${file}`);
  }

  const useSudo = !LOCAL && sudoPostgres();
  if (!LOCAL && !useSudo) {
    if (process.env.AUDIOLAD_REQUIRE_ADMIN_SEO_RELEASE_SQL === "1") {
      throw new Error(
        "admin SEO release SQL tests required but no localhost PostgreSQL is available",
      );
    }
    console.log(
      "admin-seo-reservation-release-sql-unit: skipped (no localhost DATABASE_URL / postgres)",
    );
    return;
  }

  console.log(
    `admin-seo-reservation-release-sql-unit: mode=${LOCAL ? "localhost-url" : "sudo-postgres"}`,
  );

  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  try {
    psqlInput(TEST_DB, readFileSync(STUB, "utf8"));
    psqlInput(TEST_DB, extractV2Function(readFileSync(V2, "utf8")));
    const failing = psqlInput(TEST_DB, readFileSync(FAILING, "utf8"));
    if (!/admin_release_seo_reservation_v2_fails: ALL PASS/.test(failing)) {
      throw new Error(`v2 failure SQL did not pass:\n${failing}`);
    }
    psqlInput(TEST_DB, readFileSync(FIX, "utf8"));
    const behavior = psqlInput(TEST_DB, readFileSync(BEHAVIOR, "utf8"));
    if (!/admin_release_seo_reservation_behavior: ALL PASS/.test(behavior)) {
      throw new Error(`fixed behavior SQL did not pass:\n${behavior}`);
    }
    console.log("admin-seo-reservation-release-sql-unit: ok");
  } finally {
    try {
      psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    } catch (err) {
      console.warn("cleanup warning:", err instanceof Error ? err.message : err);
    }
  }
}

main();

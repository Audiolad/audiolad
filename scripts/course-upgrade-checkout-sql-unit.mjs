#!/usr/bin/env node
/**
 * Parse-only (+ optional isolated Postgres) tests for Phase 4 upgrade checkout.
 * Scratch database only. Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const previousName = "20260924120000_course_access_levels_moderation_readiness.sql";
const schemaName = "20260925120000_course_upgrade_order_kind.sql";
const rpcName = "20260925120100_create_course_upgrade_order.sql";
const fulfillName = "20260925120200_fulfill_tochka_course_upgrade.sql";
const foundationName = "20260923120100_course_access_levels_foundation.sql";
const originalFulfillName = "20260725190000_payments_p30_transactional_fulfill.sql";
const stubPath = join(repoRoot, "scripts/lib/course-access-levels-sql-stub.sql");
const extraStubPath = join(repoRoot, "scripts/lib/course-upgrade-checkout-sql-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/course-access-levels-pre-migration-seed.sql");
const smokePath = join(repoRoot, "supabase/tests/course_upgrade_checkout_smoke.sql");
const dbName = "audiolad_course_upgrade_checkout_test";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const schema = readFileSync(join(migrationsDir, schemaName), "utf8");
const rpc = readFileSync(join(migrationsDir, rpcName), "utf8");
const fulfill = readFileSync(join(migrationsDir, fulfillName), "utf8");
const originalFulfill = readFileSync(join(migrationsDir, originalFulfillName), "utf8");

assert(existsSync(join(migrationsDir, previousName)), "previous latest migration stays intact");
assert(existsSync(join(migrationsDir, schemaName)), "order_kind migration exists");
assert(existsSync(join(migrationsDir, rpcName)), "upgrade order RPC exists");
assert(existsSync(join(migrationsDir, fulfillName)), "fulfill replacement exists");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20260925120000"), "schema stamp is listed");
assert(versions.includes("20260925120100"), "rpc stamp is listed");
assert(versions.includes("20260925120200"), "fulfill stamp is listed");
assert(versions.includes("20260924120000"), "readiness stamp remains");

assert(/ADD COLUMN IF NOT EXISTS order_kind text NOT NULL DEFAULT 'product_purchase'/.test(schema));
assert(/ADD COLUMN IF NOT EXISTS target_access_level integer NULL/.test(schema));
assert(/order_kind IN \('product_purchase', 'course_upgrade'\)/.test(schema));
assert(/course_upgrade' AND target_access_level >= 2/.test(schema));
assert(!/UPDATE\s+public\.orders/i.test(schema));
assert(/level_has_live_upgrade_orders/.test(schema));
assert(!/DROP TABLE/.test(schema));
assert(!/TRUNCATE/.test(schema));

assert(/CREATE OR REPLACE FUNCTION public\.create_course_upgrade_order/.test(rpc));
assert(/v_target := v_current \+ 1/.test(rpc));
assert(/upgrade_price::bigint\) \* 100/.test(rpc));
assert(!/RAISE EXCEPTION 'already_owned'/.test(rpc));
assert(/viewer_can_commercially_access_practice/.test(rpc));
assert(/GRANT EXECUTE ON FUNCTION public\.create_course_upgrade_order/.test(rpc));
assert(/FROM anon/.test(rpc));

assert(/CREATE OR REPLACE FUNCTION public\.fulfill_tochka_payment_transactional/.test(fulfill));
assert(/grant_practice_purchase_access\(v_order\.id\)/.test(fulfill));
assert(/granted_via', 'course_upgrade'/.test(fulfill));
assert(/grant_practice_access\(/.test(fulfill));
assert(/fulfill_tochka_payment_transactional\(/.test(originalFulfill));
assert(/p_webhook_event_id uuid/.test(fulfill));
assert(/p_provider_amount_minor bigint/.test(fulfill));
assert(/service_role only/.test(fulfill));

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

function runPsql(database, input) {
  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  }

  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function adminSql(sqlText) {
  if (dockerAvailable()) {
    const container = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
    return execFileSync(
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
        sqlText,
      ],
      { encoding: "utf8" },
    );
  }

  return execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", sqlText],
    { encoding: "utf8" },
  );
}

function runIsolatedSql() {
  const foundationPath = join(migrationsDir, foundationName);
  if (
    !existsSync(stubPath) ||
    !existsSync(extraStubPath) ||
    !existsSync(seedPath) ||
    !existsSync(smokePath) ||
    !existsSync(foundationPath)
  ) {
    throw new Error("upgrade checkout SQL fixtures are missing");
  }

  adminSql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  adminSql(`CREATE DATABASE ${dbName};`);

  const bootstrap = [
    readFileSync(stubPath, "utf8"),
    readFileSync(seedPath, "utf8"),
    readFileSync(foundationPath, "utf8"),
    readFileSync(extraStubPath, "utf8"),
    readFileSync(join(migrationsDir, schemaName), "utf8"),
    readFileSync(join(migrationsDir, rpcName), "utf8"),
    readFileSync(smokePath, "utf8"),
  ].join("\n");

  runPsql(dbName, bootstrap);
}

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";

if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  runIsolatedSql();
  console.log("course-upgrade-checkout-sql-unit: parse + isolated sql ok");
} else {
  console.log(
    skipIsolatedSql
      ? "course-upgrade-checkout-sql-unit: parse-only ok (isolated SQL disabled)"
      : "course-upgrade-checkout-sql-unit: parse-only ok (no local postgres)",
  );
}

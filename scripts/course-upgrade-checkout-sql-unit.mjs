#!/usr/bin/env node
/**
 * Parse-only + executable isolated Postgres tests for Phase 4 upgrade checkout.
 * Scratch / local isolated database only. Never writes to production postgres.
 *
 * CI path: AUDIOLAD_COURSE_UPGRADE_ISOLATED=1 + local DATABASE_URL
 * (GitHub Actions postgres:16 service). That path must CALL
 * fulfill_tochka_payment_transactional — parse-only is not sufficient.
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
const idempotencyName = "20260925120300_create_course_upgrade_order_idempotency.sql";
const canonicalName = "20260925120400_course_upgrade_canonical_sale.sql";
const projectionName = "20260925120500_course_upgrade_canonical_sales_projection.sql";
const foundationName = "20260923120100_course_access_levels_foundation.sql";
const originalFulfillName = "20260725190000_payments_p30_transactional_fulfill.sql";
const stubPath = join(repoRoot, "scripts/lib/course-access-levels-sql-stub.sql");
const extraStubPath = join(repoRoot, "scripts/lib/course-upgrade-checkout-sql-stub.sql");
const fulfillStubPath = join(repoRoot, "scripts/lib/course-upgrade-fulfill-sql-stub.sql");
const canonicalStubPath = join(repoRoot, "scripts/lib/course-upgrade-canonical-sql-stub.sql");
const seedPath = join(repoRoot, "scripts/lib/course-access-levels-pre-migration-seed.sql");
const smokePath = join(repoRoot, "supabase/tests/course_upgrade_checkout_smoke.sql");
const fulfillSmokePath = join(repoRoot, "supabase/tests/course_upgrade_fulfill_smoke.sql");
const dbName = "audiolad_course_upgrade_checkout_test";
const isolatedDbName = "audiolad_course_upgrade_isolated";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const schema = readFileSync(join(migrationsDir, schemaName), "utf8");
const rpc = readFileSync(join(migrationsDir, rpcName), "utf8");
const fulfill = readFileSync(join(migrationsDir, fulfillName), "utf8");
const idempotency = readFileSync(join(migrationsDir, idempotencyName), "utf8");
const canonical = readFileSync(join(migrationsDir, canonicalName), "utf8");
const projection = readFileSync(join(migrationsDir, projectionName), "utf8");
const originalFulfill = readFileSync(join(migrationsDir, originalFulfillName), "utf8");

assert(existsSync(join(migrationsDir, previousName)), "previous latest migration stays intact");
assert(existsSync(join(migrationsDir, schemaName)), "order_kind migration exists");
assert(existsSync(join(migrationsDir, rpcName)), "upgrade order RPC exists");
assert(existsSync(join(migrationsDir, fulfillName)), "fulfill replacement exists");
assert(existsSync(join(migrationsDir, idempotencyName)), "idempotency replay replacement exists");
assert(existsSync(join(migrationsDir, canonicalName)), "canonical sale helpers exist");
assert(existsSync(join(migrationsDir, projectionName)), "canonical projection replacement exists");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
assert(versions.includes("20260925120000"), "schema stamp is listed");
assert(versions.includes("20260925120100"), "rpc stamp is listed");
assert(versions.includes("20260925120200"), "fulfill stamp is listed");
assert(versions.includes("20260925120300"), "idempotency stamp is listed");
assert(versions.includes("20260925120400"), "canonical helper stamp is listed");
assert(versions.includes("20260925120500"), "projection stamp is listed");
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

assert(/True idempotency/.test(idempotency));
assert(idempotency.indexOf("idempotency_key = v_idempotency_key") < idempotency.indexOf("v_target := v_current + 1"));
assert(/order_kind IS DISTINCT FROM 'course_upgrade'/.test(idempotency));
assert(!/RAISE EXCEPTION 'already_owned'/.test(idempotency));

assert(/CREATE OR REPLACE FUNCTION public\.fulfill_tochka_payment_transactional/.test(fulfill));
assert(/grant_practice_purchase_access\(v_order\.id\)/.test(fulfill));
assert(/granted_via', 'course_upgrade'/.test(fulfill));
assert(/grant_practice_access\(/.test(fulfill));
assert(/fulfill_tochka_payment_transactional\(/.test(originalFulfill));
assert(/p_webhook_event_id uuid/.test(fulfill));
assert(/p_provider_amount_minor bigint/.test(fulfill));
assert(/service_role only/.test(fulfill));

assert(/canonical_sale_has_paid_access/.test(canonical));
assert(/course_upgrade' THEN/.test(canonical));
assert(/access_source = 'purchase'/.test(canonical));
assert(/canonical_sale_qualifies/.test(canonical));
assert(/canonical_sale_has_paid_access\(/.test(projection));
assert(/order_kind/.test(projection));
assert(/canonical_sale/.test(projection));

const fulfillSmoke = readFileSync(fulfillSmokePath, "utf8");
assert(/fulfill_tochka_payment_transactional\(/.test(fulfillSmoke));
assert(/external_manual/.test(fulfillSmoke));
assert(/access_source IS DISTINCT FROM 'admin'/.test(fulfillSmoke) || /stay admin/.test(fulfillSmoke));
assert(/amount_or_currency_mismatch/.test(fulfillSmoke));

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

function allowedIsolatedTarget(url) {
  if (!url) return { ok: false, reason: "database URL is required" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "database URL is invalid" };
  }
  const database = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, "");
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, reason: "database URL must use the PostgreSQL protocol" };
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    return { ok: false, reason: `refusing non-local database host: ${parsed.hostname || "(none)"}` };
  }
  if (database !== isolatedDbName && database !== dbName) {
    return { ok: false, reason: `refusing non-isolated database: ${database || "(none)"}` };
  }
  return { ok: true, database, url };
}

function bootstrapSql() {
  return [
    readFileSync(stubPath, "utf8"),
    readFileSync(seedPath, "utf8"),
    readFileSync(join(migrationsDir, foundationName), "utf8"),
    readFileSync(extraStubPath, "utf8"),
    readFileSync(fulfillStubPath, "utf8"),
    readFileSync(join(migrationsDir, schemaName), "utf8"),
    readFileSync(join(migrationsDir, rpcName), "utf8"),
    readFileSync(join(migrationsDir, fulfillName), "utf8"),
    readFileSync(join(migrationsDir, idempotencyName), "utf8"),
    readFileSync(join(migrationsDir, canonicalName), "utf8"),
    readFileSync(canonicalStubPath, "utf8"),
    readFileSync(smokePath, "utf8"),
    readFileSync(fulfillSmokePath, "utf8"),
  ].join("\n");
}

function requiredFilesExist() {
  return [
    stubPath,
    extraStubPath,
    fulfillStubPath,
    canonicalStubPath,
    seedPath,
    smokePath,
    fulfillSmokePath,
    join(migrationsDir, foundationName),
    join(migrationsDir, schemaName),
    join(migrationsDir, rpcName),
    join(migrationsDir, fulfillName),
    join(migrationsDir, idempotencyName),
    join(migrationsDir, canonicalName),
  ].every(existsSync);
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

function runIsolatedViaUrl(databaseUrl) {
  execFileSync(
    "psql",
    [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--set",
      "VERBOSITY=verbose",
      "--dbname",
      databaseUrl,
    ],
    {
      input: bootstrapSql(),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: "5",
        PGPASSWORD: process.env.PGPASSWORD ?? "",
      },
    },
  );
}

function runIsolatedSql() {
  if (!requiredFilesExist()) {
    throw new Error("upgrade checkout SQL fixtures are missing");
  }

  adminSql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  adminSql(`CREATE DATABASE ${dbName};`);
  runPsql(dbName, bootstrapSql());
}

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";
const isolatedMode = process.env.AUDIOLAD_COURSE_UPGRADE_ISOLATED === "1";

if (isolatedMode) {
  if (skipIsolatedSql) {
    throw new Error(
      "course-upgrade-checkout-sql-unit: isolated mode cannot skip executable SQL",
    );
  }
  const target = allowedIsolatedTarget(process.env.AUDIOLAD_COURSE_UPGRADE_DATABASE_URL);
  if (!target.ok) {
    throw new Error(`course-upgrade-checkout-sql-unit: ${target.reason}`);
  }
  if (!requiredFilesExist()) {
    throw new Error("upgrade checkout SQL fixtures are missing");
  }
  runIsolatedViaUrl(target.url);
  console.log(
    `course-upgrade-checkout-sql-unit: parse + executable fulfill SQL ok (${target.database})`,
  );
} else if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  runIsolatedSql();
  console.log("course-upgrade-checkout-sql-unit: parse + isolated sql ok");
} else if (skipIsolatedSql) {
  console.log("course-upgrade-checkout-sql-unit: parse-only ok (isolated SQL disabled)");
} else {
  console.log("course-upgrade-checkout-sql-unit: parse-only ok (no local postgres)");
}

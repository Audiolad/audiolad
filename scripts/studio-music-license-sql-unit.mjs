#!/usr/bin/env node
/**
 * Parse-only + optional isolated Postgres tests for Studio music license PR1.
 * Scratch / local isolated database only. Never writes to production postgres.
 *
 * CI isolated path: AUDIOLAD_STUDIO_MUSIC_ISOLATED=1 + local DATABASE_URL
 * (GitHub Actions postgres:16 service).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const foundationName = "20261003120000_studio_music_entitlements.sql";
const ordersName = "20261003120100_studio_music_license_orders.sql";
const listenerPendingName = "20261003120200_create_practice_order_pending_kind.sql";
const upgradePendingName =
  "20261003120300_create_course_upgrade_order_pending_kind.sql";
const fulfillName = "20261003120400_fulfill_tochka_studio_music_license.sql";
const financeName = "20261003120500_studio_music_canonical_sales.sql";
const orderRevokeName = "20261003120600_studio_music_entitlement_order_revoke.sql";
const previousLatest = "20261002120000_studio_duplicate_project_upload_state_ready.sql";
const stubPath = join(repoRoot, "scripts/lib/studio-music-license-sql-stub.sql");
const smokePath = join(repoRoot, "supabase/tests/studio_music_license_smoke.sql");
const dbName = "audiolad_studio_music_license_test";
const isolatedDbName = "audiolad_studio_music_isolated";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const foundation = readFileSync(join(migrationsDir, foundationName), "utf8");
const orders = readFileSync(join(migrationsDir, ordersName), "utf8");
const listenerPending = readFileSync(join(migrationsDir, listenerPendingName), "utf8");
const upgradePending = readFileSync(join(migrationsDir, upgradePendingName), "utf8");
const fulfill = readFileSync(join(migrationsDir, fulfillName), "utf8");
const finance = readFileSync(join(migrationsDir, financeName), "utf8");
const orderRevoke = readFileSync(join(migrationsDir, orderRevokeName), "utf8");
const smoke = readFileSync(smokePath, "utf8");

assert(existsSync(join(migrationsDir, previousLatest)), "previous latest migration stays intact");
assert(existsSync(join(migrationsDir, foundationName)), "entitlements migration exists");
assert(existsSync(join(migrationsDir, ordersName)), "orders migration exists");
assert(existsSync(join(migrationsDir, listenerPendingName)), "listener pending-kind patch exists");
assert(existsSync(join(migrationsDir, upgradePendingName)), "upgrade pending-kind patch exists");
assert(existsSync(join(migrationsDir, fulfillName)), "fulfill replacement exists");
assert(existsSync(join(migrationsDir, financeName)), "finance helper exists");
assert(existsSync(join(migrationsDir, orderRevokeName)), "order-specific revoke migration exists");
assert(existsSync(stubPath), "isolated stub exists");
assert(existsSync(smokePath), "smoke SQL exists");

const names = readdirSync(migrationsDir).filter((name) =>
  name.toLowerCase().endsWith(".sql"),
);
const versions = names.map((name) => name.match(/^(\d{8,})_/)?.[1]);
assert(new Set(versions).size === versions.length, "no duplicate timestamps");
for (const stamp of [
  "20261003120000",
  "20261003120100",
  "20261003120200",
  "20261003120300",
  "20261003120400",
  "20261003120500",
  "20261003120600",
]) {
  assert(versions.includes(stamp), `${stamp} is listed`);
}

assert(/CREATE TABLE IF NOT EXISTS public\.studio_music_entitlements/.test(foundation));
assert(/grant_source IN \('purchase', 'free', 'owner'\)/.test(foundation));
assert(/studio_music_entitlements_active_user_practice_uidx/.test(foundation));
assert(/revoked_at IS NULL/.test(foundation));
assert(/ON DELETE RESTRICT/.test(foundation));
assert(/can_use_music_in_studio/.test(foundation));
assert(/can_acquire_studio_music/.test(foundation));
assert(/platform_reuse_allowed/.test(foundation));
assert(/is_practice_author_member/.test(foundation));
assert(/grant_studio_music_purchase_entitlement/.test(foundation));
assert(/revoke_studio_music_entitlement_for_order/.test(foundation));
assert(/studio_music_entitlements AS e/.test(foundation));
assert(/practice_is_content_locked_after_sale/.test(foundation));
assert(!/studio_price/.test(foundation));
assert(!/studio_allowed/.test(foundation));
assert(!/DROP TABLE/.test(foundation));
assert(!/TRUNCATE/.test(foundation));
assert(/REVOKE ALL ON TABLE public\.studio_music_entitlements FROM anon, authenticated/.test(foundation));
assert(/GRANT EXECUTE ON FUNCTION public\.grant_studio_music_purchase_entitlement/.test(foundation));
assert(/TO service_role/.test(foundation));

assert(/studio_music_license/.test(orders));
assert(/orders_one_pending_per_user_practice_kind_idx/.test(orders));
assert(/DROP INDEX IF EXISTS public\.orders_one_pending_per_user_practice_idx/.test(orders));
assert(/CREATE OR REPLACE FUNCTION public\.create_studio_music_order/.test(orders));
assert(/CREATE OR REPLACE FUNCTION public\.acquire_free_studio_music/.test(orders));
assert(/v_amount_minor := v_listener_minor \* 2/.test(orders));
assert(/resolve_practice_effective_price/.test(orders));
assert(/already_studio_entitled/.test(orders));
assert(/studio_reuse_not_allowed/.test(orders));
assert(!/INSERT INTO public\.user_practices/.test(orders));
assert(!/RAISE EXCEPTION 'already_owned'/.test(orders));
assert(/GRANT EXECUTE ON FUNCTION public\.create_studio_music_order/.test(orders));
assert(/FROM anon/.test(orders));

assert(/coalesce\(o\.order_kind, 'product_purchase'\) = 'product_purchase'/.test(listenerPending));
assert(/CREATE OR REPLACE FUNCTION public\.create_practice_order/.test(listenerPending));
assert(listenerPending.includes("AND coalesce(o.order_kind, 'product_purchase') = 'product_purchase'"));

assert(/AND o\.order_kind = 'course_upgrade'/.test(upgradePending));
assert(/CREATE OR REPLACE FUNCTION public\.create_course_upgrade_order/.test(upgradePending));

assert(/CREATE OR REPLACE FUNCTION public\.fulfill_tochka_payment_transactional/.test(fulfill));
assert(/grant_studio_music_purchase_entitlement\(v_order\.id\)/.test(fulfill));
assert(/v_order_kind = 'studio_music_license'/.test(fulfill));
assert(/grant_practice_purchase_access\(v_order\.id\)/.test(fulfill));
assert(/grant_practice_access\(/.test(fulfill));
assert(/studio_music_entitlements AS e/.test(fulfill));
assert(!/INSERT INTO public\.user_practices/.test(fulfill));
assert(/service_role only/.test(fulfill));

assert(/studio_music_license/.test(finance));
assert(/course_upgrade/.test(finance));
assert(/access_source = 'purchase'/.test(finance));
assert(/canonical_sale_has_paid_access/.test(finance));

assert(/studio_music_entitlements_order_id_uidx/.test(orderRevoke));
assert(/WHERE e\.order_id = p_order_id/.test(orderRevoke));
assert(/already_revoked/.test(orderRevoke));
assert(/grant_source = 'purchase'/.test(orderRevoke));
assert(!/revoke_studio_music_entitlement\(\s*v_order\.user_id/.test(orderRevoke));
assert(/already_revoked/.test(fulfill));

assert(/studio amount must be 2x/.test(smoke));
assert(/listener purchase must not grant Studio/.test(smoke));
assert(/Studio purchase must not write user_practices/.test(smoke));
assert(/expected one studio entitlement/.test(smoke));
assert(/duplicate webhook created extra entitlement/.test(smoke));
assert(/already_studio_entitled/.test(smoke));
assert(/price change must not revoke/.test(smoke));
assert(/permission flip must not revoke/.test(smoke));
assert(/unpublish must not revoke/.test(smoke));
assert(/new user after permission off/.test(smoke));
assert(/free acquire must not create an order/.test(smoke));
assert(/free entitlement must survive permission off/.test(smoke));
assert(/publication-level/.test(smoke));
assert(/must qualify as canonical sale/.test(smoke));
assert(/listener user_practices regression/.test(smoke));
assert(/fulfill_tochka_payment_transactional\(/.test(smoke));
assert(/no active entitlement from revoked order A/.test(smoke));
assert(/UNIQUE\(order_id\) must reject/.test(smoke));
assert(/duplicate fulfill must not insert a second row/.test(smoke));
assert(/revoke order A must never revoke grant_source=free/.test(smoke));
assert(/new purchase after revoke must create entitlement B/.test(smoke));
assert(/entitlement B must stay active after late revoke of A/.test(smoke));

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
    readFileSync(join(migrationsDir, foundationName), "utf8"),
    readFileSync(join(migrationsDir, ordersName), "utf8"),
    readFileSync(join(migrationsDir, fulfillName), "utf8"),
    readFileSync(join(migrationsDir, financeName), "utf8"),
    readFileSync(join(migrationsDir, orderRevokeName), "utf8"),
    readFileSync(smokePath, "utf8"),
  ].join("\n");
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
  adminSql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  adminSql(`CREATE DATABASE ${dbName};`);
  runPsql(dbName, bootstrapSql());
}

const skipIsolatedSql = process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1";
const isolatedMode = process.env.AUDIOLAD_STUDIO_MUSIC_ISOLATED === "1";

if (isolatedMode) {
  if (skipIsolatedSql) {
    throw new Error(
      "studio-music-license-sql-unit: isolated mode cannot skip executable SQL",
    );
  }
  const target = allowedIsolatedTarget(process.env.AUDIOLAD_STUDIO_MUSIC_DATABASE_URL);
  if (!target.ok) {
    throw new Error(`studio-music-license-sql-unit: ${target.reason}`);
  }
  runIsolatedViaUrl(target.url);
  console.log(
    `studio-music-license-sql-unit: parse + executable SQL ok (${target.database})`,
  );
} else if (!skipIsolatedSql && (dockerAvailable() || localPostgresAvailable())) {
  runIsolatedSql();
  console.log("studio-music-license-sql-unit: parse + isolated sql ok");
} else if (skipIsolatedSql) {
  console.log("studio-music-license-sql-unit: parse-only ok (isolated SQL disabled)");
} else {
  console.log("studio-music-license-sql-unit: parse-only ok (no local postgres)");
}

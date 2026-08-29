#!/usr/bin/env node
/**
 * Executes Product SEO v2 authorization checks only against an explicitly
 * local, disposable PostgreSQL database. It never defaults to or accepts a
 * deployed database.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.AUDIOLAD_PRODUCT_SEO_DATABASE_URL;
const isolatedMode = process.env.AUDIOLAD_PRODUCT_SEO_ISOLATED;
const migrations = [
  join(root, "supabase/tests/product_seo_v2_bootstrap.sql"),
  join(root, "supabase/migrations/20260908120000_product_seo_v2.sql"),
  join(root, "supabase/migrations/20260909090000_harden_product_seo_v2.sql"),
];
const smoke = join(root, "supabase/tests/product_seo_v2_smoke.sql");
const isolatedSmoke = join(root, "supabase/tests/product_seo_v2_isolated.sql");

function allowedTarget(url) {
  if (isolatedMode !== "1") {
    return { ok: false, reason: "AUDIOLAD_PRODUCT_SEO_ISOLATED=1 is required" };
  }
  if (!url) return { ok: false, reason: "database URL is required" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "database URL is invalid" };
  }
  const database = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, "");
  if (
    parsed.protocol !== "postgres:" &&
    parsed.protocol !== "postgresql:"
  ) {
    return { ok: false, reason: "database URL must use the PostgreSQL protocol" };
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    return { ok: false, reason: `refusing non-local database host: ${parsed.hostname || "(none)"}` };
  }
  if (database !== "audiolad_product_seo_isolated") {
    return { ok: false, reason: `refusing non-isolated database: ${database || "(none)"}` };
  }
  return { ok: true, database };
}

function run(sqlPath) {
  const result = spawnSync(
    "psql",
    [
      "--no-psqlrc",
      "--set", "ON_ERROR_STOP=1",
      "--set", "VERBOSITY=verbose",
      "--dbname", databaseUrl,
      "--file", sqlPath,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: "5",
        PGPASSWORD: process.env.PGPASSWORD ?? "",
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const target = allowedTarget(databaseUrl);
if (!target.ok) {
  throw new Error(`product-seo-v2-isolated: ${target.reason}`);
}
if (![...migrations, smoke, isolatedSmoke].every(existsSync)) {
  throw new Error("product SEO v2 migration or isolated smoke file is missing");
}

console.log(`product-seo-v2-isolated: target=${target.database}`);
for (const migration of migrations) run(migration);
run(smoke);
run(isolatedSmoke);
console.log("product-seo-v2-isolated: PASS");

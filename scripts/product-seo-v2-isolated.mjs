#!/usr/bin/env node
/**
 * Executes Product SEO v2 authorization checks only against an explicitly
 * named isolated/test database. It never defaults to a deployed database.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.AUDIOLAD_PRODUCT_SEO_DATABASE_URL;
const allowedDatabase = process.env.AUDIOLAD_PRODUCT_SEO_ALLOW_DB;
const migrations = [
  join(root, "supabase/migrations/20260908120000_product_seo_v2.sql"),
  join(root, "supabase/migrations/20260909090000_harden_product_seo_v2.sql"),
];
const smoke = join(root, "supabase/tests/product_seo_v2_smoke.sql");
const isolatedSmoke = join(root, "supabase/tests/product_seo_v2_isolated.sql");

function allowedTarget(url) {
  if (!url) return { ok: false, reason: "database URL is required" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "database URL is invalid" };
  }
  const database = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, "");
  if (
    !database ||
    database.includes("/") ||
    ["postgres", "template0", "template1", "supabase", "audiolad"].includes(database.toLowerCase()) ||
    /(^|_)(prod|production|stage|staging)(_|$)/i.test(database) ||
    !/(^|_)(isolated|test)(_|$)/i.test(database) ||
    (database !== "audiolad_product_seo_isolated" && database !== allowedDatabase)
  ) {
    return { ok: false, reason: `refusing non-isolated database: ${database || "(none)"}` };
  }
  return { ok: true, database };
}

function run(sqlPath) {
  const result = spawnSync(
    "psql",
    ["--dbname", databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const target = allowedTarget(databaseUrl);
if (!target.ok) {
  console.log(`product-seo-v2-isolated: skipped (${target.reason})`);
  process.exit(0);
}
if (![...migrations, smoke, isolatedSmoke].every(existsSync)) {
  throw new Error("product SEO v2 migration or isolated smoke file is missing");
}

console.log(`product-seo-v2-isolated: target=${target.database}`);
for (const migration of migrations) run(migration);
run(smoke);
run(isolatedSmoke);
console.log("product-seo-v2-isolated: PASS");

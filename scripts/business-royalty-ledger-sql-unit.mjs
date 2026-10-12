#!/usr/bin/env node
/** Business royalty usage+accrual ledger contract (task 0e05333f). SQL smoke only on an explicit isolated test container. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20261229120000_business_royalty_usage_ledger.sql");
const smoke = read("supabase/tests/business_royalty_ledger_smoke.sql");
const sql = migration.replace(/--[^\n]*/g, "");

assert.match(sql, /^\s*BEGIN;[\s\S]*COMMIT;\s*$/);
assert.doesNotMatch(sql, /\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/i, "schema only, no data writes");
assert.doesNotMatch(sql, /ALTER TABLE public\.(?:music_|audio_items|playback_usage|author_)/i, "existing tables untouched");
assert.doesNotMatch(sql, /aurafon|аурафон/i, "no artist-specific rules");
assert.match(sql, /calculation_status IN \('estimated', 'calculated', 'superseded', 'void'\)/);
assert.match(sql, /settlement_mode IN \('payable', 'management'\)/);
assert.match(sql, /payout_status = 'not_payable'\s*OR \(calculation_status = 'calculated' AND settlement_mode = 'payable'\)/);
assert.match(sql, /business_royalty_rate_not_approved/);
assert.match(sql, /business_royalty_accrual_append_only/);
assert.match(sql, /rightsholder_id uuid NOT NULL REFERENCES public\.music_rightsholders/);
for (const t of ["business_service_operators", "business_royalty_rate_models", "business_royalty_periods", "business_royalty_usage", "business_royalty_accruals"]) {
  assert.ok(sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`), `${t} RLS`);
}
for (const fn of sql.matchAll(/CREATE FUNCTION ([\s\S]*?)AS \$\$/g)) assert.ok(fn[1].includes("SET search_path = public, pg_temp"));
for (const s of ["EstimatedNotPayable", "UnapprovedRate", "Immutable", "AppendOnly", "ManagementNeverPayable", "UniversalFormula", "OperatorChange"]) {
  assert.ok(smoke.includes(`${s}:`), `smoke ${s}`);
}
assert.match(smoke, /ROLLBACK;\s*$/);
assert.ok(read("docs/DATABASE.md").includes("20261229120000_business_royalty_usage_ledger.sql"));
assert.equal(JSON.parse(read("package.json")).scripts["test:business-royalty-ledger"], "node scripts/business-royalty-ledger-sql-unit.mjs");
assert.ok(read(".github/workflows/business-pr-validation.yml").includes("AUDIOLAD_SKIP_ISOLATED_SQL=1 npm run test:business-royalty-ledger"));
console.log("business-royalty-ledger-sql-unit: contract ok");

function runIsolatedSql() {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1") return "skipped";
  const container = process.env.AUDIOLAD_BUSINESS_SPA_TEST_CONTAINER?.trim();
  if (process.env.AUDIOLAD_BUSINESS_SPA_ISOLATED_SQL !== "1" || !container) return "no isolated DB opted in";
  assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*-test-db$/, "dedicated test container required");
  const dbName = "audiolad_business_royalty_ledger_test";
  const deps = ["supabase/migrations/20261205120000_music_rights_foundation.sql"].map(read);
  const args = ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
  execFileSync("docker", [...args, "-d", "postgres", "-c", `CREATE DATABASE ${dbName};`], { stdio: "pipe" });
  try {
    execFileSync("docker", [...args, "-d", dbName], { input: [...deps, migration, smoke].join("\n"), stdio: ["pipe", "pipe", "inherit"] });
  } finally {
    execFileSync("docker", [...args, "-d", "postgres", "-c", `DROP DATABASE ${dbName};`], { stdio: "pipe" });
  }
  return "isolated SQL ok";
}
console.log(`business-royalty-ledger-sql-unit: ok (${runIsolatedSql()})`);

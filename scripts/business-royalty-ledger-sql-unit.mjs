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
assert.doesNotMatch(sql.replace(/AS \$\$[\s\S]*?\$\$;/g, ""), /\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/i, "schema only, no data writes outside functions");
assert.doesNotMatch(sql, /ALTER TABLE public\.(?:music_|audio_items|playback_usage|author_)/i, "existing tables untouched");
assert.doesNotMatch(sql, /aurafon|аурафон/i, "no artist-specific rules");
// Final concept 2026-10-12 10:20: per point x calendar month, fund = base x bps, base clamped >= 0.
assert.match(sql, /period_month date NOT NULL UNIQUE CHECK \(extract\(day FROM period_month\) = 1\)/);
assert.match(sql, /greatest\(m\.payments_minor - m\.deductions_minor, 0\)/);
assert.match(sql, /author_fund_minor \+ audiolad_income_minor = base_minor/);
assert.match(sql, /category IN \('sales_tax', 'acquiring_fee', 'direct_point_service_cost'\)/);
assert.doesNotMatch(sql, /'(marketing|development|salar\w*|catalog\w*|infrastructure)'/i, "non-deductible categories absent");
assert.match(sql, /document_reference text NOT NULL/);
assert.match(sql, /allocation_rule IN \('single_point', 'equal', 'weighted', 'fixed_amounts'\)/);
assert.match(sql, /dedup_key text NOT NULL UNIQUE/);
assert.doesNotMatch(sql, /per_minute|revenue_share_pro_rata|location_pool/, "old rate options removed");
assert.match(sql, /'held_no_plays'/);
assert.match(sql, /calculation_state IN \('preliminary', 'approved', 'superseded', 'void'\)/);
assert.match(sql, /payout_state = 'none' OR \(calculation_state = 'approved' AND settlement_mode = 'payable'\)/);
assert.match(sql, /business_royalty_formula_not_approved/);
assert.match(sql, /HAVING sum\(share_bps\) = 10000/, "layer shares sum to 100%, no double minute");
// Review fixes @a84d92d9.
assert.match(sql, /status = 'distributed' AND distributed_minor = author_fund_minor/, "distributed == fund");
assert.ok((sql.match(/row_number\(\) OVER/g) || []).length >= 3, "largest remainder for allocations, deductions, royalties");
assert.match(sql, /business_royalty_accrual_state_transition/);
assert.match(sql, /business_royalty_payout_state_transition/);
assert.match(sql, /business_royalty_accrual_must_start_preliminary/);
assert.match(sql, /business_royalty_reverse_accrual/);
assert.match(sql, /'adjustment'/);
assert.match(sql, /FOR UPDATE;/, "period row lock for run numbering");
assert.match(sql, /business_royalty_allocation_issues/);
assert.match(sql, /'unallocated'/);
assert.match(sql, /single_point_requires_one_point/);
assert.match(sql, /fixed_amounts_sum_mismatch/);
assert.match(sql, /BEFORE TRUNCATE/);
assert.match(sql, /business_royalty_share_overlap/);
// Re-review fixes @c11158de.
assert.match(sql, /reverses_id IS NOT NULL AND calculation_state IN \('preliminary', 'approved'\)/, "partial reverses unique index");
assert.match(sql, /calculation_state = 'preliminary' AND reverses_id IS NULL/, "reversals not superseded");
assert.match(sql, /business_royalty_already_reversed/);
assert.match(sql, /business_royalty_deduction_payment_other_period/);
assert.match(sql, /deduction_payment_other_period/);
assert.match(sql, /business_royalty_share_retroactive_end/);
assert.match(sql, /business_royalty_deduction_status_events/);
for (const t of ["business_royalty_payment_allocations", "business_royalty_track_shares", "business_royalty_periods", "business_service_operators"]) {
  assert.ok(sql.includes(`'${t}'`), `${t} guarded`);
}
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated/);
for (const fn of sql.matchAll(/CREATE FUNCTION ([\s\S]*?)AS \$\$/g)) assert.ok(fn[1].includes("SET search_path = public, pg_temp"));
for (const s of ["ExactExample", "Offline", "Dedup", "NotAdmitted", "Layers", "Management", "History", "SharedPayment", "MultiPoint", "Refunds", "NegativeClamp", "NoPlays", "Rounding", "StateMachine", "RecalcAfterApproval", "Reversal", "AppendOnly", "Allocation", "MidMonthShare", "DeductionRounding", "RunNumbering", "ReversalSurvivesRecalc", "ReversalRepeatable", "NoReaccrue", "ClosedPeriodUpdate", "DeductionOtherPeriod", "ShareRetroEnd", "ReversalFormula"]) {
  assert.ok(smoke.includes(`${s}:`), `smoke ${s}`);
}
for (const v of ["100000", "10000", "90000", "45000", "13500", "18000"]) assert.ok(smoke.includes(v), `exact example ${v}`);
assert.ok(read("scripts/database-migrations-compile-isolated.mjs").includes("supabase/tests/business_royalty_ledger_smoke.sql"), "smoke runs in real compile CI");
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

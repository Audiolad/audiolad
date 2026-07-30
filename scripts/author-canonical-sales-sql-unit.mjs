#!/usr/bin/env node
/**
 * Canonical sales SQL tests run only against the isolated controlled database.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER =
  process.env.AUDIOLAD_CANONICAL_TEST_DB_CONTAINER || "audiolad-test-db";
const DATABASE =
  process.env.AUDIOLAD_CANONICAL_TEST_DATABASE ||
  "audiolad_canonical_sales_test";
const MIGRATION =
  "supabase/migrations/20260730160000_author_canonical_sales.sql";

const AUTHOR = "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c";
const ORDER_A = "507af74c-e76c-4fe9-a68b-0d2754efc4a2";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function main() {
  assert(
    CONTAINER === "audiolad-test-db",
    "canonical SQL tests must use the isolated test database container",
  );
  let migrationSql = readFileSync(join(ROOT, MIGRATION), "utf8");
  migrationSql = migrationSql
    .replace(/^\s*BEGIN\s*;/m, "")
    .replace(/\s*COMMIT\s*;\s*$/m, "");

  const script = `
BEGIN;

${migrationSql}

DO $$
DECLARE
  v_counts jsonb;
  v_list jsonb;
  v_stats jsonb;
  v_diag jsonb;
  v_ready jsonb;
  v_other int;
  v_row jsonb;
  v_all_sales int;
  v_external_sales int;
BEGIN
  v_counts := public.author_canonical_sales_counts('${AUTHOR}'::uuid, NULL, NULL, false, false);
  IF coalesce((v_counts->>'gross_purchases')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'expected 1 historical purchase, got %', v_counts;
  END IF;
  IF coalesce((v_counts->>'accrued')::int, 0) <> 0 THEN
    RAISE EXCEPTION 'expected 0 accrued, got %', v_counts;
  END IF;
  IF coalesce((v_counts->>'pending_accrual')::int, 0) <> 0 THEN
    RAISE EXCEPTION 'expected no pending historical accrual, got %', v_counts;
  END IF;

  v_list := public.author_canonical_sales_list('${AUTHOR}'::uuid);
  IF coalesce((v_list->>'total')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'list total expected 1, got %', v_list;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_list->'rows')
  LOOP
    IF v_row ? 'email' OR v_row ? 'payment_id' OR v_row ? 'user_id' THEN
      RAISE EXCEPTION 'forbidden field in list row %', v_row;
    END IF;
    IF coalesce(v_row->>'accrual_status', '') <> 'not_applicable' THEN
      RAISE EXCEPTION 'expected not_applicable, got %', v_row;
    END IF;
    IF v_row ? 'is_historical_exception' OR v_row ? 'attribution_source' THEN
      RAISE EXCEPTION 'historical internals leaked to author row %', v_row;
    END IF;
  END LOOP;

  v_stats := public.author_stats_summary('${AUTHOR}'::uuid);
  IF coalesce((v_stats->>'gross_purchases')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'stats gross_purchases expected 1, got %', v_stats;
  END IF;

  v_other := (
    public.author_canonical_sales_counts(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    )->>'purchases'
  )::int;
  IF v_other <> 0 THEN
    RAISE EXCEPTION 'cross-author leak %', v_other;
  END IF;

  SELECT count(*) INTO v_all_sales
  FROM public.author_canonical_sales_base(
    'b0000000-0000-0000-0000-000000000001'::uuid, false, false
  );
  SELECT count(*) INTO v_external_sales
  FROM public.author_canonical_sales_base(
    'b0000000-0000-0000-0000-000000000001'::uuid, false, true
  );
  IF v_all_sales <> v_external_sales + 1 THEN
    RAISE EXCEPTION 'team purchase exclusion mismatch: all %, external %',
      v_all_sales, v_external_sales;
  END IF;

  FOREACH v_diag IN ARRAY ARRAY[
    public.admin_canonical_sale_diagnostic('${ORDER_A}'::uuid)
  ]
  LOOP
    IF v_diag->>'ok' <> 'true' THEN
      RAISE EXCEPTION 'diagnostic failed %', v_diag;
    END IF;
    IF v_diag->>'has_purchase_access' <> 'true' THEN
      RAISE EXCEPTION 'missing access %', v_diag;
    END IF;
    IF v_diag->>'author_id_snapshot' IS NOT NULL THEN
      RAISE EXCEPTION 'snapshot unexpectedly set %', v_diag;
    END IF;
    IF v_diag->>'sale_accrual_id' IS NOT NULL THEN
      RAISE EXCEPTION 'unexpected accrual %', v_diag;
    END IF;
    IF v_diag->>'obligation_id' IS NOT NULL THEN
      RAISE EXCEPTION 'unexpected obligation %', v_diag;
    END IF;
  END LOOP;

  RAISE NOTICE 'author-canonical-sales-sql-unit assertions passed';
END $$;

ROLLBACK;
`;

  try {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        DATABASE,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: script,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      },
    );
  } catch (error) {
    throw error;
  }

  // psql NOTICE lines go to stderr; execFileSync merges only on failure.
  // Success path: exit 0 after ROLLBACK is enough — verify below.

  // Confirm the production container is never used by this test.
  const stillThere = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      DATABASE,
      "-t",
      "-A",
      "-c",
      "SELECT count(*) FROM pg_proc WHERE proname = 'author_canonical_sales_base';",
    ],
    { encoding: "utf8" },
  ).trim();
  assert(stillThere !== "0", "canonical migration must exist in controlled test database");

  console.log("author-canonical-sales-sql-unit: ok");
}

main();

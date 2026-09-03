#!/usr/bin/env node
/**
 * Isolated scratch-DB tests for author-appreciation finance projection.
 * Never touches production. Uses the same docker/psql contract as p332–p334.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_author_appreciation_finance_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const STAFF = "d9999999-9999-9999-9999-999999999999";
const AUTHOR_PAYEE = "a1111111-1111-1111-1111-111111111111";
const AUTHOR_NO_TERMS = "a3333333-3333-3333-3333-333333333333";
const AUTHOR_INELIGIBLE = "a4444444-4444-4444-4444-444444444444";
const PRACTICE_PAYEE = "c1111111-1111-1111-1111-111111111111";
const TERMS_FROM = "2026-01-01T00:00:00Z";
const OFFER_ID = "offer-appreciation";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}
function psql(database, sql, { tuples = false } = {}) {
  const args = [
    "exec", "-i", CONTAINER, "psql", "-U", "postgres",
    "-d", database, "-v", "ON_ERROR_STOP=1",
  ];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}
function psqlFile(database, absolutePath) {
  return execFileSync(
    "docker",
    [
      "exec", "-i", CONTAINER, "psql", "-U", "postgres",
      "-d", database, "-v", "ON_ERROR_STOP=1",
    ],
    {
      encoding: "utf8",
      input: readFileSync(absolutePath, "utf8"),
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}
function scalar(sql) {
  return psql(TEST_DB, sql, { tuples: true }).trim();
}
function number(sql) {
  return Number.parseInt(scalar(sql), 10);
}
function json(sql) {
  return JSON.parse(scalar(sql));
}

function bootstrap() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  psql(
    TEST_DB,
    `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END
$roles$;
CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  access_status text NOT NULL DEFAULT 'free'
);
CREATE TABLE public.practices (
  id uuid PRIMARY KEY, author_id uuid REFERENCES public.authors(id),
  title text NOT NULL, slug text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'published',
  price integer NOT NULL DEFAULT 299, is_free boolean NOT NULL DEFAULT false
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  status text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  practice_title_snapshot text NOT NULL,
  practice_slug_snapshot text NOT NULL,
  price_minor_snapshot bigint NOT NULL,
  author_id_snapshot uuid NULL REFERENCES public.authors(id),
  is_test boolean NOT NULL DEFAULT false,
  test_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  provider text NOT NULL DEFAULT 'tochka',
  provider_payment_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_test boolean NOT NULL DEFAULT false,
  test_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL
);
CREATE TABLE public.user_practices (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  access_source text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, practice_id)
);
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  user_id uuid,
  practice_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.platform_permissions (code text PRIMARY KEY, description text);
CREATE TABLE public.platform_role_permissions (
  role_code text NOT NULL,
  permission_code text NOT NULL,
  PRIMARY KEY (role_code, permission_code)
);

INSERT INTO auth.users VALUES
  ('${USER_A}', 'a@example.com'),
  ('${STAFF}', 'staff@example.com');
INSERT INTO public.authors (id, name, slug, access_status) VALUES
  ('${AUTHOR_PAYEE}', 'External Payee', 'external-payee', 'commercial'),
  ('${AUTHOR_NO_TERMS}', 'No Terms', 'no-terms', 'commercial'),
  ('${AUTHOR_INELIGIBLE}', 'Ineligible', 'ineligible', 'commercial');
INSERT INTO public.practices VALUES
  ('${PRACTICE_PAYEE}', '${AUTHOR_PAYEE}', 'Payee Practice', 'payee-practice', 'published', 299, true);
`,
  );

  for (const file of [
    "supabase/migrations/20260725192000_admin_payments_p31_money.sql",
    "supabase/migrations/20260725192100_admin_payments_p31_authors_products_fix.sql",
    "supabase/migrations/20260726120000_payments_p331_refund_facts.sql",
    "supabase/migrations/20260726140000_payments_p332_author_ledger.sql",
    "supabase/migrations/20260728180000_author_share_rounding_up.sql",
    "supabase/migrations/20260727120000_payments_p333_author_payouts.sql",
    "supabase/migrations/20260727140000_payments_p334_author_finance.sql",
    "supabase/migrations/20260728160000_author_finance_empty_state_access_status.sql",
    "supabase/migrations/20260728170000_author_finance_author_terms_empty_state.sql",
    "supabase/migrations/20260916120000_author_appreciation_getcourse_intents.sql",
    "supabase/migrations/20260917120000_author_appreciation_finance_projection.sql",
    "supabase/migrations/20260918120000_author_appreciation_finance_projection_status.sql",
  ]) {
    psqlFile(TEST_DB, join(ROOT, file));
  }

  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_PAYEE}';`);
  json(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_PAYEE}'::uuid, 7000, '${TERMS_FROM}'::timestamptz, NULL, 14, 'RUB',
      NULL, '${STAFF}'::uuid, 'aa-terms-payee', true
    );`,
  );
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_NO_TERMS}';`);
}

function insertIntent({
  id,
  authorId = AUTHOR_PAYEE,
  status = "pending",
  amount = 50000,
  dealId,
  paidAtSql = "NULL",
  projection = "pending",
}) {
  psql(
    TEST_DB,
    `
INSERT INTO author_appreciation_payment_intents (
  id, author_id, practice_id, surface, user_id, email, source_title, source_path,
  amount_minor, currency, status, provider, provider_deal_id, provider_deal_number,
  local_deal_number, idempotency_key, provider_metadata, paid_at, finance_projection_status
) VALUES (
  '${id}', '${authorId}', '${PRACTICE_PAYEE}', 'product', '${USER_A}',
  'listener@example.com', 'Payee Practice', '/a/payee-practice',
  ${amount}, 'RUB', '${status}', 'getcourse', '${dealId}', 'dn-${dealId}',
  'aa-${id}', 'idem-${id}', jsonb_build_object('offer_id', '${OFFER_ID}'),
  ${paidAtSql}, '${projection}'
);
`,
  );
}

function callback(dealId, amount = 50000) {
  return json(
    `SELECT row_to_json(t) FROM public.apply_author_appreciation_getcourse_callback(
      '${dealId}', 'dn-${dealId}', '${OFFER_ID}', ${amount}, 'payed', ${amount}, 0
    ) AS t;`,
  );
}

function intentRow(id) {
  return json(
    `SELECT row_to_json(i) FROM author_appreciation_payment_intents i WHERE id = '${id}';`,
  );
}

function accrualCount(intentId) {
  return number(
    `SELECT count(*)::int FROM author_ledger_entries
     WHERE author_appreciation_intent_id = '${intentId}' AND entry_type = 'sale_accrual';`,
  );
}

function reconcile() {
  return json(`SELECT public.reconcile_author_appreciation_paid_intents(100);`);
}

function testPaidSuccessfulProjectionOneAccrual() {
  const id = "11111111-1111-4111-8111-111111111111";
  insertIntent({ id, dealId: "deal-ok" });
  const paid = callback("deal-ok");
  assertEqual(paid.outcome, "paid", "successful callback outcome");
  const row = intentRow(id);
  assertEqual(row.status, "paid", "provider paid fact");
  assertEqual(row.finance_projection_status, "projected", "projection successful");
  assertEqual(accrualCount(id), 1, "exactly one accrual");
}

function testPaidRequiresReviewNotSilent() {
  const id = "22222222-2222-4222-8222-222222222222";
  insertIntent({ id, authorId: AUTHOR_NO_TERMS, dealId: "deal-no-terms" });
  const paid = callback("deal-no-terms");
  assertEqual(paid.outcome, "paid_needs_review", "callback does not silent-succeed");
  const row = intentRow(id);
  assertEqual(row.status, "paid", "provider paid fact preserved");
  assert(row.status !== "failed", "must not rewrite paid to failed");
  assertEqual(row.finance_projection_status, "needs_review", "explicit finance failure");
  assertEqual(row.finance_projection_result_code, "no_active_terms", "review reason");
  assertEqual(accrualCount(id), 0, "no silent accrual");
}

function testIneligibleAuthorExplicitReview() {
  const id = "33333333-3333-4333-8333-333333333333";
  insertIntent({ id, authorId: AUTHOR_INELIGIBLE, dealId: "deal-ineligible" });
  const paid = callback("deal-ineligible");
  assertEqual(paid.outcome, "paid_needs_review", "ineligible is not silent success");
  const row = intentRow(id);
  assertEqual(row.status, "paid", "provider paid preserved");
  assertEqual(row.finance_projection_status, "needs_review", "explicit review");
  assertEqual(row.finance_projection_result_code, "author_not_payout_eligible", "ineligible code");
  assertEqual(accrualCount(id), 0, "no accrual while ineligible");
}

function testReconciliationLaterSucceedsOnce() {
  const id = "22222222-2222-4222-8222-222222222222";
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_NO_TERMS}';`);
  json(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_NO_TERMS}'::uuid, 7000, '${TERMS_FROM}'::timestamptz, NULL, 14, 'RUB',
      NULL, '${STAFF}'::uuid, 'aa-terms-no-terms', true
    );`,
  );
  const first = reconcile();
  assert(first.created >= 1, `later reconcile creates accrual, got ${JSON.stringify(first)}`);
  assertEqual(accrualCount(id), 1, "one accrual after cause fixed");
  const row = intentRow(id);
  assertEqual(row.status, "paid", "still provider paid");
  assertEqual(row.finance_projection_status, "projected", "now projected");
  const second = reconcile();
  assertEqual(second.created, 0, "second reconcile creates nothing");
  assertEqual(accrualCount(id), 1, "still one accrual");
}

function testCallbackDuplicateOneAccrual() {
  const id = "11111111-1111-4111-8111-111111111111";
  const again = callback("deal-ok");
  assert(
    again.outcome === "already_paid" || again.outcome === "already_paid_needs_review",
    `duplicate callback outcome, got ${again.outcome}`,
  );
  assertEqual(accrualCount(id), 1, "duplicate callback still one accrual");
}

function testPendingAndFailedNeverAccrue() {
  const pendingId = "44444444-4444-4444-8444-444444444444";
  const failedId = "55555555-5555-4555-8555-555555555555";
  insertIntent({ id: pendingId, dealId: "deal-pending", status: "pending" });
  insertIntent({ id: failedId, dealId: "deal-failed", status: "failed" });
  const before = number(
    `SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'sale_accrual';`,
  );
  reconcile();
  json(
    `SELECT public.ensure_author_appreciation_sale_accrual('${pendingId}'::uuid);`,
  );
  json(
    `SELECT public.ensure_author_appreciation_sale_accrual('${failedId}'::uuid);`,
  );
  assertEqual(accrualCount(pendingId), 0, "pending never accrues");
  assertEqual(accrualCount(failedId), 0, "failed never accrues");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'sale_accrual';`),
    before,
    "non-paid intents add no accruals",
  );
}

function testHistoricalPaidBackfill() {
  const id = "66666666-6666-4666-8666-666666666666";
  insertIntent({
    id,
    dealId: "deal-historical",
    status: "paid",
    paidAtSql: "'2026-09-01T12:00:00Z'",
    projection: "pending",
  });
  assertEqual(accrualCount(id), 0, "historical paid starts unprojected");
  const result = reconcile();
  assert(result.created >= 1, "backfill/reconcile projects historical paid");
  const row = intentRow(id);
  assertEqual(row.status, "paid", "historical paid preserved");
  assertEqual(row.finance_projection_status, "projected", "historical now projected");
  assertEqual(accrualCount(id), 1, "exactly one historical accrual");
  const again = reconcile();
  assertEqual(again.created, 0, "historical replay creates nothing");
  assertEqual(accrualCount(id), 1, "historical still one accrual");
}

function testUnprojectedPaidSelectable() {
  const ineligibleId = "33333333-3333-4333-8333-333333333333";
  const selectable = number(
    `SELECT count(*)::int FROM author_appreciation_payment_intents i
     WHERE i.status = 'paid'
       AND (
         i.finance_projection_status IS DISTINCT FROM 'projected'
         OR NOT EXISTS (
           SELECT 1 FROM author_ledger_entries e
           WHERE e.author_appreciation_intent_id = i.id
             AND e.entry_type = 'sale_accrual'
         )
       );`,
  );
  assertEqual(selectable, 1, "ineligible paid stays selectable for reconcile");
  const row = intentRow(ineligibleId);
  assertEqual(row.status, "paid", "ineligible provider paid preserved");
  assertEqual(row.finance_projection_status, "needs_review", "still explicit review");
  assertEqual(accrualCount(ineligibleId), 0, "still no accrual");
  const again = reconcile();
  assertEqual(again.created, 0, "retry without eligibility creates nothing");
  assertEqual(accrualCount(ineligibleId), 0, "still no accrual after retry");
  assertEqual(intentRow(ineligibleId).status, "paid", "paid fact still preserved");
}

bootstrap();
testPaidSuccessfulProjectionOneAccrual();
testPaidRequiresReviewNotSilent();
testIneligibleAuthorExplicitReview();
testReconciliationLaterSucceedsOnce();
testCallbackDuplicateOneAccrual();
testPendingAndFailedNeverAccrue();
testHistoricalPaidBackfill();
testUnprojectedPaidSelectable();

psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
console.log("author-appreciation-finance-sql-unit: ok");

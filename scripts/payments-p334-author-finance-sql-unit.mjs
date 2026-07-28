#!/usr/bin/env node
/**
 * P3.3.4 author finance cabinet SQL tests on an isolated scratch database.
 *
 * Never touches the production database. The fixtures walk one author through
 * the whole money lifecycle — accrual, hold, refund, reservation, payout — and
 * assert at every step that the cabinet agrees with the P3.3.2 balance and the
 * P3.3.3 payable snapshot, that it shows one author nothing about another, and
 * that it writes nothing at all.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_payments_p334_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";
const STAFF = "d9999999-9999-9999-9999-999999999999";

/** Payout-eligible external author with approved 70/30 terms and real money. */
const AUTHOR_PAYEE = "a1111111-1111-1111-1111-111111111111";
/** Free account: never a payee. */
const AUTHOR_FREE = "a2222222-2222-2222-2222-222222222222";
/** Commercial application in review. */
const AUTHOR_PENDING = "a3333333-3333-3333-3333-333333333333";
/** access_status = commercial but platform-owned: still not a payee. */
const AUTHOR_PLATFORM = "a4444444-4444-4444-4444-444444444444";
/** Payout-eligible but nobody agreed terms yet. */
const AUTHOR_NO_TERMS = "a5555555-5555-5555-5555-555555555555";
/** Payout-eligible, money still inside its hold window. */
const AUTHOR_HELD = "a6666666-6666-6666-6666-666666666666";
/** Payout-eligible, balance below the 1000 RUB minimum. */
const AUTHOR_SMALL = "a7777777-7777-7777-7777-777777777777";
/** commercial_active, payout_eligible still false, no sales (German-like). */
const AUTHOR_ACTIVE_NOT_PAYEE = "a8888888-8888-8888-8888-888888888888";
/** commercial_onboarding, not yet a payee. */
const AUTHOR_ONBOARDING = "a9999999-9999-4999-8999-999999999999";

const PRACTICE_PAYEE = "c1111111-1111-1111-1111-111111111111";
const PRACTICE_HELD = "c6666666-6666-6666-6666-666666666666";
const PRACTICE_SMALL = "c7777777-7777-7777-7777-777777777777";
const PRACTICE_PLATFORM = "c4444444-4444-4444-4444-444444444444";

const TERMS_FROM = "2026-01-01T00:00:00Z";
/** Old enough that the 14 day hold has long expired relative to now(). */
const OLD_SALE_AT = "2026-02-10T10:00:00Z";

const MIGRATION =
  "supabase/migrations/20260727140000_payments_p334_author_finance.sql";
const EMPTY_STATE_MIGRATION =
  "supabase/migrations/20260728160000_author_finance_empty_state_access_status.sql";
const AUTHOR_TERMS_EMPTY_STATE_MIGRATION =
  "supabase/migrations/20260728170000_author_finance_author_terms_empty_state.sql";

/**
 * Every JSON key the author API must never return. Checked against the actual
 * payloads, not against the source, so a projection change cannot pass by
 * editing a comment.
 */
const FORBIDDEN_KEYS = [
  "payment_id",
  "refund_id",
  "order_id",
  "terms_id",
  "payout_id_raw",
  "calculation_snapshot",
  "reason_code",
  "notes",
  "created_by",
  "approved_by",
  "paid_by",
  "reversed_by",
  "failure_code",
  "failure_reason",
  "review_reason",
  "cancel_reason",
  "reversal_reason",
  "minimum_override_reason",
  "external_reference",
  "idempotency_key",
  "correlation_id",
  "user_id",
  "buyer_id",
  "provider",
  "entry_type",
  "ledger_entry_id",
  "reversal_ledger_entry_id",
];

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
function text(sql) {
  return scalar(sql);
}
function json(sql) {
  return JSON.parse(scalar(sql));
}
function expectError(sql, expectedFragment, label) {
  let failed = false;
  try {
    psql(TEST_DB, sql, { tuples: true });
  } catch (error) {
    failed = true;
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
    assert(
      output.includes(expectedFragment),
      `${label}: expected error containing "${expectedFragment}", got ${output.slice(0, 400)}`,
    );
  }
  assert(failed, `${label}: expected failure but statement succeeded`);
}

// ---------------------------------------------------------------------------

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
  ('${USER_B}', 'b@example.com'),
  ('${STAFF}', 'staff@example.com');

INSERT INTO public.authors (id, name, slug, access_status) VALUES
  ('${AUTHOR_PAYEE}', 'External Payee', 'external-payee', 'commercial'),
  ('${AUTHOR_FREE}', 'Free Author', 'free-author', 'free'),
  ('${AUTHOR_PENDING}', 'Pending Author', 'pending-author', 'commercial_pending'),
  ('${AUTHOR_PLATFORM}', 'Platform Catalog', 'platform-catalog', 'commercial'),
  ('${AUTHOR_NO_TERMS}', 'No Terms', 'no-terms', 'commercial'),
  ('${AUTHOR_HELD}', 'Held Balance', 'held-balance', 'commercial'),
  ('${AUTHOR_SMALL}', 'Small Balance', 'small-balance', 'commercial'),
  ('${AUTHOR_ACTIVE_NOT_PAYEE}', 'Active Not Payee', 'active-not-payee', 'commercial_active'),
  ('${AUTHOR_ONBOARDING}', 'Onboarding Author', 'onboarding-author', 'commercial_onboarding');

INSERT INTO public.practices VALUES
  ('${PRACTICE_PAYEE}', '${AUTHOR_PAYEE}', 'Payee Practice', 'payee-practice', 'published', 299, false),
  ('${PRACTICE_PLATFORM}', '${AUTHOR_PLATFORM}', 'Platform Practice', 'platform-practice', 'published', 299, false),
  ('${PRACTICE_HELD}', '${AUTHOR_HELD}', 'Held Practice', 'held-practice', 'published', 299, false),
  ('${PRACTICE_SMALL}', '${AUTHOR_SMALL}', 'Small Practice', 'small-practice', 'published', 299, false);
`,
  );

  for (const file of [
    "supabase/migrations/20260725192000_admin_payments_p31_money.sql",
    "supabase/migrations/20260725192100_admin_payments_p31_authors_products_fix.sql",
    "supabase/migrations/20260726120000_payments_p331_refund_facts.sql",
    "supabase/migrations/20260726140000_payments_p332_author_ledger.sql",
    "supabase/migrations/20260727120000_payments_p333_author_payouts.sql",
    MIGRATION,
    EMPTY_STATE_MIGRATION,
    AUTHOR_TERMS_EMPTY_STATE_MIGRATION,
  ]) {
    psqlFile(TEST_DB, join(ROOT, file));
  }
}

function insertPayment({
  id,
  userId,
  practiceId,
  authorSnapshot,
  title = "Практика автора",
  amount,
  confirmedAtSql,
}) {
  const orderId = id.replace(/^22/, "11");
  psql(
    TEST_DB,
    `
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
  author_id_snapshot, is_test, paid_at, created_at
) VALUES (
  '${orderId}', '${userId}', '${practiceId}', 'paid', ${amount}, 'RUB',
  '${title}', 'snap-${orderId}', ${amount},
  '${authorSnapshot}', false, ${confirmedAtSql}, ${confirmedAtSql}
);
INSERT INTO payments (
  id, order_id, provider, provider_payment_id, idempotency_key, status,
  amount_minor, currency, is_test, confirmed_at, created_at
) VALUES (
  '${id}', '${orderId}', 'tochka', 'op-${id}', 'idem-${id}', 'succeeded',
  ${amount}, 'RUB', false, ${confirmedAtSql}, ${confirmedAtSql}
);
INSERT INTO user_practices (user_id, practice_id, access_source, granted_at)
VALUES ('${userId}', '${practiceId}', 'purchase', ${confirmedAtSql})
ON CONFLICT DO NOTHING;
`,
  );
  return { paymentId: id, orderId };
}

function enablePayouts(authorId) {
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${authorId}';`);
}

function approveTerms(authorId, shareBps, holdDays, correlation) {
  return json(
    `SELECT public.create_author_commercial_terms_draft(
      '${authorId}'::uuid, ${shareBps}, '${TERMS_FROM}'::timestamptz, NULL, ${holdDays}, 'RUB',
      NULL, '${STAFF}'::uuid, '${correlation}', true
    );`,
  ).terms_id;
}

function accrue(paymentId, correlation) {
  return json(
    `SELECT public.ensure_author_sale_accrual('${paymentId}'::uuid, '${correlation}', NULL);`,
  );
}

function summary(authorId, includeTest = false) {
  return json(
    `SELECT public.author_finance_p334_summary('${authorId}'::uuid, ${includeTest});`,
  );
}
function balance(authorId, includeTest = false) {
  return json(
    `SELECT public.author_finance_balance('${authorId}'::uuid, ${includeTest});`,
  );
}
function payableSnapshot(authorId, includeTest = false) {
  return json(
    `SELECT public.author_payout_payable_snapshot(
      '${authorId}'::uuid, now(), ${includeTest}, NULL
    );`,
  );
}
function ledger(authorId, options = {}) {
  const {
    from = null, to = null, type = null, search = null,
    limit = 100, offset = 0, includeTest = false,
  } = options;
  return json(
    `SELECT public.author_finance_p334_ledger(
      '${authorId}'::uuid,
      ${from ? `'${from}'::timestamptz` : "NULL"},
      ${to ? `'${to}'::timestamptz` : "NULL"},
      ${type ? `'${type}'` : "NULL"},
      ${search ? `'${search}'` : "NULL"},
      ${limit}, ${offset}, ${includeTest}
    );`,
  );
}
function ledgerDetail(authorId, entryId) {
  return json(
    `SELECT public.author_finance_p334_ledger_detail('${authorId}'::uuid, '${entryId}'::uuid);`,
  );
}
function payouts(authorId, options = {}) {
  const { status = null, limit = 100, offset = 0, includeTest = false } = options;
  return json(
    `SELECT public.author_finance_p334_payouts(
      '${authorId}'::uuid, NULL, NULL,
      ${status ? `'${status}'` : "NULL"}, ${limit}, ${offset}, ${includeTest}
    );`,
  );
}
function payoutDetail(authorId, payoutId) {
  return json(
    `SELECT public.author_finance_p334_payout_detail('${authorId}'::uuid, '${payoutId}'::uuid);`,
  );
}
function integritySnapshot(includeTest = false) {
  return json(
    `SELECT public.admin_author_finance_p334_integrity_snapshot(${includeTest});`,
  );
}

function assertNoForbiddenKeys(payload, label) {
  const seen = new Set();

  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        seen.add(key);
        walk(value);
      }
    }
  };

  walk(payload);

  for (const forbidden of FORBIDDEN_KEYS) {
    assert(!seen.has(forbidden), `${label}: must not expose "${forbidden}"`);
  }
}

/** Row counts of everything the earlier phases own, for a no-write proof. */
function phaseRowCounts() {
  return {
    orders: number(`SELECT count(*)::int FROM orders;`),
    payments: number(`SELECT count(*)::int FROM payments;`),
    refunds: number(`SELECT count(*)::int FROM payment_refunds;`),
    terms: number(`SELECT count(*)::int FROM author_commercial_terms;`),
    ledger: number(`SELECT count(*)::int FROM author_ledger_entries;`),
    obligations: number(`SELECT count(*)::int FROM finance_obligations;`),
    payouts: number(`SELECT count(*)::int FROM author_payouts;`),
    allocations: number(`SELECT count(*)::int FROM author_payout_allocations;`),
    audit: number(`SELECT count(*)::int FROM finance_audit_log;`),
    eligible: number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`),
  };
}

// ---------------------------------------------------------------------------

function testMigrationSeedsNothing() {
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries;`),
    0,
    "the migration writes no ledger row",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_payouts;`),
    0,
    "the migration writes no payout",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_commercial_terms;`),
    0,
    "the migration writes no terms",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`),
    0,
    "the migration makes nobody a payee",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE access_status = 'commercial';`),
    5,
    "access_status is untouched",
  );
}

function testVocabulary() {
  for (const [entryType, expected] of [
    ["sale_accrual", "sale"],
    ["refund_reversal", "refund"],
    ["manual_credit", "adjustment_credit"],
    ["manual_debit", "adjustment_debit"],
    ["correction", "correction"],
    ["chargeback_reversal", "chargeback"],
    ["payout", "payout"],
    ["payout_reversal", "payout_reversal"],
  ]) {
    assertEqual(
      text(`SELECT public.author_finance_p334_type_key('${entryType}');`),
      expected,
      `type key for ${entryType}`,
    );
  }

  for (const [status, expected] of [
    ["draft", "preparing"],
    ["approved", "preparing"],
    ["processing", "processing"],
    ["paid", "paid"],
    ["failed", "delayed"],
    ["cancelled", "cancelled"],
    ["requires_review", "on_review"],
    ["reversed", "reversed"],
  ]) {
    assertEqual(
      text(`SELECT public.author_finance_p334_payout_status_key('${status}');`),
      expected,
      `payout status key for ${status}`,
    );
  }

  // Masking never returns the raw value and never returns more than the tail.
  assertEqual(
    text(`SELECT coalesce(public.author_finance_p334_mask_reference(NULL), 'NULL');`),
    "NULL",
    "nothing to mask",
  );
  assertEqual(
    text(`SELECT public.author_finance_p334_mask_reference('PO-2026-07-000481');`),
    "•••0481",
    "a long reference keeps only its tail",
  );
  assertEqual(
    text(`SELECT public.author_finance_p334_mask_reference('1234');`),
    "••••",
    "a short reference is fully hidden",
  );
}

/** Every ineligible shape reports the state that explains itself. */
function testEmptyStatesBeforeMoney() {
  assertEqual(
    summary(AUTHOR_FREE).empty_state_code,
    "not_payout_eligible_free",
    "a free author",
  );
  assertEqual(
    summary(AUTHOR_PENDING).empty_state_code,
    "not_payout_eligible_pending",
    "a pending commercial application",
  );
  assertEqual(
    summary(AUTHOR_PLATFORM).empty_state_code,
    "not_payout_eligible_commercial",
    "commercial access is not payout eligibility",
  );
  assertEqual(
    summary(AUTHOR_ACTIVE_NOT_PAYEE).empty_state_code,
    "no_sales",
    "commercial_active without finance terms stays operational",
  );
  assert(
    summary(AUTHOR_ACTIVE_NOT_PAYEE).empty_state_code !==
      "not_payout_eligible_free",
    "commercial_active never maps to free empty state",
  );
  assertEqual(
    summary(AUTHOR_ONBOARDING).empty_state_code,
    "commercial_onboarding_incomplete",
    "onboarding has a dedicated empty state",
  );

  enablePayouts(AUTHOR_NO_TERMS);
  assertEqual(
    summary(AUTHOR_NO_TERMS).empty_state_code,
    "terms_missing",
    "a payee without agreed terms",
  );

  enablePayouts(AUTHOR_PAYEE);
  approveTerms(AUTHOR_PAYEE, 7000, 14, "corr-terms-payee");
  assertEqual(
    summary(AUTHOR_PAYEE).empty_state_code,
    "no_sales",
    "terms agreed but nothing sold yet",
  );

  const empty = summary(AUTHOR_FREE);
  assertEqual(empty.accrued_minor, 0, "no money for a free author");
  assertEqual(empty.payable_minor, 0, "and nothing payable");
  assertEqual(empty.terms_status, "missing", "and no terms");
  assertEqual(empty.active_terms_summary, null, "and no terms summary");
}

function testHeldOnly() {
  enablePayouts(AUTHOR_HELD);
  approveTerms(AUTHOR_HELD, 7000, 14, "corr-terms-held");

  // Confirmed yesterday with a 14 day hold: still inside the window now().
  const payment = insertPayment({
    id: "22222222-0000-0000-0000-000000000601",
    userId: USER_A,
    practiceId: PRACTICE_HELD,
    authorSnapshot: AUTHOR_HELD,
    amount: 200000,
    confirmedAtSql: "now() - interval '1 day'",
  });
  assertEqual(accrue(payment.paymentId, "corr-held").outcome, "created", "held sale accrues");

  const view = summary(AUTHOR_HELD);
  assertEqual(view.accrued_minor, 140000, "70% of 200000 is accrued");
  assertEqual(view.held_minor, 140000, "all of it is still held");
  assertEqual(view.available_minor, 0, "nothing is available");
  assertEqual(view.payable_minor, 0, "nothing is payable");
  assertEqual(view.empty_state_code, "held_only", "the state names the hold");
  assert(
    view.next_hold_release_at !== null,
    "the author is told when the hold releases",
  );
  assertEqual(view.oldest_payable_at, null, "nothing is waiting to be paid yet");

  const rows = ledger(AUTHOR_HELD).rows;
  assertEqual(rows.length, 1, "the hold is visible as one row");
  assertEqual(rows[0].amount_state, "held", "and it is marked held");
  assertEqual(rows[0].is_held, true, "and flagged as held");
  assertEqual(rows[0].type_key, "sale", "and it is a sale");
}

function testBelowThreshold() {
  enablePayouts(AUTHOR_SMALL);
  approveTerms(AUTHOR_SMALL, 7000, 14, "corr-terms-small");

  const payment = insertPayment({
    id: "22222222-0000-0000-0000-000000000701",
    userId: USER_A,
    practiceId: PRACTICE_SMALL,
    authorSnapshot: AUTHOR_SMALL,
    amount: 100000,
    confirmedAtSql: `'${OLD_SALE_AT}'::timestamptz`,
  });
  accrue(payment.paymentId, "corr-small");

  const view = summary(AUTHOR_SMALL);
  assertEqual(view.payable_minor, 70000, "70% of 1000 rubles");
  assertEqual(view.threshold_minor, 100000, "the minimum is 1000 rubles");
  assertEqual(view.threshold_reached, false, "70000 is below the minimum");
  assertEqual(view.empty_state_code, "below_threshold", "and the state says so");
}

function seedPayeeMoney() {
  for (const [suffix, amount] of [["101", 200000], ["102", 100000]]) {
    const payment = insertPayment({
      id: `22222222-0000-0000-0000-000000000${suffix}`,
      userId: suffix === "101" ? USER_A : USER_B,
      practiceId: PRACTICE_PAYEE,
      authorSnapshot: AUTHOR_PAYEE,
      title: 'Практика "Изобилие"',
      amount,
      confirmedAtSql: `'${OLD_SALE_AT}'::timestamptz`,
    });
    accrue(payment.paymentId, `corr-payee-${suffix}`);
  }

  const view = summary(AUTHOR_PAYEE);
  assertEqual(view.accrued_minor, 210000, "140000 + 70000 accrued");
  assertEqual(view.available_minor, 210000, "both holds have expired");
  assertEqual(view.payable_minor, 210000, "and all of it is payable");
  assertEqual(view.empty_state_code, "active_ok", "the author is ready to be paid");
  assertEqual(view.threshold_reached, true, "and above the minimum");
  assert(view.oldest_payable_at !== null, "the oldest waiting money is dated");
}

/**
 * The cabinet must never disagree with the two upstream sources. This is the
 * check that makes the author panel and the admin panel one system.
 */
function testSummaryReconciles() {
  for (const authorId of [
    AUTHOR_PAYEE, AUTHOR_HELD, AUTHOR_SMALL,
    AUTHOR_FREE, AUTHOR_PENDING, AUTHOR_PLATFORM, AUTHOR_NO_TERMS,
  ]) {
    const view = summary(authorId);
    const p332 = balance(authorId);
    const p333 = payableSnapshot(authorId);

    assertEqual(view.accrued_minor, p332.accrued_minor, `${authorId}: accrued matches P3.3.2`);
    assertEqual(
      view.refunds_reversed_minor,
      p332.reversed_minor,
      `${authorId}: reversals match P3.3.2`,
    );
    assertEqual(
      view.adjustments_minor,
      p332.adjustments_minor,
      `${authorId}: adjustments match P3.3.2`,
    );
    assertEqual(view.held_minor, p332.held_minor, `${authorId}: held matches P3.3.2`);
    assertEqual(
      view.available_minor,
      p333.available_balance_minor,
      `${authorId}: available matches the P3.3.3 snapshot`,
    );
    assertEqual(
      view.reserved_minor,
      p333.active_reserved_minor,
      `${authorId}: reserved matches the P3.3.3 snapshot`,
    );
    assertEqual(
      view.payable_minor,
      p333.capacity_minor,
      `${authorId}: payable matches the P3.3.3 capacity`,
    );
    assertEqual(
      p332.payable_minor,
      p333.available_balance_minor,
      `${authorId}: the two upstream views describe the same money`,
    );
    assertEqual(
      view.threshold_minor,
      number(`SELECT public.author_payout_minimum_minor();`),
      `${authorId}: the threshold is the P3.3.3 minimum`,
    );
  }

  // And it matches the admin aggregate for the same author.
  const adminRow = json(
    `SELECT (public.admin_author_finance_p332_authors(
       NULL, NULL, false, NULL, 50, 0
     ) -> 'rows') AS rows;`,
  ).find((row) => row.author_id === AUTHOR_PAYEE);
  const view = summary(AUTHOR_PAYEE);
  assertEqual(
    view.accrued_minor,
    adminRow.accrued_minor,
    "the admin author list and the cabinet report the same accrual",
  );
  assertEqual(
    view.held_minor,
    adminRow.held_minor,
    "the admin author list and the cabinet report the same hold",
  );
}

function testRefundIsVisibleAndRecalculated() {
  const refundId = json(
    `SELECT public.create_payment_refund_request(
      '22222222-0000-0000-0000-000000000102'::uuid, 50000::bigint, 'customer_request', NULL,
      'refund-p334-1', '${STAFF}'::uuid, 'corr-refund-1', false, NULL
    );`,
  ).refund.id;
  json(
    `SELECT public.mark_payment_refund_submitted(
      '${refundId}'::uuid, 'prov-r1', 'ON-REFUND', 'req-r1',
      '{}'::jsonb, 'corr-refund-1', '${STAFF}'::uuid
    );`,
  );
  json(
    `SELECT public.apply_payment_refund_provider_status(
      '${refundId}'::uuid, 'succeeded', 'REFUNDED', 'prov-r1',
      NULL, NULL, '{}'::jsonb, 'corr-refund-1', NULL
    );`,
  );
  json(
    `SELECT public.ensure_author_refund_reversal('${refundId}'::uuid, 'corr-refund-1', NULL);`,
  );

  const view = summary(AUTHOR_PAYEE);
  assertEqual(view.refunds_reversed_minor, -35000, "70% of the 500 ruble refund is reversed");
  assertEqual(view.payable_minor, 175000, "the payable balance drops by the reversal");
  assertEqual(view.negative, false, "the balance is still positive");

  const refundRows = ledger(AUTHOR_PAYEE, { type: "refund" }).rows;
  assertEqual(refundRows.length, 1, "the reversal is one visible row");
  assertEqual(refundRows[0].amount_minor, -35000, "with the reversal amount");
  assertEqual(
    refundRows[0].type_key,
    "refund",
    "labelled as a refund, not as an internal reversal",
  );
}

function testLedgerFilters() {
  const all = ledger(AUTHOR_PAYEE);
  assertEqual(all.total, 3, "two sales and one reversal");

  const sales = ledger(AUTHOR_PAYEE, { type: "sale" });
  assertEqual(sales.total, 2, "the type filter narrows to sales");

  const bogusType = ledger(AUTHOR_PAYEE, { type: "definitely_not_a_type" });
  assertEqual(
    bogusType.total,
    3,
    "an unknown type filter is ignored rather than silently emptying the list",
  );

  // Both sales and the reversal that followed one of them carry the same
  // product title, so a title search finds the whole story of that product.
  const searched = ledger(AUTHOR_PAYEE, { search: "Изобилие" });
  assertEqual(searched.total, 3, "search matches the product title");
  const missed = ledger(AUTHOR_PAYEE, { search: "нет-такого-продукта" });
  assertEqual(missed.total, 0, "and returns nothing when it does not match");

  const windowed = ledger(AUTHOR_PAYEE, {
    from: "2026-01-01T00:00:00Z",
    to: "2026-02-11T00:00:00Z",
  });
  assertEqual(windowed.total, 2, "the period filter keeps only the February sales");

  const paged = ledger(AUTHOR_PAYEE, { limit: 1, offset: 0 });
  assertEqual(paged.rows.length, 1, "pagination limits the page");
  assertEqual(paged.total, 3, "but reports the full total");
}

/**
 * A period is an activity filter. Whatever the author is looking at, the KPI
 * cards describe the money they have right now.
 */
function testPeriodFilterNeverMovesBalance() {
  const before = summary(AUTHOR_PAYEE);

  ledger(AUTHOR_PAYEE, { from: "2020-01-01T00:00:00Z", to: "2020-12-31T00:00:00Z" });
  ledger(AUTHOR_PAYEE, { from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" });
  payouts(AUTHOR_PAYEE);

  const after = summary(AUTHOR_PAYEE);
  for (const key of [
    "accrued_minor", "held_minor", "available_minor",
    "reserved_minor", "payable_minor", "paid_minor",
  ]) {
    assertEqual(after[key], before[key], `${key} is unchanged by an activity filter`);
  }

  assertEqual(
    number(
      `SELECT count(*)::int
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'author_finance_p334_summary'
         AND pg_get_function_arguments(p.oid) ILIKE '%timestamptz%';`,
    ),
    0,
    "the summary cannot be period-bound: it takes no timestamp argument",
  );
}

/** One author must be able to learn nothing at all about another. */
function testOwnershipIsolation() {
  const payeeEntryId = ledger(AUTHOR_PAYEE).rows[0].entry_id;

  assertEqual(ledger(AUTHOR_FREE).total, 0, "a free author sees no rows");
  assertEqual(ledger(AUTHOR_HELD).total, 1, "each author sees only their own");
  assertEqual(ledger(AUTHOR_SMALL).total, 1, "and nothing from the neighbours");

  const payeeEntryIds = new Set(ledger(AUTHOR_PAYEE).rows.map((row) => row.entry_id));
  for (const authorId of [AUTHOR_HELD, AUTHOR_SMALL, AUTHOR_FREE]) {
    for (const row of ledger(authorId).rows) {
      assert(
        !payeeEntryIds.has(row.entry_id),
        `${authorId} never receives an entry belonging to the payee`,
      );
    }
  }

  // A foreign id and an unknown id give the same answer: no existence oracle.
  assertEqual(
    ledgerDetail(AUTHOR_FREE, payeeEntryId).found,
    false,
    "a foreign entry is not found",
  );
  assertEqual(
    ledgerDetail(AUTHOR_HELD, payeeEntryId).found,
    false,
    "another payee's entry is not found either",
  );
  assertEqual(
    ledgerDetail(AUTHOR_PAYEE, "00000000-0000-0000-0000-000000000000").found,
    false,
    "an unknown entry looks exactly the same",
  );
  assertEqual(
    ledgerDetail(AUTHOR_PAYEE, payeeEntryId).found,
    true,
    "and the owner does see their own entry",
  );

  // Every ledger row the RPC returns really belongs to the author it was
  // asked about — checked against the table, not against the projection.
  for (const authorId of [AUTHOR_PAYEE, AUTHOR_HELD, AUTHOR_SMALL]) {
    for (const row of ledger(authorId).rows) {
      assertEqual(
        text(`SELECT author_id::text FROM author_ledger_entries WHERE id = '${row.entry_id}';`),
        authorId,
        "the returned row belongs to the requested author",
      );
    }
  }

  expectError(
    `SELECT public.author_finance_p334_summary(NULL, false);`,
    "author_id_required",
    "the summary refuses a null author",
  );
  expectError(
    `SELECT public.author_finance_p334_summary(
      '00000000-0000-0000-0000-000000000000'::uuid, false
    );`,
    "author_not_found",
    "the summary refuses an unknown author",
  );
}

function testTermsProjection() {
  const terms = json(`SELECT public.author_finance_p334_terms('${AUTHOR_PAYEE}'::uuid);`);

  assertEqual(terms.total, 1, "one approved terms row");
  assertEqual(terms.active.author_share_bps, 7000, "the author keeps 70%");
  assertEqual(terms.active.platform_share_bps, 3000, "and the platform 30%");
  assertEqual(terms.active.hold_days, 14, "with a 14 day hold");
  assertEqual(terms.active.is_active_now, true, "and it is in force");

  const keys = Object.keys(terms.active).sort().join(",");
  assertEqual(
    keys,
    "author_share_bps,currency,hold_days,is_active_now,platform_share_bps,status,valid_from,valid_to",
    "the terms projection exposes exactly the safe fields",
  );

  // A draft is an internal negotiation state and must stay invisible.
  psql(
    TEST_DB,
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_NO_TERMS}'::uuid, 5000, '${TERMS_FROM}'::timestamptz, NULL, 30, 'RUB',
      'внутренняя заметка', '${STAFF}'::uuid, 'corr-draft-only', false
    );`,
  );
  const draftOnly = json(
    `SELECT public.author_finance_p334_terms('${AUTHOR_NO_TERMS}'::uuid);`,
  );
  assertEqual(draftOnly.total, 0, "a draft is not history");
  assertEqual(draftOnly.active, null, "and it is not active");
  assert(
    !JSON.stringify(draftOnly).includes("внутренняя заметка"),
    "the internal note never reaches the author",
  );
  assertEqual(
    summary(AUTHOR_NO_TERMS).empty_state_code,
    "terms_missing",
    "a draft does not count as agreed terms",
  );
}

/** draft -> approved -> processing -> paid, watched from the author's side. */
function testPayoutLifecycleClassification() {
  const draft = json(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_PAYEE}'::uuid, 'p334-payout-1', now(), NULL, false, NULL,
      'внутренняя заметка операциониста', false, '${STAFF}'::uuid, 'corr-p334-1'
    );`,
  );
  const payoutId = draft.payout.id;
  assertEqual(draft.payout.amount_minor, 175000, "the draft claims the payable balance");

  let view = summary(AUTHOR_PAYEE);
  assertEqual(view.reserved_minor, 175000, "the draft reserves the money");
  assertEqual(view.payable_minor, 0, "so nothing is payable any more");
  assertEqual(view.available_minor, 175000, "but the money has not left yet");
  assertEqual(view.paid_minor, 0, "and nothing is paid");
  assertEqual(
    view.empty_state_code,
    "reserved_in_progress",
    "the state explains where the money went",
  );

  let states = ledger(AUTHOR_PAYEE).rows.map((row) => row.amount_state);
  assert(states.includes("reserved"), "the claimed sales read as reserved");
  assert(!states.includes("paid"), "nothing reads as paid yet");

  let list = payouts(AUTHOR_PAYEE);
  assertEqual(list.total, 1, "the draft is visible to the author");
  assertEqual(list.rows[0].status_key, "preparing", "as a payout being prepared");
  assertEqual(list.rows[0].reference_masked, null, "with no reference yet");
  assertEqual(list.rows[0].is_settled, false, "and not settled");
  assert(
    !JSON.stringify(list).includes("внутренняя заметка"),
    "the operator's note never reaches the author",
  );

  json(`SELECT public.approve_author_payout('${payoutId}'::uuid, '${STAFF}'::uuid, 'corr-p334-1');`);
  assertEqual(
    payouts(AUTHOR_PAYEE).rows[0].status_key,
    "preparing",
    "approval is an internal step: the author still reads 'preparing'",
  );

  json(
    `SELECT public.mark_author_payout_processing('${payoutId}'::uuid, '${STAFF}'::uuid, 'corr-p334-1');`,
  );
  assertEqual(
    payouts(AUTHOR_PAYEE).rows[0].status_key,
    "processing",
    "processing is visible: the money is moving",
  );
  assertEqual(
    summary(AUTHOR_PAYEE).paid_minor,
    0,
    "a payout in flight is never counted as paid",
  );

  json(
    `SELECT public.mark_author_payout_paid(
      '${payoutId}'::uuid, 'PO-2026-07-000481', now(), '${STAFF}'::uuid, 'corr-p334-1'
    );`,
  );

  view = summary(AUTHOR_PAYEE);
  assertEqual(view.paid_minor, 175000, "now it is paid");
  assertEqual(view.reserved_minor, 0, "the reservation is gone");
  assertEqual(view.available_minor, 0, "the money has left the balance");
  assertEqual(view.payable_minor, 0, "and nothing is payable");
  assertEqual(
    view.empty_state_code,
    "has_paid_history",
    "the state points at the payout history",
  );

  states = ledger(AUTHOR_PAYEE).rows.map((row) => row.amount_state);
  assert(states.includes("paid"), "the settled sales read as paid");

  const payoutRow = ledger(AUTHOR_PAYEE, { type: "payout" }).rows[0];
  assertEqual(payoutRow.amount_minor, -175000, "the payout leaves as a negative row");
  assertEqual(payoutRow.amount_state, "paid", "and reads as paid");
  assert(payoutRow.payout_safe_ref !== null, "and names the payout period");

  list = payouts(AUTHOR_PAYEE);
  assertEqual(list.rows[0].status_key, "paid", "the payout reads as paid");
  assertEqual(list.rows[0].is_settled, true, "and is settled");
  assertEqual(
    list.rows[0].reference_masked,
    "•••0481",
    "the transfer reference is masked",
  );
  assert(
    !JSON.stringify(list).includes("PO-2026-07-000481"),
    "the raw reference never leaves the database",
  );

  assertEqual(
    payouts(AUTHOR_PAYEE, { status: "paid" }).total,
    1,
    "the status filter uses the author-facing key",
  );
  assertEqual(
    payouts(AUTHOR_PAYEE, { status: "preparing" }).total,
    0,
    "and no longer matches the old internal status",
  );

  return payoutId;
}

function testPayoutDetail(payoutId) {
  const detail = payoutDetail(AUTHOR_PAYEE, payoutId);
  assertEqual(detail.found, true, "the owner sees their payout");
  assertEqual(detail.payout.amount_minor, 175000, "with its amount");
  assertEqual(detail.payout.reference_masked, "•••0481", "and a masked reference");
  assert(detail.entries.length > 0, "and the sales it settled");

  for (const entry of detail.entries) {
    assertEqual(
      text(`SELECT author_id::text FROM author_ledger_entries WHERE id = '${entry.entry_id}';`),
      AUTHOR_PAYEE,
      "every settled entry belongs to the owner",
    );
  }

  const keys = Object.keys(detail.payout).sort().join(",");
  assertEqual(
    keys,
    [
      "amount_minor", "cancelled_at", "created_at", "currency", "cutoff_at",
      "delayed_at", "minimum_minor", "paid_at", "payout_id", "period_end",
      "period_label", "period_start", "processing_at", "reference_masked",
      "reversed_at", "status_key",
    ].join(","),
    "the payout detail exposes exactly the safe fields",
  );

  for (const authorId of [AUTHOR_FREE, AUTHOR_HELD]) {
    assertEqual(
      payoutDetail(authorId, payoutId).found,
      false,
      "another author cannot open this payout",
    );
  }
  assertEqual(
    payoutDetail(AUTHOR_PAYEE, "00000000-0000-0000-0000-000000000000").found,
    false,
    "an unknown payout looks the same as a foreign one",
  );
  assertEqual(
    payouts(AUTHOR_FREE).total,
    0,
    "and it does not appear in anyone else's list",
  );
}

/**
 * A failed transfer is the most sensitive state: it is where an internal code
 * would be most tempting to surface.
 */
function testFailedPayoutStaysPublicSafe() {
  const draft = json(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_SMALL}'::uuid, 'p334-payout-small', now(), NULL, true,
      'разовое исключение по договорённости', NULL, false, '${STAFF}'::uuid, 'corr-p334-small'
    );`,
  );
  const payoutId = draft.payout.id;

  json(
    `SELECT public.approve_author_payout('${payoutId}'::uuid, '${STAFF}'::uuid, 'corr-p334-small');`,
  );
  json(
    `SELECT public.mark_author_payout_failed(
      '${payoutId}'::uuid, 'provider_rejected', 'счёт получателя закрыт',
      'release', '${STAFF}'::uuid, 'corr-p334-small'
    );`,
  );

  const list = payouts(AUTHOR_SMALL);
  assertEqual(list.rows[0].status_key, "delayed", "a failed transfer reads as delayed");

  const serialized = JSON.stringify(list) + JSON.stringify(payoutDetail(AUTHOR_SMALL, payoutId));
  for (const secret of [
    "provider_rejected",
    "счёт получателя закрыт",
    "разовое исключение по договорённости",
  ]) {
    assert(!serialized.includes(secret), `the author never sees "${secret}"`);
  }

  // The money came back to the author, which is the only fact that matters.
  assertEqual(
    summary(AUTHOR_SMALL).payable_minor,
    70000,
    "a failed payout releases its reservation",
  );
  assertEqual(summary(AUTHOR_SMALL).paid_minor, 0, "and is never counted as paid");
}

function testForbiddenFieldsAreAbsent() {
  const payloads = {
    summary: summary(AUTHOR_PAYEE),
    terms: json(`SELECT public.author_finance_p334_terms('${AUTHOR_PAYEE}'::uuid);`),
    ledger: ledger(AUTHOR_PAYEE),
    ledgerDetail: ledgerDetail(AUTHOR_PAYEE, ledger(AUTHOR_PAYEE).rows[0].entry_id),
    payouts: payouts(AUTHOR_PAYEE),
  };

  for (const [label, payload] of Object.entries(payloads)) {
    assertNoForbiddenKeys(payload, label);
  }

  // The buyers exist in the fixtures; their ids must appear nowhere.
  const serialized = JSON.stringify(payloads);
  for (const userId of [USER_A, USER_B, STAFF]) {
    assert(!serialized.includes(userId), "no user id reaches the author");
  }
  assert(!serialized.includes("tochka"), "the payment provider is not named");

  // The ledger row shape is pinned: adding a field is a deliberate decision.
  const rowKeys = Object.keys(ledger(AUTHOR_PAYEE).rows[0]).sort().join(",");
  assertEqual(
    rowKeys,
    [
      "amount_minor", "amount_state", "available_at", "currency", "effective_at",
      "entry_id", "is_held", "payout_safe_ref", "product_title", "public_comment",
      "type_key",
    ].join(","),
    "the ledger row exposes exactly the safe fields",
  );

  // public_comment exists and is always null: P3.3.4 derives no author-facing
  // text from an internal reason or note.
  for (const row of ledger(AUTHOR_PAYEE).rows) {
    assertEqual(row.public_comment, null, "public_comment is never derived internally");
  }

  const detail = ledgerDetail(AUTHOR_PAYEE, ledger(AUTHOR_PAYEE).rows[0].entry_id);
  assertEqual(
    Object.keys(detail.formula).sort().join(","),
    [
      "author_share_bps", "gross_basis_minor", "hold_days", "net_basis_minor",
      "platform_share_bps", "refund_policy", "rounding",
    ].join(","),
    "the formula detail exposes exactly the safe arithmetic",
  );
}

function testAdjustmentsStayOpaque() {
  json(
    `SELECT public.create_author_ledger_manual_adjustment(
      '${AUTHOR_HELD}'::uuid, 5000::bigint, 'goodwill_compensation', 'adj-p334-1',
      'внутреннее обоснование для аудита', 'RUB', NULL, '${STAFF}'::uuid, 'corr-adj-1'
    );`,
  );

  const rows = ledger(AUTHOR_HELD).rows;
  const adjustment = rows.find((row) => row.type_key === "adjustment_credit");
  assert(adjustment !== undefined, "the author sees the adjustment");
  assertEqual(adjustment.amount_minor, 5000, "with its amount");
  assertEqual(adjustment.amount_state, "adjustment", "marked as an adjustment");
  assertEqual(adjustment.public_comment, null, "and no internal text");

  const serialized = JSON.stringify(rows);
  assert(
    !serialized.includes("goodwill_compensation"),
    "the internal reason code is not exposed",
  );
  assert(
    !serialized.includes("внутреннее обоснование"),
    "the internal justification is not exposed",
  );

  assertEqual(
    summary(AUTHOR_HELD).adjustments_minor,
    5000,
    "but the money is counted",
  );
}

function testNegativeBalance() {
  json(
    `SELECT public.create_author_ledger_manual_adjustment(
      '${AUTHOR_SMALL}'::uuid, -120000::bigint, 'duplicate_accrual_correction',
      'adj-p334-negative', NULL, 'RUB', NULL, '${STAFF}'::uuid, 'corr-adj-2'
    );`,
  );

  const view = summary(AUTHOR_SMALL);
  assert(view.available_minor < 0, "the balance really is negative");
  assertEqual(view.negative, true, "and the summary says so");
  assertEqual(view.negative_minor, view.available_minor, "with the amount");
  assertEqual(
    view.eligibility_message,
    "negative_balance",
    "the message key warns about the negative balance",
  );
  assertEqual(view.payable_minor, 0, "a negative balance is never payable");
  assertEqual(
    view.payable_minor,
    payableSnapshot(AUTHOR_SMALL).capacity_minor,
    "and it still agrees with the P3.3.3 snapshot",
  );
}

function testIntegrityStatus() {
  assert(
    ["ok", "processing", "review_required"].includes(
      text(`SELECT public.author_finance_p334_integrity_status('${AUTHOR_PAYEE}'::uuid);`),
    ),
    "a known author gets a known status",
  );
  assertEqual(
    text(
      `SELECT public.author_finance_p334_integrity_status(
        '00000000-0000-0000-0000-000000000000'::uuid
      );`,
    ),
    "unavailable",
    "an unknown author gets 'unavailable', not an error",
  );
  assertEqual(
    text(`SELECT public.author_finance_p334_integrity_status(NULL);`),
    "unavailable",
    "and so does a null author",
  );

  // A payout parked for review is the one thing the author is told about.
  const draft = json(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_HELD}'::uuid, 'p334-payout-review', now(), NULL, true, 'проверка',
      NULL, false, '${STAFF}'::uuid, 'corr-review'
    );`,
  );
  json(
    `SELECT public.mark_author_payout_requires_review(
      '${draft.payout.id}'::uuid, 'нужна сверка с банком', '${STAFF}'::uuid, 'corr-review'
    );`,
  );
  assertEqual(
    text(`SELECT public.author_finance_p334_integrity_status('${AUTHOR_HELD}'::uuid);`),
    "review_required",
    "a payout under review raises the status",
  );

  const list = payouts(AUTHOR_HELD);
  assertEqual(list.rows[0].status_key, "on_review", "and the payout reads as on review");
  assert(
    !JSON.stringify(list).includes("нужна сверка с банком"),
    "without the reviewer's note",
  );
}

function testTestMoneyIsNotShown() {
  psql(
    TEST_DB,
    `
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
  author_id_snapshot, is_test, test_reason, paid_at, created_at
) VALUES (
  '11111111-0000-0000-0000-000000000901', '${USER_A}', '${PRACTICE_PAYEE}', 'paid', 500000, 'RUB',
  'Тестовая практика', 'snap-test-901', 500000,
  '${AUTHOR_PAYEE}', true, 'qa', '${OLD_SALE_AT}', '${OLD_SALE_AT}'
);
INSERT INTO payments (
  id, order_id, provider, provider_payment_id, idempotency_key, status,
  amount_minor, currency, is_test, test_reason, confirmed_at, created_at
) VALUES (
  '22222222-0000-0000-0000-000000000901', '11111111-0000-0000-0000-000000000901',
  'tochka', 'op-test-901', 'idem-test-901', 'succeeded',
  500000, 'RUB', true, 'qa', '${OLD_SALE_AT}', '${OLD_SALE_AT}'
);
`,
  );
  accrue("22222222-0000-0000-0000-000000000901", "corr-test-901");

  const testEntries = number(
    `SELECT count(*)::int FROM author_ledger_entries WHERE is_test = true;`,
  );
  assert(testEntries > 0, "the fixture really created test money");

  const real = ledger(AUTHOR_PAYEE);
  for (const row of real.rows) {
    assertEqual(
      text(`SELECT is_test::text FROM author_ledger_entries WHERE id = '${row.entry_id}';`),
      "false",
      "no test row appears in the real cabinet",
    );
  }
  assert(
    !JSON.stringify(real).includes("Тестовая практика"),
    "the test product is not listed",
  );

  const view = summary(AUTHOR_PAYEE);
  const realAccrued = number(
    `SELECT coalesce(sum(amount_minor), 0)::bigint
     FROM author_ledger_entries
     WHERE author_id = '${AUTHOR_PAYEE}' AND entry_type = 'sale_accrual' AND is_test = false;`,
  );
  assertEqual(view.accrued_minor, realAccrued, "test money is excluded from the KPIs");
}

function testIntegritySnapshotIsClean() {
  const snapshot = integritySnapshot(false);

  assert(snapshot.authors_checked > 0, "the snapshot actually checked authors");

  for (const counter of [
    "held_mismatch",
    "available_mismatch",
    "reserved_mismatch",
    "payable_mismatch",
    "paid_mismatch",
    "processing_counted_as_paid",
    "reserved_counted_as_payable",
    "held_counted_as_payable",
    "empty_state_invalid",
    "period_filter_changes_balance",
    "ledger_cross_author_rows",
    "payout_cross_author_rows",
    "detail_denied_own_entry",
    "ledger_test_leak",
    "payout_test_leak",
    "forbidden_ledger_fields",
    "forbidden_payout_fields",
    "unmasked_references",
    "author_rpcs_not_stable",
    "author_rpcs_executable_by_clients",
    "summary_accepts_period_argument",
    "future_effective_entries",
  ]) {
    assertEqual(snapshot[counter], 0, `integrity counter ${counter} is zero`);
  }

  // With test money included the aggregates must still reconcile.
  const withTest = integritySnapshot(true);
  for (const counter of [
    "held_mismatch", "available_mismatch", "reserved_mismatch",
    "payable_mismatch", "paid_mismatch", "ledger_cross_author_rows",
  ]) {
    assertEqual(withTest[counter], 0, `integrity counter ${counter} is zero with test money`);
  }
}

function testSecurityGrants() {
  const functions = psql(
    TEST_DB,
    `SELECT p.proname
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'author\\_finance\\_p334\\_%'
            OR p.proname = 'admin_author_finance_p334_integrity_snapshot');`,
    { tuples: true },
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  assert(functions.length >= 9, "the P3.3.4 surface is present");

  for (const name of functions) {
    for (const role of ["anon", "authenticated"]) {
      assertEqual(
        number(
          `SELECT count(*)::int
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = '${name}'
             AND has_function_privilege('${role}', p.oid, 'EXECUTE');`,
        ),
        0,
        `${name} is unreachable from ${role}`,
      );
    }

    assert(
      number(
        `SELECT count(*)::int
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = '${name}'
           AND has_function_privilege('service_role', p.oid, 'EXECUTE');`,
      ) > 0,
      `${name} is callable by service_role`,
    );

    assertEqual(
      number(
        `SELECT count(*)::int
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = '${name}'
           AND p.provolatile = 'v';`,
      ),
      0,
      `${name} is read-only (not VOLATILE)`,
    );

    // Every SECURITY DEFINER function pins its search_path.
    assertEqual(
      number(
        `SELECT count(*)::int
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = '${name}'
           AND p.prosecdef = true
           AND NOT ('search_path=public, pg_temp' = ANY (coalesce(p.proconfig, ARRAY[]::text[])));`,
      ),
      0,
      `${name} pins its search_path when it is SECURITY DEFINER`,
    );
  }

  // The author tables themselves stay unreachable from client roles.
  for (const table of [
    "author_ledger_entries",
    "author_payouts",
    "author_payout_allocations",
    "author_commercial_terms",
  ]) {
    for (const role of ["anon", "authenticated"]) {
      assertEqual(
        number(
          `SELECT count(*)::int FROM information_schema.role_table_grants
           WHERE table_schema = 'public' AND table_name = '${table}' AND grantee = '${role}';`,
        ),
        0,
        `${table} grants nothing to ${role}`,
      );
    }
  }
}

function testEarlierPhasesUnchanged(before) {
  const after = phaseRowCounts();

  for (const [key, value] of Object.entries(before)) {
    assertEqual(after[key], value, `reading the cabinet changed no ${key} row`);
  }

  // And the P3.3.1 / P3.3.2 / P3.3.3 read models still answer identically.
  assertEqual(
    json(`SELECT public.admin_author_payout_p333_integrity_snapshot(false);`)
      .allocation_sum_mismatch,
    0,
    "the P3.3.3 integrity snapshot is still clean",
  );
  assertEqual(
    json(`SELECT public.admin_author_finance_p332_integrity_snapshot(false);`)
      .accruals_without_terms,
    0,
    "the P3.3.2 integrity snapshot is still clean",
  );
}

function testRollingDeploySafety() {
  const before = phaseRowCounts();
  const beforeSummary = summary(AUTHOR_PAYEE);

  psqlFile(TEST_DB, join(ROOT, MIGRATION));

  const after = phaseRowCounts();
  for (const [key, value] of Object.entries(before)) {
    assertEqual(after[key], value, `re-applying the migration adds no ${key} row`);
  }

  const afterSummary = summary(AUTHOR_PAYEE);
  for (const key of [
    "accrued_minor", "held_minor", "available_minor",
    "reserved_minor", "payable_minor", "paid_minor", "empty_state_code",
  ]) {
    assertEqual(
      afterSummary[key],
      beforeSummary[key],
      `re-applying the migration does not change ${key}`,
    );
  }
}

function main() {
  bootstrap();

  testMigrationSeedsNothing();
  testVocabulary();
  testEmptyStatesBeforeMoney();
  testHeldOnly();
  testBelowThreshold();
  seedPayeeMoney();
  testSummaryReconciles();
  testRefundIsVisibleAndRecalculated();
  testLedgerFilters();
  testPeriodFilterNeverMovesBalance();
  testOwnershipIsolation();
  testTermsProjection();

  const paidPayoutId = testPayoutLifecycleClassification();
  testPayoutDetail(paidPayoutId);
  testFailedPayoutStaysPublicSafe();
  testForbiddenFieldsAreAbsent();
  testAdjustmentsStayOpaque();
  testNegativeBalance();
  testIntegrityStatus();
  testTestMoneyIsNotShown();
  testIntegritySnapshotIsClean();
  testSecurityGrants();

  // Everything above only read. Prove it.
  const counts = phaseRowCounts();
  summary(AUTHOR_PAYEE);
  ledger(AUTHOR_PAYEE);
  payouts(AUTHOR_PAYEE);
  json(`SELECT public.author_finance_p334_terms('${AUTHOR_PAYEE}'::uuid);`);
  integritySnapshot(false);
  testEarlierPhasesUnchanged(counts);

  testRollingDeploySafety();

  console.log("payments-p334-author-finance-sql-unit: ok");
}

main();

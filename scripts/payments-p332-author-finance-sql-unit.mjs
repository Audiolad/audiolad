#!/usr/bin/env node
/**
 * P3.3.2 author ledger SQL tests on an isolated scratch database.
 * Never touches the production database and never calls Tochka: every
 * "provider" transition goes through the P3.3.1 RPCs.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_payments_p332_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";
const STAFF = "d9999999-9999-9999-9999-999999999999";

/** Payout-eligible external author with approved terms. */
const AUTHOR_PAYEE = "a1111111-1111-1111-1111-111111111111";
/** access_status = commercial but platform-owned: must never accrue. */
const AUTHOR_PLATFORM = "a2222222-2222-2222-2222-222222222222";
/** Payout-eligible but no approved terms: must park for review. */
const AUTHOR_NO_TERMS = "a3333333-3333-3333-3333-333333333333";

const PRACTICE_PAYEE = "c1111111-1111-1111-1111-111111111111";
const PRACTICE_PLATFORM = "c2222222-2222-2222-2222-222222222222";
const PRACTICE_NO_TERMS = "c3333333-3333-3333-3333-333333333333";

const TERMS_FROM = "2026-01-01T00:00:00Z";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}
function psql(database, sql, { tuples = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}
function psqlFile(database, absolutePath) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: readFileSync(absolutePath, "utf8"), maxBuffer: 20 * 1024 * 1024 },
  );
}
function scalar(sql) {
  return psql(TEST_DB, sql, { tuples: true }).trim();
}
function number(sql) {
  return Number.parseInt(scalar(sql), 10);
}
function bool(sql) {
  return scalar(sql) === "true";
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
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
    assert(
      text.includes(expectedFragment),
      `${label}: expected error containing "${expectedFragment}", got ${text.slice(0, 400)}`,
    );
  }
  assert(failed, `${label}: expected failure but statement succeeded`);
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
CREATE TABLE public.platform_permissions (
  code text PRIMARY KEY,
  description text
);
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
  ('${AUTHOR_PLATFORM}', 'Platform Catalog', 'platform-catalog', 'commercial'),
  ('${AUTHOR_NO_TERMS}', 'Payee Without Terms', 'payee-no-terms', 'commercial');
INSERT INTO public.practices VALUES
  ('${PRACTICE_PAYEE}', '${AUTHOR_PAYEE}', 'Payee Practice', 'payee-practice', 'published', 299, false),
  ('${PRACTICE_PLATFORM}', '${AUTHOR_PLATFORM}', 'Platform Practice', 'platform-practice', 'published', 299, false),
  ('${PRACTICE_NO_TERMS}', '${AUTHOR_NO_TERMS}', 'No Terms Practice', 'no-terms-practice', 'published', 299, false);
`,
  );

  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192000_admin_payments_p31_money.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192100_admin_payments_p31_authors_products_fix.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260726120000_payments_p331_refund_facts.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260726140000_payments_p332_author_ledger.sql"));
}

function insertPayment({
  id,
  userId,
  practiceId,
  authorSnapshot,
  status = "succeeded",
  amount,
  confirmedAt,
  isTest = false,
}) {
  const orderId = id.replace(/^22/, "11");
  const paid = status === "succeeded";
  psql(
    TEST_DB,
    `
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
  author_id_snapshot, is_test, paid_at, created_at
) VALUES (
  '${orderId}', '${userId}', '${practiceId}', '${paid ? "paid" : "pending"}', ${amount}, 'RUB',
  'Snap', 'snap-${orderId}', ${amount},
  ${authorSnapshot ? `'${authorSnapshot}'` : "NULL"}, ${isTest},
  ${paid ? `'${confirmedAt}'` : "NULL"}, '${confirmedAt}'
);
INSERT INTO payments (
  id, order_id, provider, provider_payment_id, idempotency_key, status,
  amount_minor, currency, is_test, confirmed_at, created_at
) VALUES (
  '${id}', '${orderId}', 'tochka', 'op-${id}', 'idem-${id}', '${status}',
  ${amount}, 'RUB', ${isTest}, ${paid ? `'${confirmedAt}'` : "NULL"}, '${confirmedAt}'
);
`,
  );
  if (paid) {
    psql(
      TEST_DB,
      `INSERT INTO user_practices (user_id, practice_id, access_source, granted_at)
       VALUES ('${userId}', '${practiceId}', 'purchase', '${confirmedAt}')
       ON CONFLICT DO NOTHING;`,
    );
  }
  return { paymentId: id, orderId };
}

function confirmRefund({ paymentId, amount, key }) {
  const created = json(
    `SELECT public.create_payment_refund_request(
      '${paymentId}'::uuid, ${amount}::bigint, 'customer_request', NULL,
      '${key}', '${STAFF}'::uuid, 'corr-${key}', false, NULL
    );`,
  );
  const refundId = created.refund.id;
  json(
    `SELECT public.mark_payment_refund_submitted(
      '${refundId}'::uuid, 'prov-${key}', 'ON-REFUND', 'req-${key}',
      '{}'::jsonb, 'corr-${key}', '${STAFF}'::uuid
    );`,
  );
  json(
    `SELECT public.apply_payment_refund_provider_status(
      '${refundId}'::uuid, 'succeeded', 'REFUNDED', 'prov-${key}',
      NULL, NULL, '{}'::jsonb, 'corr-${key}', NULL
    );`,
  );
  return refundId;
}

function drain() {
  return json(`SELECT public.process_due_finance_obligations(500);`);
}

function balance(authorId, includeTest = false) {
  return json(`SELECT public.author_finance_balance('${authorId}'::uuid, ${includeTest});`);
}

// ---------------------------------------------------------------------------

function testMigrationSeedsNothing() {
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries;`),
    0,
    "migration writes no historical ledger",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_commercial_terms;`),
    0,
    "migration seeds no commercial terms",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`),
    0,
    "no author is auto-enabled for payouts",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE access_status = 'commercial';`),
    3,
    "commercial access status alone does not imply payout eligibility",
  );
}

function testShareMath() {
  // floor() in kopeks, remainder stays with the platform.
  assertEqual(number(`SELECT public.author_share_minor(139400::bigint, 7000);`), 97580, "70% of 139400");
  assertEqual(number(`SELECT public.author_share_minor(29900::bigint, 7000);`), 20930, "70% of 29900");
  assertEqual(number(`SELECT public.author_share_minor(29900::bigint, 3333);`), 9965, "33.33% floors down");
  assertEqual(number(`SELECT public.author_share_minor(1::bigint, 5000);`), 0, "half a kopek floors to zero");
  assertEqual(number(`SELECT public.author_share_minor(29900::bigint, 10000);`), 29900, "100% share");
  assertEqual(number(`SELECT public.author_share_minor(29900::bigint, 0);`), 0, "zero share");
  assertEqual(number(`SELECT public.author_share_minor(0::bigint, 7000);`), 0, "zero basis");
  assertEqual(number(`SELECT public.author_share_minor(NULL, 7000);`), 0, "null basis is zero");
}

function testTermsLifecycle() {
  const draft = json(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_PAYEE}'::uuid, 7000, '${TERMS_FROM}'::timestamptz, NULL, 14, 'RUB',
      'standard 70/30', '${STAFF}'::uuid, 'corr-terms', false
    );`,
  );
  assertEqual(draft.status, "draft", "draft created as draft");

  const termsId = draft.terms_id;

  // A draft is not a rate: resolution must find nothing until it is approved.
  const beforeApproval = json(
    `SELECT public.resolve_author_commercial_terms('${AUTHOR_PAYEE}'::uuid, now(), 'RUB');`,
  );
  assertEqual(beforeApproval.found, false, "draft terms do not resolve");
  assertEqual(beforeApproval.reason, "no_active_terms", "draft reported as no active terms");

  const approved = json(
    `SELECT public.approve_author_commercial_terms('${termsId}'::uuid, '${STAFF}'::uuid, 'corr-approve');`,
  );
  assertEqual(approved.status, "approved", "draft approved");

  const replay = json(
    `SELECT public.approve_author_commercial_terms('${termsId}'::uuid, '${STAFF}'::uuid, 'corr-approve');`,
  );
  assertEqual(replay.idempotent_replay, true, "approve is idempotent");

  const resolved = json(
    `SELECT public.resolve_author_commercial_terms('${AUTHOR_PAYEE}'::uuid, now(), 'RUB');`,
  );
  assertEqual(resolved.found, true, "approved terms resolve");
  assertEqual(resolved.author_share_bps, 7000, "share resolved");
  assertEqual(resolved.hold_days, 14, "hold resolved");
  assertEqual(resolved.match_count, 1, "exactly one match");

  // Before valid_from there is no rate at all.
  const before = json(
    `SELECT public.resolve_author_commercial_terms(
      '${AUTHOR_PAYEE}'::uuid, '2025-06-01T00:00:00Z'::timestamptz, 'RUB'
    );`,
  );
  assertEqual(before.found, false, "no terms before valid_from");

  // Currency is part of the key.
  const otherCurrency = json(
    `SELECT public.resolve_author_commercial_terms('${AUTHOR_PAYEE}'::uuid, now(), 'USD');`,
  );
  assertEqual(otherCurrency.found, false, "terms are per currency");

  return termsId;
}

function testTermsOverlapGuard() {
  expectError(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_PAYEE}'::uuid, 5000, '${TERMS_FROM}'::timestamptz, NULL, 14, 'RUB',
      NULL, '${STAFF}'::uuid, 'corr-overlap', true
    );`,
    "author_commercial_terms_overlap",
    "second open-ended approved period rejected",
  );

  expectError(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_PAYEE}'::uuid, 5000, '2026-06-01T00:00:00Z'::timestamptz,
      '2026-07-01T00:00:00Z'::timestamptz, 14, 'RUB',
      NULL, '${STAFF}'::uuid, 'corr-overlap-2', true
    );`,
    "author_commercial_terms_overlap",
    "bounded period inside an open period rejected",
  );

  // A draft may overlap: only approved periods are exclusive.
  const draft = json(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_PAYEE}'::uuid, 5000, '2026-06-01T00:00:00Z'::timestamptz, NULL, 14, 'RUB',
      NULL, '${STAFF}'::uuid, 'corr-overlap-3', false
    );`,
  );
  assertEqual(draft.status, "draft", "overlapping draft allowed");
  psql(TEST_DB, `DELETE FROM author_commercial_terms WHERE id = '${draft.terms_id}';`);

  // A different author is unaffected.
  const other = json(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_PLATFORM}'::uuid, 5000, '${TERMS_FROM}'::timestamptz, NULL, 14, 'RUB',
      NULL, '${STAFF}'::uuid, 'corr-overlap-4', true
    );`,
  );
  assertEqual(other.status, "approved", "other authors are independent");
  json(
    `SELECT public.close_author_commercial_terms(
      '${other.terms_id}'::uuid, now(), 'test cleanup', '${STAFF}'::uuid, 'corr-close', 'cancelled'
    );`,
  );
}

function testTermsImmutability(termsId) {
  expectError(
    `UPDATE author_commercial_terms SET author_share_bps = 9000 WHERE id = '${termsId}';`,
    "author_commercial_terms_approved_immutable",
    "approved rate cannot be edited",
  );
  expectError(
    `UPDATE author_commercial_terms SET hold_days = 0 WHERE id = '${termsId}';`,
    "author_commercial_terms_approved_immutable",
    "approved hold cannot be edited",
  );
  expectError(
    `UPDATE author_commercial_terms SET valid_from = now() WHERE id = '${termsId}';`,
    "author_commercial_terms_approved_immutable",
    "approved validity start cannot be edited",
  );
  expectError(
    `UPDATE author_commercial_terms SET valid_to = now() WHERE id = '${termsId}';`,
    "author_commercial_terms_rpc_required",
    "closing valid_to requires the RPC",
  );
  expectError(
    `UPDATE author_commercial_terms SET status = 'cancelled' WHERE id = '${termsId}';`,
    "author_commercial_terms_rpc_required",
    "status change requires the RPC",
  );
  expectError(
    `DELETE FROM author_commercial_terms WHERE id = '${termsId}';`,
    "author_commercial_terms_approved_immutable",
    "approved terms cannot be deleted",
  );

  assertEqual(
    number(`SELECT author_share_bps FROM author_commercial_terms WHERE id = '${termsId}';`),
    7000,
    "rate survived every rejected mutation",
  );
}

function testAccrualEligibility() {
  // 1. Platform-owned catalog: commercial access, no payout decision.
  const platform = insertPayment({
    id: "22222222-2222-2222-2222-222222222201",
    userId: USER_A,
    practiceId: PRACTICE_PLATFORM,
    authorSnapshot: AUTHOR_PLATFORM,
    amount: 29900,
    confirmedAt: "2026-07-10T10:00:00Z",
  });
  const platformResult = json(
    `SELECT public.ensure_author_sale_accrual('${platform.paymentId}'::uuid, 'corr-1', NULL);`,
  );
  assertEqual(platformResult.outcome, "skipped", "platform-owned payment is skipped");
  assertEqual(
    platformResult.result_code,
    "author_not_payout_eligible",
    "platform skip is explicit, not an error",
  );

  // 2. Payout-eligible author without approved terms: never guess a rate.
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_NO_TERMS}';`);
  const noTerms = insertPayment({
    id: "22222222-2222-2222-2222-222222222202",
    userId: USER_A,
    practiceId: PRACTICE_NO_TERMS,
    authorSnapshot: AUTHOR_NO_TERMS,
    amount: 29900,
    confirmedAt: "2026-07-10T11:00:00Z",
  });
  const noTermsResult = json(
    `SELECT public.ensure_author_sale_accrual('${noTerms.paymentId}'::uuid, 'corr-2', NULL);`,
  );
  assertEqual(noTermsResult.outcome, "requires_review", "missing terms parks for review");
  assertEqual(noTermsResult.result_code, "no_active_terms", "review reason is missing terms");

  // 3. Missing write-time attribution: never fall back to the practice owner.
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_PAYEE}';`);
  const noSnapshot = insertPayment({
    id: "22222222-2222-2222-2222-222222222203",
    userId: USER_B,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: null,
    amount: 29900,
    confirmedAt: "2026-07-10T12:00:00Z",
  });
  const noSnapshotResult = json(
    `SELECT public.ensure_author_sale_accrual('${noSnapshot.paymentId}'::uuid, 'corr-3', NULL);`,
  );
  assertEqual(noSnapshotResult.outcome, "requires_review", "missing snapshot parks for review");
  assertEqual(
    noSnapshotResult.result_code,
    "author_snapshot_missing",
    "review reason is the missing snapshot",
  );

  // 4. Not-yet-succeeded payment accrues nothing.
  const pending = insertPayment({
    id: "22222222-2222-2222-2222-222222222204",
    userId: USER_B,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    status: "pending",
    amount: 29900,
    confirmedAt: "2026-07-10T13:00:00Z",
  });
  const pendingResult = json(
    `SELECT public.ensure_author_sale_accrual('${pending.paymentId}'::uuid, 'corr-4', NULL);`,
  );
  assertEqual(pendingResult.outcome, "skipped", "pending payment is skipped");
  assertEqual(pendingResult.result_code, "payment_not_succeeded", "pending skip reason");

  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries;`),
    0,
    "no ledger row was written by any rejected case",
  );

  // Buyers keep their access and their payments regardless of bookkeeping.
  assertEqual(
    number(`SELECT count(*)::int FROM payments WHERE status = 'succeeded';`),
    3,
    "payments untouched by the ledger layer",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM user_practices;`),
    3,
    "entitlements untouched by the ledger layer",
  );
}

function testAccrualHappyPath() {
  const sale = insertPayment({
    id: "22222222-2222-2222-2222-222222222210",
    userId: USER_A,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    amount: 29900,
    confirmedAt: "2026-07-11T10:00:00Z",
  });

  const created = json(
    `SELECT public.ensure_author_sale_accrual('${sale.paymentId}'::uuid, 'corr-sale', NULL);`,
  );
  assertEqual(created.outcome, "created", "accrual created");
  assertEqual(created.entry.amount_minor, 20930, "70% of 29900 floored");
  assertEqual(created.entry.entry_type, "sale_accrual", "entry type");
  assertEqual(created.entry.author_share_bps, 7000, "rate snapshotted on the entry");
  assertEqual(created.entry.gross_basis_minor, 29900, "gross basis snapshotted");
  assertEqual(created.entry.calculation_version, "p332.v1", "calculation version");
  assertEqual(
    created.entry.idempotency_key,
    `p332:sale:${sale.paymentId}`,
    "deterministic idempotency key",
  );

  // available_at = confirmed_at + hold_days.
  assertEqual(
    scalar(
      `SELECT (available_at = timestamptz '2026-07-11T10:00:00Z' + interval '14 days')::text
       FROM author_ledger_entries WHERE payment_id = '${sale.paymentId}';`,
    ),
    "true",
    "hold window applied",
  );

  const replay = json(
    `SELECT public.ensure_author_sale_accrual('${sale.paymentId}'::uuid, 'corr-sale', NULL);`,
  );
  assertEqual(replay.outcome, "idempotent_replay", "second call is a replay");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE payment_id = '${sale.paymentId}';`),
    1,
    "replay writes no second row",
  );

  // The unique partial index is the hard guarantee behind the replay.
  expectError(
    `INSERT INTO author_ledger_entries (
       author_id, entry_type, amount_minor, payment_id, terms_id, effective_at, idempotency_key
     ) VALUES (
       '${AUTHOR_PAYEE}', 'sale_accrual', 100, '${sale.paymentId}',
       (SELECT id FROM author_commercial_terms WHERE author_id = '${AUTHOR_PAYEE}' AND status = 'approved'),
       now(), 'p332:sale:duplicate'
     );`,
    "author_ledger_entries_sale_accrual_uidx",
    "one sale accrual per payment",
  );

  return sale.paymentId;
}

function testLedgerAppendOnly(paymentId) {
  expectError(
    `UPDATE author_ledger_entries SET amount_minor = 1 WHERE payment_id = '${paymentId}';`,
    "author_ledger_entries_append_only",
    "ledger rows cannot be updated",
  );
  expectError(
    `DELETE FROM author_ledger_entries WHERE payment_id = '${paymentId}';`,
    "author_ledger_entries_append_only",
    "ledger rows cannot be deleted",
  );
  assertEqual(
    number(`SELECT amount_minor FROM author_ledger_entries WHERE payment_id = '${paymentId}';`),
    20930,
    "ledger amount survived every rejected mutation",
  );

  expectError(
    `INSERT INTO author_ledger_entries (author_id, entry_type, amount_minor, refund_id, payment_id, effective_at, idempotency_key)
     VALUES ('${AUTHOR_PAYEE}', 'refund_reversal', 500, NULL, '${paymentId}', now(), 'bad-sign-1');`,
    "author_ledger_entries",
    "a positive reversal is rejected",
  );
  expectError(
    `INSERT INTO author_ledger_entries (author_id, entry_type, amount_minor, payment_id, terms_id, effective_at, idempotency_key)
     VALUES ('${AUTHOR_PAYEE}', 'sale_accrual', -500, NULL, NULL, now(), 'bad-sign-2');`,
    "author_ledger_entries",
    "a negative accrual is rejected",
  );
}

function testCumulativeRefundReversal(paymentId) {
  // Sale accrual is 20930 on a 29900 payment at 70%.
  const first = confirmRefund({ paymentId, amount: 10000, key: "k-rev-1" });
  const firstReversal = json(
    `SELECT public.ensure_author_refund_reversal('${first}'::uuid, 'corr-rev-1', NULL);`,
  );
  // target = floor((29900 - 10000) * 0.7) = 13930 → reversal = -(20930 - 13930) = -7000
  assertEqual(firstReversal.outcome, "created", "first reversal created");
  assertEqual(firstReversal.target_minor, 13930, "cumulative target after 10000 refunded");
  assertEqual(firstReversal.entry.amount_minor, -7000, "first reversal amount");
  assertEqual(firstReversal.entry.net_basis_minor, 19900, "net basis recorded");

  const replay = json(
    `SELECT public.ensure_author_refund_reversal('${first}'::uuid, 'corr-rev-1', NULL);`,
  );
  assertEqual(replay.outcome, "idempotent_replay", "reversal replay is idempotent");

  // Second partial refund: the target keeps shrinking cumulatively.
  const second = confirmRefund({ paymentId, amount: 9900, key: "k-rev-2" });
  const secondReversal = json(
    `SELECT public.ensure_author_refund_reversal('${second}'::uuid, 'corr-rev-2', NULL);`,
  );
  // target = floor((29900 - 19900) * 0.7) = 7000 → reversal = -(20930 - 7000 - 7000) = -6930
  assertEqual(secondReversal.target_minor, 7000, "cumulative target after 19900 refunded");
  assertEqual(secondReversal.entry.amount_minor, -6930, "second reversal amount");

  const netAfterTwo = number(
    `SELECT coalesce(sum(amount_minor), 0)::bigint FROM author_ledger_entries WHERE payment_id = '${paymentId}';`,
  );
  assertEqual(netAfterTwo, 7000, "net entitlement equals the cumulative target");

  // Closing refund: the author position must land exactly on zero.
  const third = confirmRefund({ paymentId, amount: 10000, key: "k-rev-3" });
  const thirdReversal = json(
    `SELECT public.ensure_author_refund_reversal('${third}'::uuid, 'corr-rev-3', NULL);`,
  );
  assertEqual(thirdReversal.target_minor, 0, "fully refunded payment leaves nothing");
  assertEqual(thirdReversal.entry.amount_minor, -7000, "third reversal closes the position");
  assertEqual(
    number(
      `SELECT coalesce(sum(amount_minor), 0)::bigint FROM author_ledger_entries WHERE payment_id = '${paymentId}';`,
    ),
    0,
    "author keeps nothing after a full refund",
  );
  assertEqual(
    number(
      `SELECT count(*)::int FROM author_ledger_entries
       WHERE payment_id = '${paymentId}' AND entry_type = 'refund_reversal';`,
    ),
    3,
    "one reversal row per refund",
  );

  // The buyer's payment record is untouched by all of this.
  assertEqual(
    scalar(`SELECT status FROM payments WHERE id = '${paymentId}';`),
    "succeeded",
    "payments.status is never rewritten by the ledger",
  );
}

function testZeroDeltaReversalWritesNothing() {
  const sale = insertPayment({
    id: "22222222-2222-2222-2222-222222222220",
    userId: USER_B,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    amount: 10000,
    confirmedAt: "2026-07-12T10:00:00Z",
  });
  json(`SELECT public.ensure_author_sale_accrual('${sale.paymentId}'::uuid, 'corr-zero', NULL);`);
  assertEqual(
    number(`SELECT amount_minor FROM author_ledger_entries WHERE payment_id = '${sale.paymentId}';`),
    7000,
    "70% of 10000",
  );

  // 1 kopek back: floor((10000-1)*0.7) = 6999 → a 1 kopek reversal.
  const tiny = confirmRefund({ paymentId: sale.paymentId, amount: 1, key: "k-zero-1" });
  const tinyResult = json(
    `SELECT public.ensure_author_refund_reversal('${tiny}'::uuid, 'corr-zero-1', NULL);`,
  );
  assertEqual(tinyResult.entry.amount_minor, -1, "sub-kopek rounding still reverses one kopek");

  // Another kopek: floor((10000-2)*0.7) = 6998 → another 1 kopek.
  const tiny2 = confirmRefund({ paymentId: sale.paymentId, amount: 1, key: "k-zero-2" });
  const tiny2Result = json(
    `SELECT public.ensure_author_refund_reversal('${tiny2}'::uuid, 'corr-zero-2', NULL);`,
  );
  assertEqual(tiny2Result.entry.amount_minor, -1, "second kopek reversal");

  // Force a zero-delta reversal by reconciling a refund whose target is already met.
  const entriesBefore = number(
    `SELECT count(*)::int FROM author_ledger_entries WHERE payment_id = '${sale.paymentId}';`,
  );
  psql(
    TEST_DB,
    `INSERT INTO payment_refunds (
       id, payment_id, order_id, provider, amount_minor, currency, status,
       reason_code, idempotency_key, confirmed_at
     )
     SELECT '33333333-3333-3333-3333-333333333301', p.id, p.order_id, 'tochka', 0 + 1,
            'RUB', 'requested', 'customer_request', 'k-zero-manual', NULL
     FROM payments AS p WHERE p.id = '${sale.paymentId}';`,
  );
  // The row is still 'requested', so reconciling it must be a no-op, not a write.
  const notSucceeded = json(
    `SELECT public.ensure_author_refund_reversal(
      '33333333-3333-3333-3333-333333333301'::uuid, 'corr-zero-3', NULL
    );`,
  );
  assertEqual(notSucceeded.outcome, "skipped", "unconfirmed refund reverses nothing");
  assertEqual(notSucceeded.result_code, "refund_not_succeeded", "skip reason");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE payment_id = '${sale.paymentId}';`),
    entriesBefore,
    "no ledger row written for a skipped reversal",
  );

  return sale.paymentId;
}

function testReversalWithoutAccrual() {
  const platformSale = insertPayment({
    id: "22222222-2222-2222-2222-222222222230",
    userId: USER_A,
    practiceId: PRACTICE_PLATFORM,
    authorSnapshot: AUTHOR_PLATFORM,
    amount: 50000,
    confirmedAt: "2026-07-13T10:00:00Z",
  });
  const refundId = confirmRefund({
    paymentId: platformSale.paymentId,
    amount: 20000,
    key: "k-platform-refund",
  });
  const result = json(
    `SELECT public.ensure_author_refund_reversal('${refundId}'::uuid, 'corr-platform', NULL);`,
  );
  assertEqual(result.outcome, "skipped", "platform revenue has nothing to reverse");
  assertEqual(result.result_code, "no_sale_accrual", "skip reason");
  assertEqual(
    number(
      `SELECT count(*)::int FROM author_ledger_entries WHERE payment_id = '${platformSale.paymentId}';`,
    ),
    0,
    "no ledger row for a platform-owned refund",
  );
}

function testOutboxEnqueueAndDrain() {
  // Every succeeded payment and refund so far should already be queued by the
  // triggers that ran inside the commerce transactions.
  const paymentsWithout = number(
    `SELECT count(*)::int FROM payments p
     WHERE p.status = 'succeeded'
       AND NOT EXISTS (
         SELECT 1 FROM finance_obligations o
         WHERE o.obligation_type = 'payment_succeeded_accrual' AND o.subject_id = p.id
       );`,
  );
  assertEqual(paymentsWithout, 0, "every succeeded payment enqueued an obligation");

  const refundsWithout = number(
    `SELECT count(*)::int FROM payment_refunds r
     WHERE r.status = 'succeeded'
       AND NOT EXISTS (
         SELECT 1 FROM finance_obligations o
         WHERE o.obligation_type = 'refund_succeeded_reversal' AND o.subject_id = r.id
       );`,
  );
  assertEqual(refundsWithout, 0, "every succeeded refund enqueued an obligation");

  const drained = drain();
  assert(drained.attempted > 0, "drain processed the queue");
  assertEqual(
    number(`SELECT count(*)::int FROM finance_obligations WHERE status = 'pending';`),
    0,
    "queue is empty after the drain",
  );
  assert(
    number(`SELECT count(*)::int FROM finance_obligations WHERE status = 'skipped';`) > 0,
    "platform-owned payments are recorded as deliberate skips",
  );
  assert(
    number(`SELECT count(*)::int FROM finance_obligations WHERE status = 'requires_review';`) > 0,
    "missing terms / snapshot obligations are parked",
  );

  // Draining again must not double-write anything.
  const ledgerBefore = number(`SELECT count(*)::int FROM author_ledger_entries;`);
  drain();
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries;`),
    ledgerBefore,
    "re-draining writes no duplicate ledger rows",
  );

  const terminal = json(
    `SELECT public.process_finance_obligation(
      (SELECT id FROM finance_obligations WHERE status = 'processed' LIMIT 1)
    );`,
  );
  assertEqual(terminal.outcome, "already_terminal", "processed obligations are terminal");
}

function testOutboxRepairsMissingTerms() {
  // A payment that arrived before its terms existed must settle as soon as the
  // terms are approved, without touching the payment or the entitlement.
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_NO_TERMS}';`);
  const parked = number(
    `SELECT count(*)::int FROM finance_obligations
     WHERE status = 'requires_review' AND result_code = 'no_active_terms';`,
  );
  assert(parked > 0, "there is a parked no-terms obligation to repair");

  const terms = json(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_NO_TERMS}'::uuid, 5000, '${TERMS_FROM}'::timestamptz, NULL, 0, 'RUB',
      'late terms', '${STAFF}'::uuid, 'corr-late', true
    );`,
  );
  assertEqual(terms.status, "approved", "late terms approved directly");

  // Parked rows back off for an hour; ops replays them explicitly.
  const obligationId = scalar(
    `SELECT id FROM finance_obligations
     WHERE status = 'requires_review' AND result_code = 'no_active_terms' LIMIT 1;`,
  );
  const repaired = json(`SELECT public.process_finance_obligation('${obligationId}'::uuid);`);
  assertEqual(repaired.status, "processed", "obligation settles once terms exist");

  const entry = json(
    `SELECT public.author_ledger_entry_row_json(e) FROM author_ledger_entries AS e
     WHERE e.author_id = '${AUTHOR_NO_TERMS}' AND e.entry_type = 'sale_accrual';`,
  );
  assertEqual(entry.amount_minor, 14950, "50% of 29900");
  assertEqual(entry.hold_days, 0, "zero hold days honoured");
}

function testBalanceHeldVsPayable() {
  // Zero hold: immediately payable.
  const immediate = balance(AUTHOR_NO_TERMS);
  assertEqual(immediate.held_minor, 0, "no hold means nothing held");
  assertEqual(immediate.payable_minor, 14950, "zero-hold accrual is payable now");
  assertEqual(immediate.net_entitlement_minor, 14950, "net equals payable");

  // A fresh sale under a 14 day hold is held, not payable.
  const before = balance(AUTHOR_PAYEE);
  insertPayment({
    id: "22222222-2222-2222-2222-222222222240",
    userId: USER_A,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    amount: 100000,
    confirmedAt: new Date().toISOString(),
  });
  drain();

  const payee = balance(AUTHOR_PAYEE);
  assertEqual(
    payee.held_minor - before.held_minor,
    70000,
    "fresh sale sits in the hold window, not in payable",
  );
  assertEqual(
    payee.payable_minor,
    before.payable_minor,
    "a held sale adds nothing to payable",
  );
  assert(payee.payable_minor >= 0, "payable is not negative");
  assertEqual(
    payee.net_entitlement_minor,
    payee.held_minor + payee.payable_minor,
    "net = held + payable",
  );
  assertEqual(payee.paid_out_minor, 0, "payouts are not connected");
  assertEqual(payee.notes.payouts, "not_connected", "payout note");

  // A manual adjustment is payable immediately and is the only correction path.
  const adjustment = json(
    `SELECT public.create_author_ledger_manual_adjustment(
      '${AUTHOR_PAYEE}'::uuid, -500::bigint, 'ops_correction', 'adj-1',
      'manual clawback', 'RUB', NULL, '${STAFF}'::uuid, 'corr-adj'
    );`,
  );
  assertEqual(adjustment.outcome, "created", "adjustment created");
  assertEqual(adjustment.entry.amount_minor, -500, "adjustment amount");

  const adjustmentReplay = json(
    `SELECT public.create_author_ledger_manual_adjustment(
      '${AUTHOR_PAYEE}'::uuid, -500::bigint, 'ops_correction', 'adj-1',
      'manual clawback', 'RUB', NULL, '${STAFF}'::uuid, 'corr-adj'
    );`,
  );
  assertEqual(adjustmentReplay.outcome, "idempotent_replay", "adjustment key is idempotent");

  expectError(
    `SELECT public.create_author_ledger_manual_adjustment(
      '${AUTHOR_PAYEE}'::uuid, 0::bigint, 'ops_correction', 'adj-zero',
      NULL, 'RUB', NULL, '${STAFF}'::uuid, NULL
    );`,
    "amount_must_be_nonzero",
    "a zero adjustment is meaningless",
  );
  expectError(
    `SELECT public.create_author_ledger_manual_adjustment(
      '${AUTHOR_PAYEE}'::uuid, 100::bigint, '  ', 'adj-noreason',
      NULL, 'RUB', NULL, '${STAFF}'::uuid, NULL
    );`,
    "reason_code_required",
    "adjustments need a reason",
  );

  const afterAdjustment = balance(AUTHOR_PAYEE);
  assertEqual(
    afterAdjustment.payable_minor,
    payee.payable_minor - 500,
    "adjustment lands straight in payable",
  );
}

function testTermsCloseKeepsHistory() {
  const before = json(
    `SELECT public.resolve_author_commercial_terms('${AUTHOR_NO_TERMS}'::uuid, now(), 'RUB');`,
  );
  assertEqual(before.found, true, "terms active before closing");

  const termsId = before.terms_id;
  const closed = json(
    `SELECT public.close_author_commercial_terms(
      '${termsId}'::uuid, now(), 'renegotiated', '${STAFF}'::uuid, 'corr-close', 'superseded'
    );`,
  );
  assertEqual(closed.status, "superseded", "terms superseded");

  const after = json(
    `SELECT public.resolve_author_commercial_terms('${AUTHOR_NO_TERMS}'::uuid, now() + interval '1 day', 'RUB');`,
  );
  assertEqual(after.found, false, "closed terms stop resolving");

  // Already-written entries keep the historic rate.
  assertEqual(
    number(
      `SELECT author_share_bps FROM author_ledger_entries
       WHERE author_id = '${AUTHOR_NO_TERMS}' AND entry_type = 'sale_accrual';`,
    ),
    5000,
    "history keeps the rate it was written with",
  );

  // A successor period may now be approved without overlapping.
  const next = json(
    `SELECT public.create_author_commercial_terms_draft(
      '${AUTHOR_NO_TERMS}'::uuid, 6000, now() + interval '1 day', NULL, 14, 'RUB',
      'new deal', '${STAFF}'::uuid, 'corr-next', true
    );`,
  );
  assertEqual(next.status, "approved", "successor terms approved after the close");
}

function testAmbiguousTermsNeverGuess() {
  // The overlap guard makes this unreachable through the RPCs, so we force the
  // data corruption directly to prove the resolver still refuses to guess.
  psql(
    TEST_DB,
    `ALTER TABLE author_commercial_terms DISABLE TRIGGER author_commercial_terms_no_overlap_trg;
     INSERT INTO author_commercial_terms (
       author_id, currency, author_share_bps, platform_fee_bps, hold_days,
       provider_fee_policy, refund_policy, rounding_policy,
       status, valid_from, approved_at
     ) VALUES (
       '${AUTHOR_PAYEE}', 'RUB', 4000, 6000, 14,
       'platform_absorbs', 'proportional_reversal', 'floor_author_remainder_platform',
       'approved', '${TERMS_FROM}', now()
     );
     ALTER TABLE author_commercial_terms ENABLE TRIGGER author_commercial_terms_no_overlap_trg;`,
  );

  const ambiguous = json(
    `SELECT public.resolve_author_commercial_terms('${AUTHOR_PAYEE}'::uuid, now(), 'RUB');`,
  );
  assertEqual(ambiguous.found, false, "two matching rates resolve to nothing");
  assertEqual(ambiguous.reason, "ambiguous_terms", "ambiguity is named");
  assertEqual(ambiguous.match_count, 2, "both matches counted");

  const sale = insertPayment({
    id: "22222222-2222-2222-2222-222222222250",
    userId: USER_B,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    amount: 29900,
    confirmedAt: new Date().toISOString(),
  });
  const result = json(
    `SELECT public.ensure_author_sale_accrual('${sale.paymentId}'::uuid, 'corr-amb', NULL);`,
  );
  assertEqual(result.outcome, "requires_review", "ambiguous terms park the accrual");
  assertEqual(result.result_code, "ambiguous_terms", "review reason is the ambiguity");

  assertEqual(
    number(`SELECT (public.admin_author_finance_p332_integrity_snapshot(true) ->> 'overlapping_approved_terms')::int;`),
    2,
    "integrity snapshot surfaces the overlap",
  );

  psql(
    TEST_DB,
    `ALTER TABLE author_commercial_terms DISABLE TRIGGER author_commercial_terms_immutability_trg;
     DELETE FROM author_commercial_terms
     WHERE author_id = '${AUTHOR_PAYEE}' AND author_share_bps = 4000 AND status = 'approved';
     ALTER TABLE author_commercial_terms ENABLE TRIGGER author_commercial_terms_immutability_trg;`,
  );
  assertEqual(
    number(`SELECT (public.admin_author_finance_p332_integrity_snapshot(true) ->> 'overlapping_approved_terms')::int;`),
    0,
    "overlap cleared",
  );

  return sale.paymentId;
}

function testTestPaymentIsolation() {
  const testSale = insertPayment({
    id: "22222222-2222-2222-2222-222222222260",
    userId: USER_A,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    amount: 100000,
    confirmedAt: "2026-07-14T10:00:00Z",
    isTest: true,
  });
  json(`SELECT public.ensure_author_sale_accrual('${testSale.paymentId}'::uuid, 'corr-test', NULL);`);

  assertEqual(
    bool(`SELECT is_test::text FROM author_ledger_entries WHERE payment_id = '${testSale.paymentId}';`),
    true,
    "test flag inherited from the payment",
  );

  const real = balance(AUTHOR_PAYEE, false);
  const withTest = balance(AUTHOR_PAYEE, true);
  assert(
    withTest.net_entitlement_minor > real.net_entitlement_minor,
    "test money is excluded from the real balance",
  );
}

function testAnalytics() {
  const summary = json(`SELECT public.admin_author_finance_p332_summary(NULL, NULL, false);`);
  const p31 = json(`SELECT public.admin_payments_p31_summary(NULL,NULL,NULL,NULL,false,NULL,NULL);`);
  assertEqual(summary.gross_minor, p31.gross_minor, "author economy reuses P3.1 gross");
  assertEqual(summary.payment_count, p31.payment_count, "payment count matches P3.1");
  assertEqual(
    summary.net_entitlement_minor,
    summary.accrued_minor + summary.reversed_minor + summary.adjustments_minor,
    "net = accrued + reversed + adjustments",
  );
  assertEqual(
    summary.platform_share_minor,
    summary.gross_minor - (summary.accrued_minor + summary.reversed_minor),
    "platform share is the remainder",
  );
  assertEqual(summary.calculation_version, "p332.v1", "calculation version reported");
  assertEqual(summary.notes.payouts, "not_connected", "payouts not connected");
  assertEqual(summary.notes.product_overrides, "not_implemented", "product overrides not implemented");
  assert(summary.obligations_skipped_platform_owned > 0, "platform skips are counted");

  const authors = json(
    `SELECT public.admin_author_finance_p332_authors(NULL, NULL, false, NULL, 50, 0);`,
  );
  assert(authors.total >= 3, "all authors listed");
  const payee = authors.rows.find((row) => row.author_id === AUTHOR_PAYEE);
  const platform = authors.rows.find((row) => row.author_id === AUTHOR_PLATFORM);
  assertEqual(payee.payout_class, "payout_eligible", "explicit payee classified");
  assertEqual(platform.payout_class, "platform_owned_heuristic", "platform catalog classified");
  assertEqual(platform.payout_eligible, false, "platform author stays ineligible");
  assertEqual(platform.net_entitlement_minor, 0, "platform author has no entitlement");
  assertEqual(payee.current_share_bps, 7000, "current rate surfaced");

  const serialized = JSON.stringify(authors.rows);
  assert(!serialized.includes("@example.com"), "authors table exposes no buyer email");
  assert(!serialized.includes("user_id"), "authors table exposes no buyer id");

  const ledger = json(
    `SELECT public.admin_author_finance_p332_ledger(NULL, NULL, false, NULL, NULL, NULL, 100, 0);`,
  );
  assert(ledger.total > 0, "ledger list has rows");
  const ledgerSerialized = JSON.stringify(ledger.rows);
  assert(!ledgerSerialized.includes("@example.com"), "ledger exposes no buyer email");
  assert(!ledgerSerialized.includes('"user_id"'), "ledger exposes no buyer id");

  const filtered = json(
    `SELECT public.admin_author_finance_p332_ledger(NULL, NULL, false, NULL, 'refund_reversal', NULL, 100, 0);`,
  );
  assert(
    filtered.rows.every((row) => row.entry_type === "refund_reversal"),
    "entry type filter applied",
  );
  const paged = json(
    `SELECT public.admin_author_finance_p332_ledger(NULL, NULL, false, NULL, NULL, NULL, 1, 0);`,
  );
  assertEqual(paged.rows.length, 1, "limit respected");
  assertEqual(paged.total, ledger.total, "total ignores pagination");
}

function testPaymentDetail(paymentId) {
  const detail = json(
    `SELECT public.admin_author_finance_p332_payment_detail('${paymentId}'::uuid);`,
  );
  assertEqual(detail.found, true, "payment detail found");
  assertEqual(detail.attribution_source, "snapshot", "attribution from the write-time snapshot");
  assertEqual(detail.sale_accrual_minor, 20930, "accrual shown");
  assertEqual(detail.reversed_minor, 20930, "reversals shown");
  assertEqual(detail.author_net_minor, 0, "net position after a full refund");
  assertEqual(detail.target_entitlement_minor, 0, "target matches");
  assertEqual(detail.reconciled, true, "payment reconciles");
  assertEqual(detail.settlement.settlement_status, "fully_refunded", "P3.3.1 settlement reused");
  assertEqual(detail.entries.length, 4, "one accrual plus three reversals");

  const missing = json(
    `SELECT public.admin_author_finance_p332_payment_detail('99999999-9999-9999-9999-999999999999'::uuid);`,
  );
  assertEqual(missing.found, false, "unknown payment reported as not found");
}

function testIntegritySnapshot() {
  const snapshot = json(`SELECT public.admin_author_finance_p332_integrity_snapshot(true);`);
  assertEqual(snapshot.wrong_sign_entries, 0, "no wrong-sign entries");
  assertEqual(snapshot.over_reversed_payments, 0, "no over-reversed payments");
  assertEqual(snapshot.accrual_exceeds_payment, 0, "no accrual exceeds its payment");
  assertEqual(snapshot.accrual_formula_mismatch, 0, "every accrual matches the formula");
  assertEqual(snapshot.unreconciled_payments, 0, "every payment reconciles to its target");
  assertEqual(snapshot.duplicate_sale_accruals, 0, "no duplicate accruals");
  assertEqual(snapshot.duplicate_refund_reversals, 0, "no duplicate reversals");
  assertEqual(snapshot.entries_missing_idempotency_key, 0, "idempotency keys present");
  assertEqual(snapshot.accruals_without_terms, 0, "every accrual points at its terms");
  assertEqual(snapshot.reversals_without_sale, 0, "no orphan reversals");
  assertEqual(
    snapshot.accruals_for_non_eligible_authors,
    0,
    "platform-owned authors never accrue",
  );
  assertEqual(snapshot.accruals_without_succeeded_payment, 0, "accruals sit on succeeded payments");
  assertEqual(snapshot.accrual_author_snapshot_mismatch, 0, "accrual author matches the snapshot");
  assertEqual(snapshot.succeeded_payments_without_obligation, 0, "outbox covers every payment");
  assertEqual(snapshot.succeeded_refunds_without_obligation, 0, "outbox covers every refund");
  assertEqual(snapshot.entries_without_audit_entry, 0, "every ledger row is audited");
  assertEqual(snapshot.overlapping_approved_terms, 0, "no overlapping approved terms");
  assert(snapshot.entries_total > 0, "ledger is populated");
}

function testHistoricalDryRunIsReadOnly() {
  const ledgerBefore = number(`SELECT count(*)::int FROM author_ledger_entries;`);
  const termsBefore = number(`SELECT count(*)::int FROM author_commercial_terms;`);
  const obligationsBefore = number(`SELECT count(*)::int FROM finance_obligations;`);

  const dry = json(
    `SELECT public.admin_author_finance_p332_historical_dry_run(NULL, NULL, false, 200);`,
  );

  assertEqual(dry.read_only, true, "dry run declares itself read-only");
  assertEqual(dry.writes_performed, 0, "dry run performs no writes");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries;`),
    ledgerBefore,
    "dry run wrote no ledger rows",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_commercial_terms;`),
    termsBefore,
    "dry run wrote no terms",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM finance_obligations;`),
    obligationsBefore,
    "dry run wrote no obligations",
  );

  assert(dry.totals.platform_owned_count > 0, "platform-owned payments are labelled");
  assert(dry.rows.length > 0, "dry run returns rows");
  assert(
    dry.rows.every((row) => row.attribution_source === "snapshot" || row.attribution_source === "historical_fallback"),
    "every row is labelled snapshot or historical_fallback",
  );
  const blocked = dry.rows.filter((row) => row.blocker !== null);
  assert(
    blocked.every((row) => row.proposed_accrual_minor === 0),
    "blocked rows never propose money",
  );
  assert(
    dry.rows.some((row) => row.blocker === "platform_owned_no_payout"),
    "platform-owned blocker present",
  );
  assert(
    dry.heuristics.platform_owned.includes("platform-owned"),
    "platform heuristic is documented in the payload",
  );
  assertEqual(
    dry.notes.backfill,
    "not_performed_p332_creates_no_historical_ledger",
    "dry run states there is no backfill",
  );
  assertEqual(
    dry.notes.payout_blocker,
    "payouts_are_manual_and_out_of_scope_in_p332",
    "manual payout blocker documented",
  );

  // A fallback-attributed payment can never propose money.
  const fallbackRows = dry.rows.filter((row) => row.attribution_source === "historical_fallback");
  assert(
    fallbackRows.every((row) => row.proposed_accrual_minor === 0),
    "historical fallback never proposes an accrual",
  );
}

function testRegressionAgainstEarlierPhases() {
  // P3.1 gross methodology must be unchanged by the author layer.
  const expectedGross = number(
    `SELECT coalesce(sum(amount_minor), 0)::bigint
     FROM payments WHERE status = 'succeeded' AND is_test = false;`,
  );
  const p31 = json(`SELECT public.admin_payments_p31_summary(NULL,NULL,NULL,NULL,false,NULL,NULL);`);
  assertEqual(p31.gross_minor, expectedGross, "P3.1 gross unchanged");
  assertEqual(p31.notes.refunds, "not_connected", "P3.1 notes untouched");

  // P3.3.1 refund facts must be unchanged too.
  const refunds = json(`SELECT public.admin_refund_p331_summary(NULL, NULL, false);`);
  assertEqual(refunds.gross_minor, p31.gross_minor, "P3.3.1 still reads P3.1 gross");
  assertEqual(
    refunds.net_minor,
    refunds.gross_minor - refunds.refunded_minor,
    "P3.3.1 net formula unchanged",
  );
  assertEqual(
    number(`SELECT (public.admin_refund_p331_integrity_snapshot(true) ->> 'over_refunded_payments')::int;`),
    0,
    "P3.3.1 integrity still clean",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM payments WHERE status = 'refunded';`),
    0,
    "payments.status never becomes refunded",
  );
}

function testSecurityGrants() {
  const tables = ["author_commercial_terms", "author_ledger_entries", "finance_obligations"];
  for (const table of tables) {
    assert(
      bool(`SELECT relrowsecurity::text FROM pg_class WHERE relname = '${table}';`),
      `${table}: RLS enabled`,
    );
    assertEqual(
      number(`SELECT count(*)::int FROM pg_policies WHERE tablename = '${table}';`),
      0,
      `${table}: no client policies`,
    );
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert(
          !bool(`SELECT has_table_privilege('${role}', 'public.${table}', '${privilege}')::text;`),
          `${table}: ${role} cannot ${privilege}`,
        );
      }
    }
  }

  // The ledger is append-only at the grant level too.
  assert(
    bool(`SELECT has_table_privilege('service_role', 'public.author_ledger_entries', 'INSERT')::text;`),
    "service_role can append ledger rows",
  );
  assert(
    !bool(`SELECT has_table_privilege('service_role', 'public.author_ledger_entries', 'UPDATE')::text;`),
    "ledger is not updatable",
  );
  assert(
    !bool(`SELECT has_table_privilege('service_role', 'public.author_ledger_entries', 'DELETE')::text;`),
    "ledger is not deletable",
  );
  assert(
    !bool(`SELECT has_table_privilege('service_role', 'public.author_commercial_terms', 'DELETE')::text;`),
    "terms are not deletable",
  );

  const functions = [
    "resolve_author_commercial_terms",
    "ensure_author_sale_accrual",
    "ensure_author_refund_reversal",
    "process_finance_obligation",
    "process_due_finance_obligations",
    "create_author_commercial_terms_draft",
    "approve_author_commercial_terms",
    "close_author_commercial_terms",
    "create_author_ledger_manual_adjustment",
    "author_finance_balance",
    "author_ledger_payment_positions",
    "admin_author_finance_p332_summary",
    "admin_author_finance_p332_authors",
    "admin_author_finance_p332_ledger",
    "admin_author_finance_p332_payment_detail",
    "admin_author_finance_p332_integrity_snapshot",
    "admin_author_finance_p332_historical_dry_run",
  ];
  for (const fn of functions) {
    const identity = scalar(
      `SELECT p.oid::regprocedure::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${fn}' LIMIT 1;`,
    );
    assert(identity.length > 0, `${fn}: exists`);
    for (const role of ["anon", "authenticated", "public"]) {
      assert(
        !bool(`SELECT has_function_privilege('${role}', '${identity}', 'EXECUTE')::text;`),
        `${fn}: ${role} cannot execute`,
      );
    }
    assert(
      bool(`SELECT has_function_privilege('service_role', '${identity}', 'EXECUTE')::text;`),
      `${fn}: service_role can execute`,
    );
    assert(
      bool(
        `SELECT prosecdef::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = '${fn}' LIMIT 1;`,
      ),
      `${fn}: security definer`,
    );
    assert(
      scalar(
        `SELECT coalesce(array_to_string(proconfig, ','), '') FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = '${fn}' LIMIT 1;`,
      ).includes("search_path"),
      `${fn}: fixed search_path`,
    );
  }
}

function testPermissionsSeeded() {
  for (const code of [
    "finance.terms.manage",
    "finance.ledger.manage",
    "finance.adjustments.manage",
  ]) {
    assertEqual(
      number(`SELECT count(*)::int FROM platform_permissions WHERE code = '${code}';`),
      1,
      `${code}: permission seeded`,
    );
    for (const role of ["owner", "finance"]) {
      assertEqual(
        number(
          `SELECT count(*)::int FROM platform_role_permissions
           WHERE role_code = '${role}' AND permission_code = '${code}';`,
        ),
        1,
        `${code}: granted to ${role}`,
      );
    }
    for (const role of ["admin", "analyst", "support", "editor"]) {
      assertEqual(
        number(
          `SELECT count(*)::int FROM platform_role_permissions
           WHERE role_code = '${role}' AND permission_code = '${code}';`,
        ),
        0,
        `${code}: not granted to ${role}`,
      );
    }
  }
}

function testRollingDeploySafety() {
  const ledgerBefore = number(`SELECT count(*)::int FROM author_ledger_entries;`);
  const termsBefore = number(`SELECT count(*)::int FROM author_commercial_terms;`);
  const eligibleBefore = number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`);

  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260726140000_payments_p332_author_ledger.sql"));

  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries;`),
    ledgerBefore,
    "re-apply preserves the ledger and adds nothing",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_commercial_terms;`),
    termsBefore,
    "re-apply preserves terms and adds nothing",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`),
    eligibleBefore,
    "re-apply never changes payout eligibility",
  );
}

function main() {
  bootstrap();

  testMigrationSeedsNothing();
  testShareMath();
  const termsId = testTermsLifecycle();
  testTermsOverlapGuard();
  testTermsImmutability(termsId);
  testAccrualEligibility();
  const salePaymentId = testAccrualHappyPath();
  testLedgerAppendOnly(salePaymentId);
  testCumulativeRefundReversal(salePaymentId);
  testZeroDeltaReversalWritesNothing();
  testReversalWithoutAccrual();
  testOutboxEnqueueAndDrain();
  testOutboxRepairsMissingTerms();
  testBalanceHeldVsPayable();
  testTermsCloseKeepsHistory();
  testAmbiguousTermsNeverGuess();
  testTestPaymentIsolation();
  testAnalytics();
  testPaymentDetail(salePaymentId);
  testIntegritySnapshot();
  testHistoricalDryRunIsReadOnly();
  testRegressionAgainstEarlierPhases();
  testSecurityGrants();
  testPermissionsSeeded();
  testRollingDeploySafety();

  console.log("payments-p332-author-finance-sql-unit: ok");
}

main();

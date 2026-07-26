#!/usr/bin/env node
/**
 * P3.3.1 refund fact layer SQL tests on isolated DB (never production).
 * No provider calls: every "provider" transition is applied through the RPCs.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_payments_p331_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";
const STAFF = "d9999999-9999-9999-9999-999999999999";
const AUTHOR = "a1111111-1111-1111-1111-111111111111";
const PRACTICE = "c1111111-1111-1111-1111-111111111111";
const PRACTICE_B = "c2222222-2222-2222-2222-222222222222";

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
  -- Roles are cluster-wide: the Supabase container already ships them.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END
$roles$;
CREATE TABLE public.authors (id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE);
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

INSERT INTO auth.users VALUES
  ('${USER_A}', 'a@example.com'),
  ('${USER_B}', 'b@example.com'),
  ('${STAFF}', 'staff@example.com');
INSERT INTO public.authors VALUES ('${AUTHOR}', 'Author', 'author');
INSERT INTO public.practices VALUES
  ('${PRACTICE}', '${AUTHOR}', 'Practice A', 'practice-a', 'published', 299, false),
  ('${PRACTICE_B}', '${AUTHOR}', 'Practice B', 'practice-b', 'published', 199, false);
`,
  );

  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192000_admin_payments_p31_money.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192100_admin_payments_p31_authors_products_fix.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260726120000_payments_p331_refund_facts.sql"));
}

function insertPayment({
  id,
  userId,
  practiceId,
  status = "succeeded",
  amount,
  confirmedAt,
  isTest = false,
  grantAccess = true,
}) {
  const orderId = id.replace(/^22/, "11");
  const paid = status === "succeeded";
  psql(
    TEST_DB,
    `
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
  is_test, paid_at, created_at
) VALUES (
  '${orderId}', '${userId}', '${practiceId}', '${paid ? "paid" : "pending"}', ${amount}, 'RUB',
  'Snap', 'snap', ${amount}, ${isTest}, ${paid ? `'${confirmedAt}'` : "NULL"}, '${confirmedAt}'
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
  if (paid && grantAccess) {
    psql(
      TEST_DB,
      `INSERT INTO user_practices (user_id, practice_id, access_source, granted_at)
       VALUES ('${userId}', '${practiceId}', 'purchase', '${confirmedAt}')
       ON CONFLICT DO NOTHING;`,
    );
  }
  return { paymentId: id, orderId };
}

function createRefund({ paymentId, amount, key, reason = "customer_request", allowTest = false }) {
  return json(
    `SELECT public.create_payment_refund_request(
      '${paymentId}'::uuid, ${amount}::bigint, '${reason}', NULL,
      '${key}', '${STAFF}'::uuid, 'corr-${key}', ${allowTest}, NULL
    );`,
  );
}

function applyStatus(refundId, status, { providerRefundId = null, failureCode = null } = {}) {
  return json(
    `SELECT public.apply_payment_refund_provider_status(
      '${refundId}'::uuid, '${status}', 'PROVIDER-${status}',
      ${providerRefundId ? `'${providerRefundId}'` : "NULL"},
      ${failureCode ? `'${failureCode}'` : "NULL"}, NULL,
      '{}'::jsonb, 'corr-apply', NULL
    );`,
  );
}

function submit(refundId, providerRefundId) {
  return json(
    `SELECT public.mark_payment_refund_submitted(
      '${refundId}'::uuid, '${providerRefundId}', 'ON-REFUND', 'req-1',
      '{}'::jsonb, 'corr-submit', '${STAFF}'::uuid
    );`,
  );
}

function settlement(paymentId) {
  return json(`SELECT public.payment_refund_settlement_snapshot('${paymentId}'::uuid);`);
}

// ---------------------------------------------------------------------------

function testCreateValidation() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222201",
    userId: USER_A,
    practiceId: PRACTICE,
    amount: 30000,
    confirmedAt: "2026-07-20T10:00:00Z",
  });

  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 0::bigint, 'r', NULL, 'k-zero', NULL, NULL, false, NULL);`,
    "amount_must_be_positive",
    "zero amount rejected",
  );
  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, -100::bigint, 'r', NULL, 'k-neg', NULL, NULL, false, NULL);`,
    "amount_must_be_positive",
    "negative amount rejected",
  );
  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 100::bigint, '  ', NULL, 'k-noreason', NULL, NULL, false, NULL);`,
    "reason_code_required",
    "reason required",
  );
  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 100::bigint, 'r', NULL, '', NULL, NULL, false, NULL);`,
    "idempotency_key_required",
    "idempotency key required",
  );
  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 30001::bigint, 'r', NULL, 'k-over', NULL, NULL, false, NULL);`,
    "refund_amount_exceeds_refundable",
    "over-refund on create rejected",
  );
  expectError(
    `SELECT public.create_payment_refund_request(
      '99999999-9999-9999-9999-999999999999'::uuid, 100::bigint, 'r', NULL, 'k-missing', NULL, NULL, false, NULL
    );`,
    "payment_not_found",
    "unknown payment rejected",
  );
  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 100::bigint, 'r', NULL, 'k-eff', NULL, NULL, false, 'delete_user');`,
    "invalid_access_effect",
    "invalid access effect rejected",
  );

  assertEqual(
    number(`SELECT count(*)::int FROM payment_refunds WHERE payment_id='${paymentId}';`),
    0,
    "no refund rows created by rejected requests",
  );

  return paymentId;
}

function testPartialFullAndSettlement(paymentId) {
  const first = createRefund({ paymentId, amount: 10000, key: "k-partial-1" });
  assertEqual(first.ok, true, "first refund created");
  assertEqual(first.refund.status, "requested", "initial status requested");
  assertEqual(first.refund.kind, "partial", "partial kind");
  assertEqual(first.refund.access_effect, "keep", "partial keeps access");
  assertEqual(first.refund.currency, "RUB", "currency copied from payment");
  assertEqual(first.settlement.in_flight_minor, 10000, "reserve after request");
  assertEqual(first.settlement.refundable_minor, 20000, "refundable after reserve");
  assertEqual(first.settlement.confirmed_refunded_minor, 0, "nothing confirmed yet");

  // Reserve blocks a second request that would exceed the remaining balance.
  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 20001::bigint, 'r', NULL, 'k-over-2', NULL, NULL, false, NULL);`,
    "refund_amount_exceeds_refundable",
    "reserve counts against refundable",
  );

  const firstId = first.refund.id;
  submit(firstId, "prov-refund-1");
  const confirmed = applyStatus(firstId, "succeeded", { providerRefundId: "prov-refund-1" });
  assertEqual(confirmed.refund.status, "succeeded", "confirmed");
  assert(confirmed.refund.confirmed_at !== null, "confirmed_at set");
  assertEqual(confirmed.settlement.confirmed_refunded_minor, 10000, "confirmed sum");
  assertEqual(confirmed.settlement.in_flight_minor, 0, "reserve released on confirm");
  assertEqual(confirmed.settlement.refundable_minor, 20000, "refundable after confirm");
  assertEqual(confirmed.settlement.net_collected_minor, 20000, "net collected");
  assertEqual(confirmed.settlement.settlement_status, "partially_refunded", "partial settlement");

  // Closing the remaining balance is classified full and flags a manual access review.
  const rest = createRefund({ paymentId, amount: 20000, key: "k-full-rest" });
  assertEqual(rest.refund.kind, "full", "closing refund is full");
  assertEqual(rest.refund.access_effect, "manual_review", "full refund flags review");

  const restId = rest.refund.id;
  submit(restId, "prov-refund-2");
  const done = applyStatus(restId, "succeeded", { providerRefundId: "prov-refund-2" });
  assertEqual(done.settlement.confirmed_refunded_minor, 30000, "all refunded");
  assertEqual(done.settlement.refundable_minor, 0, "nothing left");
  assertEqual(done.settlement.net_collected_minor, 0, "net zero");
  assertEqual(done.settlement.settlement_status, "fully_refunded", "fully refunded");

  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 1::bigint, 'r', NULL, 'k-after-full', NULL, NULL, false, NULL);`,
    "no_refundable_amount",
    "nothing refundable after full refund",
  );

  // P3.1 source of truth must be untouched.
  assertEqual(
    scalar(`SELECT status FROM payments WHERE id='${paymentId}';`),
    "succeeded",
    "payment stays succeeded",
  );
  assertEqual(
    scalar(`SELECT status FROM orders WHERE id=(SELECT order_id FROM payments WHERE id='${paymentId}');`),
    "paid",
    "order stays paid",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM user_practices WHERE user_id='${USER_A}' AND practice_id='${PRACTICE}';`),
    1,
    "access is not auto-revoked",
  );
}

function testIdempotency() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222202",
    userId: USER_B,
    practiceId: PRACTICE_B,
    amount: 50000,
    confirmedAt: "2026-07-21T10:00:00Z",
  });

  const first = createRefund({ paymentId, amount: 20000, key: "k-idem" });
  const replay = createRefund({ paymentId, amount: 20000, key: "k-idem" });
  assertEqual(replay.idempotent_replay, true, "replay flagged");
  assertEqual(replay.refund.id, first.refund.id, "replay returns same refund");
  assertEqual(
    number(`SELECT count(*)::int FROM payment_refunds WHERE payment_id='${paymentId}';`),
    1,
    "replay does not double-reserve",
  );
  assertEqual(settlement(paymentId).in_flight_minor, 20000, "single reserve after replay");

  // A different amount under the same key must not create a second reserve.
  const replayOther = createRefund({ paymentId, amount: 999, key: "k-idem" });
  assertEqual(replayOther.refund.amount_minor, 20000, "key wins over amount");

  return paymentId;
}

function testStateMachine(paymentId) {
  const refundId = scalar(
    `SELECT id FROM payment_refunds WHERE payment_id='${paymentId}' ORDER BY requested_at LIMIT 1;`,
  );

  assert(
    bool(`SELECT public.payment_refund_transition_allowed('requested','submitted')::text;`),
    "requested → submitted",
  );
  assert(
    !bool(`SELECT public.payment_refund_transition_allowed('requested','succeeded')::text;`),
    "requested → succeeded blocked",
  );
  assert(
    !bool(`SELECT public.payment_refund_transition_allowed('succeeded','failed')::text;`),
    "succeeded terminal",
  );
  assert(
    !bool(`SELECT public.payment_refund_transition_allowed('cancelled','requested')::text;`),
    "cancelled terminal",
  );
  assert(
    bool(`SELECT public.payment_refund_transition_allowed('requires_review','succeeded')::text;`),
    "review can resolve to succeeded",
  );
  assert(
    bool(`SELECT public.payment_refund_transition_allowed('pending','pending')::text;`),
    "same status idempotent",
  );

  const invalid = applyStatus(refundId, "succeeded");
  assertEqual(invalid.ok, false, "requested cannot jump to succeeded");
  assertEqual(invalid.error, "invalid_transition", "invalid transition reported");
  assertEqual(
    scalar(`SELECT status FROM payment_refunds WHERE id='${refundId}';`),
    "requested",
    "status unchanged after invalid transition",
  );

  submit(refundId, "prov-refund-3");
  assertEqual(
    scalar(`SELECT status FROM payment_refunds WHERE id='${refundId}';`),
    "submitted",
    "submitted applied",
  );

  const resubmit = submit(refundId, "prov-refund-3");
  assertEqual(resubmit.ok, true, "resubmit is idempotent");
  assertEqual(resubmit.refund.status, "submitted", "still submitted");

  applyStatus(refundId, "pending");
  applyStatus(refundId, "succeeded");
  const terminal = applyStatus(refundId, "failed");
  assertEqual(terminal.outcome, "ignored_terminal", "terminal row ignores later transitions");
  assertEqual(
    scalar(`SELECT status FROM payment_refunds WHERE id='${refundId}';`),
    "succeeded",
    "terminal status preserved",
  );
}

function testCancelAndReviewReserve() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222203",
    userId: USER_A,
    practiceId: PRACTICE_B,
    amount: 40000,
    confirmedAt: "2026-07-22T10:00:00Z",
  });

  const cancellable = createRefund({ paymentId, amount: 15000, key: "k-cancel" });
  const cancelId = cancellable.refund.id;
  assertEqual(settlement(paymentId).refundable_minor, 25000, "reserve held before cancel");

  const cancelled = json(
    `SELECT public.cancel_payment_refund_request('${cancelId}'::uuid, 'operator changed mind', '${STAFF}'::uuid, 'corr-cancel');`,
  );
  assertEqual(cancelled.ok, true, "cancel ok");
  assertEqual(cancelled.refund.status, "cancelled", "cancelled status");
  assertEqual(settlement(paymentId).refundable_minor, 40000, "cancel releases the reserve");

  const replayCancel = json(
    `SELECT public.cancel_payment_refund_request('${cancelId}'::uuid, NULL, '${STAFF}'::uuid, 'corr-cancel');`,
  );
  assertEqual(replayCancel.idempotent_replay, true, "cancel replay is idempotent");

  // Submitted refunds belong to the provider and cannot be cancelled locally.
  const submitted = createRefund({ paymentId, amount: 10000, key: "k-cancel-late" });
  submit(submitted.refund.id, "prov-refund-4");
  const late = json(
    `SELECT public.cancel_payment_refund_request('${submitted.refund.id}'::uuid, NULL, '${STAFF}'::uuid, 'corr-late');`,
  );
  assertEqual(late.ok, false, "submitted refund not cancellable");
  assertEqual(late.error, "refund_not_cancellable", "cancel error code");

  // A timeout parks the refund without releasing the money it reserved.
  const timeout = createRefund({ paymentId, amount: 5000, key: "k-timeout" });
  const review = applyStatus(timeout.refund.id, "requires_review", {
    failureCode: "provider_timeout",
  });
  assertEqual(review.refund.status, "requires_review", "review status");
  assertEqual(review.settlement.requires_review_minor, 5000, "review money tracked");
  assertEqual(review.settlement.in_flight_minor, 10000, "review is not in-flight");
  assertEqual(review.settlement.reserved_minor, 15000, "review still reserves");
  assertEqual(review.settlement.refundable_minor, 25000, "timeout keeps the reserve");

  return { paymentId, reviewRefundId: timeout.refund.id };
}

function testOverRefundGuardOnConfirm() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222204",
    userId: USER_B,
    practiceId: PRACTICE,
    amount: 10000,
    confirmedAt: "2026-07-23T10:00:00Z",
  });

  const a = createRefund({ paymentId, amount: 6000, key: "k-guard-a" });
  const b = createRefund({ paymentId, amount: 4000, key: "k-guard-b" });
  submit(a.refund.id, "prov-guard-a");
  submit(b.refund.id, "prov-guard-b");
  applyStatus(a.refund.id, "succeeded");

  // Simulate a provider/data drift that would push the total over the payment.
  psql(TEST_DB, `UPDATE payment_refunds SET amount_minor = 9000 WHERE id='${b.refund.id}';`);
  const guarded = applyStatus(b.refund.id, "succeeded");
  assertEqual(guarded.refund.status, "requires_review", "over-refund guard parks the row");
  assertEqual(guarded.refund.failure_code, "over_refund_guard", "guard failure code");
  assertEqual(guarded.settlement.confirmed_refunded_minor, 6000, "no over-refund recorded");
  assertEqual(
    number(`SELECT (public.admin_refund_p331_integrity_snapshot(true) ->> 'over_refunded_payments')::int;`),
    0,
    "integrity: no over-refunded payments",
  );

  // Resolving the drift lets the parked refund settle normally.
  psql(TEST_DB, `UPDATE payment_refunds SET amount_minor = 4000 WHERE id='${b.refund.id}';`);
  const resolved = applyStatus(b.refund.id, "succeeded");
  assertEqual(resolved.refund.status, "succeeded", "requires_review can resolve to succeeded");
  assertEqual(resolved.settlement.confirmed_refunded_minor, 10000, "settled exactly");
  assertEqual(resolved.settlement.settlement_status, "fully_refunded", "fully refunded");
}

function testTestPaymentIsolation() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222205",
    userId: USER_B,
    practiceId: PRACTICE_B,
    amount: 19900,
    confirmedAt: "2026-07-24T10:00:00Z",
    isTest: true,
  });

  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 1000::bigint, 'r', NULL, 'k-test-block', NULL, NULL, false, NULL);`,
    "test_payment_refund_not_allowed",
    "test payment refund needs an explicit opt-in",
  );

  const allowed = createRefund({ paymentId, amount: 19900, key: "k-test-ok", allowTest: true });
  assertEqual(allowed.refund.is_test, true, "refund inherits is_test from payment");
  submit(allowed.refund.id, "prov-test-1");
  applyStatus(allowed.refund.id, "succeeded");
  return paymentId;
}

function testNonSucceededPaymentRejected() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222206",
    userId: USER_A,
    practiceId: PRACTICE,
    status: "pending",
    amount: 12000,
    confirmedAt: "2026-07-24T12:00:00Z",
  });

  expectError(
    `SELECT public.create_payment_refund_request('${paymentId}'::uuid, 1000::bigint, 'r', NULL, 'k-pending', NULL, NULL, false, NULL);`,
    "payment_not_succeeded",
    "pending payment cannot be refunded",
  );
}

function testWebhookBridge() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222207",
    userId: USER_A,
    practiceId: PRACTICE_B,
    amount: 25000,
    confirmedAt: "2026-07-25T10:00:00Z",
  });
  const operationId = `op-${paymentId}`;

  const refund = createRefund({ paymentId, amount: 25000, key: "k-webhook" });
  submit(refund.refund.id, "prov-webhook-1");

  const onRefund = json(
    `SELECT public.apply_tochka_refund_webhook_status('${operationId}', 'ON-REFUND', NULL, '{}'::jsonb, 'corr-wh');`,
  );
  assertEqual(onRefund.outcome, "pending_applied", "ON-REFUND applied");
  assertEqual(
    scalar(`SELECT status FROM payment_refunds WHERE id='${refund.refund.id}';`),
    "pending",
    "submitted → pending via webhook",
  );

  const refunded = json(
    `SELECT public.apply_tochka_refund_webhook_status('${operationId}', 'REFUNDED', 25000, '{}'::jsonb, 'corr-wh');`,
  );
  assertEqual(refunded.outcome, "succeeded", "REFUNDED confirms the matching refund");
  assertEqual(refunded.settlement.confirmed_refunded_minor, 25000, "webhook confirmed money");

  // Replay must not create or confirm anything twice.
  const replay = json(
    `SELECT public.apply_tochka_refund_webhook_status('${operationId}', 'REFUNDED', 25000, '{}'::jsonb, 'corr-wh');`,
  );
  assertEqual(replay.outcome, "no_in_flight_refund", "replay is a no-op");
  assertEqual(
    number(`SELECT count(*)::int FROM payment_refunds WHERE payment_id='${paymentId}';`),
    1,
    "replay creates no rows",
  );
  assertEqual(settlement(paymentId).confirmed_refunded_minor, 25000, "no double refund");

  // Unknown operation ids never invent facts.
  const unknown = json(
    `SELECT public.apply_tochka_refund_webhook_status('op-does-not-exist', 'REFUNDED', 100, '{}'::jsonb, 'corr-wh');`,
  );
  assertEqual(unknown.outcome, "payment_not_found", "unknown payment ignored");
  assertEqual(
    scalar(`SELECT status FROM payments WHERE id='${paymentId}';`),
    "succeeded",
    "webhook never rewrites payments.status",
  );
}

function testWebhookAmbiguity() {
  const { paymentId } = insertPayment({
    id: "22222222-2222-2222-2222-222222222208",
    userId: USER_B,
    practiceId: PRACTICE,
    amount: 20000,
    confirmedAt: "2026-07-25T12:00:00Z",
  });
  const operationId = `op-${paymentId}`;

  const a = createRefund({ paymentId, amount: 5000, key: "k-amb-a" });
  const b = createRefund({ paymentId, amount: 5000, key: "k-amb-b" });
  submit(a.refund.id, "prov-amb-a");
  submit(b.refund.id, "prov-amb-b");

  const ambiguous = json(
    `SELECT public.apply_tochka_refund_webhook_status('${operationId}', 'REFUNDED', 5000, '{}'::jsonb, 'corr-amb');`,
  );
  assertEqual(ambiguous.outcome, "requires_review", "ambiguous match parks both refunds");
  assertEqual(ambiguous.updated_count, 2, "both refunds parked");
  assertEqual(ambiguous.settlement.confirmed_refunded_minor, 0, "nothing confirmed blindly");
  assertEqual(ambiguous.settlement.reserved_minor, 10000, "reserve kept while parked");
}

function testAnalytics() {
  const summary = json(
    `SELECT public.admin_refund_p331_summary(NULL, NULL, false);`,
  );
  const grossOnly = json(
    `SELECT public.admin_payments_p31_summary(NULL,NULL,NULL,NULL,false,NULL,NULL);`,
  );
  assertEqual(summary.gross_minor, grossOnly.gross_minor, "refund summary reuses P3.1 gross");
  assertEqual(summary.payment_count, grossOnly.payment_count, "payment count matches P3.1");
  assertEqual(
    summary.net_minor,
    summary.gross_minor - summary.refunded_minor,
    "net = gross - refunds",
  );
  assert(summary.refunded_minor > 0, "some refunds confirmed");
  assertEqual(summary.notes.provider_fees, "not_connected", "fees not connected");

  const withTest = json(`SELECT public.admin_refund_p331_summary(NULL, NULL, true);`);
  assert(
    withTest.refunded_minor > summary.refunded_minor,
    "test refunds are excluded by default",
  );

  const empty = json(
    `SELECT public.admin_refund_p331_summary('2020-01-01T00:00:00Z','2020-01-02T00:00:00Z',false);`,
  );
  assertEqual(empty.refunded_minor, 0, "empty period has no refunds");
  assertEqual(empty.gross_minor, 0, "empty period has no gross");

  const list = json(`SELECT public.admin_refund_p331_list(NULL,NULL,false,NULL,NULL,NULL,25,0);`);
  assert(list.total > 0, "list has rows");
  assert(Array.isArray(list.rows), "rows is an array");
  const serialized = JSON.stringify(list.rows);
  assert(!serialized.includes("@example.com"), "list exposes no payer email");
  assert(!serialized.includes("metadata_snapshot"), "list exposes no raw provider metadata");
  assert(!serialized.includes("user_id"), "list exposes no buyer id");

  const filtered = json(
    `SELECT public.admin_refund_p331_list(NULL,NULL,false,'succeeded',NULL,NULL,25,0);`,
  );
  assert(
    filtered.rows.every((row) => row.status === "succeeded"),
    "status filter applied",
  );

  const paged = json(`SELECT public.admin_refund_p331_list(NULL,NULL,false,NULL,NULL,NULL,1,0);`);
  assertEqual(paged.rows.length, 1, "limit respected");
  assertEqual(paged.total, list.total, "total ignores pagination");
}

function testP31GrossRegression() {
  // Gross must stay the raw sum of succeeded payments even though refunds exist.
  const expected = number(
    `SELECT coalesce(sum(amount_minor), 0)::bigint
     FROM payments WHERE status='succeeded' AND is_test=false;`,
  );
  const after = json(
    `SELECT public.admin_payments_p31_summary(NULL,NULL,NULL,NULL,false,NULL,NULL);`,
  );
  assert(
    number(`SELECT count(*)::int FROM payment_refunds WHERE status='succeeded';`) > 0,
    "regression runs with confirmed refunds present",
  );
  assertEqual(after.gross_minor, expected, "P3.1 gross is unchanged by the refund layer");
  assertEqual(after.notes.refunds, "not_connected", "P3.1 notes untouched");
}

function testIntegritySnapshot() {
  const snapshot = json(`SELECT public.admin_refund_p331_integrity_snapshot(true);`);
  assertEqual(snapshot.over_refunded_payments, 0, "no over-refunded payments");
  assertEqual(snapshot.over_reserved_payments, 0, "no over-reserved payments");
  assertEqual(snapshot.nonpositive_amount_refunds, 0, "no non-positive amounts");
  assertEqual(snapshot.refunds_order_mismatch, 0, "order ids consistent");
  assertEqual(snapshot.refunds_currency_mismatch, 0, "currencies consistent");
  assertEqual(snapshot.refunds_provider_mismatch, 0, "providers consistent");
  assertEqual(snapshot.refunds_test_flag_mismatch, 0, "test flags consistent");
  assertEqual(snapshot.duplicate_provider_refund_ids, 0, "no duplicate provider refund ids");
  assertEqual(snapshot.refunds_without_succeeded_payment, 0, "all refunds sit on succeeded payments");
  assertEqual(snapshot.succeeded_without_confirmed_at, 0, "succeeded rows have confirmed_at");
  assertEqual(snapshot.confirmed_at_without_succeeded_status, 0, "confirmed_at only on succeeded");
  assertEqual(snapshot.terminal_without_terminal_timestamp, 0, "terminal timestamps present");
  assertEqual(snapshot.refunds_missing_idempotency_key, 0, "idempotency keys present");
  assertEqual(snapshot.refunds_without_audit_entry, 0, "every refund is audited");
  assertEqual(snapshot.payments_with_refunded_status, 0, "payments.status never becomes refunded");
  assert(snapshot.audit_entries_total > 0, "audit log is populated");
  assert(snapshot.fully_refunded_payments > 0, "at least one payment fully refunded");
}

function testSecurityGrants() {
  const tables = ["payment_refunds", "finance_audit_log"];
  for (const table of tables) {
    assert(
      bool(`SELECT relrowsecurity::text FROM pg_class WHERE relname='${table}';`),
      `${table}: RLS enabled`,
    );
    assertEqual(
      number(`SELECT count(*)::int FROM pg_policies WHERE tablename='${table}';`),
      0,
      `${table}: no client policies`,
    );
    for (const role of ["anon", "authenticated"]) {
      assert(
        !bool(`SELECT has_table_privilege('${role}', 'public.${table}', 'SELECT')::text;`),
        `${table}: ${role} cannot select`,
      );
      assert(
        !bool(`SELECT has_table_privilege('${role}', 'public.${table}', 'INSERT')::text;`),
        `${table}: ${role} cannot insert`,
      );
    }
  }

  // Append-only: service_role may read and insert but never rewrite history.
  assert(
    bool(`SELECT has_table_privilege('service_role', 'public.finance_audit_log', 'INSERT')::text;`),
    "service_role can append audit",
  );
  assert(
    !bool(`SELECT has_table_privilege('service_role', 'public.finance_audit_log', 'UPDATE')::text;`),
    "audit log is not updatable",
  );
  assert(
    !bool(`SELECT has_table_privilege('service_role', 'public.finance_audit_log', 'DELETE')::text;`),
    "audit log is not deletable",
  );

  const functions = [
    "create_payment_refund_request",
    "mark_payment_refund_submitted",
    "apply_payment_refund_provider_status",
    "cancel_payment_refund_request",
    "apply_tochka_refund_webhook_status",
    "payment_refund_settlement_snapshot",
    "admin_refund_p331_summary",
    "admin_refund_p331_list",
    "admin_refund_p331_integrity_snapshot",
  ];
  for (const fn of functions) {
    const identity = scalar(
      `SELECT p.oid::regprocedure::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='${fn}' LIMIT 1;`,
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
        `SELECT prosecdef::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='${fn}' LIMIT 1;`,
      ),
      `${fn}: security definer`,
    );
    assert(
      (scalar(
        `SELECT coalesce(array_to_string(proconfig, ','), '') FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='${fn}' LIMIT 1;`,
      )).includes("search_path"),
      `${fn}: fixed search_path`,
    );
  }
}

function testRollingDeploySafety() {
  // Re-applying the migration must be a no-op, not an error.
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260726120000_payments_p331_refund_facts.sql"));
  assert(
    number(`SELECT count(*)::int FROM payment_refunds;`) > 0,
    "re-apply preserves refund facts",
  );
}

function main() {
  bootstrap();

  const paymentId = testCreateValidation();
  testPartialFullAndSettlement(paymentId);
  const idemPaymentId = testIdempotency();
  testStateMachine(idemPaymentId);
  testCancelAndReviewReserve();
  testOverRefundGuardOnConfirm();
  testTestPaymentIsolation();
  testNonSucceededPaymentRejected();
  testWebhookBridge();
  testWebhookAmbiguity();
  testAnalytics();
  testP31GrossRegression();
  testIntegritySnapshot();
  testSecurityGrants();
  testRollingDeploySafety();

  console.log("payments-p331-refund-sql-unit: ok");
}

main();

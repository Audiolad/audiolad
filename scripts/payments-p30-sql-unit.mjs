#!/usr/bin/env node
/**
 * Payments P3.0 SQL tests on an isolated database (never production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_payments_p30_test";

const USER_ID = "d1111111-1111-1111-1111-111111111111";
const PRACTICE_ID = "c1111111-1111-1111-1111-111111111111";
const AUTHOR_ID = "a1111111-1111-1111-1111-111111111111";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function psql(database, sql, { tuples = false } = {}) {
  const args = [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
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
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
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

function createStubSchema() {
  psql(
    TEST_DB,
    `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published',
  price integer NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  status text NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  practice_title_snapshot text NOT NULL,
  practice_slug_snapshot text NOT NULL,
  price_minor_snapshot bigint NOT NULL,
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,
  CONSTRAINT orders_status_check CHECK (status IN ('pending','paid','cancelled','failed','refunded')),
  CONSTRAINT orders_paid_at_consistency_check CHECK (status <> 'paid' OR paid_at IS NOT NULL),
  CONSTRAINT orders_cancelled_at_consistency_check CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
  CONSTRAINT orders_failed_at_consistency_check CHECK (status <> 'failed' OR failed_at IS NOT NULL),
  CONSTRAINT orders_refunded_at_consistency_check CHECK (status <> 'refunded' OR refunded_at IS NOT NULL)
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  provider text NOT NULL,
  provider_payment_id text NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,
  CONSTRAINT payments_status_check CHECK (status IN ('pending','succeeded','cancelled','failed','refunded')),
  CONSTRAINT payments_succeeded_confirmed_at_check CHECK (status <> 'succeeded' OR confirmed_at IS NOT NULL),
  CONSTRAINT payments_failed_at_consistency_check CHECK (status <> 'failed' OR failed_at IS NOT NULL),
  CONSTRAINT payments_refunded_at_consistency_check CHECK (status <> 'refunded' OR refunded_at IS NOT NULL)
);

CREATE UNIQUE INDEX payments_provider_payment_id_unique_idx
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE public.user_practices (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  practice_id uuid NOT NULL REFERENCES public.practices(id),
  access_source text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, practice_id),
  CONSTRAINT user_practices_access_source_check
    CHECK (access_source IN ('starter','free_claim','purchase','gift','subscription','program','admin'))
);

CREATE FUNCTION public.grant_practice_purchase_access(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  locked_order public.orders%ROWTYPE;
  inserted_count integer;
  existing_count integer;
BEGIN
  SELECT * INTO locked_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;
  IF locked_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Order % is not paid (status=%)', p_order_id, locked_order.status;
  END IF;
  SELECT count(*) INTO existing_count
  FROM public.user_practices
  WHERE user_id = locked_order.user_id AND practice_id = locked_order.practice_id;
  INSERT INTO public.user_practices (user_id, practice_id, access_source, metadata)
  VALUES (
    locked_order.user_id,
    locked_order.practice_id,
    'purchase',
    jsonb_build_object('order_id', locked_order.id, 'granted_via', 'grant_practice_purchase_access')
  )
  ON CONFLICT (user_id, practice_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN jsonb_build_object(
    'order_id', locked_order.id,
    'inserted', inserted_count = 1,
    'library_rows_before', existing_count,
    'library_rows_after', existing_count + inserted_count
  );
END;
$fn$;

INSERT INTO auth.users (id, email) VALUES ('${USER_ID}', 'buyer@example.com');
INSERT INTO public.authors (id, name, slug) VALUES ('${AUTHOR_ID}', 'Author', 'author');
INSERT INTO public.practices (id, author_id, title, slug, status, price, is_free)
VALUES ('${PRACTICE_ID}', '${AUTHOR_ID}', 'Practice', 'practice', 'published', 299, false);
`,
  );
}

function seedPendingPair({
  orderId,
  paymentId,
  amountMinor = 29900,
  orderStatus = "pending",
  paymentStatus = "pending",
  providerPaymentId = null,
  metadata = {},
  cancelled = false,
  refunded = false,
  failed = false,
}) {
  const paidAt =
    orderStatus === "paid" ? "now()" : "NULL";
  const cancelledAt = cancelled || orderStatus === "cancelled" ? "now()" : "NULL";
  const failedAt = failed || orderStatus === "failed" ? "now()" : "NULL";
  const refundedAt = refunded || orderStatus === "refunded" ? "now()" : "NULL";
  const confirmedAt = paymentStatus === "succeeded" ? "now()" : "NULL";
  const paymentFailedAt = paymentStatus === "failed" ? "now()" : "NULL";
  const paymentRefundedAt = paymentStatus === "refunded" ? "now()" : "NULL";

  psql(
    TEST_DB,
    `
INSERT INTO public.orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
  paid_at, cancelled_at, failed_at, refunded_at
) VALUES (
  '${orderId}', '${USER_ID}', '${PRACTICE_ID}', '${orderStatus}', ${amountMinor}, 'RUB',
  'Practice', 'practice', ${amountMinor},
  ${paidAt}, ${cancelledAt}, ${failedAt}, ${refundedAt}
);

INSERT INTO public.payments (
  id, order_id, provider, provider_payment_id, idempotency_key, status,
  amount_minor, currency, provider_metadata, confirmed_at, failed_at, refunded_at
) VALUES (
  '${paymentId}', '${orderId}', 'tochka',
  ${providerPaymentId ? `'${providerPaymentId}'` : "NULL"},
  '${paymentId}-idem', '${paymentStatus}', ${amountMinor}, 'RUB',
  '${JSON.stringify(metadata)}'::jsonb,
  ${confirmedAt}, ${paymentFailedAt}, ${paymentRefundedAt}
);
`,
  );
}

function recordEvent({
  eventId,
  dedupKey,
  operationId,
  status = "received",
}) {
  psql(
    TEST_DB,
    `
INSERT INTO public.payment_webhook_events (
  id, provider, dedup_key, provider_event_id, provider_payment_id,
  event_type, payload, signature_verified, processing_status, processing_attempts
) VALUES (
  '${eventId}', 'tochka', '${dedupKey}', '${dedupKey}',
  ${operationId ? `'${operationId}'` : "NULL"},
  'acquiringInternetPayment',
  '{"webhookType":"acquiringInternetPayment","status":"APPROVED"}'::jsonb,
  true, '${status}', 1
);
`,
  );
}

function fulfill({
  eventId,
  operationId,
  paymentId,
  amountMinor = 29900,
  currency = "RUB",
  providerStatus = "APPROVED",
}) {
  return json(
    `SELECT public.fulfill_tochka_payment_transactional(
      '${eventId}'::uuid,
      ${operationId ? `'${operationId}'` : "NULL"},
      ${paymentId ? `'${paymentId}'::uuid` : "NULL"},
      ${amountMinor},
      '${currency}',
      '${providerStatus}'
    );`,
  );
}

function main() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  createStubSchema();
  psqlFile(
    TEST_DB,
    join(
      ROOT,
      "supabase/migrations/20260725190000_payments_p30_transactional_fulfill.sql",
    ),
  );

  // 1. pending → succeeded + paid + access
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111101",
    paymentId: "22222222-2222-2222-2222-222222222201",
    providerPaymentId: "op-1",
  });
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333301",
    dedupKey: "tochka:tx:tx-1",
    operationId: "op-1",
  });
  let result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333301",
    operationId: "op-1",
    paymentId: "22222222-2222-2222-2222-222222222201",
  });
  assertEqual(result.outcome, "completed", "happy path outcome");
  assertEqual(result.payment_status, "succeeded", "payment succeeded");
  assertEqual(result.order_status, "paid", "order paid");
  assertEqual(result.access_granted, true, "access granted");
  assertEqual(number("SELECT count(*) FROM user_practices WHERE access_source='purchase'"), 1, "one access");

  // 2. replay → no duplicate access
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333302",
    dedupKey: "tochka:tx:tx-1-replay-row",
    operationId: "op-1",
  });
  // Use same logical payment via new event row (simulates redelivery with new dedup if tx missing)
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333302",
    operationId: "op-1",
    paymentId: "22222222-2222-2222-2222-222222222201",
  });
  assert(
    result.outcome === "already_complete" || result.outcome === "repaired",
    `replay outcome=${result.outcome}`,
  );
  assertEqual(number("SELECT count(*) FROM user_practices WHERE access_source='purchase'"), 1, "still one access");

  // ledger dedup: same dedup_key
  const ledger1 = json(
    `SELECT public.record_payment_webhook_event(
      'tochka', 'tochka:tx:dup-1', 'dup-1', 'op-x', 'acquiringInternetPayment',
      '{"status":"APPROVED"}'::jsonb, true
    );`,
  );
  assertEqual(ledger1.is_new, true, "ledger first insert");
  const ledger2 = json(
    `SELECT public.record_payment_webhook_event(
      'tochka', 'tochka:tx:dup-1', 'dup-1', 'op-x', 'acquiringInternetPayment',
      '{"status":"APPROVED"}'::jsonb, true
    );`,
  );
  assertEqual(ledger2.is_new, false, "ledger duplicate key");
  assertEqual(
    number("SELECT count(*) FROM payment_webhook_events WHERE dedup_key='tochka:tx:dup-1'"),
    1,
    "one ledger row",
  );

  // 3. payment succeeded + order pending → repair
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111103",
    paymentId: "22222222-2222-2222-2222-222222222203",
    providerPaymentId: "op-3",
    paymentStatus: "succeeded",
  });
  // Clear accidental access
  psql(TEST_DB, `DELETE FROM user_practices WHERE user_id='${USER_ID}' AND practice_id='${PRACTICE_ID}';`);
  // Re-seed only this pair's world: need unique practice for parallel cases — use same practice after delete
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333303",
    dedupKey: "tochka:tx:tx-3",
    operationId: "op-3",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333303",
    operationId: "op-3",
    paymentId: "22222222-2222-2222-2222-222222222203",
  });
  assertEqual(result.outcome, "repaired", "repair order/access");
  assertEqual(result.was_repaired, true, "was_repaired");
  assertEqual(scalar(`SELECT status FROM orders WHERE id='11111111-1111-1111-1111-111111111103'`), "paid", "repaired paid");

  // 4. order paid + access missing → repair access
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111104",
    paymentId: "22222222-2222-2222-2222-222222222204",
    providerPaymentId: "op-4",
    orderStatus: "paid",
    paymentStatus: "succeeded",
  });
  psql(
    TEST_DB,
    `DELETE FROM user_practices WHERE user_id='${USER_ID}' AND practice_id='${PRACTICE_ID}'
      AND (metadata->>'order_id') = '11111111-1111-1111-1111-111111111104';`,
  );
  // Ensure no access for this user/practice
  psql(TEST_DB, `DELETE FROM user_practices WHERE user_id='${USER_ID}' AND practice_id='${PRACTICE_ID}';`);
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333304",
    dedupKey: "tochka:tx:tx-4",
    operationId: "op-4",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333304",
    operationId: "op-4",
    paymentId: "22222222-2222-2222-2222-222222222204",
  });
  assertEqual(result.access_granted, true, "access repaired");
  assertEqual(result.outcome, "repaired", "access repair outcome");

  // 5. access exists → success without duplicate
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333305",
    dedupKey: "tochka:tx:tx-4b",
    operationId: "op-4",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333305",
    operationId: "op-4",
    paymentId: "22222222-2222-2222-2222-222222222204",
  });
  assert(
    result.outcome === "already_complete" || result.outcome === "repaired",
    "existing access ok",
  );
  assertEqual(
    number(`SELECT count(*) FROM user_practices WHERE user_id='${USER_ID}' AND practice_id='${PRACTICE_ID}'`),
    1,
    "no access dup",
  );

  // 6+7. grant failure rolls back payment/order (replace grant temporarily)
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111106",
    paymentId: "22222222-2222-2222-2222-222222222206",
    providerPaymentId: "op-6",
  });
  psql(
    TEST_DB,
    `
CREATE OR REPLACE FUNCTION public.grant_practice_purchase_access(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $boom$
BEGIN
  RAISE EXCEPTION 'forced_grant_failure';
END;
$boom$;
`,
  );
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333306",
    dedupKey: "tochka:tx:tx-6",
    operationId: "op-6",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333306",
    operationId: "op-6",
    paymentId: "22222222-2222-2222-2222-222222222206",
  });
  assertEqual(result.ok, false, "grant failure ok=false");
  assertEqual(
    scalar(`SELECT status FROM payments WHERE id='22222222-2222-2222-2222-222222222206'`),
    "pending",
    "payment rolled back",
  );
  assertEqual(
    scalar(`SELECT status FROM orders WHERE id='11111111-1111-1111-1111-111111111106'`),
    "pending",
    "order rolled back",
  );
  assertEqual(
    scalar(`SELECT processing_status FROM payment_webhook_events WHERE id='33333333-3333-3333-3333-333333333306'`),
    "failed",
    "event failed for retry",
  );

  // restore grant after forced failure test
  createGrantOnly();

  // 8. amount mismatch
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111108",
    paymentId: "22222222-2222-2222-2222-222222222208",
    providerPaymentId: "op-8",
    amountMinor: 29900,
  });
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333308",
    dedupKey: "tochka:tx:tx-8",
    operationId: "op-8",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333308",
    operationId: "op-8",
    paymentId: "22222222-2222-2222-2222-222222222208",
    amountMinor: 100,
  });
  assertEqual(result.outcome, "requires_review", "amount mismatch review");
  assertEqual(
    scalar(`SELECT status FROM orders WHERE id='11111111-1111-1111-1111-111111111108'`),
    "pending",
    "no paid on mismatch",
  );

  // 9. currency mismatch
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111109",
    paymentId: "22222222-2222-2222-2222-222222222209",
    providerPaymentId: "op-9",
  });
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333309",
    dedupKey: "tochka:tx:tx-9",
    operationId: "op-9",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333309",
    operationId: "op-9",
    paymentId: "22222222-2222-2222-2222-222222222209",
    currency: "USD",
  });
  assertEqual(result.outcome, "requires_review", "currency mismatch");

  // 10. unknown payment
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333310",
    dedupKey: "tochka:tx:tx-10",
    operationId: "missing-op",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333310",
    operationId: "missing-op",
    paymentId: null,
  });
  assertEqual(result.review_reason, "payment_not_found", "unknown payment");

  // 11. refunded order cannot become paid
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111111",
    paymentId: "22222222-2222-2222-2222-222222222211",
    providerPaymentId: "op-11",
    orderStatus: "refunded",
    refunded: true,
  });
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333311",
    dedupKey: "tochka:tx:tx-11",
    operationId: "op-11",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333311",
    operationId: "op-11",
    paymentId: "22222222-2222-2222-2222-222222222211",
  });
  assertEqual(result.review_reason, "refunded_order", "refunded blocked");
  assertEqual(
    scalar(`SELECT status FROM orders WHERE id='11111111-1111-1111-1111-111111111111'`),
    "refunded",
    "stays refunded",
  );

  // 12. cancelled + APPROVED → requires_review, payment succeeded, order not paid, no access
  psql(TEST_DB, `DELETE FROM user_practices WHERE user_id='${USER_ID}';`);
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111112",
    paymentId: "22222222-2222-2222-2222-222222222212",
    providerPaymentId: "op-12",
    orderStatus: "cancelled",
    cancelled: true,
  });
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333312",
    dedupKey: "tochka:tx:tx-12",
    operationId: "op-12",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333312",
    operationId: "op-12",
    paymentId: "22222222-2222-2222-2222-222222222212",
  });
  assertEqual(result.outcome, "requires_review", "cancelled late approved");
  assertEqual(result.review_reason, "cancelled_order_late_approved", "review reason");
  assertEqual(
    scalar(`SELECT status FROM payments WHERE id='22222222-2222-2222-2222-222222222212'`),
    "succeeded",
    "payment reflects provider",
  );
  assertEqual(
    scalar(`SELECT status FROM orders WHERE id='11111111-1111-1111-1111-111111111112'`),
    "cancelled",
    "order stays cancelled",
  );
  assertEqual(
    number(`SELECT count(*) FROM user_practices WHERE user_id='${USER_ID}'`),
    0,
    "no silent access",
  );

  // 21. e2e metadata → is_test
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111121",
    paymentId: "22222222-2222-2222-2222-222222222221",
    providerPaymentId: "e2e-22222222-2222-2222-2222-222222222221",
    metadata: { e2e_test: true },
  });
  recordEvent({
    eventId: "33333333-3333-3333-3333-333333333321",
    dedupKey: "tochka:tx:tx-21",
    operationId: "e2e-22222222-2222-2222-2222-222222222221",
  });
  result = fulfill({
    eventId: "33333333-3333-3333-3333-333333333321",
    operationId: "e2e-22222222-2222-2222-2222-222222222221",
    paymentId: "22222222-2222-2222-2222-222222222221",
  });
  assertEqual(result.is_test, true, "e2e is_test");
  assertEqual(
    scalar(`SELECT is_test::text FROM payments WHERE id='22222222-2222-2222-2222-222222222221'`),
    "true",
    "payment is_test persisted",
  );

  // 22. normal payment is_test false
  assertEqual(
    scalar(`SELECT is_test::text FROM payments WHERE id='22222222-2222-2222-2222-222222222201'`),
    "false",
    "normal payment not test",
  );

  // integrity snapshot keys
  const snap = json(`SELECT public.payment_integrity_snapshot();`);
  assert(typeof snap.succeeded_payments === "number", "snapshot succeeded");
  assert(typeof snap.webhook_requires_review === "number", "snapshot review");

  // zombie cancel policy from migration: seed cancelled+pending then re-run only the update
  seedPendingPair({
    orderId: "11111111-1111-1111-1111-111111111199",
    paymentId: "22222222-2222-2222-2222-222222222299",
    providerPaymentId: "op-zombie",
    orderStatus: "cancelled",
    cancelled: true,
  });
  psql(
    TEST_DB,
    `
UPDATE public.payments AS p
SET status = 'cancelled', updated_at = now()
FROM public.orders AS o
WHERE p.order_id = o.id AND o.status = 'cancelled' AND p.status = 'pending';
`,
  );
  assertEqual(
    scalar(`SELECT status FROM payments WHERE id='22222222-2222-2222-2222-222222222299'`),
    "cancelled",
    "zombie locally cancelled",
  );

  console.log("payments-p30-sql-unit: ok");
}

function createGrantOnly() {
  psql(
    TEST_DB,
    `
CREATE OR REPLACE FUNCTION public.grant_practice_purchase_access(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  locked_order public.orders%ROWTYPE;
  inserted_count integer;
  existing_count integer;
BEGIN
  SELECT * INTO locked_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;
  IF locked_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Order % is not paid (status=%)', p_order_id, locked_order.status;
  END IF;
  SELECT count(*) INTO existing_count
  FROM public.user_practices
  WHERE user_id = locked_order.user_id AND practice_id = locked_order.practice_id;
  INSERT INTO public.user_practices (user_id, practice_id, access_source, metadata)
  VALUES (
    locked_order.user_id,
    locked_order.practice_id,
    'purchase',
    jsonb_build_object('order_id', locked_order.id, 'granted_via', 'grant_practice_purchase_access')
  )
  ON CONFLICT (user_id, practice_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN jsonb_build_object(
    'order_id', locked_order.id,
    'inserted', inserted_count = 1,
    'library_rows_before', existing_count,
    'library_rows_after', existing_count + inserted_count
  );
END;
$fn$;
`,
  );
}

main();

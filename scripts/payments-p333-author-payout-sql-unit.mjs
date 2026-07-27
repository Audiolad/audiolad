#!/usr/bin/env node
/**
 * P3.3.3 author payout SQL tests on an isolated scratch database.
 *
 * Never touches the production database, never calls a bank and never calls
 * Tochka: refunds go through the P3.3.1 RPCs and payouts are "transferred" by
 * an operator confirming an external reference, exactly as in production.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_payments_p333_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";
const STAFF = "d9999999-9999-9999-9999-999999999999";

/** Payout-eligible external author with approved 70/30 terms. */
const AUTHOR_PAYEE = "a1111111-1111-1111-1111-111111111111";
/** access_status = commercial but platform-owned: never a payout candidate. */
const AUTHOR_PLATFORM = "a2222222-2222-2222-2222-222222222222";
/** Payout-eligible with a balance below the 1000 RUB minimum. */
const AUTHOR_SMALL = "a3333333-3333-3333-3333-333333333333";
/** Payout-eligible, used for the hold window. */
const AUTHOR_HELD = "a4444444-4444-4444-4444-444444444444";

const PRACTICE_PAYEE = "c1111111-1111-1111-1111-111111111111";
const PRACTICE_PLATFORM = "c2222222-2222-2222-2222-222222222222";
const PRACTICE_SMALL = "c3333333-3333-3333-3333-333333333333";
const PRACTICE_HELD = "c4444444-4444-4444-4444-444444444444";

const TERMS_FROM = "2026-01-01T00:00:00Z";
/** Every accrual in the fixtures is old enough to be out of its hold window. */
const OLD_SALE_AT = "2026-02-10T10:00:00Z";
const CUTOFF = "2026-07-01T00:00:00Z";

const MIGRATION = "supabase/migrations/20260727120000_payments_p333_author_payouts.sql";

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
  ('${AUTHOR_SMALL}', 'Small Balance', 'small-balance', 'commercial'),
  ('${AUTHOR_HELD}', 'Held Balance', 'held-balance', 'commercial');
INSERT INTO public.practices VALUES
  ('${PRACTICE_PAYEE}', '${AUTHOR_PAYEE}', 'Payee Practice', 'payee-practice', 'published', 299, false),
  ('${PRACTICE_PLATFORM}', '${AUTHOR_PLATFORM}', 'Platform Practice', 'platform-practice', 'published', 299, false),
  ('${PRACTICE_SMALL}', '${AUTHOR_SMALL}', 'Small Practice', 'small-practice', 'published', 299, false),
  ('${PRACTICE_HELD}', '${AUTHOR_HELD}', 'Held Practice', 'held-practice', 'published', 299, false);
`,
  );

  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192000_admin_payments_p31_money.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192100_admin_payments_p31_authors_products_fix.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260726120000_payments_p331_refund_facts.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260726140000_payments_p332_author_ledger.sql"));
  psqlFile(TEST_DB, join(ROOT, MIGRATION));
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

function approveTerms(authorId, shareBps, holdDays, correlation) {
  const draft = json(
    `SELECT public.create_author_commercial_terms_draft(
      '${authorId}'::uuid, ${shareBps}, '${TERMS_FROM}'::timestamptz, NULL, ${holdDays}, 'RUB',
      NULL, '${STAFF}'::uuid, '${correlation}', true
    );`,
  );
  return draft.terms_id;
}

function accrue(paymentId, correlation) {
  return json(
    `SELECT public.ensure_author_sale_accrual('${paymentId}'::uuid, '${correlation}', NULL);`,
  );
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
  json(
    `SELECT public.ensure_author_refund_reversal('${refundId}'::uuid, 'corr-${key}', NULL);`,
  );
  return refundId;
}

function snapshot(authorId, cutoff = CUTOFF, includeTest = false, excludePayoutId = null) {
  return json(
    `SELECT public.author_payout_payable_snapshot(
      '${authorId}'::uuid, '${cutoff}'::timestamptz, ${includeTest},
      ${excludePayoutId ? `'${excludePayoutId}'::uuid` : "NULL"}
    );`,
  );
}

function createDraft({
  authorId,
  key,
  cutoff = CUTOFF,
  desired = null,
  allowBelowMinimum = false,
  overrideReason = null,
}) {
  return json(
    `SELECT public.create_author_payout_draft(
      '${authorId}'::uuid, '${key}', '${cutoff}'::timestamptz,
      ${desired === null ? "NULL" : `${desired}::bigint`},
      ${allowBelowMinimum},
      ${overrideReason ? `'${overrideReason}'` : "NULL"},
      NULL, false, '${STAFF}'::uuid, 'corr-${key}'
    );`,
  );
}

// ---------------------------------------------------------------------------

function testMigrationSeedsNothing() {
  assertEqual(number(`SELECT count(*)::int FROM author_payouts;`), 0, "no payout row is seeded");
  assertEqual(
    number(`SELECT count(*)::int FROM author_payout_allocations;`),
    0,
    "no allocation is seeded",
  );
  assertEqual(
    number(
      `SELECT count(*)::int FROM author_ledger_entries WHERE entry_type IN ('payout','payout_reversal');`,
    ),
    0,
    "no payout ledger row is seeded",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`),
    0,
    "the migration enables payouts for nobody",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE access_status = 'commercial';`),
    4,
    "commercial access status alone is still not payout eligibility",
  );

  // The candidate list is empty on a production-shaped database, and that is
  // the correct answer rather than a bug.
  const candidates = json(
    `SELECT public.admin_author_payout_p333_candidates(now(), false, true, NULL, 50, 0);`,
  );
  assertEqual(candidates.total, 0, "no candidates without payout-eligible authors");
  assertEqual(candidates.payout_eligible_authors, 0, "no payout-eligible authors yet");
}

function testPolicyHelpers() {
  assertEqual(number(`SELECT public.author_payout_minimum_minor();`), 100000, "minimum is 1000 RUB");

  const period = json(
    `SELECT to_jsonb(p) FROM public.author_payout_period('2026-08-01T00:00:00+03:00'::timestamptz) AS p;`,
  );
  assertEqual(period.period_label, "2026-07", "a Moscow month boundary labels the closed month");

  const mid = json(
    `SELECT to_jsonb(p) FROM public.author_payout_period('2026-07-15T12:00:00+03:00'::timestamptz) AS p;`,
  );
  assertEqual(mid.period_label, "2026-07", "a mid-month cutoff labels its own month");

  // A cutoff just after Moscow midnight belongs to the new month, not the old.
  const justAfter = json(
    `SELECT to_jsonb(p) FROM public.author_payout_period('2026-08-01T00:00:01+03:00'::timestamptz) AS p;`,
  );
  assertEqual(justAfter.period_label, "2026-08", "one second into August is August");

  for (const [from, to, expected] of [
    ["draft", "approved", true],
    ["draft", "paid", false],
    ["approved", "paid", true],
    ["processing", "cancelled", false],
    ["paid", "reversed", true],
    ["paid", "cancelled", false],
    ["reversed", "paid", false],
    ["cancelled", "draft", false],
    ["failed", "approved", false],
  ]) {
    assertEqual(
      bool(`SELECT public.author_payout_transition_allowed('${from}', '${to}')::text;`),
      expected,
      `transition ${from} -> ${to}`,
    );
  }
}

/** Money still inside its hold window is not payable, even if it is accrued. */
function testHeldExclusion() {
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_HELD}';`);
  approveTerms(AUTHOR_HELD, 7000, 14, "corr-terms-held");

  // Confirmed one day before the cutoff with a 14 day hold: still held.
  const held = insertPayment({
    id: "22222222-2222-2222-2222-222222222401",
    userId: USER_A,
    practiceId: PRACTICE_HELD,
    authorSnapshot: AUTHOR_HELD,
    amount: 200000,
    confirmedAt: "2026-06-30T00:00:00Z",
  });
  const accrual = accrue(held.paymentId, "corr-held-1");
  assertEqual(accrual.outcome, "created", "held sale still accrues");
  assertEqual(accrual.entry.amount_minor, 140000, "70% of 200000");

  const snap = snapshot(AUTHOR_HELD);
  assertEqual(snap.held_minor, 140000, "the whole accrual is inside the hold window");
  assertEqual(snap.available_balance_minor, 0, "nothing is available at the cutoff");
  assertEqual(snap.capacity_minor, 0, "held money is not payable capacity");
  assertEqual(snap.blocker, "no_payable_balance", "the blocker names the empty balance");

  expectError(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_HELD}'::uuid, 'payout-held-1', '${CUTOFF}'::timestamptz,
      NULL, false, NULL, NULL, false, '${STAFF}'::uuid, 'corr-held-draft'
    );`,
    "no_payable_balance",
    "a payout cannot be drafted from held money",
  );

  // The same accrual is payable once the hold window has passed.
  const later = snapshot(AUTHOR_HELD, "2026-07-20T00:00:00Z");
  assertEqual(later.held_minor, 0, "after the hold window nothing is held");
  assertEqual(later.capacity_minor, 140000, "the full accrual becomes payable");
}

function testThreshold() {
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_SMALL}';`);
  approveTerms(AUTHOR_SMALL, 7000, 14, "corr-terms-small");

  const small = insertPayment({
    id: "22222222-2222-2222-2222-222222222301",
    userId: USER_A,
    practiceId: PRACTICE_SMALL,
    authorSnapshot: AUTHOR_SMALL,
    amount: 29900,
    confirmedAt: OLD_SALE_AT,
  });
  accrue(small.paymentId, "corr-small-1");

  const snap = snapshot(AUTHOR_SMALL);
  assertEqual(snap.capacity_minor, 20930, "70% of one 299 RUB sale");
  assertEqual(snap.meets_minimum, false, "20930 is below the 100000 minimum");
  assertEqual(snap.blocker, "below_minimum", "the blocker names the minimum");

  expectError(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_SMALL}'::uuid, 'payout-small-1', '${CUTOFF}'::timestamptz,
      NULL, false, NULL, NULL, false, '${STAFF}'::uuid, 'corr-small-draft'
    );`,
    "below_minimum_payout",
    "below the minimum a payout is refused by default",
  );

  // An override is allowed but never silent: it needs a written reason.
  expectError(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_SMALL}'::uuid, 'payout-small-2', '${CUTOFF}'::timestamptz,
      NULL, true, NULL, NULL, false, '${STAFF}'::uuid, 'corr-small-draft-2'
    );`,
    "override_reason_required",
    "an override without a reason is refused",
  );

  const overridden = createDraft({
    authorId: AUTHOR_SMALL,
    key: "payout-small-3",
    allowBelowMinimum: true,
    overrideReason: "closing the account",
  });
  assertEqual(overridden.outcome, "created", "an explained override is allowed");
  assertEqual(overridden.payout.amount_minor, 20930, "the override pays the whole capacity");
  assertEqual(overridden.payout.minimum_override, true, "the override is recorded on the row");
  assertEqual(
    overridden.payout.minimum_override_reason,
    "closing the account",
    "the reason is stored for the audit",
  );

  assertEqual(
    number(
      `SELECT count(*)::int FROM finance_audit_log
       WHERE entity_type = 'author_payout' AND entity_id = '${overridden.payout.id}'
         AND action = 'author_payout_draft_created';`,
    ),
    1,
    "the override is audited",
  );

  // Clean up so later tests see this author with a free balance again.
  json(
    `SELECT public.cancel_author_payout(
      '${overridden.payout.id}'::uuid, 'test cleanup', '${STAFF}'::uuid, 'corr-small-cancel'
    );`,
  );
}

/** Builds the main payee position: three old sales, 70% share, no holds left. */
function seedPayeeBalance() {
  psql(TEST_DB, `UPDATE authors SET payout_eligible = true WHERE id = '${AUTHOR_PAYEE}';`);
  approveTerms(AUTHOR_PAYEE, 7000, 14, "corr-terms-payee");

  const sales = [
    { id: "22222222-2222-2222-2222-222222222101", amount: 100000, at: "2026-02-10T10:00:00Z" },
    { id: "22222222-2222-2222-2222-222222222102", amount: 100000, at: "2026-03-10T10:00:00Z" },
    { id: "22222222-2222-2222-2222-222222222103", amount: 100000, at: "2026-04-10T10:00:00Z" },
  ];

  const ids = [];
  for (const sale of sales) {
    const payment = insertPayment({
      id: sale.id,
      userId: USER_B,
      practiceId: PRACTICE_PAYEE,
      authorSnapshot: AUTHOR_PAYEE,
      amount: sale.amount,
      confirmedAt: sale.at,
    });
    const result = accrue(payment.paymentId, `corr-payee-${sale.id.slice(-3)}`);
    assertEqual(result.outcome, "created", `accrual for ${sale.id}`);
    ids.push(payment.paymentId);
  }

  const snap = snapshot(AUTHOR_PAYEE);
  assertEqual(snap.available_balance_minor, 210000, "three sales at 70% of 100000");
  assertEqual(snap.capacity_minor, 210000, "nothing reserved yet");
  assertEqual(snap.source_entry_count, 3, "three allocatable source rows");
  return ids;
}

function testPlatformAuthorIsNeverACandidate() {
  const platform = insertPayment({
    id: "22222222-2222-2222-2222-222222222201",
    userId: USER_A,
    practiceId: PRACTICE_PLATFORM,
    authorSnapshot: AUTHOR_PLATFORM,
    amount: 500000,
    confirmedAt: OLD_SALE_AT,
  });
  const result = accrue(platform.paymentId, "corr-platform-1");
  assertEqual(result.outcome, "skipped", "a platform-owned sale never accrues");

  const snap = snapshot(AUTHOR_PLATFORM);
  assertEqual(snap.capacity_minor, 0, "a platform author has no capacity");
  assertEqual(snap.blocker, "author_not_payout_eligible", "and is blocked by eligibility");

  expectError(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_PLATFORM}'::uuid, 'payout-platform-1', '${CUTOFF}'::timestamptz,
      NULL, false, NULL, NULL, false, '${STAFF}'::uuid, 'corr-platform-draft'
    );`,
    "author_not_payout_eligible",
    "a platform-owned author can never be paid",
  );

  const candidates = json(
    `SELECT public.admin_author_payout_p333_candidates('${CUTOFF}'::timestamptz, false, true, NULL, 50, 0);`,
  );
  const slugs = candidates.rows.map((row) => row.slug);
  assert(!slugs.includes("platform-catalog"), "the platform author is not offered as a candidate");
}

function testDraftReservesFifo() {
  const draft = createDraft({ authorId: AUTHOR_PAYEE, key: "payout-payee-1", desired: 100000 });
  assertEqual(draft.outcome, "created", "a partial draft is allowed");
  assertEqual(draft.payout.amount_minor, 100000, "the requested partial amount is honoured");
  assertEqual(draft.allocated_minor, 100000, "allocations cover the amount exactly");

  // FIFO: the oldest entry is consumed in full, the next one partially.
  const allocations = json(
    `SELECT coalesce(jsonb_agg(jsonb_build_object(
       'amount', al.amount_minor, 'effective_at', e.effective_at, 'status', al.status
     ) ORDER BY e.effective_at), '[]'::jsonb)
     FROM author_payout_allocations AS al
     JOIN author_ledger_entries AS e ON e.id = al.ledger_entry_id
     WHERE al.payout_id = '${draft.payout.id}';`,
  );
  assertEqual(allocations.length, 2, "two source rows were needed");
  assertEqual(allocations[0].amount, 70000, "the oldest accrual is consumed in full");
  assertEqual(allocations[1].amount, 30000, "the next accrual is consumed partially");
  assert(
    allocations[0].effective_at < allocations[1].effective_at,
    "allocation order is oldest money first",
  );

  const snap = snapshot(AUTHOR_PAYEE);
  assertEqual(snap.active_reserved_minor, 100000, "the draft reserves its amount");
  assertEqual(snap.capacity_minor, 110000, "capacity drops by exactly the reservation");
  assertEqual(
    snap.available_balance_minor,
    210000,
    "reserving money does not touch the ledger balance",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'payout';`),
    0,
    "a draft writes no ledger row",
  );

  return draft.payout.id;
}

function testIdempotencyAndOverReservation(firstPayoutId) {
  const replay = createDraft({ authorId: AUTHOR_PAYEE, key: "payout-payee-1", desired: 100000 });
  assertEqual(replay.outcome, "idempotent_replay", "the same key returns the same payout");
  assertEqual(replay.payout.id, firstPayoutId, "and never creates a second document");
  assertEqual(
    number(
      `SELECT count(*)::int FROM author_payout_allocations WHERE payout_id = '${firstPayoutId}';`,
    ),
    2,
    "a replay does not duplicate allocations",
  );

  // The remaining capacity is 110000: asking for more must be refused rather
  // than promising the same money twice.
  expectError(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_PAYEE}'::uuid, 'payout-payee-over', '${CUTOFF}'::timestamptz,
      120000::bigint, false, NULL, NULL, false, '${STAFF}'::uuid, 'corr-over'
    );`,
    "desired_amount_exceeds_capacity",
    "a second draft cannot exceed the remaining capacity",
  );

  const second = createDraft({ authorId: AUTHOR_PAYEE, key: "payout-payee-2" });
  assertEqual(second.payout.amount_minor, 110000, "the second draft takes exactly what is left");

  const snap = snapshot(AUTHOR_PAYEE);
  assertEqual(snap.active_reserved_minor, 210000, "everything is now reserved");
  assertEqual(snap.capacity_minor, 0, "and nothing is left to promise");

  expectError(
    `SELECT public.create_author_payout_draft(
      '${AUTHOR_PAYEE}'::uuid, 'payout-payee-3', '${CUTOFF}'::timestamptz,
      NULL, false, NULL, NULL, false, '${STAFF}'::uuid, 'corr-third'
    );`,
    "no_payable_balance",
    "a third draft finds nothing left",
  );

  return second.payout.id;
}

function testConcurrencyGuards() {
  const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
  assert(
    sql.includes("pg_advisory_xact_lock"),
    "drafts serialize on an advisory lock per author and currency",
  );
  assert(
    sql.includes("FOR UPDATE"),
    "lifecycle transitions lock the payout row",
  );
  assert(
    sql.includes("author_payouts_idempotency_key_uidx"),
    "idempotency is enforced by a unique index, not only by a read",
  );

  // The unique index is real, not just declared.
  expectError(
    `INSERT INTO author_payouts (
       author_id, amount_minor, period_label, period_start, period_end, cutoff_at, idempotency_key
     ) VALUES (
       '${AUTHOR_PAYEE}', 100000, '2026-07', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z',
       '${CUTOFF}', 'payout-payee-1'
     );`,
    "author_payouts_idempotency_key_uidx",
    "a duplicate idempotency key is rejected by the database",
  );
}

function testCancelReleases(payoutId) {
  const cancelled = json(
    `SELECT public.cancel_author_payout(
      '${payoutId}'::uuid, 'author asked to wait', '${STAFF}'::uuid, 'corr-cancel'
    );`,
  );
  assertEqual(cancelled.outcome, "cancelled", "a draft can be cancelled");
  // 110000 came from the leftover of the second accrual plus the whole third.
  assertEqual(cancelled.released_allocations, 2, "its reservation is given back");

  const snap = snapshot(AUTHOR_PAYEE);
  assertEqual(snap.capacity_minor, 110000, "the cancelled amount is payable again");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'payout';`),
    0,
    "cancelling writes no ledger row",
  );

  const replay = json(
    `SELECT public.cancel_author_payout(
      '${payoutId}'::uuid, 'again', '${STAFF}'::uuid, 'corr-cancel-2'
    );`,
  );
  assertEqual(replay.outcome, "idempotent_replay", "cancelling twice is safe");
}

function testApproveAndPay(payoutId) {
  const approved = json(
    `SELECT public.approve_author_payout('${payoutId}'::uuid, '${STAFF}'::uuid, 'corr-approve');`,
  );
  assertEqual(approved.outcome, "approved", "a funded draft is approvable");

  const replay = json(
    `SELECT public.approve_author_payout('${payoutId}'::uuid, '${STAFF}'::uuid, 'corr-approve');`,
  );
  assertEqual(replay.outcome, "idempotent_replay", "approving twice is safe");

  json(
    `SELECT public.mark_author_payout_processing('${payoutId}'::uuid, '${STAFF}'::uuid, 'corr-processing');`,
  );

  expectError(
    `SELECT public.mark_author_payout_paid(
      '${payoutId}'::uuid, '   ', '2026-07-02T10:00:00Z'::timestamptz, '${STAFF}'::uuid, 'corr-paid'
    );`,
    "external_reference_required",
    "paid without a transfer reference is refused",
  );

  expectError(
    `SELECT public.mark_author_payout_paid(
      '${payoutId}'::uuid, 'PP-1001', '2026-07-02T10:00:00Z'::timestamptz, NULL, 'corr-paid'
    );`,
    "actor_required",
    "paid without a named actor is refused",
  );

  const paid = json(
    `SELECT public.mark_author_payout_paid(
      '${payoutId}'::uuid, 'PP-1001', '2026-07-02T10:00:00Z'::timestamptz, '${STAFF}'::uuid, 'corr-paid'
    );`,
  );
  assertEqual(paid.outcome, "paid", "an approved payout can be confirmed as transferred");

  const entry = json(
    `SELECT to_jsonb(e) FROM author_ledger_entries AS e WHERE e.id = '${paid.ledger_entry_id}';`,
  );
  assertEqual(entry.entry_type, "payout", "the ledger row is a payout");
  assertEqual(Number(entry.amount_minor), -100000, "and it is negative");
  assertEqual(entry.payout_id, payoutId, "and it points back at the payout");
  assertEqual(entry.calculation_version, "p333.v1", "with the P3.3.3 calculation version");

  assertEqual(
    number(
      `SELECT count(*)::int FROM author_payout_allocations
       WHERE payout_id = '${payoutId}' AND status = 'paid';`,
    ),
    2,
    "its allocations became paid",
  );

  const snap = snapshot(AUTHOR_PAYEE, "2026-07-10T00:00:00Z");
  assertEqual(snap.available_balance_minor, 110000, "the payout reduced the ledger balance");
  assertEqual(snap.payout_paid_minor, 100000, "and is visible as paid money");
  assertEqual(snap.active_reserved_minor, 0, "a paid payout no longer reserves anything");
  assertEqual(snap.capacity_minor, 110000, "the rest of the balance stays payable");

  // The transfer happened after this payout's own cutoff, so a snapshot at the
  // old cutoff cannot see the negative row yet. The paid allocations still
  // consume their source entries, and capacity is capped by what is actually
  // unclaimed — so the same money can never be promised twice.
  const atOldCutoff = snapshot(AUTHOR_PAYEE);
  assertEqual(atOldCutoff.available_balance_minor, 210000, "the old cutoff predates the transfer");
  assertEqual(atOldCutoff.allocatable_positive_minor, 110000, "but the paid sources are consumed");
  assertEqual(atOldCutoff.capacity_minor, 110000, "so capacity is capped by the unclaimed rows");
  assertEqual(atOldCutoff.capacity_capped_by_sources, true, "and the cap is reported honestly");

  // One payout row per payout, enforced by the database.
  expectError(
    `INSERT INTO author_ledger_entries (
       author_id, entry_type, amount_minor, currency, payout_id,
       effective_at, available_at, idempotency_key
     ) VALUES (
       '${AUTHOR_PAYEE}', 'payout', -1, 'RUB', '${payoutId}',
       now(), now(), 'duplicate-payout-entry'
     );`,
    "author_ledger_entries_payout_uidx",
    "a second payout ledger row for the same payout is impossible",
  );

  const replayPaid = json(
    `SELECT public.mark_author_payout_paid(
      '${payoutId}'::uuid, 'PP-1001', '2026-07-02T10:00:00Z'::timestamptz, '${STAFF}'::uuid, 'corr-paid'
    );`,
  );
  assertEqual(replayPaid.outcome, "idempotent_replay", "marking paid twice is safe");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'payout';`),
    1,
    "and never writes a second ledger row",
  );

  return payoutId;
}

function testFailureModes() {
  // Explicit refusal: the money was never sent, so the claim is released.
  const explicit = createDraft({ authorId: AUTHOR_PAYEE, key: "payout-fail-1", desired: 100000 });
  json(
    `SELECT public.approve_author_payout('${explicit.payout.id}'::uuid, '${STAFF}'::uuid, 'corr-fail-approve');`,
  );
  const failed = json(
    `SELECT public.mark_author_payout_failed(
      '${explicit.payout.id}'::uuid, 'account_closed', 'bank refused', 'release',
      '${STAFF}'::uuid, 'corr-fail-1'
    );`,
  );
  assertEqual(failed.outcome, "failed", "an explicit refusal fails the payout");
  assertEqual(failed.reservation_kept, false, "and releases the reservation");
  assertEqual(snapshot(AUTHOR_PAYEE).capacity_minor, 110000, "the money is payable again");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'payout';`),
    1,
    "a failed payout writes no ledger row",
  );

  // Unknown state: the transfer may be in flight, so the claim is kept.
  const unknown = createDraft({ authorId: AUTHOR_PAYEE, key: "payout-fail-2", desired: 100000 });
  json(
    `SELECT public.approve_author_payout('${unknown.payout.id}'::uuid, '${STAFF}'::uuid, 'corr-unknown-approve');`,
  );
  const review = json(
    `SELECT public.mark_author_payout_failed(
      '${unknown.payout.id}'::uuid, 'provider_timeout', 'no answer', 'review',
      '${STAFF}'::uuid, 'corr-fail-2'
    );`,
  );
  assertEqual(review.outcome, "requires_review", "an unknown outcome parks for review");
  assertEqual(review.reservation_kept, true, "and keeps holding the money");
  assertEqual(review.released_allocations, 0, "nothing was released");

  const snap = snapshot(AUTHOR_PAYEE);
  assertEqual(snap.active_reserved_minor, 100000, "the reservation survives review");
  assertEqual(snap.capacity_minor, 10000, "so the money cannot be promised twice");

  expectError(
    `SELECT public.mark_author_payout_failed(
      '${unknown.payout.id}'::uuid, 'x', NULL, 'shrug', '${STAFF}'::uuid, 'corr-fail-3'
    );`,
    "invalid_failure_mode",
    "only release and review are valid failure modes",
  );

  // A reviewed payout can still be resolved either way.
  json(
    `SELECT public.cancel_author_payout(
      '${unknown.payout.id}'::uuid, 'confirmed not sent', '${STAFF}'::uuid, 'corr-unknown-cancel'
    );`,
  );
  assertEqual(
    snapshot(AUTHOR_PAYEE).capacity_minor,
    110000,
    "resolving the review gives the money back",
  );
}

function testRequiresReviewKeepsReserve() {
  const draft = createDraft({ authorId: AUTHOR_PAYEE, key: "payout-review-1", desired: 100000 });

  expectError(
    `SELECT public.mark_author_payout_requires_review(
      '${draft.payout.id}'::uuid, NULL, '${STAFF}'::uuid, 'corr-review'
    );`,
    "review_reason_required",
    "parking a payout for review needs a reason",
  );

  const review = json(
    `SELECT public.mark_author_payout_requires_review(
      '${draft.payout.id}'::uuid, 'identity check', '${STAFF}'::uuid, 'corr-review'
    );`,
  );
  assertEqual(review.outcome, "requires_review", "a draft can be parked");
  assertEqual(review.reservation_kept, true, "and keeps its reservation");
  assertEqual(snapshot(AUTHOR_PAYEE).capacity_minor, 10000, "capacity stays reduced");

  // Review resolves forward without a new document.
  const approved = json(
    `SELECT public.approve_author_payout('${draft.payout.id}'::uuid, '${STAFF}'::uuid, 'corr-review-approve');`,
  );
  assertEqual(approved.outcome, "approved", "a reviewed payout can be approved");

  json(
    `SELECT public.cancel_author_payout(
      '${draft.payout.id}'::uuid, 'test cleanup', '${STAFF}'::uuid, 'corr-review-cancel'
    );`,
  );
}

function testFullReversal(paidPayoutId) {
  expectError(
    `SELECT public.reverse_author_payout(
      '${paidPayoutId}'::uuid, NULL, '${STAFF}'::uuid, 'corr-reverse', NULL
    );`,
    "reversal_reason_required",
    "a reversal needs a written reason",
  );

  const before = snapshot(AUTHOR_PAYEE, "2026-07-20T00:00:00Z");
  assertEqual(before.available_balance_minor, 110000, "the paid transfer is out of the balance");

  const reversed = json(
    `SELECT public.reverse_author_payout(
      '${paidPayoutId}'::uuid, 'transfer returned by the bank', '${STAFF}'::uuid,
      'corr-reverse', '2026-07-05T10:00:00Z'::timestamptz
    );`,
  );
  assertEqual(reversed.outcome, "reversed", "a paid payout can be fully reversed");
  assertEqual(reversed.scope, "full", "only full reversal exists in the MVP");

  const entry = json(
    `SELECT to_jsonb(e) FROM author_ledger_entries AS e
     WHERE e.id = '${reversed.reversal_ledger_entry_id}';`,
  );
  assertEqual(entry.entry_type, "payout_reversal", "the reversal is its own ledger row");
  assertEqual(Number(entry.amount_minor), 100000, "and gives the whole amount back");

  const after = snapshot(AUTHOR_PAYEE, "2026-07-20T00:00:00Z");
  assertEqual(
    after.available_balance_minor - before.available_balance_minor,
    100000,
    "the balance is restored in full",
  );
  assertEqual(after.payout_reversed_minor, 100000, "the reversal is visible in the snapshot");

  // The paid allocations stay paid: history is not rewritten. The returned
  // money becomes a fresh allocatable source row instead.
  assertEqual(
    number(
      `SELECT count(*)::int FROM author_payout_allocations
       WHERE payout_id = '${paidPayoutId}' AND status = 'paid';`,
    ),
    2,
    "reversal does not rewrite the original allocations",
  );

  const fresh = createDraft({
    authorId: AUTHOR_PAYEE,
    key: "payout-after-reversal",
    cutoff: "2026-07-20T00:00:00Z",
    desired: 100000,
  });
  assertEqual(fresh.outcome, "created", "returned money can be paid out again");
  json(
    `SELECT public.cancel_author_payout(
      '${fresh.payout.id}'::uuid, 'test cleanup', '${STAFF}'::uuid, 'corr-fresh-cancel'
    );`,
  );

  const replay = json(
    `SELECT public.reverse_author_payout(
      '${paidPayoutId}'::uuid, 'again', '${STAFF}'::uuid, 'corr-reverse-2', NULL
    );`,
  );
  assertEqual(replay.outcome, "idempotent_replay", "a second reversal is a replay");
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'payout_reversal';`),
    1,
    "and never writes a second reversal row",
  );
}

/** A refund landing after the draft must block approval, not shrink the payout. */
function testUnderfundedAfterRefund() {
  const payment = insertPayment({
    id: "22222222-2222-2222-2222-222222222501",
    userId: USER_A,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    amount: 300000,
    confirmedAt: "2026-05-10T10:00:00Z",
  });
  accrue(payment.paymentId, "corr-refund-case");

  const cutoff = "2026-07-20T00:00:00Z";
  const before = snapshot(AUTHOR_PAYEE, cutoff);
  const draft = createDraft({
    authorId: AUTHOR_PAYEE,
    key: "payout-refund-case",
    cutoff,
    desired: before.capacity_minor,
  });
  assertEqual(draft.outcome, "created", "the draft is created while fully funded");

  confirmRefund({ paymentId: payment.paymentId, amount: 300000, key: "refund-after-draft" });

  // The reversal is effective now, i.e. after this payout's cutoff, so the
  // re-check has to look at the present rather than at the frozen cutoff.
  const after = json(
    `SELECT public.author_payout_payable_snapshot(
      '${AUTHOR_PAYEE}'::uuid, greatest('${cutoff}'::timestamptz, now()), false,
      '${draft.payout.id}'::uuid
    );`,
  );
  assert(
    after.capacity_minor < draft.payout.amount_minor,
    `the refund left the payout underfunded (capacity ${after.capacity_minor} vs ${draft.payout.amount_minor})`,
  );

  const atFrozenCutoff = snapshot(AUTHOR_PAYEE, cutoff, false, draft.payout.id);
  assert(
    atFrozenCutoff.capacity_minor >= draft.payout.amount_minor,
    "the frozen cutoff alone would still look funded, which is why it is not used",
  );

  const blocked = json(
    `SELECT public.approve_author_payout('${draft.payout.id}'::uuid, '${STAFF}'::uuid, 'corr-underfunded');`,
  );
  assertEqual(blocked.ok, false, "approval is blocked");
  assertEqual(blocked.result_code, "underfunded", "and says why");
  assertEqual(blocked.payout.status, "requires_review", "the payout is parked for a human");

  const integrity = json(`SELECT public.admin_author_payout_p333_integrity_snapshot(false);`);
  assert(
    integrity.underfunded_active_payouts >= 1,
    "the integrity snapshot sees the underfunded payout",
  );

  // Reconcile finds the same problem and can park draft/approved payouts.
  const dryRun = json(`SELECT public.admin_author_payout_p333_reconcile(false, false, NULL, NULL);`);
  assertEqual(dryRun.applied, false, "reconcile defaults to read-only");
  assertEqual(dryRun.flagged_for_review, 0, "and writes nothing by default");

  json(
    `SELECT public.cancel_author_payout(
      '${draft.payout.id}'::uuid, 'refunded', '${STAFF}'::uuid, 'corr-underfunded-cancel'
    );`,
  );
  return draft.payout.id;
}

function testReconcileApplies() {
  const cutoff = "2026-07-20T00:00:00Z";
  const payment = insertPayment({
    id: "22222222-2222-2222-2222-222222222502",
    userId: USER_B,
    practiceId: PRACTICE_PAYEE,
    authorSnapshot: AUTHOR_PAYEE,
    amount: 400000,
    confirmedAt: "2026-05-20T10:00:00Z",
  });
  accrue(payment.paymentId, "corr-reconcile-case");

  const draft = createDraft({
    authorId: AUTHOR_PAYEE,
    key: "payout-reconcile-case",
    cutoff,
    desired: 280000,
  });

  confirmRefund({ paymentId: payment.paymentId, amount: 400000, key: "refund-reconcile" });

  const applied = json(
    `SELECT public.admin_author_payout_p333_reconcile(false, true, '${STAFF}'::uuid, 'corr-reconcile');`,
  );
  assertEqual(applied.applied, true, "reconcile can be asked to act");
  assert(applied.flagged_for_review >= 1, "and parks the underfunded payout");

  assertEqual(
    scalar(`SELECT status FROM author_payouts WHERE id = '${draft.payout.id}';`),
    "requires_review",
    "the payout waits for a human",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'payout';`),
    1,
    "reconcile never writes a ledger row",
  );

  json(
    `SELECT public.cancel_author_payout(
      '${draft.payout.id}'::uuid, 'refunded', '${STAFF}'::uuid, 'corr-reconcile-cancel'
    );`,
  );
}

function testNegativeBalanceReducesCapacity() {
  const cutoff = "2026-07-20T00:00:00Z";
  const before = snapshot(AUTHOR_PAYEE, cutoff);

  // A manual debit is a negative position with no source row of its own: it
  // must reduce capacity globally rather than being netted against one sale.
  json(
    `SELECT public.create_author_ledger_manual_adjustment(
      '${AUTHOR_PAYEE}'::uuid, -25000::bigint, 'correction_overpayment', 'adj-negative-1',
      'test debit', 'RUB', '2026-06-01T00:00:00Z'::timestamptz, '${STAFF}'::uuid, 'corr-adj'
    );`,
  );

  const after = snapshot(AUTHOR_PAYEE, cutoff);
  assertEqual(
    before.capacity_minor - after.capacity_minor,
    25000,
    "a negative entry reduces capacity one for one",
  );
  assertEqual(after.negative_available_minor - before.negative_available_minor, 25000, "and is reported as the holdback");
  assert(
    after.allocatable_positive_minor > after.capacity_minor,
    "unclaimed positive rows exceed capacity by exactly the holdback",
  );
  assertEqual(
    after.allocatable_positive_minor - after.capacity_minor,
    after.negative_available_minor,
    "capacity equals free positive money minus the negative holdback",
  );
}

function testImmutability() {
  const payoutId = scalar(`SELECT id::text FROM author_payouts WHERE status = 'reversed' LIMIT 1;`);
  assert(payoutId.length > 0, "there is a reversed payout to test against");

  expectError(
    `UPDATE author_payouts SET amount_minor = 1 WHERE id = '${payoutId}';`,
    "author_payouts_economics_immutable",
    "a payout amount can never be edited",
  );
  expectError(
    `UPDATE author_payouts SET author_id = '${AUTHOR_SMALL}' WHERE id = '${payoutId}';`,
    "author_payouts_economics_immutable",
    "a payout can never be moved to another author",
  );
  expectError(
    `UPDATE author_payouts SET status = 'draft' WHERE id = '${payoutId}';`,
    "author_payouts_rpc_required",
    "a status change outside the RPCs is refused",
  );
  expectError(
    `DELETE FROM author_payouts WHERE id = '${payoutId}';`,
    "author_payouts_delete_forbidden",
    "payouts are never deleted",
  );
  expectError(
    `UPDATE author_payouts SET external_reference = 'FORGED' WHERE id = '${payoutId}';`,
    "author_payouts_rpc_required",
    "a direct edit outside the RPCs is refused",
  );
  // Even a caller that has the RPC flag on cannot rewrite what was paid.
  expectError(
    `SELECT set_config('audiolad.finance_payout_mutation', 'on', true);
     UPDATE author_payouts SET external_reference = 'FORGED' WHERE id = '${payoutId}';`,
    "author_payouts_paid_immutable",
    "the transfer reference of a paid payout is frozen",
  );
  expectError(
    `SELECT set_config('audiolad.finance_payout_mutation', 'on', true);
     UPDATE author_payouts SET paid_at = now() WHERE id = '${payoutId}';`,
    "author_payouts_paid_immutable",
    "the transfer time of a paid payout is frozen",
  );

  const allocationId = scalar(
    `SELECT id::text FROM author_payout_allocations WHERE status = 'paid' LIMIT 1;`,
  );
  expectError(
    `UPDATE author_payout_allocations SET amount_minor = 1 WHERE id = '${allocationId}';`,
    "author_payout_allocations_immutable",
    "an allocation amount is frozen",
  );
  expectError(
    `UPDATE author_payout_allocations SET status = 'released' WHERE id = '${allocationId}';`,
    "author_payout_allocations_paid_immutable",
    "a paid allocation can never be released",
  );
  expectError(
    `DELETE FROM author_payout_allocations WHERE id = '${allocationId}';`,
    "author_payout_allocations_delete_forbidden",
    "allocations are never deleted",
  );

  // The P3.3.2 ledger stays append-only for payout rows too.
  const entryId = scalar(
    `SELECT id::text FROM author_ledger_entries WHERE entry_type = 'payout' LIMIT 1;`,
  );
  expectError(
    `UPDATE author_ledger_entries SET amount_minor = -1 WHERE id = '${entryId}';`,
    "author_ledger_entries_append_only",
    "a payout ledger row cannot be edited",
  );
  expectError(
    `DELETE FROM author_ledger_entries WHERE id = '${entryId}';`,
    "author_ledger_entries_append_only",
    "a payout ledger row cannot be deleted",
  );

  // The payout link is only valid on payout rows.
  expectError(
    `INSERT INTO author_ledger_entries (
       author_id, entry_type, amount_minor, currency, payout_id,
       effective_at, available_at, idempotency_key, reason_code
     ) VALUES (
       '${AUTHOR_PAYEE}', 'manual_credit', 100, 'RUB', '${payoutId}',
       now(), now(), 'bad-payout-link', 'test'
     );`,
    "author_ledger_entries_payout_scope_check",
    "only payout rows may reference a payout",
  );
}

function testAdminReadModels() {
  const cutoff = "2026-07-20T00:00:00Z";

  const candidates = json(
    `SELECT public.admin_author_payout_p333_candidates('${cutoff}'::timestamptz, false, true, NULL, 50, 0);`,
  );
  assert(candidates.total >= 1, "there is at least one candidate");
  assertEqual(candidates.minimum_minor, 100000, "the minimum travels with the read model");
  const payee = candidates.rows.find((row) => row.slug === "external-payee");
  assert(payee !== undefined, "the payee is a candidate");
  assertEqual(
    payee.capacity_minor,
    snapshot(AUTHOR_PAYEE, cutoff).capacity_minor,
    "the candidate capacity matches the snapshot",
  );

  const list = json(
    `SELECT public.admin_author_payout_p333_list(NULL, NULL, false, NULL, NULL, NULL, 50, 0);`,
  );
  assert(list.total >= 1, "the register lists payouts");
  for (const row of list.rows) {
    assert(!("bank_account" in row), "no bank account is exposed");
    assert(typeof row.author_slug === "string", "rows identify the author, not the buyer");
  }

  const paidRow = list.rows.find((row) => row.status === "reversed");
  assert(paidRow !== undefined, "the reversed payout is in the register");

  const detail = json(
    `SELECT public.admin_author_payout_p333_detail('${paidRow.payout_id}'::uuid);`,
  );
  assertEqual(detail.found, true, "the detail view finds it");
  assertEqual(detail.allocations.length, 2, "with its allocations");
  assertEqual(detail.ledger_entries.length, 2, "and both its ledger rows");
  assert(detail.audit.length >= 3, "and the full audit trail");

  const summary = json(
    `SELECT public.admin_author_payout_p333_summary(NULL, NULL, false);`,
  );
  assertEqual(summary.currency, "RUB", "summary currency");
  assertEqual(summary.minimum_minor, 100000, "summary minimum");
  assertEqual(summary.timezone, "Europe/Moscow", "summary timezone");
  assertEqual(summary.cadence, "monthly", "summary cadence");
  assertEqual(summary.paid_minor, 100000, "one payout of 100000 was paid");
  assertEqual(summary.reversed_minor, 100000, "and fully reversed");
  assertEqual(summary.net_paid_minor, 0, "so nothing is net paid out");

  const integrity = json(`SELECT public.admin_author_payout_p333_integrity_snapshot(false);`);
  assertEqual(integrity.paid_without_ledger_entry, 0, "every paid payout has its ledger row");
  assertEqual(integrity.paid_without_external_reference, 0, "and its transfer reference");
  assertEqual(integrity.allocation_sum_mismatch, 0, "allocations always add up to the amount");
  assertEqual(integrity.over_allocated_entries, 0, "no source row is over-allocated");
  assertEqual(integrity.allocations_on_negative_entries, 0, "negatives are never allocated");
  assertEqual(integrity.duplicate_payout_entries, 0, "no duplicate payout ledger rows");
  assertEqual(integrity.payout_entry_amount_mismatch, 0, "ledger amounts match the documents");
  assertEqual(integrity.payout_entries_wrong_sign, 0, "signs are correct");
  assertEqual(integrity.below_minimum_without_override, 0, "no silent sub-minimum payout");
  assertEqual(integrity.payouts_without_audit_entry, 0, "every payout is audited");
  assertEqual(integrity.reserved_allocations_on_closed_payouts, 0, "closed payouts hold nothing");
}

function testRegressionAgainstEarlierPhases() {
  // P3.1 gross is untouched by anything the payout layer does.
  const grossFromPayments = number(
    `SELECT coalesce(sum(amount_minor), 0)::bigint FROM payments WHERE status = 'succeeded' AND is_test = false;`,
  );
  const p31 = json(`SELECT public.admin_payments_p31_summary(NULL,NULL,NULL,NULL,false,NULL,NULL);`);
  assertEqual(
    Number(p31.gross_minor),
    grossFromPayments,
    "P3.1 gross still equals the sum of succeeded payments",
  );

  // P3.3.1 refund facts are untouched.
  assertEqual(
    number(`SELECT count(*)::int FROM payment_refunds WHERE status = 'succeeded';`),
    2,
    "the refunds created by the tests are still the only refunds",
  );

  // P3.3.2 keeps its shape and its accrual numbers.
  const p332 = json(`SELECT public.admin_author_finance_p332_summary(NULL, NULL, false);`);
  for (const key of [
    "gross_minor",
    "accrued_minor",
    "reversed_minor",
    "net_entitlement_minor",
    "held_minor",
    "payable_minor",
    "payout_eligible_authors",
  ]) {
    assert(key in p332, `P3.3.2 summary still exposes ${key}`);
  }
  assertEqual(
    Number(p332.gross_minor),
    grossFromPayments,
    "P3.3.2 still reads gross from the P3.1 base",
  );

  // Payouts are ledger entries, so P3.3.2 payable already accounts for them:
  // p332 payable = p333 available balance, and p333 capacity is that minus
  // the reservations the payout layer added on top.
  assertEqual(
    Number(p332.net_entitlement_minor),
    Number(p332.accrued_minor) + Number(p332.reversed_minor) + Number(p332.adjustments_minor),
    "P3.3.2 net entitlement is still accruals plus reversals plus adjustments",
  );
  const entitlementFromLedger = number(
    `SELECT coalesce(sum(amount_minor), 0)::bigint
     FROM author_ledger_entries
     WHERE is_test = false AND entry_type NOT IN ('payout', 'payout_reversal');`,
  );
  assertEqual(
    entitlementFromLedger,
    Number(p332.net_entitlement_minor),
    "payout rows stay outside the P3.3.2 entitlement definition, which is unchanged",
  );
  assert(
    number(`SELECT count(*)::int FROM author_ledger_entries WHERE entry_type = 'payout';`) > 0,
    "and the payout rows the tests produced really are in the ledger",
  );

  // No accrual, terms row or eligibility flag was invented by the payout layer.
  assertEqual(
    number(
      `SELECT count(*)::int FROM author_ledger_entries
       WHERE entry_type = 'sale_accrual' AND (payment_id IS NULL OR calculation_version <> 'p332.v1');`,
    ),
    0,
    "every accrual still comes from the P3.3.2 sale path, none from the payout layer",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`),
    3,
    "only the authors the test enabled are payout eligible",
  );
}

function testSecurityGrants() {
  for (const table of ["author_payouts", "author_payout_allocations"]) {
    assert(
      bool(
        `SELECT relrowsecurity::text FROM pg_class
         WHERE oid = 'public.${table}'::regclass;`,
      ),
      `${table}: row level security is on`,
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
    assert(
      !bool(`SELECT has_table_privilege('service_role', 'public.${table}', 'DELETE')::text;`),
      `${table}: not even service_role may delete`,
    );
  }

  const functions = [
    "author_payout_statuses",
    "author_payout_active_statuses",
    "author_payout_transition_allowed",
    "author_payout_minimum_minor",
    "author_payout_period",
    "author_payout_available_entries",
    "author_payout_payable_snapshot",
    "author_payout_allocated_minor",
    "create_author_payout_draft",
    "approve_author_payout",
    "mark_author_payout_processing",
    "mark_author_payout_paid",
    "mark_author_payout_failed",
    "cancel_author_payout",
    "mark_author_payout_requires_review",
    "reverse_author_payout",
    "admin_author_payout_p333_candidates",
    "admin_author_payout_p333_list",
    "admin_author_payout_p333_detail",
    "admin_author_payout_p333_summary",
    "admin_author_payout_p333_integrity_snapshot",
    "admin_author_payout_p333_reconcile",
  ];

  // Pure vocabulary helpers are IMMUTABLE and carry no data access, so they
  // are intentionally not SECURITY DEFINER.
  const pureHelpers = new Set([
    "author_payout_statuses",
    "author_payout_active_statuses",
    "author_payout_allocation_reserved_statuses",
    "author_payout_allocation_consuming_statuses",
    "author_payout_transition_allowed",
    "author_payout_minimum_minor",
    "author_payout_period",
    "author_payout_row_json",
  ]);

  for (const fn of functions) {
    const identity = scalar(
      `SELECT p.oid::regprocedure::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${fn}' LIMIT 1;`,
    );
    assert(identity.length > 0, `${fn}: exists`);

    if (pureHelpers.has(fn)) continue;

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
    "finance.payouts.view",
    "finance.payouts.create",
    "finance.payouts.approve",
    "finance.payouts.mark_paid",
    "finance.payouts.reverse",
    "finance.payouts.manage",
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

function testNoBankDetailsStored() {
  const columns = psql(
    TEST_DB,
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('author_payouts', 'author_payout_allocations');`,
    { tuples: true },
  );
  for (const forbidden of [
    "bank",
    "account",
    "card",
    "iban",
    "bic",
    "inn",
    "swift",
    "requisites",
    "payee",
    "tax",
  ]) {
    assert(
      !columns.toLowerCase().includes(forbidden),
      `payout tables store no ${forbidden} column`,
    );
  }
}

function testRollingDeploySafety() {
  const payouts = number(`SELECT count(*)::int FROM author_payouts;`);
  const allocations = number(`SELECT count(*)::int FROM author_payout_allocations;`);
  const entries = number(`SELECT count(*)::int FROM author_ledger_entries;`);
  const eligible = number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`);

  psqlFile(TEST_DB, join(ROOT, MIGRATION));

  assertEqual(number(`SELECT count(*)::int FROM author_payouts;`), payouts, "re-apply adds no payout");
  assertEqual(
    number(`SELECT count(*)::int FROM author_payout_allocations;`),
    allocations,
    "re-apply adds no allocation",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM author_ledger_entries;`),
    entries,
    "re-apply adds no ledger row",
  );
  assertEqual(
    number(`SELECT count(*)::int FROM authors WHERE payout_eligible = true;`),
    eligible,
    "re-apply never changes payout eligibility",
  );
}

function main() {
  bootstrap();

  testMigrationSeedsNothing();
  testPolicyHelpers();
  testHeldExclusion();
  testThreshold();
  seedPayeeBalance();
  testPlatformAuthorIsNeverACandidate();
  const firstPayoutId = testDraftReservesFifo();
  const secondPayoutId = testIdempotencyAndOverReservation(firstPayoutId);
  testConcurrencyGuards();
  testCancelReleases(secondPayoutId);
  const paidPayoutId = testApproveAndPay(firstPayoutId);
  testFailureModes();
  testRequiresReviewKeepsReserve();
  testFullReversal(paidPayoutId);
  testUnderfundedAfterRefund();
  testReconcileApplies();
  testNegativeBalanceReducesCapacity();
  testImmutability();
  testAdminReadModels();
  testRegressionAgainstEarlierPhases();
  testSecurityGrants();
  testPermissionsSeeded();
  testNoBankDetailsStored();
  testRollingDeploySafety();

  console.log("payments-p333-author-payout-sql-unit: ok");
}

main();

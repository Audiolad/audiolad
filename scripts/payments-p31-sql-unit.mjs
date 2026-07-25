#!/usr/bin/env node
/**
 * P3.1 money analytics SQL tests on isolated DB (never production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_payments_p31_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";
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

INSERT INTO auth.users VALUES ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');
INSERT INTO public.authors VALUES ('${AUTHOR}', 'Author', 'author');
INSERT INTO public.practices VALUES
  ('${PRACTICE}', '${AUTHOR}', 'Practice A', 'practice-a', 'published', 299, false),
  ('${PRACTICE_B}', '${AUTHOR}', 'Practice B', 'practice-b', 'published', 199, false);
`,
  );

  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192000_admin_payments_p31_money.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725192100_admin_payments_p31_authors_products_fix.sql"));
}

function insertPayment({
  id,
  userId,
  practiceId,
  status,
  amount,
  confirmedAt,
  isTest = false,
  orderStatus = null,
  currentPracticePrice = null,
}) {
  const orderId = id.replace(/^22/, "11");
  const paid = status === "succeeded" || orderStatus === "paid";
  const oStatus = orderStatus ?? (status === "succeeded" ? "paid" : "pending");
  psql(
    TEST_DB,
    `
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot,
  is_test, paid_at, created_at
) VALUES (
  '${orderId}', '${userId}', '${practiceId}', '${oStatus}', ${amount}, 'RUB',
  'Snap', 'snap', ${amount}, ${isTest}, ${paid ? `'${confirmedAt}'` : "NULL"}, '${confirmedAt}'
);
INSERT INTO payments (
  id, order_id, provider, provider_payment_id, idempotency_key, status,
  amount_minor, currency, is_test, confirmed_at, created_at
) VALUES (
  '${id}', '${orderId}', 'tochka', 'op-${id}', 'idem-${id}', '${status}',
  ${amount}, 'RUB', ${isTest}, ${status === "succeeded" ? `'${confirmedAt}'` : "NULL"}, '${confirmedAt}'
);
`,
  );
  if (currentPracticePrice !== null) {
    psql(TEST_DB, `UPDATE practices SET price = ${currentPracticePrice} WHERE id='${practiceId}';`);
  }
  if (status === "succeeded" && oStatus === "paid") {
    psql(
      TEST_DB,
      `INSERT INTO user_practices (user_id, practice_id, access_source, granted_at)
       VALUES ('${userId}', '${practiceId}', 'purchase', '${confirmedAt}')
       ON CONFLICT DO NOTHING;`,
    );
  }
}

function main() {
  bootstrap();

  // Real succeeded
  insertPayment({
    id: "22222222-2222-2222-2222-222222222201",
    userId: USER_A,
    practiceId: PRACTICE,
    status: "succeeded",
    amount: 29900,
    confirmedAt: "2026-07-20T10:00:00Z",
  });
  // Pending ignored
  insertPayment({
    id: "22222222-2222-2222-2222-222222222202",
    userId: USER_A,
    practiceId: PRACTICE_B,
    status: "pending",
    amount: 50000,
    confirmedAt: "2026-07-20T11:00:00Z",
  });
  // Failed ignored
  insertPayment({
    id: "22222222-2222-2222-2222-222222222203",
    userId: USER_B,
    practiceId: PRACTICE,
    status: "failed",
    amount: 10000,
    confirmedAt: "2026-07-20T12:00:00Z",
  });
  // Test succeeded
  insertPayment({
    id: "22222222-2222-2222-2222-222222222204",
    userId: USER_B,
    practiceId: PRACTICE_B,
    status: "succeeded",
    amount: 19900,
    confirmedAt: "2026-07-21T10:00:00Z",
    isTest: true,
  });
  // Second real purchase by USER_A (repeat) — change practice price after first sale
  insertPayment({
    id: "22222222-2222-2222-2222-222222222205",
    userId: USER_A,
    practiceId: PRACTICE_B,
    status: "succeeded",
    amount: 15000,
    confirmedAt: "2026-07-22T10:00:00Z",
    currentPracticePrice: 999,
  });
  // Paid order without succeeded payment should not count — create orphan paid order
  psql(
    TEST_DB,
    `
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, paid_at
) VALUES (
  '11111111-1111-1111-1111-111111111199', '${USER_B}', '${PRACTICE}', 'paid', 77700, 'RUB',
  'Orphan', 'orphan', 77700, '2026-07-22T12:00:00Z'
);
`,
  );

  const summary = json(
    `SELECT public.admin_payments_p31_summary(NULL,NULL,NULL,NULL,false,NULL,NULL);`,
  );
  assertEqual(summary.payment_count, 2, "real payments only");
  assertEqual(summary.unique_buyers, 1, "unique buyers distinct");
  assertEqual(summary.gross_minor, 44900, "gross snapshot sum");
  assertEqual(summary.aov_minor, 22450, "aov");
  assertEqual(summary.repeat_buyers, 0, "all-time first purchases both in window → new");

  const withTest = json(
    `SELECT public.admin_payments_p31_summary(NULL,NULL,NULL,NULL,true,NULL,NULL);`,
  );
  assertEqual(withTest.payment_count, 3, "include test");
  assertEqual(withTest.gross_minor, 64800, "gross with test");

  // Price change must not affect gross
  assertEqual(
    number(`SELECT price FROM practices WHERE id='${PRACTICE_B}'`),
    999,
    "current price changed",
  );
  assertEqual(summary.gross_minor, 44900, "gross ignores current price");

  // Period new/repeat
  const period = json(
    `SELECT public.admin_payments_p31_summary(
      '2026-07-22T00:00:00Z','2026-07-23T00:00:00Z',NULL,NULL,false,NULL,NULL
    );`,
  );
  assertEqual(period.payment_count, 1, "period payments");
  assertEqual(period.unique_buyers, 1, "period buyers");
  assertEqual(period.repeat_buyers, 1, "repeat in period");
  assertEqual(period.new_buyers, 0, "not new in period");

  const zero = json(
    `SELECT public.admin_payments_p31_summary(
      '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',NULL,NULL,false,NULL,NULL
    );`,
  );
  assertEqual(zero.payment_count, 0, "empty period");
  assert(zero.aov_minor === null, "aov null at zero");

  const products = json(
    `SELECT public.admin_payments_p31_products(NULL,NULL,false,NULL,NULL,NULL,'gross_minor','desc',25,0);`,
  );
  const productGross = products.rows.reduce((s, r) => s + r.gross_minor, 0);
  assertEqual(productGross, summary.gross_minor, "product totals match summary");

  const authors = json(
    `SELECT public.admin_payments_p31_authors(NULL,NULL,false,NULL,NULL,NULL,'gross_minor','desc',25,0);`,
  );
  const authorGross = authors.rows.reduce((s, r) => s + r.gross_minor, 0);
  assertEqual(authorGross, summary.gross_minor, "author totals match summary");

  const ts = json(
    `SELECT public.admin_payments_p31_timeseries(
      '2026-07-20T00:00:00Z','2026-07-23T00:00:00Z',false,NULL,NULL,'day'
    );`,
  );
  const tsPayments = ts.points.reduce((s, p) => s + p.payments, 0);
  const tsGross = ts.points.reduce((s, p) => s + p.gross_minor, 0);
  const windowSummary = json(
    `SELECT public.admin_payments_p31_summary(
      '2026-07-20T00:00:00Z','2026-07-23T00:00:00Z',NULL,NULL,false,NULL,NULL
    );`,
  );
  assertEqual(tsPayments, windowSummary.payment_count, "timeseries payments = summary");
  assertEqual(tsGross, windowSummary.gross_minor, "timeseries gross = summary");

  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260725192200_admin_payments_p31_timeseries_range_fix.sql"),
  );

  const allTs = json(
    `SELECT public.admin_payments_p31_timeseries(NULL,NULL,false,NULL,NULL,'day');`,
  );
  const allTsPayments = allTs.points.reduce((s, p) => s + p.payments, 0);
  const allTsGross = allTs.points.reduce((s, p) => s + p.gross_minor, 0);
  assertEqual(allTsPayments, summary.payment_count, "all-time timeseries payments = summary");
  assertEqual(allTsGross, summary.gross_minor, "all-time timeseries gross = summary");

  console.log("payments-p31-sql-unit: ok");
}

main();

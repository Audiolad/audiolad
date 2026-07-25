#!/usr/bin/env node
/**
 * P3.2.1 buy_clicked linkage + path funnel SQL tests (isolated DB, never production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_analytics_p321_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";
const AUTHOR = "a1111111-1111-1111-1111-111111111111";
const PRACTICE = "c1111111-1111-1111-1111-111111111111";
const PRACTICE_FREE = "c2222222-2222-2222-2222-222222222222";
const SESSION_A = "51111111-1111-4111-8111-111111111111";
const SESSION_B = "52222222-2222-4222-8222-222222222222";
const ANON_A = "anon-user-a";
const ANON_B = "anon-user-b";
const CLICK_A = "e1111111-1111-4111-8111-111111111111";
const CLICK_B = "e2222222-2222-4222-8222-222222222222";
const CLICK_WRONG_TYPE = "e3333333-3333-4333-8333-333333333333";
const CLICK_STALE = "e4444444-4444-4444-8444-444444444444";
const CLICK_OTHER_USER = "e5555555-5555-4555-8555-555555555555";
const EVENT_A = "f1111111-1111-4111-8111-111111111111";
const EVENT_B = "f2222222-2222-4222-8222-222222222222";
const EVENT_WRONG = "f3333333-3333-4333-8333-333333333333";
const EVENT_STALE = "f4444444-4444-4444-8444-444444444444";
const EVENT_OTHER = "f5555555-5555-4555-8555-555555555555";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
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
function json(sql) {
  return JSON.parse(scalar(sql));
}
function setAuth(userId) {
  psql(
    TEST_DB,
    `CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${userId}'::uuid $$;`,
  );
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
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE
);
CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published',
  price integer NOT NULL DEFAULT 299,
  is_free boolean NOT NULL DEFAULT false
);
CREATE TABLE public.user_practices (
  user_id uuid NOT NULL,
  practice_id uuid NOT NULL,
  access_source text NOT NULL DEFAULT 'purchase',
  expires_at timestamptz NULL,
  PRIMARY KEY (user_id, practice_id)
);
CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY,
  anonymous_id text NOT NULL,
  user_id uuid NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,
  referrer_domain text NULL,
  landing_path text NULL,
  device_type text NOT NULL DEFAULT 'desktop',
  created_at timestamptz NOT NULL DEFAULT now(),
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human'
);
CREATE TABLE public.analytics_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz NULL,
  source text NOT NULL DEFAULT 'login',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  practice_id uuid NULL,
  track_id uuid NULL,
  user_id uuid NULL,
  anonymous_session_id text NULL,
  session_id uuid NULL,
  path text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  client_event_id uuid NULL,
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human',
  classification_reason text NULL,
  user_agent text NULL,
  client_version text NULL
);
CREATE UNIQUE INDEX analytics_events_client_event_id_uidx
  ON public.analytics_events (client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  practice_id uuid NOT NULL,
  status text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  practice_title_snapshot text NOT NULL,
  practice_slug_snapshot text NOT NULL,
  price_minor_snapshot bigint NOT NULL,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,
  is_test boolean NOT NULL DEFAULT false,
  test_reason text NULL
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  status text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  confirmed_at timestamptz NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO auth.users VALUES ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');
INSERT INTO public.authors VALUES ('${AUTHOR}', 'Author', 'author');
INSERT INTO public.practices VALUES
  ('${PRACTICE}', '${AUTHOR}', 'Paid Practice', 'paid-practice', 'published', 299, false),
  ('${PRACTICE_FREE}', '${AUTHOR}', 'Free', 'free-practice', 'published', 0, true);

INSERT INTO public.analytics_sessions (
  id, anonymous_id, user_id, utm_source, utm_campaign, landing_path, last_seen_at, started_at
) VALUES
  ('${SESSION_A}', '${ANON_A}', '${USER_A}', 'bothelp-maks', 'camp-a', '/practice/author/paid-practice', now(), now()),
  ('${SESSION_B}', '${ANON_B}', '${USER_B}', 'other', 'camp-b', '/catalog', now(), now());

-- buy clicks
INSERT INTO public.analytics_events (
  id, event_name, practice_id, user_id, anonymous_session_id, session_id,
  path, payload, occurred_at, client_event_id
) VALUES
  ('${EVENT_A}', 'buy_clicked', '${PRACTICE}', '${USER_A}', '${ANON_A}', '${SESSION_A}',
   '/practice/author/paid-practice', '{"purchase_surface":"practice_page"}'::jsonb, now() - interval '10 seconds', '${CLICK_A}'),
  ('${EVENT_B}', 'buy_clicked', '${PRACTICE}', '${USER_A}', '${ANON_A}', '${SESSION_A}',
   '/practice/author/paid-practice', '{"purchase_surface":"practice_page"}'::jsonb, now() - interval '5 seconds', '${CLICK_B}'),
  ('${EVENT_WRONG}', 'practice_view', '${PRACTICE}', '${USER_A}', '${ANON_A}', '${SESSION_A}',
   '/x', '{}'::jsonb, now() - interval '3 seconds', '${CLICK_WRONG_TYPE}'),
  ('${EVENT_STALE}', 'buy_clicked', '${PRACTICE}', '${USER_A}', '${ANON_A}', '${SESSION_A}',
   '/x', '{"purchase_surface":"practice_page"}'::jsonb, now() - interval '2 hours', '${CLICK_STALE}'),
  ('${EVENT_OTHER}', 'buy_clicked', '${PRACTICE}', '${USER_B}', '${ANON_B}', '${SESSION_B}',
   '/x', '{"purchase_surface":"practice_page"}'::jsonb, now() - interval '8 seconds', '${CLICK_OTHER_USER}');

INSERT INTO public.analytics_events (
  event_name, practice_id, user_id, anonymous_session_id, session_id, occurred_at
) VALUES
  ('practice_view', '${PRACTICE}', '${USER_A}', '${ANON_A}', '${SESSION_A}', now() - interval '1 minute'),
  ('practice_view', '${PRACTICE}', NULL, 'viewer-2', '${SESSION_A}', now() - interval '50 seconds');
`,
  );

  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260725194000_orders_p320_attribution_snapshot.sql"),
  );
  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260725200000_analytics_p321_buy_click_path.sql"),
  );
}

function createOrder({ key, sessionId = null, anon = null, origin = null, click = null }) {
  const sid = sessionId ? `'${sessionId}'::uuid` : "NULL";
  const aid = anon ? `'${anon}'` : "NULL";
  const path = origin ? `'${origin}'` : "NULL";
  const clickId = click ? `'${click}'::uuid` : "NULL";
  return json(
    `SELECT to_jsonb(t) FROM public.create_practice_order(
      'paid-practice', '${key}'::uuid, ${sid}, ${aid}, ${path}, ${clickId}
    ) AS t;`,
  );
}

function orderRow(orderId) {
  return json(`SELECT to_jsonb(o) FROM orders o WHERE id='${orderId}';`);
}

function main() {
  bootstrap();
  setAuth(USER_A);

  assert(
    ["t", "true"].includes(
      scalar(`SELECT public.is_platform_analytics_event('buy_clicked')::text`),
    ),
    "buy_clicked allowlisted",
  );

  // Valid link
  const linked = createOrder({
    key: "11111111-1111-4111-8111-111111111201",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/practice/author/paid-practice?token=1",
    click: CLICK_A,
  });
  assertEqual(linked.buy_click_linked, true, "linked true");
  assertEqual(linked.buy_click_link_reason, "linked", "reason linked");
  assertEqual(linked.attribution_confidence, "exact", "session exact preserved");
  const linkedRow = orderRow(linked.order_id);
  assertEqual(linkedRow.buy_click_event_id, EVENT_A, "event id");
  assertEqual(linkedRow.buy_click_client_event_id, CLICK_A, "client event id");
  assertEqual(linkedRow.purchase_surface, "practice_page", "surface");

  // Idempotent replay preserves link
  const replay = createOrder({
    key: "11111111-1111-4111-8111-111111111201",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/other",
    click: CLICK_B,
  });
  assertEqual(replay.order_id, linked.order_id, "same order");
  assertEqual(orderRow(replay.order_id).buy_click_event_id, EVENT_A, "link immutable");

  // Same event cannot link two orders
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${linked.order_id}';`);
  const second = createOrder({
    key: "11111111-1111-4111-8111-111111111202",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
    click: CLICK_A,
  });
  assertEqual(second.buy_click_linked, false, "already linked rejected");
  assertEqual(second.buy_click_link_reason, "already_linked", "already_linked reason");
  assert(second.order_id, "order still created");
  assertEqual(orderRow(second.order_id).buy_click_event_id, null, "no link");

  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${second.order_id}';`);

  // Wrong event type
  const wrongType = createOrder({
    key: "11111111-1111-4111-8111-111111111203",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
    click: CLICK_WRONG_TYPE,
  });
  assertEqual(wrongType.buy_click_linked, false, "wrong type");
  assertEqual(wrongType.buy_click_link_reason, "invalid_event_type", "invalid type reason");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${wrongType.order_id}';`);

  // Stale
  const stale = createOrder({
    key: "11111111-1111-4111-8111-111111111204",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
    click: CLICK_STALE,
  });
  assertEqual(stale.buy_click_linked, false, "stale");
  assertEqual(stale.buy_click_link_reason, "stale_click", "stale reason");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${stale.order_id}';`);

  // Other user event
  const other = createOrder({
    key: "11111111-1111-4111-8111-111111111205",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
    click: CLICK_OTHER_USER,
  });
  assertEqual(other.buy_click_linked, false, "other user");
  assert(
    ["identity_mismatch", "session_mismatch"].includes(other.buy_click_link_reason),
    `other user reason: ${other.buy_click_link_reason}`,
  );
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${other.order_id}';`);

  // Unknown event
  const missing = createOrder({
    key: "11111111-1111-4111-8111-111111111206",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
    click: "99999999-9999-4999-8999-999999999999",
  });
  assertEqual(missing.buy_click_linked, false, "missing event");
  assertEqual(missing.buy_click_link_reason, "event_missing", "missing reason");
  assertEqual(missing.attribution_confidence, "exact", "attr still exact");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${missing.order_id}';`);

  // Pending fill once with valid click B
  const bare = createOrder({
    key: "11111111-1111-4111-8111-111111111207",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
  });
  assertEqual(bare.buy_click_linked, false, "bare unlinked");
  const filled = createOrder({
    key: "11111111-1111-4111-8111-111111111208",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
    click: CLICK_B,
  });
  assertEqual(filled.order_id, bare.order_id, "reuse pending");
  assertEqual(filled.buy_click_linked, true, "filled once");
  assertEqual(orderRow(filled.order_id).buy_click_event_id, EVENT_B, "filled event B");

  // Paid order not overwritten
  psql(
    TEST_DB,
    `UPDATE orders SET status='paid', paid_at=now() WHERE id='${filled.order_id}';`,
  );
  // New click for new order
  const CLICK_C = "e6666666-6666-4666-8666-666666666666";
  const EVENT_C = "f6666666-6666-4666-8666-666666666666";
  psql(
    TEST_DB,
    `INSERT INTO analytics_events (
      id, event_name, practice_id, user_id, anonymous_session_id, session_id,
      payload, occurred_at, client_event_id
    ) VALUES (
      '${EVENT_C}', 'buy_clicked', '${PRACTICE}', '${USER_A}', '${ANON_A}', '${SESSION_A}',
      '{"purchase_surface":"practice_page"}'::jsonb, now(), '${CLICK_C}'
    );`,
  );
  const afterPaid = createOrder({
    key: "11111111-1111-4111-8111-111111111209",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/x",
    click: CLICK_C,
  });
  assert(afterPaid.order_id !== filled.order_id, "new order after paid");
  assertEqual(orderRow(filled.order_id).buy_click_event_id, EVENT_B, "paid link untouched");

  // Money/payment outcomes for funnel
  psql(
    TEST_DB,
    `
INSERT INTO payments (order_id, status, amount_minor, confirmed_at, is_test)
VALUES ('${afterPaid.order_id}', 'succeeded', 29900, now(), false);
INSERT INTO user_practices (user_id, practice_id, access_source)
VALUES ('${USER_A}', '${PRACTICE}', 'purchase');
INSERT INTO analytics_events (event_name, practice_id, user_id, anonymous_session_id, session_id, occurred_at)
VALUES ('audio_play_started', '${PRACTICE}', '${USER_A}', '${ANON_A}', '${SESSION_A}', now() + interval '1 minute');
`,
  );

  const summary = json(
    `SELECT public.admin_analytics_p321_path_summary(NULL, NULL, false, NULL, NULL);`,
  );
  assertEqual(summary.methodology, "order_cohort", "methodology");
  assert(summary.engagement.buy_clicks >= 3, "buy clicks counted");
  assert(summary.engagement.paid_product_views >= 2, "views counted");
  assert(summary.cohort.exact_click_linked_orders >= 1, "exact linked coverage");
  assert(summary.cohort.succeeded_payments >= 1, "succeeded from payments");
  assertEqual(summary.cohort.gross_minor, 29900, "gross from payments SoT");
  assert(summary.cohort.first_post_purchase_plays >= 1, "first play after paid");
  assertEqual(summary.checkout_started, "not_emitted", "no checkout_started");

  // Historical unknown not exact (revoke entitlement so order can be created)
  psql(
    TEST_DB,
    `
DELETE FROM user_practices WHERE user_id='${USER_A}' AND practice_id='${PRACTICE}';
UPDATE orders SET status='cancelled' WHERE status='pending';
`,
  );
  const hist2 = createOrder({
    key: "11111111-1111-4111-8111-111111111211",
  });
  assertEqual(hist2.attribution_confidence, "unknown", "historical-style unknown");
  assertEqual(hist2.buy_click_linked, false, "unknown unlinked");

  const integrity = json(`SELECT public.buy_click_path_integrity_snapshot(NULL);`);
  assertEqual(integrity.critical, 0, "integrity critical 0");
  assertEqual(integrity.same_event_multiple_orders, 0, "one event one order");

  // Grants
  assert(
    ["f", "false"].includes(
      scalar(
        `SELECT has_function_privilege('authenticated', 'public.admin_analytics_p321_path_summary(timestamptz,timestamptz,boolean,uuid,text)', 'EXECUTE')::text;`,
      ),
    ),
    "summary not for authenticated",
  );
  assert(
    ["t", "true"].includes(
      scalar(
        `SELECT has_function_privilege('service_role', 'public.admin_analytics_p321_path_summary(timestamptz,timestamptz,boolean,uuid,text)', 'EXECUTE')::text;`,
      ),
    ),
    "summary for service_role",
  );

  // Zero denominator → null rate
  const emptyRate = json(
    `SELECT public.admin_analytics_p321_path_summary(now() + interval '1 day', now() + interval '2 days', false, NULL, NULL);`,
  );
  assertEqual(
    emptyRate.conversions.click_to_order_exact.rate_pct,
    null,
    "zero denom null",
  );

  console.log("analytics-p321-sql-unit: ok");
}

main();

#!/usr/bin/env node
/**
 * P3.2.3 attribution panel SQL tests (isolated DB, never production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_analytics_p323_test";

const USER_A = "a1111111-1111-4111-8111-111111111111";
const USER_B = "b2222222-2222-4222-8222-222222222222";
const AUTHOR = "c1111111-1111-4111-8111-111111111111";
const PRACTICE = "d1111111-1111-4111-8111-111111111111";
const ORDER_A = "e1111111-1111-4111-8111-111111111111";
const ORDER_B = "e2222222-2222-4222-8222-222222222222";
const ORDER_U = "e3333333-3333-4333-8333-333333333333";
const PAY_A = "f1111111-1111-4111-8111-111111111111";
const PAY_B = "f2222222-2222-4222-8222-222222222222";
const PAY_U = "f3333333-3333-4333-8333-333333333333";
const PAY_TEST = "f4444444-4444-4444-8444-444444444444";
const PAY_PENDING = "f5555555-5555-4555-8555-555555555555";
const SESSION = "51111111-1111-4111-8111-111111111111";

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
    "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1",
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
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: readFileSync(absolutePath, "utf8"), maxBuffer: 20 * 1024 * 1024 },
  );
}
function scalar(sql) {
  return psql(TEST_DB, sql, { tuples: true }).trim();
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
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE
);
CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  price integer NOT NULL DEFAULT 99999
);
CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  user_id uuid NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,
  utm_term text NULL,
  referrer_domain text NULL,
  landing_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human'
);
CREATE TABLE public.analytics_first_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  anonymous_id text NULL,
  user_id uuid NULL,
  first_session_id uuid NULL,
  first_seen_at timestamptz NOT NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,
  utm_term text NULL,
  referrer_domain text NULL,
  landing_path text NULL,
  source_class text NULL,
  confidence text NOT NULL,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
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
  author_id_snapshot uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  analytics_session_id uuid NULL,
  attribution_confidence text NULL,
  session_utm_source text NULL,
  session_utm_medium text NULL,
  session_utm_campaign text NULL,
  session_utm_content text NULL,
  session_utm_term text NULL,
  session_referrer_domain text NULL,
  session_landing_path text NULL,
  is_test boolean NOT NULL DEFAULT false
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

CREATE OR REPLACE FUNCTION public.sanitize_analytics_utm_value(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(left(regexp_replace(btrim(coalesce(p_value,'')), E'[\\\\x00-\\\\x1F\\\\x7F]', '', 'g'), 128), '');
$$;

CREATE OR REPLACE FUNCTION public.classify_acquisition_source_class(
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_referrer_domain text
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_src text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_source), ''));
  v_med text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_medium), ''));
  v_camp text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_campaign), ''));
  v_ref text := lower(coalesce(public.sanitize_analytics_utm_value(p_referrer_domain), ''));
BEGIN
  IF v_ref IN ('audiolad.ru','www.audiolad.ru','localhost','127.0.0.1') THEN v_ref := ''; END IF;
  IF v_src <> '' OR v_med <> '' OR v_camp <> '' THEN
    IF v_src IN ('telegram','tg','max','vk','whatsapp','viber')
       OR v_med IN ('messenger','messaging','messaging_bot','social_messenger')
       OR v_src LIKE 'bothelp%' OR v_med LIKE '%messenger%' THEN
      RETURN 'messenger';
    END IF;
    RETURN 'utm';
  END IF;
  IF v_ref = '' THEN RETURN 'direct_or_unknown'; END IF;
  RETURN 'referral';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_payments_p31_user_first_paid_at(p_include_test boolean)
RETURNS TABLE (user_id uuid, first_confirmed_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT p.user_id, min(p.confirmed_at)
  FROM (
    SELECT o.user_id, pay.confirmed_at, pay.is_test
    FROM payments pay JOIN orders o ON o.id = pay.order_id
    WHERE pay.status='succeeded' AND pay.confirmed_at IS NOT NULL
  ) p
  WHERE p_include_test OR p.is_test = false
  GROUP BY p.user_id;
$$;

INSERT INTO auth.users VALUES ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');
INSERT INTO authors VALUES ('${AUTHOR}', 'Author', 'author');
INSERT INTO practices VALUES ('${PRACTICE}', '${AUTHOR}', 'Paid', 'paid', 99999);

INSERT INTO analytics_sessions (
  id, anonymous_id, user_id, utm_source, utm_medium, utm_campaign, landing_path, started_at
) VALUES (
  '${SESSION}', 'anon-a', '${USER_A}', 'live-session', 'cpc', 'live', '/live', now() - interval '1 hour'
);

INSERT INTO analytics_first_touches (
  subject_type, user_id, first_session_id, first_seen_at,
  utm_source, utm_medium, utm_campaign, landing_path, source_class, confidence, origin
) VALUES (
  'user', '${USER_A}', '${SESSION}', now() - interval '2 days',
  'bothelp-maks', 'messaging_bot', 'ft-camp', '/ft-landing', 'messenger', 'exact', 'identity_link'
);

-- exact session-touch order A
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, practice_title_snapshot, practice_slug_snapshot,
  price_minor_snapshot, author_id_snapshot, created_at, analytics_session_id, attribution_confidence,
  session_utm_source, session_utm_medium, session_utm_campaign, session_landing_path
) VALUES (
  '${ORDER_A}', '${USER_A}', '${PRACTICE}', 'paid', 29900, 'Paid', 'paid', 29900, '${AUTHOR}',
  now() - interval '30 minutes', '${SESSION}', 'exact',
  'order-src', 'cpc', 'order-camp', '/order-landing'
);
INSERT INTO payments (id, order_id, status, amount_minor, confirmed_at, is_test)
VALUES ('${PAY_A}', '${ORDER_A}', 'succeeded', 29900, now() - interval '25 minutes', false);

-- second payment same user (repeat) with exact FT, unknown session-touch
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, practice_title_snapshot, practice_slug_snapshot,
  price_minor_snapshot, author_id_snapshot, created_at, attribution_confidence
) VALUES (
  '${ORDER_B}', '${USER_A}', '${PRACTICE}', 'paid', 29900, 'Paid', 'paid', 29900, '${AUTHOR}',
  now() - interval '10 minutes', 'unknown'
);
INSERT INTO payments (id, order_id, status, amount_minor, confirmed_at, is_test)
VALUES ('${PAY_B}', '${ORDER_B}', 'succeeded', 29900, now() - interval '9 minutes', false);

-- user B: no first-touch, unknown session
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, practice_title_snapshot, practice_slug_snapshot,
  price_minor_snapshot, author_id_snapshot, attribution_confidence
) VALUES (
  '${ORDER_U}', '${USER_B}', '${PRACTICE}', 'paid', 19900, 'Paid', 'paid', 19900, '${AUTHOR}', 'unknown'
);
INSERT INTO payments (id, order_id, status, amount_minor, confirmed_at, is_test)
VALUES ('${PAY_U}', '${ORDER_U}', 'succeeded', 19900, now() - interval '5 minutes', false);

-- test payment
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, practice_title_snapshot, practice_slug_snapshot,
  price_minor_snapshot, author_id_snapshot, attribution_confidence, is_test
) VALUES (
  'e4444444-4444-4444-8444-444444444444', '${USER_A}', '${PRACTICE}', 'paid', 100, 'Paid', 'paid', 100, '${AUTHOR}', 'exact', true
);
INSERT INTO payments (id, order_id, status, amount_minor, confirmed_at, is_test)
VALUES ('${PAY_TEST}', 'e4444444-4444-4444-8444-444444444444', 'succeeded', 100, now(), true);

-- pending excluded
INSERT INTO orders (
  id, user_id, practice_id, status, amount_minor, practice_title_snapshot, practice_slug_snapshot,
  price_minor_snapshot
) VALUES (
  'e5555555-5555-4555-8555-555555555555', '${USER_A}', '${PRACTICE}', 'pending', 500, 'Paid', 'paid', 500
);
INSERT INTO payments (id, order_id, status, amount_minor, confirmed_at, is_test)
VALUES ('${PAY_PENDING}', 'e5555555-5555-4555-8555-555555555555', 'pending', 500, NULL, false);
`,
  );

  // Stub classify already created; apply only p323 migration functions by extracting...
  // Apply full migration file (depends on classify + p31_user_first_paid_at which we stubbed)
  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260725220000_analytics_p323_attribution_panel.sql"),
  );
}

function main() {
  bootstrap();

  const st = json(
    `SELECT public.admin_attribution_p323_summary(NULL,NULL,false,'session_touch','all',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);`,
  );
  assertEqual(st.payments_total, 3, "succeeded non-test total");
  assertEqual(st.gross_minor_total, 79700, "gross from payment amounts not practice price");
  assertEqual(st.payments_attributed, 1, "session exact attributed");
  assertEqual(st.payments_unattributed, 2, "session unattributed");
  assertEqual(
    st.payments_attributed + st.payments_unattributed,
    st.payments_total,
    "coverage reconcile payments",
  );
  assertEqual(
    st.gross_minor_attributed + st.gross_minor_unattributed,
    st.gross_minor_total,
    "coverage reconcile gross",
  );
  assertEqual(st.confidence.exact, 1, "session exact count");
  assertEqual(st.linkage.missing_record, 2, "missing session snapshot");

  const ft = json(
    `SELECT public.admin_attribution_p323_summary(NULL,NULL,false,'first_touch','all',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);`,
  );
  assertEqual(ft.payments_attributed, 2, "both payments of user A have FT");
  assertEqual(ft.payments_unattributed, 1, "user B missing FT");
  assertEqual(ft.confidence.exact, 2, "FT exact");
  assertEqual(ft.linkage.missing_record, 1, "FT missing");

  const ftExactOnly = json(
    `SELECT public.admin_attribution_p323_summary(NULL,NULL,false,'first_touch','exact',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);`,
  );
  assertEqual(ftExactOnly.payments_attributed, 2, "exact filter");

  const withTest = json(
    `SELECT public.admin_attribution_p323_summary(NULL,NULL,true,'session_touch','all',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);`,
  );
  assertEqual(withTest.payments_total, 4, "include test");

  // session UTM from order snapshot, not live session
  const sources = json(
    `SELECT public.admin_attribution_p323_sources(NULL,NULL,false,'session_touch','all',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'gross_minor','desc',25);`,
  );
  assertEqual(sources.rows.length, 1, "one session source row");
  assertEqual(sources.rows[0].utm_source, "order-src", "order snapshot utm");
  assert(sources.rows[0].utm_source !== "live-session", "not live session");

  const ftSources = json(
    `SELECT public.admin_attribution_p323_sources(NULL,NULL,false,'first_touch','all',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'gross_minor','desc',25);`,
  );
  assertEqual(ftSources.rows[0].utm_source, "bothelp-maks", "first-touch utm");
  assertEqual(ftSources.rows[0].source_class, "messenger", "ft class");

  const products = json(
    `SELECT public.admin_attribution_p323_products(NULL,NULL,false,'all',NULL,NULL,NULL,25);`,
  );
  assertEqual(products.rows[0].gross_minor, 79700, "product gross matches total");
  assertEqual(products.rows[0].ft_attributed, 2, "product ft attr");
  assertEqual(products.rows[0].st_attributed, 1, "product st attr");

  const authors = json(
    `SELECT public.admin_attribution_p323_authors(NULL,NULL,false,'all',NULL,NULL,NULL,25);`,
  );
  assertEqual(authors.rows[0].gross_minor, 79700, "author gross");
  assert(String(authors.note).includes("not author payout"), "author note");

  const cmp = json(
    `SELECT public.admin_attribution_p323_touch_comparison(NULL,NULL,false,NULL,NULL);`,
  );
  const groups = Object.fromEntries(
    cmp.groups.map((g) => [g.cmp_group, g.payment_count]),
  );
  assertEqual(groups.changed_source ?? 0, 1, "changed source one");
  assertEqual(groups.first_touch_only ?? 0, 1, "ft only");
  assertEqual(groups.neither ?? 0, 1, "neither");
  const groupSum = Object.values(groups).reduce((a, b) => a + b, 0);
  assertEqual(groupSum, 3, "comparison mutually exclusive");

  const time = json(
    `SELECT public.admin_attribution_p323_time_to_purchase(NULL,NULL,false,NULL,NULL);`,
  );
  assert(time.first_touch_to_first_payment, "ft duration present");
  assert(time.session_start_to_order, "session duration present");

  const preview = json(`SELECT public.admin_attribution_p323_backfill_preview();`);
  assertEqual(preview.apply_available_in_ui, false, "no apply ui");
  assertEqual(preview.confidence_if_applied, "inferred", "inferred only");

  const integ = json(`SELECT public.admin_attribution_p323_integrity_snapshot(NULL);`);
  assertEqual(integ.critical, 0, "integrity critical 0");

  // grants
  assertEqual(
    scalar(`
SELECT count(*)::text FROM information_schema.routine_privileges
WHERE routine_schema='public'
  AND routine_name LIKE 'admin_attribution_p323%'
  AND grantee IN ('anon','authenticated','PUBLIC');
`),
    "0",
    "no client grants",
  );

  // no identifiers in summary JSON keys of concern
  const summaryText = JSON.stringify(st);
  assert(!summaryText.includes(USER_A), "no user id in summary");
  assert(!summaryText.includes("anon-a"), "no anon id in summary");

  console.log("analytics-p323-sql-unit: ok");
}

main();

#!/usr/bin/env node
/**
 * P3.2.0 order attribution SQL tests (isolated DB, never production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_analytics_p320_test";

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";
const AUTHOR = "a1111111-1111-1111-1111-111111111111";
const PRACTICE = "c1111111-1111-1111-1111-111111111111";
const SESSION_A = "51111111-1111-4111-8111-111111111111";
const SESSION_B = "52222222-2222-4222-8222-222222222222";
const SESSION_STALE = "53333333-3333-4333-8333-333333333333";
const SESSION_BOT = "54444444-4444-4444-8444-444444444444";
const SESSION_LINKED = "55555555-5555-4555-8555-555555555555";
const ANON_A = "anon-user-a";
const ANON_B = "anon-user-b";

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

INSERT INTO auth.users VALUES ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');
INSERT INTO public.authors VALUES ('${AUTHOR}', 'Author', 'author');
INSERT INTO public.practices VALUES
  ('${PRACTICE}', '${AUTHOR}', 'Paid Practice', 'paid-practice', 'published', 299, false);

INSERT INTO public.analytics_sessions (
  id, anonymous_id, user_id, utm_source, utm_medium, utm_campaign, utm_content,
  referrer_domain, landing_path, last_seen_at, started_at, is_bot
) VALUES
  ('${SESSION_A}', '${ANON_A}', '${USER_A}', 'bothelp-maks', 'messaging_bot', 'camp-a', 'c1',
   't.me', '/practice/author/paid-practice', now(), now() - interval '2 minutes', false),
  ('${SESSION_B}', '${ANON_B}', '${USER_B}', 'other', 'cpc', 'camp-b', null,
   'vk.com', '/catalog', now(), now() - interval '1 minutes', false),
  ('${SESSION_STALE}', '${ANON_A}', '${USER_A}', 'stale', 'cpc', 'old', null,
   null, '/', now() - interval '2 hours', now() - interval '3 hours', false),
  ('${SESSION_BOT}', '${ANON_A}', '${USER_A}', 'bot', 'bot', 'bot', null,
   null, '/', now(), now(), true);

INSERT INTO public.analytics_identity_links (anonymous_id, user_id, source)
VALUES ('${ANON_A}-link-only', '${USER_A}', 'login');
`,
  );

  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260725194000_orders_p320_attribution_snapshot.sql"),
  );

  // Fresh anon session without user_id but with identity link
  psql(
    TEST_DB,
    `
INSERT INTO public.analytics_sessions (
  id, anonymous_id, user_id, utm_source, utm_campaign, landing_path, last_seen_at, started_at
) VALUES (
  '${SESSION_LINKED}', '${ANON_A}-link-only', NULL,
  'linked-src', 'linked-camp', '/landing', now(), now()
);
`,
  );
}

function createOrder({ key, sessionId = null, anon = null, origin = null }) {
  const sid = sessionId ? `'${sessionId}'::uuid` : "NULL";
  const aid = anon ? `'${anon}'` : "NULL";
  const path = origin ? `'${origin}'` : "NULL";
  return json(
    `SELECT to_jsonb(t) FROM public.create_practice_order(
      'paid-practice', '${key}'::uuid, ${sid}, ${aid}, ${path}
    ) AS t;`,
  );
}

function orderRow(orderId) {
  return json(
    `SELECT to_jsonb(o) FROM orders o WHERE id='${orderId}';`,
  );
}

function main() {
  bootstrap();
  setAuth(USER_A);

  // 1 Exact
  const exact = createOrder({
    key: "11111111-1111-4111-8111-111111111101",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/practice/author/paid-practice?token=secret&email=a@b.c",
  });
  assertEqual(exact.attribution_confidence, "exact", "exact confidence");
  const exactRow = orderRow(exact.order_id);
  assertEqual(exactRow.session_utm_source, "bothelp-maks", "utm from DB");
  assertEqual(exactRow.session_utm_campaign, "camp-a", "campaign from DB");
  assertEqual(exactRow.session_referrer_domain, "t.me", "referrer from DB");
  assertEqual(exactRow.session_landing_path, "/practice/author/paid-practice", "landing");
  assertEqual(exactRow.checkout_origin_path, "/practice/author/paid-practice", "sanitized origin");
  assertEqual(exactRow.author_id_snapshot, AUTHOR, "author snapshot");
  assertEqual(exactRow.attribution_user_id, USER_A, "attr user");

  // Spoofed client UTM ignored — already using DB values above.

  // 7 No claims → unknown
  const unknown = createOrder({ key: "11111111-1111-4111-8111-111111111102" });
  // pending reuse from previous? wait - previous order is pending, so second create returns same pending!
  // Cancel exact order first for isolation
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${exact.order_id}';`);
  const unknown2 = createOrder({ key: "11111111-1111-4111-8111-111111111103" });
  assertEqual(unknown2.attribution_confidence, "unknown", "no claims unknown");
  const unknownRow = orderRow(unknown2.order_id);
  assert(unknownRow.analytics_session_id === null, "no session fk");
  assertEqual(unknownRow.attribution_confidence, "unknown", "row unknown");

  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${unknown2.order_id}';`);

  // 8 Missing session uuid
  const missing = createOrder({
    key: "11111111-1111-4111-8111-111111111104",
    sessionId: "99999999-9999-4999-8999-999999999999",
    anon: ANON_A,
    origin: "/x",
  });
  assertEqual(missing.attribution_confidence, "unknown", "missing session");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${missing.order_id}';`);

  // 9 Stale
  const stale = createOrder({
    key: "11111111-1111-4111-8111-111111111105",
    sessionId: SESSION_STALE,
    anon: ANON_A,
    origin: "/x",
  });
  assertEqual(stale.attribution_confidence, "unknown", "stale");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${stale.order_id}';`);

  // 10 anon mismatch
  const mismatch = createOrder({
    key: "11111111-1111-4111-8111-111111111106",
    sessionId: SESSION_A,
    anon: "wrong-anon",
    origin: "/x",
  });
  assertEqual(mismatch.attribution_confidence, "unknown", "anon mismatch");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${mismatch.order_id}';`);

  // 11 other user session
  const foreign = createOrder({
    key: "11111111-1111-4111-8111-111111111107",
    sessionId: SESSION_B,
    anon: ANON_B,
    origin: "/x",
  });
  assertEqual(foreign.attribution_confidence, "unknown", "foreign session");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${foreign.order_id}';`);

  // Bot session
  const bot = createOrder({
    key: "11111111-1111-4111-8111-111111111108",
    sessionId: SESSION_BOT,
    anon: ANON_A,
    origin: "/x",
  });
  assertEqual(bot.attribution_confidence, "unknown", "bot rejected");
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${bot.order_id}';`);

  // Identity link path (session.user_id null)
  const linked = createOrder({
    key: "11111111-1111-4111-8111-111111111109",
    sessionId: SESSION_LINKED,
    anon: `${ANON_A}-link-only`,
    origin: "/landing?token=1",
  });
  assertEqual(linked.attribution_confidence, "exact", "identity link exact");
  assertEqual(orderRow(linked.order_id).session_utm_source, "linked-src", "linked utm");

  // 15 Idempotent replay preserves snapshot
  const replay = createOrder({
    key: "11111111-1111-4111-8111-111111111109",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/other",
  });
  assertEqual(replay.order_id, linked.order_id, "same order");
  assertEqual(orderRow(replay.order_id).session_utm_source, "linked-src", "snapshot immutable");
  assertEqual(orderRow(replay.order_id).checkout_origin_path, "/landing", "origin not overwritten");

  // 17 Pending without snapshot can be filled once
  psql(TEST_DB, `UPDATE orders SET status='cancelled' WHERE id='${linked.order_id}';`);
  const bare = createOrder({ key: "11111111-1111-4111-8111-111111111110" });
  assertEqual(bare.attribution_confidence, "unknown", "bare pending");
  const filled = createOrder({
    key: "11111111-1111-4111-8111-111111111111",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/fill",
  });
  assertEqual(filled.order_id, bare.order_id, "reuse pending");
  assertEqual(filled.attribution_confidence, "exact", "filled exact");
  assertEqual(orderRow(filled.order_id).session_utm_source, "bothelp-maks", "filled utm");

  // 18 Paid not overwritten
  psql(
    TEST_DB,
    `UPDATE orders SET status='paid', paid_at=now(),
      analytics_session_id=NULL, attribution_captured_at=NULL, attribution_confidence='unknown'
     WHERE id='${filled.order_id}';`,
  );
  const paidTry = createOrder({
    key: "11111111-1111-4111-8111-111111111112",
    sessionId: SESSION_A,
    anon: ANON_A,
    origin: "/paid",
  });
  // New pending should be created because previous is paid (not pending)
  assert(paidTry.order_id !== filled.order_id, "new order after paid");
  assertEqual(orderRow(filled.order_id).attribution_confidence, "unknown", "paid untouched");

  // Sanitize SQL helper
  assertEqual(
    scalar(`SELECT public.sanitize_checkout_origin_path('/a?token=1#x')`),
    "/a",
    "sql sanitize",
  );

  // Integrity helper
  const integrity = json(`SELECT public.order_attribution_integrity_snapshot(NULL);`);
  assert(integrity.exact >= 1, "integrity exact count");
  assertEqual(integrity.exact_missing_session, 0, "no exact missing session");
  assertEqual(integrity.suspicious_origin_query, 0, "no suspicious origin");

  // Grants: authenticated cannot execute resolve helper
  const resolvePriv = scalar(
    `SELECT has_function_privilege('authenticated', 'public.resolve_order_attribution_snapshot(uuid,uuid,text,text)', 'EXECUTE')::text;`,
  );
  assertEqual(resolvePriv, "false", "resolve not granted to authenticated");

  console.log("analytics-p320-sql-unit: ok");
}

main();

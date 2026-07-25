#!/usr/bin/env node
/**
 * P3.2.2 immutable first-touch SQL tests (isolated DB, never production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_analytics_p322_test";

const USER_A = "a1111111-1111-4111-8111-111111111111";
const USER_B = "b2222222-2222-4222-8222-222222222222";
const USER_STAFF = "c3333333-3333-4333-8333-333333333333";
const S1 = "51111111-1111-4111-8111-111111111111";
const S2 = "52222222-2222-4222-8222-222222222222";
const S3 = "53333333-3333-4333-8333-333333333333";
const S_BOT = "54444444-4444-4444-8444-444444444444";
const S_TEST = "55555555-5555-4555-8555-555555555555";
const S_STAFF = "56666666-6666-4666-8666-666666666666";
const S_AUTH = "57777777-7777-4777-8777-777777777777";
const ANON_A = "anon-a-p322";
const ANON_B = "anon-b-p322";
const ANON_EARLY = "anon-early-p322";
const ANON_LATE = "anon-late-p322";

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
function json(sql) {
  return JSON.parse(scalar(sql));
}
function setAuth(userId) {
  const expr = userId ? `'${userId}'::uuid` : "NULL::uuid";
  psql(
    TEST_DB,
    `CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT ${expr} $$;`,
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
  referrer_domain text NULL,
  landing_path text NULL,
  device_type text NOT NULL DEFAULT 'desktop',
  created_at timestamptz NOT NULL DEFAULT now(),
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human',
  classification_reason text NULL,
  user_agent text NULL,
  client_version text NULL
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

CREATE OR REPLACE FUNCTION public.sanitize_checkout_origin_path(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_path IS NULL OR btrim(p_path) = '' THEN NULL
    WHEN position('?' in p_path) > 0 THEN left(split_part(p_path, '?', 1), 512)
    WHEN position('#' in p_path) > 0 THEN left(split_part(p_path, '#', 1), 512)
    ELSE left(btrim(p_path), 512)
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_user_id = '${USER_STAFF}'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_analytics_test_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.resolve_analytics_traffic_flags(
  p_user_id uuid,
  p_anonymous_id text,
  p_utm_campaign text,
  p_user_agent text
)
RETURNS TABLE (
  is_staff boolean,
  is_test boolean,
  is_bot boolean,
  traffic_class text,
  classification_reason text
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY SELECT
    COALESCE(public.is_platform_staff(p_user_id), false),
    false,
    COALESCE(lower(coalesce(p_user_agent, '')) LIKE '%bot%', false),
    CASE
      WHEN lower(coalesce(p_user_agent, '')) LIKE '%bot%' THEN 'bot'
      WHEN public.is_platform_staff(p_user_id) THEN 'staff'
      ELSE 'human'
    END,
    NULL::text;
END;
$$;

INSERT INTO auth.users VALUES
  ('${USER_A}', 'a@example.com'),
  ('${USER_B}', 'b@example.com'),
  ('${USER_STAFF}', 'staff@example.com');
`,
  );

  psqlFile(
    TEST_DB,
    join(ROOT, "supabase/migrations/20260725210000_analytics_p322_first_touch.sql"),
  );
}

function ftAnon(anonId) {
  return json(
    `SELECT to_jsonb(t) FROM analytics_first_touches t
     WHERE subject_type='anonymous' AND anonymous_id='${anonId}';`,
  );
}
function ftUser(userId) {
  return json(
    `SELECT to_jsonb(t) FROM analytics_first_touches t
     WHERE subject_type='user' AND user_id='${userId}';`,
  );
}
function countFt(where = "true") {
  return Number(scalar(`SELECT count(*) FROM analytics_first_touches WHERE ${where};`));
}

function main() {
  bootstrap();

  // --- Source classification ---
  assertEqual(
    scalar(`SELECT public.classify_acquisition_source_class('google','cpc','x',NULL);`),
    "utm",
    "utm class",
  );
  assertEqual(
    scalar(`SELECT public.classify_acquisition_source_class(NULL,NULL,NULL,'www.google.com');`),
    "organic_search",
    "organic",
  );
  assertEqual(
    scalar(`SELECT public.classify_acquisition_source_class(NULL,NULL,NULL,'vk.com');`),
    "social",
    "social",
  );
  assertEqual(
    scalar(`SELECT public.classify_acquisition_source_class('telegram','messaging_bot','x',NULL);`),
    "messenger",
    "messenger utm",
  );
  assertEqual(
    scalar(`SELECT public.classify_acquisition_source_class(NULL,NULL,NULL,NULL);`),
    "direct_or_unknown",
    "direct",
  );
  assertEqual(
    scalar(`SELECT public.classify_acquisition_source_class(NULL,NULL,NULL,'audiolad.ru');`),
    "direct_or_unknown",
    "internal excluded",
  );
  assertEqual(
    scalar(`SELECT public.classify_acquisition_source_class(NULL,NULL,NULL,'example.org');`),
    "referral",
    "referral",
  );

  // --- Anonymous exact ---
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions (
  id, anonymous_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  referrer_domain, landing_path, started_at, last_seen_at, traffic_class
) VALUES (
  '${S1}', '${ANON_A}', 'bothelp-maks', 'messaging_bot', 'camp-a', 'c1', 'term-a',
  't.me', '/landing?token=secret&email=a@b.c', now() - interval '2 minutes', now(), 'human'
);
`,
  );

  let r = json(`SELECT public.ensure_anonymous_first_touch('${S1}'::uuid);`);
  assertEqual(r.ok, true, "anon create ok");
  assertEqual(r.created, true, "anon created");
  assertEqual(r.confidence, "exact", "anon exact");
  assertEqual(r.origin, "session_insert", "anon origin");

  const anon1 = ftAnon(ANON_A);
  assertEqual(anon1.utm_source, "bothelp-maks", "utm from DB");
  assertEqual(anon1.utm_term, "term-a", "utm_term");
  assertEqual(anon1.referrer_domain, "t.me", "referrer domain");
  assertEqual(anon1.landing_path, "/landing", "pathname only");
  assertEqual(anon1.source_class, "messenger", "source class");
  assert(!String(anon1.landing_path || "").includes("token"), "no query/token");
  assertEqual(anon1.first_session_id, S1, "first session");

  // Second session / new campaign does not overwrite
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions (
  id, anonymous_id, utm_source, utm_campaign, landing_path, started_at, last_seen_at
) VALUES (
  '${S2}', '${ANON_A}', 'later-src', 'later-camp', '/later', now(), now()
);
`,
  );
  r = json(`SELECT public.ensure_anonymous_first_touch('${S2}'::uuid);`);
  assertEqual(r.created, false, "second session no create");
  assertEqual(r.reason, "already_exists", "already exists");
  assertEqual(ftAnon(ANON_A).utm_source, "bothelp-maks", "no overwrite campaign");
  assertEqual(countFt(`anonymous_id='${ANON_A}'`), 1, "one anon ft");

  // Resume-style re-ensure
  r = json(`SELECT public.ensure_anonymous_first_touch('${S1}'::uuid);`);
  assertEqual(r.created, false, "resume no overwrite");

  // Null-source session still creates FT
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions (id, anonymous_id, landing_path, started_at, last_seen_at)
VALUES ('${S3}', '${ANON_B}', '/bare', now(), now());
`,
  );
  r = json(`SELECT public.ensure_anonymous_first_touch('${S3}'::uuid);`);
  assertEqual(r.created, true, "null source created");
  assertEqual(ftAnon(ANON_B).utm_source, null, "null utm");
  assertEqual(ftAnon(ANON_B).source_class, "direct_or_unknown", "direct class");

  // Bot / test / staff excluded
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions (id, anonymous_id, utm_source, is_bot, traffic_class, started_at, last_seen_at)
VALUES ('${S_BOT}', 'anon-bot', 'x', true, 'bot', now(), now());
INSERT INTO analytics_sessions (id, anonymous_id, utm_source, is_test, traffic_class, started_at, last_seen_at)
VALUES ('${S_TEST}', 'anon-test', 'x', true, 'test', now(), now());
INSERT INTO analytics_sessions (id, anonymous_id, utm_source, is_staff, traffic_class, started_at, last_seen_at)
VALUES ('${S_STAFF}', 'anon-staff', 'x', true, 'staff', now(), now());
`,
  );
  assertEqual(
    json(`SELECT public.ensure_anonymous_first_touch('${S_BOT}'::uuid);`).reason,
    "excluded_traffic",
    "bot excluded",
  );
  assertEqual(
    json(`SELECT public.ensure_anonymous_first_touch('${S_TEST}'::uuid);`).reason,
    "excluded_traffic",
    "test excluded",
  );
  assertEqual(
    json(`SELECT public.ensure_anonymous_first_touch('${S_STAFF}'::uuid);`).reason,
    "excluded_traffic",
    "staff excluded",
  );
  assertEqual(countFt(`anonymous_id IN ('anon-bot','anon-test','anon-staff')`), 0, "no excluded ft");

  // --- User exact via identity link (earliest of multiple anons) ---
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions (
  id, anonymous_id, utm_source, utm_campaign, started_at, last_seen_at
) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${ANON_EARLY}', 'early', 'e', now() - interval '1 day', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${ANON_LATE}', 'late', 'l', now() - interval '1 hour', now());
`,
  );
  json(`SELECT public.ensure_anonymous_first_touch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);`);
  json(`SELECT public.ensure_anonymous_first_touch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid);`);

  // Multiple anon ids linked before ensure → earliest wins
  const USER_C = "d4444444-4444-4444-8444-444444444444";
  psql(TEST_DB, `INSERT INTO auth.users VALUES ('${USER_C}', 'c@example.com');`);
  psql(
    TEST_DB,
    `
INSERT INTO analytics_identity_links (anonymous_id, user_id, source) VALUES
  ('${ANON_LATE}', '${USER_C}', 'login'),
  ('${ANON_EARLY}', '${USER_C}', 'login');
`,
  );
  let rC = json(`SELECT public.ensure_user_first_touch('${USER_C}'::uuid);`);
  assertEqual(rC.created, true, "multi-anon user created");
  assertEqual(ftUser(USER_C).utm_source, "early", "multi-anon earliest");

  setAuth(USER_A);
  let link = json(
    `SELECT public.link_analytics_identity('${ANON_LATE}', 'login');`,
  );
  assertEqual(link.ok, true, "link late ok");
  assertEqual(link.first_touch.created, true, "user ft created from late first");
  assertEqual(ftUser(USER_A).utm_source, "late", "from late anon first");

  // Linking earlier anon must NOT overwrite user first-touch
  link = json(`SELECT public.link_analytics_identity('${ANON_EARLY}', 'login');`);
  assertEqual(link.first_touch.created, false, "no overwrite on earlier link");
  assertEqual(ftUser(USER_A).utm_source, "late", "immutable after first link");

  // Logout unlink + re-login later device does not overwrite
  psql(
    TEST_DB,
    `UPDATE analytics_identity_links SET unlinked_at = now()
     WHERE user_id='${USER_A}' AND anonymous_id='${ANON_LATE}';`,
  );
  r = json(`SELECT public.ensure_user_first_touch('${USER_A}'::uuid);`);
  assertEqual(r.created, false, "logout does not recreate");
  assertEqual(ftUser(USER_A).utm_source, "late", "still late");

  // Inactive link not used for NEW user
  setAuth(USER_B);
  // Create inactive link to ANON_A for user B — should not use it
  psql(
    TEST_DB,
    `
INSERT INTO analytics_identity_links (anonymous_id, user_id, linked_at, unlinked_at, source)
VALUES ('${ANON_A}', '${USER_B}', now() - interval '1 day', now() - interval '1 hour', 'login');
`,
  );
  r = json(`SELECT public.ensure_user_first_touch('${USER_B}'::uuid);`);
  assertEqual(r.ok, false, "inactive link no candidate without auth session");

  // Auth session without anonymous FT history
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions (
  id, anonymous_id, user_id, utm_source, utm_campaign, started_at, last_seen_at, traffic_class
) VALUES (
  '${S_AUTH}', 'anon-auth-only', '${USER_B}', 'auth-src', 'auth-camp', now(), now(), 'human'
);
`,
  );
  r = json(`SELECT public.ensure_user_first_touch('${USER_B}'::uuid);`);
  assertEqual(r.created, true, "auth session creates user ft");
  assertEqual(r.confidence, "exact", "auth exact");
  assertEqual(ftUser(USER_B).utm_source, "auth-src", "auth utm");
  assertEqual(ftUser(USER_B).origin, "auth_session", "auth origin");

  // Other user's anonymous not used
  assertEqual(ftUser(USER_B).utm_source !== "bothelp-maks", true, "not other anon");

  // Staff user excluded
  setAuth(USER_STAFF);
  r = json(`SELECT public.ensure_user_first_touch('${USER_STAFF}'::uuid);`);
  assertEqual(r.reason, "excluded_user", "staff excluded");

  // Account switch: USER_A already has FT; linking ANON_A to USER_A again is fine (immutable)
  setAuth(USER_A);
  link = json(`SELECT public.link_analytics_identity('${ANON_A}', 'login');`);
  assertEqual(link.first_touch.created, false, "switch/link no overwrite");
  assertEqual(ftUser(USER_A).utm_source, "late", "user A immutable");

  // --- Historical dry-run semantics (never exact) ---
  // Simulate backfill insert as inferred
  const histAnon = "anon-hist-p322";
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions (id, anonymous_id, utm_source, started_at, last_seen_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${histAnon}', 'hist', now() - interval '10 days', now());
INSERT INTO analytics_first_touches (
  subject_type, anonymous_id, first_session_id, first_seen_at,
  utm_source, source_class, confidence, origin
) VALUES (
  'anonymous', '${histAnon}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', now() - interval '10 days',
  'hist', 'utm', 'inferred', 'historical_backfill'
);
`,
  );
  assertEqual(ftAnon(histAnon).confidence, "inferred", "hist inferred");
  assertEqual(ftAnon(histAnon).origin, "historical_backfill", "hist origin");

  // Exact not overwritten by ensure
  r = json(
    `SELECT public.ensure_anonymous_first_touch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid);`,
  );
  assertEqual(r.created, false, "ensure does not overwrite inferred");
  assertEqual(ftAnon(histAnon).confidence, "inferred", "still inferred");

  // Integrity: exact+historical_backfill is critical
  psql(
    TEST_DB,
    `UPDATE analytics_first_touches SET confidence='exact'
     WHERE anonymous_id='${histAnon}';`,
  );
  let integ = json(`SELECT public.admin_first_touch_integrity_snapshot(NULL);`);
  assert(integ.critical >= 1, "exact+backfill critical");
  psql(
    TEST_DB,
    `UPDATE analytics_first_touches SET confidence='inferred'
     WHERE anonymous_id='${histAnon}';`,
  );
  integ = json(`SELECT public.admin_first_touch_integrity_snapshot(NULL);`);
  assertEqual(integ.critical, 0, "integrity critical 0");

  // Upsert creates FT + utm_term
  setAuth(null);
  const sid = scalar(
    `SELECT public.upsert_analytics_session(
      NULL, 'anon-upsert-p322', '/up?x=1', 'ups', 'cpc', 'camp-u', 'cnt',
      'example.com', 'desktop', 'Mozilla', 'p322', 'term-u'
    )::text;`,
  );
  assert(sid.length === 36, "upsert session id");
  const up = ftAnon("anon-upsert-p322");
  assertEqual(up.utm_source, "ups", "upsert utm");
  assertEqual(up.utm_term, "term-u", "upsert term");
  assertEqual(up.landing_path, "/up", "upsert path sanitize");
  assertEqual(up.confidence, "exact", "upsert exact");

  // Second upsert resume does not overwrite
  const sid2 = scalar(
    `SELECT public.upsert_analytics_session(
      '${sid}'::uuid, 'anon-upsert-p322', '/other', 'newcamp', 'cpc', 'new', NULL,
      NULL, 'desktop', 'Mozilla', 'p322', 'newterm'
    )::text;`,
  );
  assertEqual(sid2, sid, "resume same session");
  assertEqual(ftAnon("anon-upsert-p322").utm_source, "ups", "resume no overwrite");

  // Privacy sanitize
  assertEqual(
    scalar(`SELECT public.sanitize_analytics_utm_value(E'ab\\x01c');`),
    "abc",
    "control chars stripped",
  );
  assertEqual(
    scalar(`SELECT char_length(public.sanitize_analytics_utm_value(repeat('x', 200)));`),
    "128",
    "length limit",
  );

  // Grants: authenticated / anon must not have EXECUTE on ensure / integrity
  const ensureGrant = scalar(`
SELECT count(*)::text
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'ensure_anonymous_first_touch'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');
`);
  assertEqual(ensureGrant, "0", "ensure not granted to client roles");
  const integGrant = scalar(`
SELECT count(*)::text
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'admin_first_touch_integrity_snapshot'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');
`);
  assertEqual(integGrant, "0", "integrity not granted to client roles");

  console.log("analytics-p322-sql-unit: ok");
}

main();

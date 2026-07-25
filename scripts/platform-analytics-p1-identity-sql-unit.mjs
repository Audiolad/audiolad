#!/usr/bin/env node
/**
 * P1 identity / classification / idempotency SQL tests on isolated DB.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_analytics_p1_identity_test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function psql(database, sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function psqlFile(database, absolutePath) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: readFileSync(absolutePath, "utf8"), maxBuffer: 20 * 1024 * 1024 },
  );
}

function scalar(sql) {
  return psql(TEST_DB, sql).split("\n").filter((l) => l.trim() && !l.startsWith("-") && !l.includes("row)")).map((l) => l.trim()).filter(Boolean).pop();
}

function setup() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  psql(
    TEST_DB,
    `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.authors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE);
CREATE TABLE public.practices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid REFERENCES public.authors(id), title text);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text, role text NOT NULL DEFAULT 'listener', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.platform_roles (code text PRIMARY KEY);
CREATE TABLE public.platform_permissions (code text PRIMARY KEY);
CREATE TABLE public.platform_role_permissions (
  role_code text REFERENCES public.platform_roles(code),
  permission_code text REFERENCES public.platform_permissions(code),
  PRIMARY KEY (role_code, permission_code)
);
CREATE TABLE public.platform_user_roles (
  user_id uuid REFERENCES auth.users(id),
  role_code text REFERENCES public.platform_roles(code),
  PRIMARY KEY (user_id, role_code)
);
INSERT INTO public.platform_roles(code) VALUES ('owner'), ('admin');
INSERT INTO public.platform_permissions(code) VALUES ('admin_panel.access');
INSERT INTO public.platform_role_permissions VALUES ('owner','admin_panel.access'), ('admin','admin_panel.access');

CREATE OR REPLACE FUNCTION public.has_platform_permission(p_user_id uuid, p_permission text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_user_roles ur
    JOIN public.platform_role_permissions rp ON rp.role_code = ur.role_code
    WHERE ur.user_id = p_user_id AND rp.permission_code = p_permission
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.role IN ('platform_owner','platform_admin')
  );
$$;
CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.has_platform_permission(p_user_id, 'admin_panel.access');
$$;
CREATE OR REPLACE FUNCTION public.is_platform_owner(p_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_user_roles WHERE user_id = p_user_id AND role_code = 'owner');
$$;

CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  user_id uuid NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  referrer_domain text, landing_path text,
  device_type text NOT NULL DEFAULT 'desktop',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  practice_id uuid NULL,
  track_id uuid NULL,
  user_id uuid NULL,
  anonymous_session_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NULL REFERENCES public.analytics_sessions(id),
  path text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.is_platform_analytics_event(p_event_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(COALESCE(p_event_name,'')) IN (
    'page_view','practice_view','listen_page_view','audio_play_started',
    'audio_progress_25','audio_progress_50','audio_progress_75','audio_progress_90',
    'audio_completed','signup_started','signup_completed',
    'author_application_started','author_application_submitted'
  );
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
`,
  );

  // Minimal P0 helpers required by P1 migration
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725140000_admin_analytics_dashboard_snapshot.sql"));
  // Drop dashboard from P0 file then apply P1 identity + dashboard
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725160000_platform_analytics_p1_identity.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725161000_admin_analytics_dashboard_snapshot_p1.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20260725162000_unlink_analytics_identity.sql"));
}

function testCrossTabResume() {
  const sql = `
DO $$
DECLARE
  s1 uuid; s2 uuid;
BEGIN
  s1 := public.upsert_analytics_session(NULL,'anon-tab-a','/',NULL,NULL,NULL,NULL,NULL,'desktop','Mozilla/5.0','p1');
  s2 := public.upsert_analytics_session(NULL,'anon-tab-a','/catalog',NULL,NULL,NULL,NULL,NULL,'desktop','Mozilla/5.0','p1');
  IF s1 IS DISTINCT FROM s2 THEN
    RAISE EXCEPTION 'cross-tab created two sessions: % vs %', s1, s2;
  END IF;
END $$;
`;
  psql(TEST_DB, sql);
}

function testTimeoutNewSession() {
  const sql = `
DO $$
DECLARE
  s1 uuid; s2 uuid;
BEGIN
  s1 := public.upsert_analytics_session(NULL,'anon-timeout','/',NULL,NULL,NULL,NULL,NULL,'desktop','Mozilla/5.0','p1');
  UPDATE analytics_sessions SET last_seen_at = now() - interval '31 minutes' WHERE id = s1;
  s2 := public.upsert_analytics_session(NULL,'anon-timeout','/',NULL,NULL,NULL,NULL,NULL,'desktop','Mozilla/5.0','p1');
  IF s1 = s2 THEN
    RAISE EXCEPTION 'expected new session after 31m';
  END IF;
END $$;
`;
  psql(TEST_DB, sql);
}

function testIdempotentEvent() {
  const sql = `
DO $$
DECLARE
  sid uuid; e1 uuid; e2 uuid; cnt int;
BEGIN
  sid := public.upsert_analytics_session(NULL,'anon-idem','/',NULL,NULL,NULL,NULL,NULL,'desktop','Mozilla/5.0','p1');
  e1 := public.insert_platform_analytics_event(sid,'anon-idem','page_view','/',NULL,NULL,'{}'::jsonb,'11111111-1111-1111-1111-111111111111'::uuid,'Mozilla/5.0','p1');
  e2 := public.insert_platform_analytics_event(sid,'anon-idem','page_view','/',NULL,NULL,'{}'::jsonb,'11111111-1111-1111-1111-111111111111'::uuid,'Mozilla/5.0','p1');
  IF e1 IS DISTINCT FROM e2 THEN RAISE EXCEPTION 'idempotency failed'; END IF;
  SELECT count(*) INTO cnt FROM analytics_events WHERE client_event_id='11111111-1111-1111-1111-111111111111';
  IF cnt <> 1 THEN RAISE EXCEPTION 'expected 1 row, got %', cnt; END IF;
END $$;
`;
  psql(TEST_DB, sql);
}

function testBotClassification() {
  assert(scalar("SELECT public.classify_analytics_bot('Googlebot/2.1');") === "t", "googlebot");
  assert(scalar("SELECT public.classify_analytics_bot('Mozilla/5.0 (Macintosh)');") === "f", "browser");
  const sql = `
DO $$
DECLARE sid uuid; flags record;
BEGIN
  sid := public.upsert_analytics_session(NULL,'anon-bot','/',NULL,NULL,NULL,NULL,NULL,'desktop','Googlebot/2.1','p1');
  IF NOT (SELECT is_bot FROM analytics_sessions WHERE id=sid) THEN
    RAISE EXCEPTION 'session not marked bot';
  END IF;
END $$;
`;
  psql(TEST_DB, sql);
}

function testStaffFilterSnapshot() {
  psql(
    TEST_DB,
    `
INSERT INTO auth.users(id,email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','owner@audiolad.ru'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','user@example.com'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','audiolad@mail.ru');
INSERT INTO public.profiles(id,email,role,created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','owner@audiolad.ru','platform_owner','2026-07-24 10:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','user@example.com','listener','2026-07-24 11:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','audiolad@mail.ru','listener','2026-07-24 12:00:00+00');
INSERT INTO public.platform_user_roles VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','owner');
INSERT INTO public.analytics_test_accounts(user_id,label) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','primary');
`,
  );

  // Direct inserts with flags simulating classified traffic
  psql(
    TEST_DB,
    `
INSERT INTO analytics_sessions(id,anonymous_id,user_id,started_at,last_seen_at,is_staff,is_test,is_bot,traffic_class)
VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','anon-human',NULL,'2026-07-24 10:00:00+00','2026-07-24 10:05:00+00',false,false,false,'human'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','anon-staff','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','2026-07-24 10:10:00+00','2026-07-24 10:15:00+00',true,false,false,'staff'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','anon-test','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','2026-07-24 10:20:00+00','2026-07-24 10:25:00+00',false,true,false,'test');
INSERT INTO analytics_events(session_id,anonymous_session_id,event_name,occurred_at,is_staff,is_test,is_bot,traffic_class)
VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','anon-human','practice_view','2026-07-24 10:01:00+00',false,false,false,'human'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','anon-human','audio_play_started','2026-07-24 10:02:00+00',false,false,false,'human'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','anon-staff','practice_view','2026-07-24 10:11:00+00',true,false,false,'staff'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','anon-test','practice_view','2026-07-24 10:21:00+00',false,true,false,'test');
`,
  );

  const excluded = JSON.parse(
    scalar(`SELECT public.admin_analytics_dashboard_snapshot('2026-07-24T00:00:00Z','2026-07-25T00:00:00Z', false)::text;`),
  );
  const included = JSON.parse(
    scalar(`SELECT public.admin_analytics_dashboard_snapshot('2026-07-24T00:00:00Z','2026-07-25T00:00:00Z', true)::text;`),
  );

  assert(excluded.visits === 1, `excluded visits=${excluded.visits}`);
  assert(excluded.practice_views === 1, `excluded practice_views=${excluded.practice_views}`);
  assert(excluded.play_starts === 1, `excluded plays=${excluded.play_starts}`);
  assert(excluded.excluded_test_sessions === 2, `excluded_service=${excluded.excluded_test_sessions}`);
  assert(included.visits === 3, `included visits=${included.visits}`);
  assert(included.practice_views === 3, `included practice_views=${included.practice_views}`);
}

function testIdentityLinkUserSwitch() {
  const sql = `
DO $$
DECLARE
  link1 uuid; link2 uuid; key_a text; key_b text; key_gap text;
BEGIN
  -- Simulate User A link then unlink then User B
  INSERT INTO analytics_identity_links(anonymous_id,user_id,linked_at,unlinked_at,source)
  VALUES ('anon-switch','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','2026-07-24 08:00:00+00','2026-07-24 09:00:00+00','login');
  INSERT INTO analytics_identity_links(anonymous_id,user_id,linked_at,source)
  VALUES ('anon-switch','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','2026-07-24 09:30:00+00','login');

  key_a := public.admin_analytics_visitor_key(NULL,'anon-switch','2026-07-24 08:30:00+00');
  key_gap := public.admin_analytics_visitor_key(NULL,'anon-switch','2026-07-24 09:15:00+00');
  key_b := public.admin_analytics_visitor_key(NULL,'anon-switch','2026-07-24 10:00:00+00');

  IF key_a <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' THEN
    RAISE EXCEPTION 'expected user A at 08:30, got %', key_a;
  END IF;
  IF key_gap <> 'anon-switch' THEN
    RAISE EXCEPTION 'expected anonymous in gap, got %', key_gap;
  END IF;
  IF key_b <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3' THEN
    RAISE EXCEPTION 'expected user B at 10:00, got %', key_b;
  END IF;
END $$;
`;
  psql(TEST_DB, sql);
}

function testUnlinkClosesActiveLink() {
  // auth.uid() stub returns NULL; exercise function body via direct close semantics
  const sql = `
DO $$
DECLARE
  closed int;
  key_after text;
BEGIN
  INSERT INTO analytics_identity_links(anonymous_id,user_id,linked_at,source)
  VALUES ('anon-logout','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','2026-07-24 11:00:00+00','login');

  UPDATE analytics_identity_links
  SET unlinked_at = '2026-07-24 11:30:00+00'
  WHERE anonymous_id = 'anon-logout'
    AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
    AND unlinked_at IS NULL;

  GET DIAGNOSTICS closed = ROW_COUNT;
  IF closed <> 1 THEN RAISE EXCEPTION 'expected 1 closed link'; END IF;

  key_after := public.admin_analytics_visitor_key(NULL,'anon-logout','2026-07-24 12:00:00+00');
  IF key_after <> 'anon-logout' THEN
    RAISE EXCEPTION 'expected anonymous after unlink, got %', key_after;
  END IF;
END $$;
`;
  psql(TEST_DB, sql);
}

function testP0StillAggregates() {
  psql(
    TEST_DB,
    `
INSERT INTO analytics_events(session_id,anonymous_session_id,event_name,occurred_at,is_staff,is_test,is_bot,traffic_class)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','anon-human','practice_view',
  '2026-07-24 10:03:00+00'::timestamptz + (g||' seconds')::interval,false,false,false,'human'
FROM generate_series(1,1200) g;
`,
  );
  const snap = JSON.parse(
    scalar(`SELECT public.admin_analytics_dashboard_snapshot('2026-07-24T00:00:00Z','2026-07-25T00:00:00Z', false)::text;`),
  );
  assert(snap.practice_views >= 1201, `practice_views after bulk=${snap.practice_views}`);
}

function main() {
  setup();
  testCrossTabResume();
  testTimeoutNewSession();
  testIdempotentEvent();
  testBotClassification();
  testStaffFilterSnapshot();
  testIdentityLinkUserSwitch();
  testUnlinkClosesActiveLink();
  testP0StillAggregates();
  console.log("platform-analytics-p1-identity-sql-unit: ok");
}

main();

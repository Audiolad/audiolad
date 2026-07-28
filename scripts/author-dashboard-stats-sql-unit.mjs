#!/usr/bin/env node
/**
 * Author stats SQL semantics on an isolated database.
 * Never touches the production schema.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_author_stats_test";

const AUTHOR_ONE = "a1111111-1111-1111-1111-111111111111";
const AUTHOR_TWO = "a2222222-2222-2222-2222-222222222222";
const PRACTICE_ONE = "c1111111-1111-1111-1111-111111111111";
const PRACTICE_TWO = "c2222222-2222-2222-2222-222222222222";
const PRACTICE_ARCHIVED = "c3333333-3333-3333-3333-333333333333";
const USER_HUMAN = "d1111111-1111-1111-1111-111111111111";
const USER_MEMBER = "d2222222-2222-2222-2222-222222222222";
const USER_STAFF = "d3333333-3333-3333-3333-333333333333";
const USER_OTHER = "d4444444-4444-4444-4444-444444444444";
const SESSION_HUMAN = "e1111111-1111-1111-1111-111111111111";
const SESSION_MEMBER = "e2222222-2222-2222-2222-222222222222";
const SESSION_STAFF = "e3333333-3333-3333-3333-333333333333";
const SESSION_BOT = "e4444444-4444-4444-4444-444444444444";

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

function scalar(sql) {
  return psql(TEST_DB, sql, { tuples: true }).trim();
}

function number(sql) {
  return Number.parseInt(scalar(sql), 10);
}

function json(sql) {
  return JSON.parse(scalar(sql));
}

function recreateDb() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB};`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
}

function bootstrap() {
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

CREATE TABLE public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'owner',
  PRIMARY KEY (author_id, user_id)
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'published',
  is_free boolean NOT NULL DEFAULT false,
  price numeric NULL
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
  referrer_domain text NULL,
  device_type text NOT NULL DEFAULT 'desktop',
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human',
  classification_reason text NULL,
  user_agent text NULL
);

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  practice_id uuid NULL,
  track_id uuid NULL,
  author_id uuid NULL REFERENCES public.authors(id),
  user_id uuid NULL,
  anonymous_session_id text NULL,
  session_id uuid NULL REFERENCES public.analytics_sessions(id),
  path text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human',
  classification_reason text NULL,
  client_event_id uuid NULL,
  user_agent text NULL,
  client_version text NULL
);

CREATE TABLE public.user_practices (
  user_id uuid NOT NULL,
  practice_id uuid NOT NULL,
  access_source text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  PRIMARY KEY (user_id, practice_id)
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  practice_id uuid NULL,
  status text NOT NULL,
  paid_at timestamptz NULL,
  refunded_at timestamptz NULL,
  author_id_snapshot uuid NULL,
  is_test boolean NOT NULL DEFAULT false,
  amount_minor integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.admin_analytics_visitor_key(
  p_user_id uuid,
  p_anonymous_id text,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_user_id IS NOT NULL THEN p_user_id::text
    WHEN nullif(btrim(coalesce(p_anonymous_id, '')), '') IS NOT NULL THEN btrim(p_anonymous_id)
    ELSE NULL
  END;
$$;

DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`,
  );

  // Apply privilege harden + page view + aggregates migrations (extract needed helpers)
  const pageView = readFileSync(
    join(ROOT, "supabase/migrations/20260728191000_author_page_view_event.sql"),
    "utf8",
  );
  // Skip full insert rewrite for this isolated harness – only aggregates + privileges matter.
  // Load helper functions and aggregates from author_stats migration.
  const aggregates = readFileSync(
    join(ROOT, "supabase/migrations/20260728192000_author_stats_aggregates.sql"),
    "utf8",
  );
  const privileges = readFileSync(
    join(
      ROOT,
      "supabase/migrations/20260728190000_admin_analytics_p2_privileges_harden.sql",
    ),
    "utf8",
  );

  // Minimal stubs for privilege migration targets
  psql(
    TEST_DB,
    `
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_summary()
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_timeseries()
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_practices()
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_authors()
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_acquisition()
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_window_metrics()
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_utm_matches(text, text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_utm_label(text, text, text, text)
RETURNS text LANGUAGE sql AS $$ SELECT 'x' $$;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_summary() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_timeseries() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_practices() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_acquisition() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_authors() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_window_metrics() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_utm_matches(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_utm_label(text, text, text, text) TO anon, authenticated;
`,
  );

  execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", TEST_DB, "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: privileges },
  );
  execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", TEST_DB, "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: aggregates },
  );

  // Soft-touch pageView migration for allowlist presence check only if needed
  void pageView;
}

function seed() {
  psql(
    TEST_DB,
    `
INSERT INTO auth.users (id, email) VALUES
  ('${USER_HUMAN}', 'human@example.com'),
  ('${USER_MEMBER}', 'member@example.com'),
  ('${USER_STAFF}', 'staff@example.com'),
  ('${USER_OTHER}', 'other@example.com');

INSERT INTO public.authors (id, name, slug) VALUES
  ('${AUTHOR_ONE}', 'Author One', 'author-one'),
  ('${AUTHOR_TWO}', 'Author Two', 'author-two');

INSERT INTO public.author_members (author_id, user_id, role) VALUES
  ('${AUTHOR_ONE}', '${USER_MEMBER}', 'owner');

INSERT INTO public.practices (id, author_id, title, slug, status, is_free, price) VALUES
  ('${PRACTICE_ONE}', '${AUTHOR_ONE}', 'Practice One', 'practice-one', 'published', true, 0),
  ('${PRACTICE_TWO}', '${AUTHOR_TWO}', 'Practice Two', 'practice-two', 'published', false, 990),
  ('${PRACTICE_ARCHIVED}', '${AUTHOR_ONE}', 'Archived', 'archived', 'archived', false, 500);

INSERT INTO public.analytics_sessions
  (id, anonymous_id, user_id, started_at, utm_source, referrer_domain, is_staff, is_test, is_bot, traffic_class)
VALUES
  ('${SESSION_HUMAN}', 'anon-human', '${USER_HUMAN}', '2026-07-20 10:00:00+00', 'telegram', NULL, false, false, false, 'human'),
  ('${SESSION_MEMBER}', 'anon-member', '${USER_MEMBER}', '2026-07-20 10:00:00+00', NULL, NULL, false, false, false, 'human'),
  ('${SESSION_STAFF}', 'anon-staff', '${USER_STAFF}', '2026-07-20 10:00:00+00', NULL, NULL, true, false, false, 'staff'),
  ('${SESSION_BOT}', 'anon-bot', NULL, '2026-07-20 10:00:00+00', NULL, NULL, false, false, true, 'bot');

INSERT INTO public.analytics_events
  (event_name, practice_id, author_id, user_id, anonymous_session_id, session_id, occurred_at, is_staff, is_test, is_bot, traffic_class)
VALUES
  -- human author page + practice funnel for author one
  ('author_page_view', NULL, '${AUTHOR_ONE}', '${USER_HUMAN}', 'anon-human', '${SESSION_HUMAN}', '2026-07-20 10:01:00+00', false, false, false, 'human'),
  ('author_page_view', NULL, '${AUTHOR_ONE}', NULL, 'anon-guest', '${SESSION_HUMAN}', '2026-07-20 10:02:00+00', false, false, false, 'human'),
  ('practice_view', '${PRACTICE_ONE}', NULL, '${USER_HUMAN}', 'anon-human', '${SESSION_HUMAN}', '2026-07-20 10:03:00+00', false, false, false, 'human'),
  ('practice_view', '${PRACTICE_ONE}', NULL, '${USER_HUMAN}', 'anon-human', '${SESSION_HUMAN}', '2026-07-20 10:04:00+00', false, false, false, 'human'),
  ('audio_play_started', '${PRACTICE_ONE}', NULL, '${USER_HUMAN}', 'anon-human', '${SESSION_HUMAN}', '2026-07-20 10:05:00+00', false, false, false, 'human'),
  ('audio_progress_25', '${PRACTICE_ONE}', NULL, '${USER_HUMAN}', 'anon-human', '${SESSION_HUMAN}', '2026-07-20 10:06:00+00', false, false, false, 'human'),
  ('audio_completed', '${PRACTICE_ONE}', NULL, '${USER_HUMAN}', 'anon-human', '${SESSION_HUMAN}', '2026-07-20 10:07:00+00', false, false, false, 'human'),
  -- archived practice still counts events
  ('practice_view', '${PRACTICE_ARCHIVED}', NULL, '${USER_OTHER}', 'anon-other', '${SESSION_HUMAN}', '2026-07-21 10:00:00+00', false, false, false, 'human'),
  -- member self traffic excluded
  ('practice_view', '${PRACTICE_ONE}', NULL, '${USER_MEMBER}', 'anon-member', '${SESSION_MEMBER}', '2026-07-20 11:00:00+00', false, false, false, 'human'),
  ('author_page_view', NULL, '${AUTHOR_ONE}', '${USER_MEMBER}', 'anon-member', '${SESSION_MEMBER}', '2026-07-20 11:01:00+00', false, false, false, 'human'),
  -- staff/bot excluded
  ('practice_view', '${PRACTICE_ONE}', NULL, '${USER_STAFF}', 'anon-staff', '${SESSION_STAFF}', '2026-07-20 12:00:00+00', true, false, false, 'staff'),
  ('practice_view', '${PRACTICE_ONE}', NULL, NULL, 'anon-bot', '${SESSION_BOT}', '2026-07-20 12:01:00+00', false, false, true, 'bot'),
  -- author two isolation
  ('practice_view', '${PRACTICE_TWO}', NULL, '${USER_HUMAN}', 'anon-human', '${SESSION_HUMAN}', '2026-07-20 13:00:00+00', false, false, false, 'human');

INSERT INTO public.user_practices (user_id, practice_id, access_source, granted_at) VALUES
  ('${USER_HUMAN}', '${PRACTICE_ONE}', 'free_claim', '2026-07-20 10:08:00+00'),
  ('${USER_MEMBER}', '${PRACTICE_ONE}', 'free_claim', '2026-07-20 11:02:00+00'),
  ('${USER_HUMAN}', '${PRACTICE_TWO}', 'free_claim', '2026-07-20 13:01:00+00');

INSERT INTO public.orders (user_id, practice_id, status, paid_at, author_id_snapshot, is_test, amount_minor) VALUES
  ('${USER_OTHER}', '${PRACTICE_ARCHIVED}', 'paid', '2026-07-21 11:00:00+00', '${AUTHOR_ONE}', false, 50000),
  ('${USER_HUMAN}', '${PRACTICE_ONE}', 'pending', NULL, '${AUTHOR_ONE}', false, 0),
  ('${USER_HUMAN}', '${PRACTICE_TWO}', 'paid', '2026-07-20 14:00:00+00', '${AUTHOR_TWO}', false, 99000),
  ('${USER_HUMAN}', '${PRACTICE_ARCHIVED}', 'cancelled', NULL, '${AUTHOR_ONE}', false, 50000);
`,
  );
}

function testPrivileges() {
  const open = scalar(`
SELECT coalesce(string_agg(routine_name || ':' || grantee, ','), '')
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name LIKE 'admin_analytics_p2%'
  AND privilege_type = 'EXECUTE'
  AND grantee IN ('anon', 'authenticated');
`);
  assertEqual(open, "", "admin p2 closed to anon/authenticated");

  const authorOpen = scalar(`
SELECT coalesce(string_agg(routine_name || ':' || grantee, ','), '')
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name LIKE 'author_stats_%'
  AND privilege_type = 'EXECUTE'
  AND grantee IN ('anon', 'authenticated');
`);
  assertEqual(authorOpen, "", "author stats closed to anon/authenticated");
}

function testSummarySemantics() {
  const summary = json(`
SELECT public.author_stats_summary(
  '${AUTHOR_ONE}'::uuid,
  '2026-07-19T00:00:00Z'::timestamptz,
  '2026-07-28T00:00:00Z'::timestamptz
);
`);

  assertEqual(summary.author_page_views, 2, "author page views exclude member");
  assertEqual(summary.author_page_unique_visitors, 2, "author page uniques");
  assertEqual(summary.practice_views, 3, "practice views: 2 human + 1 archived, no member/staff/bot");
  assertEqual(summary.plays, 1, "plays");
  assertEqual(summary.progress_25, 1, "progress 25");
  assertEqual(summary.completions, 1, "completions");
  assertEqual(summary.library_saves, 1, "library saves exclude member");
  assertEqual(summary.paid_purchases, 1, "paid purchases only");
  assertEqual(summary.view_to_play_rate, 33.3, "view to play rate");
  assertEqual(summary.play_to_complete_rate, 100, "play to complete");
  assert(summary.view_to_purchase_rate !== null, "purchase rate present");

  const other = json(`
SELECT public.author_stats_summary(
  '${AUTHOR_TWO}'::uuid,
  '2026-07-19T00:00:00Z'::timestamptz,
  '2026-07-28T00:00:00Z'::timestamptz
);
`);
  assertEqual(other.practice_views, 1, "author two isolation");
  assertEqual(other.paid_purchases, 1, "author two paid");
  assertEqual(other.library_saves, 1, "author two save");

  const emptyRate = json(`
SELECT public.author_stats_summary(
  '${AUTHOR_TWO}'::uuid,
  '2026-01-01T00:00:00Z'::timestamptz,
  '2026-01-02T00:00:00Z'::timestamptz
);
`);
  assertEqual(emptyRate.view_to_play_rate, null, "null rate on zero denominator");
}

function testProductsAndSources() {
  const products = json(`
SELECT public.author_stats_products(
  '${AUTHOR_ONE}'::uuid,
  '2026-07-19T00:00:00Z'::timestamptz,
  '2026-07-28T00:00:00Z'::timestamptz
);
`);
  assertEqual(products.rows.length, 2, "includes archived + published");
  const archived = products.rows.find((row) => row.practice_id === PRACTICE_ARCHIVED);
  assert(archived, "archived row present");
  assertEqual(archived.practice_views, 1, "archived views");
  assertEqual(archived.paid_purchases, 1, "archived purchase");

  const sources = json(`
SELECT public.author_stats_sources(
  '${AUTHOR_ONE}'::uuid,
  '2026-07-19T00:00:00Z'::timestamptz,
  '2026-07-28T00:00:00Z'::timestamptz
);
`);
  const telegram = sources.rows.find((row) => row.bucket === "telegram");
  assert(telegram && telegram.visitors > 0, "telegram bucket attributed via utm");
}

function testTimeseriesGaps() {
  const series = json(`
SELECT public.author_stats_timeseries(
  '${AUTHOR_ONE}'::uuid,
  '2026-07-20T00:00:00Z'::timestamptz,
  '2026-07-22T00:00:00Z'::timestamptz
);
`);
  assert(Array.isArray(series.points), "points array");
  assert(series.points.length >= 2, "filled days");
  assert(
    series.points.every((point) => typeof point.practice_views === "number"),
    "zero-filled numeric fields",
  );
}

function main() {
  recreateDb();
  bootstrap();
  seed();
  testPrivileges();
  testSummarySemantics();
  testProductsAndSources();
  testTimeseriesGaps();
  console.log("author-dashboard-stats-sql-unit: ok");
}

main();

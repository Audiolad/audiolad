#!/usr/bin/env node
/**
 * P2 platform analytics SQL tests (summary / timeseries / practices / authors /
 * acquisition) on an isolated database. Never touches the production schema.
 *
 * Requires the Supabase Postgres container (default: supabase-db).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_analytics_p2_test";

// Europe/Moscow days 2026-07-20 .. 2026-07-24 (UTC+3, no DST).
const FROM = "2026-07-19T21:00:00Z";
const TO = "2026-07-24T21:00:00Z";
const PREV_FROM = "2026-07-14T21:00:00Z";
const PREV_TO = "2026-07-19T21:00:00Z";

const AUTHOR_ONE = "a1111111-1111-1111-1111-111111111111";
const AUTHOR_TWO = "a2222222-2222-2222-2222-222222222222";
const PRACTICE_ONE = "c1111111-1111-1111-1111-111111111111";
const PRACTICE_TWO = "c2222222-2222-2222-2222-222222222222";
const PRACTICE_THREE = "c3333333-3333-3333-3333-333333333333";
const PRACTICE_FOUR = "c4444444-4444-4444-4444-444444444444";
const USER_HUMAN_ONE = "d1111111-1111-1111-1111-111111111111";
const USER_HUMAN_TWO = "d2222222-2222-2222-2222-222222222222";
const USER_STAFF = "d3333333-3333-3333-3333-333333333333";
const USER_TEST = "d4444444-4444-4444-4444-444444444444";

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

function migration(name) {
  return join(ROOT, "supabase/migrations", name);
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);
CREATE TABLE public.practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.authors(id),
  title text,
  slug text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text,
  role text NOT NULL DEFAULT 'listener',
  created_at timestamptz NOT NULL DEFAULT now()
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
  );
$$;
CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.has_platform_permission(p_user_id, 'admin_panel.access');
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
    'author_application_started','author_application_submitted',
    'first_manual_library_save'
  );
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
`,
  );
}

function applyMigrations() {
  psqlFile(TEST_DB, migration("20260725140000_admin_analytics_dashboard_snapshot.sql"));
  psqlFile(TEST_DB, migration("20260725160000_platform_analytics_p1_identity.sql"));
  psqlFile(TEST_DB, migration("20260725161000_admin_analytics_dashboard_snapshot_p1.sql"));
  psqlFile(TEST_DB, migration("20260725162000_unlink_analytics_identity.sql"));
  psqlFile(TEST_DB, migration("20260725180000_admin_analytics_p2_dashboard.sql"));
}

/**
 * Fixture (Europe/Moscow days):
 *   2026-07-20  session S1 (human1, telegram/social/summer/post1, mobile)
 *               practice_view x2 + play + completion + save on practice-one
 *   2026-07-21  session S2 (anonymous, no UTM, desktop)
 *               practice_view on practice-one and practice-two + 2 plays on practice-two
 *               session S4 (staff) practice_view, session S5 (test account) practice_view
 *   2026-07-22  session S3 (human2, vk/social/promo, desktop)
 *               practice_view + play on practice-three, save on practice-four
 *   2026-07-23  no activity (zero-fill check)
 *   2026-07-24  no activity (zero-fill check)
 */
function seedFixture() {
  psql(
    TEST_DB,
    `
INSERT INTO auth.users(id,email) VALUES
  ('${USER_HUMAN_ONE}','one@example.com'),
  ('${USER_HUMAN_TWO}','two@example.com'),
  ('${USER_STAFF}','staff@audiolad.ru'),
  ('${USER_TEST}','audiolad@mail.ru');

INSERT INTO public.profiles(id,email,role,created_at) VALUES
  ('${USER_HUMAN_ONE}','one@example.com','listener','2026-07-20 09:00:00+00'),
  ('${USER_HUMAN_TWO}','two@example.com','listener','2026-07-22 09:00:00+00'),
  ('${USER_STAFF}','staff@audiolad.ru','listener','2026-07-21 09:00:00+00'),
  ('${USER_TEST}','audiolad@mail.ru','listener','2026-07-21 09:30:00+00');

INSERT INTO public.platform_user_roles VALUES ('${USER_STAFF}','owner');
INSERT INTO public.analytics_test_accounts(user_id,label) VALUES ('${USER_TEST}','primary')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.authors(id,name,slug) VALUES
  ('${AUTHOR_ONE}','Автор Один','author-one'),
  ('${AUTHOR_TWO}','Автор Два','author-two');

INSERT INTO public.practices(id,author_id,title,slug,status) VALUES
  ('${PRACTICE_ONE}','${AUTHOR_ONE}','Практика Один','practice-one','published'),
  ('${PRACTICE_TWO}','${AUTHOR_ONE}','Практика Два','practice-two','published'),
  ('${PRACTICE_THREE}','${AUTHOR_TWO}','Практика Три','practice-three','draft'),
  ('${PRACTICE_FOUR}','${AUTHOR_TWO}','Практика Четыре','practice-four','published');

INSERT INTO public.analytics_sessions(
  id,anonymous_id,user_id,started_at,last_seen_at,
  utm_source,utm_medium,utm_campaign,utm_content,device_type,
  is_staff,is_test,is_bot,traffic_class
) VALUES
  ('e1111111-1111-1111-1111-111111111111','p2anon1','${USER_HUMAN_ONE}','2026-07-20 10:00:00+00','2026-07-20 10:30:00+00','telegram','social','summer','post1','mobile',false,false,false,'human'),
  ('e2222222-2222-2222-2222-222222222222','p2anon2',NULL,'2026-07-21 10:00:00+00','2026-07-21 10:30:00+00',NULL,NULL,NULL,NULL,'desktop',false,false,false,'human'),
  ('e3333333-3333-3333-3333-333333333333','p2anon3','${USER_HUMAN_TWO}','2026-07-22 10:00:00+00','2026-07-22 10:30:00+00','vk','social','promo',NULL,'desktop',false,false,false,'human'),
  ('e4444444-4444-4444-4444-444444444444','p2anonstaff','${USER_STAFF}','2026-07-21 11:00:00+00','2026-07-21 11:30:00+00',NULL,NULL,NULL,NULL,'desktop',true,false,false,'staff'),
  ('e5555555-5555-5555-5555-555555555555','p2anontester','${USER_TEST}','2026-07-21 12:00:00+00','2026-07-21 12:30:00+00',NULL,NULL,NULL,NULL,'desktop',false,true,false,'test');

INSERT INTO public.analytics_events(
  session_id,anonymous_session_id,user_id,event_name,practice_id,occurred_at,
  is_staff,is_test,is_bot,traffic_class
) VALUES
  ('e1111111-1111-1111-1111-111111111111','p2anon1','${USER_HUMAN_ONE}','practice_view','${PRACTICE_ONE}','2026-07-20 10:01:00+00',false,false,false,'human'),
  ('e1111111-1111-1111-1111-111111111111','p2anon1','${USER_HUMAN_ONE}','practice_view','${PRACTICE_ONE}','2026-07-20 10:02:00+00',false,false,false,'human'),
  ('e1111111-1111-1111-1111-111111111111','p2anon1','${USER_HUMAN_ONE}','audio_play_started','${PRACTICE_ONE}','2026-07-20 10:03:00+00',false,false,false,'human'),
  ('e1111111-1111-1111-1111-111111111111','p2anon1','${USER_HUMAN_ONE}','audio_completed','${PRACTICE_ONE}','2026-07-20 10:20:00+00',false,false,false,'human'),
  ('e1111111-1111-1111-1111-111111111111','p2anon1','${USER_HUMAN_ONE}','first_manual_library_save','${PRACTICE_ONE}','2026-07-20 10:21:00+00',false,false,false,'human'),
  ('e2222222-2222-2222-2222-222222222222','p2anon2',NULL,'practice_view','${PRACTICE_ONE}','2026-07-21 10:01:00+00',false,false,false,'human'),
  ('e2222222-2222-2222-2222-222222222222','p2anon2',NULL,'practice_view','${PRACTICE_TWO}','2026-07-21 10:02:00+00',false,false,false,'human'),
  ('e2222222-2222-2222-2222-222222222222','p2anon2',NULL,'audio_play_started','${PRACTICE_TWO}','2026-07-21 10:03:00+00',false,false,false,'human'),
  ('e2222222-2222-2222-2222-222222222222','p2anon2',NULL,'audio_play_started','${PRACTICE_TWO}','2026-07-21 10:04:00+00',false,false,false,'human'),
  ('e3333333-3333-3333-3333-333333333333','p2anon3','${USER_HUMAN_TWO}','practice_view','${PRACTICE_THREE}','2026-07-22 10:01:00+00',false,false,false,'human'),
  ('e3333333-3333-3333-3333-333333333333','p2anon3','${USER_HUMAN_TWO}','audio_play_started','${PRACTICE_THREE}','2026-07-22 10:02:00+00',false,false,false,'human'),
  ('e3333333-3333-3333-3333-333333333333','p2anon3','${USER_HUMAN_TWO}','first_manual_library_save','${PRACTICE_FOUR}','2026-07-22 10:05:00+00',false,false,false,'human'),
  ('e4444444-4444-4444-4444-444444444444','p2anonstaff','${USER_STAFF}','practice_view','${PRACTICE_ONE}','2026-07-21 11:01:00+00',true,false,false,'staff'),
  ('e5555555-5555-5555-5555-555555555555','p2anontester','${USER_TEST}','practice_view','${PRACTICE_ONE}','2026-07-21 12:01:00+00',false,true,false,'test');
`,
  );
}

function setup() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  createStubSchema();
  applyMigrations();
  seedFixture();
}

function summary(overrides = {}) {
  const {
    from = `'${FROM}'`,
    to = `'${TO}'`,
    includeTest = false,
    prevFrom = "NULL",
    prevTo = "NULL",
    authorId = "NULL",
    practiceId = "NULL",
    utmSource = "NULL",
    deviceType = "NULL",
  } = overrides;
  return json(
    `SELECT public.admin_analytics_p2_summary(${from}, ${to}, ${includeTest}, ${prevFrom}, ${prevTo}, ${authorId}, ${practiceId}, ${utmSource}, ${deviceType})::text;`,
  );
}

function testSummaryMatchesDirectSql() {
  const snapshot = summary();
  const directViews = number(`
SELECT count(*)
FROM public.analytics_events AS e
JOIN public.analytics_sessions AS s ON s.id = e.session_id
WHERE e.event_name = 'practice_view'
  AND e.occurred_at >= '${FROM}'
  AND e.occurred_at < '${TO}'
  AND NOT (s.is_staff OR s.is_test OR s.is_bot);`);

  assertEqual(snapshot.events.practice_views, directViews, "practice_views vs direct SQL");
  assertEqual(snapshot.events.practice_views, 5, "practice_views");
  assertEqual(snapshot.events.play_starts, 4, "play_starts");
  assertEqual(snapshot.events.completions, 1, "completions");
  assertEqual(snapshot.events.saves, 2, "saves");
  assertEqual(snapshot.audience.sessions, 3, "sessions");
  assertEqual(snapshot.audience.visitors, 3, "visitors");
  assertEqual(snapshot.audience.registrations, 2, "registrations");
  assert(snapshot.purchases === null, "purchases must be null until the payment stage");
  assert(snapshot.previous === null, "previous must be null without prev bounds");
}

function testEventCountsDifferFromUniquePeople() {
  const snapshot = summary();
  assertEqual(snapshot.people.listeners, 3, "listeners");
  assertEqual(snapshot.people.practice_visitors, 3, "practice_visitors");
  assertEqual(snapshot.people.savers, 2, "savers");
  assertEqual(snapshot.people.completers, 1, "completers");
  assert(
    snapshot.events.play_starts > snapshot.people.listeners,
    `play_starts (${snapshot.events.play_starts}) must exceed unique listeners (${snapshot.people.listeners})`,
  );
}

function testPreviousWindow() {
  const snapshot = summary({ prevFrom: `'${PREV_FROM}'`, prevTo: `'${PREV_TO}'` });
  assert(snapshot.previous !== null, "previous must be present with both prev bounds");
  assertEqual(snapshot.previous.practice_views, 0, "previous practice_views");
  assertEqual(snapshot.previous.sessions, 0, "previous sessions");
  assertEqual(snapshot.previous.registrations, 0, "previous registrations");
}

function testServiceTrafficFilter() {
  const human = summary();
  const all = summary({ includeTest: true });

  assertEqual(human.audience.excluded_service_sessions, 2, "excluded_service_sessions");
  assertEqual(human.audience.excluded_service_visitors, 2, "excluded_service_visitors");
  assertEqual(all.audience.sessions, 5, "sessions with include_test");
  assertEqual(all.events.practice_views, 7, "practice_views with include_test");
  assertEqual(all.audience.registrations, 4, "registrations with include_test");
  assert(
    human.events.practice_views < all.events.practice_views,
    "staff/test traffic must be excluded by default",
  );
}

function testProductAndSessionFilters() {
  const byAuthor = summary({ authorId: `'${AUTHOR_ONE}'` });
  assertEqual(byAuthor.events.practice_views, 4, "author filter practice_views");
  assertEqual(byAuthor.events.play_starts, 3, "author filter play_starts");
  assertEqual(byAuthor.audience.sessions, 2, "author filter sessions");
  assertEqual(byAuthor.audience.visitors, 2, "author filter visitors");
  assertEqual(byAuthor.audience.registrations, 1, "author filter registrations");

  const byPractice = summary({ practiceId: `'${PRACTICE_TWO}'` });
  assertEqual(byPractice.events.practice_views, 1, "practice filter practice_views");
  assertEqual(byPractice.events.play_starts, 2, "practice filter play_starts");

  const noUtm = summary({ utmSource: `'__none__'` });
  assertEqual(noUtm.audience.sessions, 1, "__none__ sessions");
  assertEqual(noUtm.events.practice_views, 2, "__none__ practice_views");

  const telegram = summary({ utmSource: `'Telegram'` });
  assertEqual(telegram.audience.sessions, 1, "utm_source sessions (case-insensitive)");
  assertEqual(telegram.events.practice_views, 2, "utm_source practice_views");

  const mobile = summary({ deviceType: `'mobile'` });
  assertEqual(mobile.audience.sessions, 1, "device sessions");
  assertEqual(mobile.events.practice_views, 2, "device practice_views");
}

function testTimeseriesZeroFillAndAdditivity() {
  const series = json(
    `SELECT public.admin_analytics_p2_timeseries('${FROM}', '${TO}', false)::text;`,
  );
  assertEqual(series.granularity, "day", "granularity");
  assertEqual(series.points.length, 5, "point count");
  assertEqual(
    series.points.map((point) => point.bucket).join(","),
    "2026-07-20,2026-07-21,2026-07-22,2026-07-23,2026-07-24",
    "bucket labels",
  );

  const empty = series.points.filter((point) => ["2026-07-23", "2026-07-24"].includes(point.bucket));
  assertEqual(empty.length, 2, "zero-filled buckets present");
  for (const point of empty) {
    for (const key of [
      "visitors",
      "registrations",
      "practice_views",
      "play_starts",
      "listeners",
      "completions",
      "saves",
    ]) {
      assertEqual(point[key], 0, `zero-filled ${key} on ${point.bucket}`);
    }
  }

  const sum = (key) => series.points.reduce((total, point) => total + point[key], 0);
  const snapshot = summary();
  assertEqual(sum("practice_views"), snapshot.events.practice_views, "additive practice_views");
  assertEqual(sum("play_starts"), snapshot.events.play_starts, "additive play_starts");
  assertEqual(sum("completions"), snapshot.events.completions, "additive completions");
  assertEqual(sum("saves"), snapshot.events.saves, "additive saves");
  assertEqual(sum("registrations"), snapshot.audience.registrations, "additive registrations");
  assert(
    sum("listeners") >= snapshot.people.listeners,
    "daily unique listeners are not additive but must not undercount",
  );

  const wide = json(
    `SELECT public.admin_analytics_p2_timeseries('2026-01-01T00:00:00Z', '${TO}', false)::text;`,
  );
  assertEqual(wide.granularity, "week", "granularity for periods over 120 days");
  assert(wide.points.length <= 400, `capped point count, got ${wide.points.length}`);
}

function practices(overrides = {}) {
  const {
    authorId = "NULL",
    practiceId = "NULL",
    utmSource = "NULL",
    deviceType = "NULL",
    sort = "'play_starts'",
    dir = "'desc'",
    limit = 20,
    offset = 0,
  } = overrides;
  return json(
    `SELECT public.admin_analytics_p2_practices('${FROM}', '${TO}', false, ${authorId}, ${practiceId}, ${utmSource}, ${deviceType}, ${sort}, ${dir}, ${limit}, ${offset})::text;`,
  );
}

function testPracticesPaginationAndHref() {
  const all = practices();
  assertEqual(all.total, 4, "practices total");
  assertEqual(all.rows.length, 4, "practices rows");

  const top = all.rows[0];
  assertEqual(top.practiceId, PRACTICE_TWO, "default sort is play_starts desc");
  assertEqual(top.playStarts, 2, "top playStarts");
  assertEqual(top.uniqueListeners, 1, "top uniqueListeners");

  const first = practices({ sort: "'views'", limit: 1 });
  assertEqual(first.total, 4, "total is not affected by limit");
  assertEqual(first.rows.length, 1, "limit applies to aggregated rows");
  assertEqual(first.rows[0].practiceId, PRACTICE_ONE, "views desc winner");
  assertEqual(first.rows[0].views, 3, "practice-one views");
  assertEqual(first.rows[0].uniqueVisitors, 2, "practice-one unique visitors");
  assertEqual(
    first.rows[0].href,
    "/practice/author-one/practice-one",
    "public practice href",
  );

  const second = practices({ sort: "'views'", limit: 1, offset: 1 });
  assertEqual(second.rows.length, 1, "offset page size");
  assert(
    second.rows[0].practiceId !== PRACTICE_ONE,
    "offset must move past the first aggregated row",
  );

  const beyond = practices({ limit: 1, offset: 99 });
  assertEqual(beyond.rows.length, 0, "offset beyond total returns no rows");
  assertEqual(beyond.total, 4, "total stays stable beyond the last page");

  const clamped = practices({ limit: 9999, offset: -5 });
  assertEqual(clamped.rows.length, 4, "limit clamped to 100 and offset to 0");
}

function testDivisionSafeSorts() {
  const viewToPlay = practices({ sort: "'view_to_play'" });
  assertEqual(viewToPlay.rows.length, 4, "view_to_play rows");
  assertEqual(viewToPlay.rows[0].practiceId, PRACTICE_TWO, "best view_to_play ratio");
  const zeroViews = viewToPlay.rows.find((row) => row.practiceId === PRACTICE_FOUR);
  assertEqual(zeroViews.views, 0, "practice-four has no views");
  assertEqual(zeroViews.saves, 1, "practice-four save counted");

  const playToComplete = practices({ sort: "'play_to_complete'" });
  assertEqual(playToComplete.rows[0].practiceId, PRACTICE_ONE, "best play_to_complete ratio");

  const ascending = practices({ sort: "'view_to_play'", dir: "'asc'", limit: 1 });
  assertEqual(ascending.rows.length, 1, "ascending ratio sort works");

  const unknownSort = practices({ sort: "'; drop table analytics_events; --'" });
  assertEqual(unknownSort.rows[0].practiceId, PRACTICE_TWO, "unknown sort falls back to play_starts");
  assertEqual(
    number("SELECT count(*) FROM public.analytics_events;"),
    14,
    "events table untouched by sort input",
  );
}

function testAuthors() {
  const authors = json(
    `SELECT public.admin_analytics_p2_authors('${FROM}', '${TO}', false, NULL, NULL, NULL, NULL, 'views', 'desc', 20, 0)::text;`,
  );
  assertEqual(authors.total, 2, "authors total");
  assertEqual(authors.rows[0].authorId, AUTHOR_ONE, "authors sorted by views desc");
  assertEqual(authors.rows[0].views, 4, "author-one views");
  assertEqual(authors.rows[0].playStarts, 3, "author-one playStarts");
  assertEqual(authors.rows[0].publishedPractices, 2, "author-one published practices");
  assertEqual(authors.rows[0].href, "/authors/author-one", "author href");

  const authorTwo = authors.rows.find((row) => row.authorId === AUTHOR_TWO);
  assertEqual(authorTwo.publishedPractices, 1, "author-two published practices (draft excluded)");
  assertEqual(authorTwo.saves, 1, "author-two saves");

  const paged = json(
    `SELECT public.admin_analytics_p2_authors('${FROM}', '${TO}', false, NULL, NULL, NULL, NULL, 'views', 'desc', 1, 1)::text;`,
  );
  assertEqual(paged.total, 2, "authors total with pagination");
  assertEqual(paged.rows.length, 1, "authors page size");
  assertEqual(paged.rows[0].authorId, AUTHOR_TWO, "authors second page");
}

function testAcquisition() {
  const acquisition = json(
    `SELECT public.admin_analytics_p2_acquisition('${FROM}', '${TO}', false, NULL, NULL, NULL, NULL, 20, 0)::text;`,
  );
  assertEqual(acquisition.attribution, "session_touch", "attribution mode");
  assertEqual(acquisition.total, 3, "acquisition groups");

  const noUtm = acquisition.rows.find((row) => row.utmSource === "");
  assert(noUtm !== undefined, "empty-UTM group must be present");
  assertEqual(
    noUtm.label,
    "Без UTM / прямые и неопределённые переходы",
    "empty-UTM label",
  );
  assertEqual(noUtm.sessions, 1, "empty-UTM sessions");
  assertEqual(noUtm.playStarts, 2, "empty-UTM playStarts");
  assertEqual(noUtm.listeners, 1, "empty-UTM listeners");
  assertEqual(noUtm.registrations, 0, "empty-UTM registrations");

  const telegram = acquisition.rows.find((row) => row.utmSource === "telegram");
  assertEqual(telegram.label, "telegram / social / summer / post1", "UTM label");
  assertEqual(telegram.registrations, 1, "session-touch registration attribution");
  assertEqual(telegram.saves, 1, "telegram saves");

  const totalRegistrations = acquisition.rows.reduce((total, row) => total + row.registrations, 0);
  assertEqual(totalRegistrations, summary().audience.registrations, "registrations split across UTM rows");

  const paged = json(
    `SELECT public.admin_analytics_p2_acquisition('${FROM}', '${TO}', false, NULL, NULL, NULL, NULL, 2, 0)::text;`,
  );
  assertEqual(paged.total, 3, "acquisition total is not affected by limit");
  assertEqual(paged.rows.length, 2, "acquisition page size");
}

function testP0SnapshotStillWorks() {
  const snapshot = json(
    `SELECT public.admin_analytics_dashboard_snapshot('${FROM}', '${TO}', false)::text;`,
  );
  assertEqual(snapshot.visits, 3, "P1 snapshot visits");
  assertEqual(snapshot.practice_views, 5, "P1 snapshot practice_views");
  assertEqual(snapshot.play_starts, 4, "P1 snapshot play_starts");
}

function testGrantsAreServiceRoleOnly() {
  const functions = [
    "admin_analytics_p2_summary",
    "admin_analytics_p2_timeseries",
    "admin_analytics_p2_practices",
    "admin_analytics_p2_authors",
    "admin_analytics_p2_acquisition",
    "admin_analytics_p2_window_metrics",
  ];

  for (const name of functions) {
    const definer = scalar(`
SELECT p.prosecdef::text
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = '${name}';`);
    assertEqual(definer, "true", `${name} must be SECURITY DEFINER`);

    const comment = scalar(`
SELECT coalesce(obj_description(p.oid, 'pg_proc'), '')
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = '${name}';`);
    assert(
      comment.includes("audiolad:platform-analytics:p2"),
      `${name} must be tagged audiolad:platform-analytics:p2`,
    );

    for (const role of ["anon", "authenticated", "public"]) {
      const granted = scalar(`
SELECT has_function_privilege('${role}', p.oid, 'EXECUTE')::text
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = '${name}';`);
      assertEqual(granted, "false", `${name} must not be executable by ${role}`);
    }

    const serviceRole = scalar(`
SELECT has_function_privilege('service_role', p.oid, 'EXECUTE')::text
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = '${name}';`);
    assertEqual(serviceRole, "true", `${name} must be executable by service_role`);
  }
}

function main() {
  setup();
  testSummaryMatchesDirectSql();
  testEventCountsDifferFromUniquePeople();
  testPreviousWindow();
  testServiceTrafficFilter();
  testProductAndSessionFilters();
  testTimeseriesZeroFillAndAdditivity();
  testPracticesPaginationAndHref();
  testDivisionSafeSorts();
  testAuthors();
  testAcquisition();
  testP0SnapshotStillWorks();
  testGrantsAreServiceRoleOnly();
  console.log("platform-analytics-p2-sql-unit: ok");
}

main();

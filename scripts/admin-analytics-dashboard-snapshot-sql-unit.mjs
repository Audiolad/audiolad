#!/usr/bin/env node
/**
 * SQL regression for admin_analytics_dashboard_snapshot.
 * Uses an isolated test database — never production data.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";
const TEST_DB = "audiolad_admin_analytics_p0_test";
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260725140000_admin_analytics_dashboard_snapshot.sql",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function psql(database, sql, extraArgs = []) {
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
      ...extraArgs,
      "-c",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}

function psqlFile(database, absolutePath) {
  const sql = readFileSync(absolutePath, "utf8");
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
    { encoding: "utf8", input: sql, maxBuffer: 20 * 1024 * 1024 },
  );
}

function snapshotJson(fromIso, toIso, includeTest) {
  const sql = `
SELECT public.admin_analytics_dashboard_snapshot(
  ${fromIso ? `'${fromIso}'::timestamptz` : "NULL"},
  ${toIso ? `'${toIso}'::timestamptz` : "NULL"},
  ${includeTest ? "true" : "false"}
)::text;
`;
  const raw = psql(TEST_DB, sql, ["-tA"]).trim();
  return JSON.parse(raw);
}

function resetData() {
  psql(
    TEST_DB,
    `
TRUNCATE public.analytics_events, public.analytics_sessions, public.profiles,
  public.practices, public.authors RESTART IDENTITY CASCADE;
`,
  );
}

function setupSchema() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);

  psql(
    TEST_DB,
    `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.authors(id),
  title text
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  role text NOT NULL DEFAULT 'listener',
  created_at timestamptz NOT NULL DEFAULT now()
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
  referrer_domain text NULL,
  landing_path text NULL,
  device_type text NOT NULL DEFAULT 'desktop',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  practice_id uuid NULL REFERENCES public.practices(id),
  track_id uuid NULL,
  user_id uuid NULL,
  anonymous_session_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NULL REFERENCES public.analytics_sessions(id),
  path text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
`,
  );

  psqlFile(TEST_DB, MIGRATION);
}

function insertSession(input) {
  const {
    id,
    anonymousId,
    userId = null,
    startedAt,
    utmSource = null,
    utmCampaign = null,
    referrerDomain = null,
  } = input;

  psql(
    TEST_DB,
    `
INSERT INTO public.analytics_sessions (
  id, anonymous_id, user_id, started_at, last_seen_at, utm_source, utm_campaign, referrer_domain
) VALUES (
  '${id}'::uuid,
  '${anonymousId}',
  ${userId ? `'${userId}'::uuid` : "NULL"},
  '${startedAt}'::timestamptz,
  '${startedAt}'::timestamptz,
  ${utmSource ? `'${utmSource}'` : "NULL"},
  ${utmCampaign ? `'${utmCampaign}'` : "NULL"},
  ${referrerDomain ? `'${referrerDomain}'` : "NULL"}
);
`,
  );
}

function insertEvent(input) {
  const {
    id = null,
    sessionId,
    anonymousId,
    eventName,
    occurredAt,
    practiceId = null,
    userId = null,
  } = input;

  psql(
    TEST_DB,
    `
INSERT INTO public.analytics_events (
  ${id ? "id," : ""}
  event_name, session_id, anonymous_session_id, occurred_at, practice_id, user_id
) VALUES (
  ${id ? `'${id}'::uuid,` : ""}
  '${eventName}',
  ${sessionId ? `'${sessionId}'::uuid` : "NULL"},
  ${anonymousId ? `'${anonymousId}'` : "NULL"},
  '${occurredAt}'::timestamptz,
  ${practiceId ? `'${practiceId}'::uuid` : "NULL"},
  ${userId ? `'${userId}'::uuid` : "NULL"}
);
`,
  );
}

function insertBulkPracticeViews({ sessionId, anonymousId, startAt, count }) {
  psql(
    TEST_DB,
    `
INSERT INTO public.analytics_events (event_name, session_id, anonymous_session_id, occurred_at)
SELECT
  'practice_view',
  '${sessionId}'::uuid,
  '${anonymousId}',
  '${startAt}'::timestamptz + (g || ' seconds')::interval
FROM generate_series(1, ${count}) AS g;
`,
  );
}

function seedBaseEntities() {
  psql(
    TEST_DB,
    `
INSERT INTO public.authors (id, name, slug)
VALUES ('11111111-1111-1111-1111-111111111111', 'Автор Тест', 'author-test');

INSERT INTO public.practices (id, author_id, title)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Практика Тест'
);
`,
  );
}

function testSmallPeriod() {
  resetData();
  seedBaseEntities();

  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
  const anon = "visitor-small-1";

  insertSession({
    id: sessionId,
    anonymousId: anon,
    startedAt: "2026-07-24T10:00:00Z",
  });

  for (const eventName of [
    "practice_view",
    "practice_view",
    "audio_play_started",
    "audio_play_started",
    "audio_completed",
    "author_application_submitted",
  ]) {
    insertEvent({
      sessionId,
      anonymousId: anon,
      eventName,
      occurredAt: "2026-07-24T10:05:00Z",
      practiceId: "22222222-2222-2222-2222-222222222222",
    });
  }

  const snap = snapshotJson(from, to, false);
  assert(snap.visits === 1, "small: visits");
  assert(snap.visitors === 1, "small: visitors");
  assert(snap.practice_views === 2, "small: practice views");
  assert(snap.play_starts === 2, "small: play starts");
  assert(snap.listeners === 1, "small: listeners");
  assert(snap.completions === 1, "small: completions");
  assert(snap.author_applications === 1, "small: applications");
}

function testExact1000() {
  resetData();
  seedBaseEntities();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
  const anon = "visitor-1000";

  insertSession({
    id: sessionId,
    anonymousId: anon,
    startedAt: "2026-07-24T10:00:00Z",
  });
  insertBulkPracticeViews({
    sessionId,
    anonymousId: anon,
    startAt: "2026-07-24T10:00:00Z",
    count: 1000,
  });

  const snap = snapshotJson(from, to, false);
  assert(snap.practice_views === 1000, "exact 1000 practice views retained");
  assert(snap.visits === 1, "exact 1000 visits");
}

function test1001NoLoss() {
  resetData();
  seedBaseEntities();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
  const anon = "visitor-1001";

  insertSession({
    id: sessionId,
    anonymousId: anon,
    startedAt: "2026-07-24T10:00:00Z",
  });
  insertBulkPracticeViews({
    sessionId,
    anonymousId: anon,
    startAt: "2026-07-24T10:00:00Z",
    count: 1001,
  });

  const snap = snapshotJson(from, to, false);
  assert(snap.practice_views === 1001, "1001 events: none lost");
}

function test1264AuditShape() {
  resetData();
  seedBaseEntities();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4";
  const anon = "visitor-1264";

  insertSession({
    id: sessionId,
    anonymousId: anon,
    startedAt: "2026-07-24T10:00:00Z",
  });

  // 119 practice_view + 61 play + 26 completed + filler page_view = 1264 platform events
  insertBulkPracticeViews({
    sessionId,
    anonymousId: anon,
    startAt: "2026-07-24T10:00:00Z",
    count: 119,
  });

  psql(
    TEST_DB,
    `
INSERT INTO public.analytics_events (event_name, session_id, anonymous_session_id, occurred_at, practice_id)
SELECT 'audio_play_started', '${sessionId}'::uuid, '${anon}',
  '2026-07-24T11:00:00Z'::timestamptz + (g || ' seconds')::interval,
  '22222222-2222-2222-2222-222222222222'::uuid
FROM generate_series(1, 61) AS g;

INSERT INTO public.analytics_events (event_name, session_id, anonymous_session_id, occurred_at, practice_id)
SELECT 'audio_completed', '${sessionId}'::uuid, '${anon}',
  '2026-07-24T12:00:00Z'::timestamptz + (g || ' seconds')::interval,
  '22222222-2222-2222-2222-222222222222'::uuid
FROM generate_series(1, 26) AS g;

INSERT INTO public.analytics_events (event_name, session_id, anonymous_session_id, occurred_at)
SELECT 'page_view', '${sessionId}'::uuid, '${anon}',
  '2026-07-24T13:00:00Z'::timestamptz + (g || ' seconds')::interval
FROM generate_series(1, 1058) AS g;
`,
  );

  const count = Number(
    psql(
      TEST_DB,
      `SELECT count(*) FROM public.analytics_events
       WHERE occurred_at >= '2026-07-24T00:00:00Z'
         AND occurred_at < '2026-07-25T00:00:00Z';`,
      ["-tA"],
    ).trim(),
  );
  assert(count === 1264, `fixture platform-like events=${count}`);

  const snap = snapshotJson(from, to, false);
  assert(snap.practice_views === 119, "1264 fixture practice_views");
  assert(snap.play_starts === 61, "1264 fixture play_starts");
  assert(snap.listeners === 1, "1264 fixture listeners (one visitor)");
  assert(snap.completions === 26, "1264 fixture completions");
  assert(
    Math.round((snap.completions / snap.play_starts) * 100) === 43,
    "1264 fixture completion rate 43%",
  );
}

function testOver5000IndependentOfRowLimit() {
  resetData();
  seedBaseEntities();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5";
  const anon = "visitor-5001";

  insertSession({
    id: sessionId,
    anonymousId: anon,
    startedAt: "2026-07-24T10:00:00Z",
  });
  insertBulkPracticeViews({
    sessionId,
    anonymousId: anon,
    startAt: "2026-07-24T10:00:00Z",
    count: 5001,
  });

  const snap = snapshotJson(from, to, false);
  assert(snap.practice_views === 5001, ">5000 events fully aggregated");
}

function testSemiOpenBounds() {
  resetData();
  seedBaseEntities();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const sessionIn = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6";
  const sessionEnd = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7";

  insertSession({
    id: sessionIn,
    anonymousId: "bound-start",
    startedAt: from,
  });
  insertSession({
    id: sessionEnd,
    anonymousId: "bound-end",
    startedAt: to,
  });

  insertEvent({
    sessionId: sessionIn,
    anonymousId: "bound-start",
    eventName: "practice_view",
    occurredAt: from,
    practiceId: "22222222-2222-2222-2222-222222222222",
  });
  insertEvent({
    sessionId: sessionIn,
    anonymousId: "bound-start",
    eventName: "practice_view",
    occurredAt: to,
    practiceId: "22222222-2222-2222-2222-222222222222",
  });

  const snap = snapshotJson(from, to, false);
  assert(snap.visits === 1, "session at start included, at end excluded");
  assert(snap.practice_views === 1, "event at start included, at end excluded");
}

function testSharedBoundsAcrossCards() {
  resetData();
  seedBaseEntities();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8";
  const anon = "shared-bounds";

  insertSession({
    id: sessionId,
    anonymousId: anon,
    startedAt: "2026-07-24T15:00:00Z",
    utmSource: "max",
  });
  insertEvent({
    sessionId,
    anonymousId: anon,
    eventName: "practice_view",
    occurredAt: "2026-07-24T15:01:00Z",
    practiceId: "22222222-2222-2222-2222-222222222222",
  });
  insertEvent({
    sessionId,
    anonymousId: anon,
    eventName: "audio_play_started",
    occurredAt: "2026-07-24T15:02:00Z",
    practiceId: "22222222-2222-2222-2222-222222222222",
  });
  insertEvent({
    sessionId,
    anonymousId: anon,
    eventName: "audio_completed",
    occurredAt: "2026-07-24T15:03:00Z",
    practiceId: "22222222-2222-2222-2222-222222222222",
  });

  const snap = snapshotJson(from, to, false);
  assert(snap.visits === 1 && snap.visitors === 1, "shared bounds: sessions");
  assert(snap.practice_views === 1 && snap.play_starts === 1, "shared bounds: events");
  assert(snap.completions === 1 && snap.listeners === 1, "shared bounds: listeners");
  const maxSource = (snap.sources || []).find((row) => row.source === "max");
  assert(maxSource?.visitors === 1, "shared bounds: sources use same period");
  assert(maxSource?.playStarts === 1, "shared bounds: source plays");
}

function testTestFilterToggle() {
  resetData();
  seedBaseEntities();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";

  insertSession({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10",
    anonymousId: "real-user",
    startedAt: "2026-07-24T10:00:00Z",
  });
  insertSession({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11",
    anonymousId: "test-fixture-user",
    startedAt: "2026-07-24T11:00:00Z",
    utmCampaign: "analytics_dev_fixture",
  });

  insertEvent({
    sessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10",
    anonymousId: "real-user",
    eventName: "practice_view",
    occurredAt: "2026-07-24T10:05:00Z",
  });
  insertEvent({
    sessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11",
    anonymousId: "test-fixture-user",
    eventName: "practice_view",
    occurredAt: "2026-07-24T11:05:00Z",
  });
  insertEvent({
    sessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11",
    anonymousId: "test-fixture-user",
    eventName: "audio_play_started",
    occurredAt: "2026-07-24T11:06:00Z",
  });

  const excluded = snapshotJson(from, to, false);
  const included = snapshotJson(from, to, true);

  assert(excluded.visits === 1, "filter off: real visits only");
  assert(excluded.practice_views === 1, "filter off: real practice views");
  assert(excluded.play_starts === 0, "filter off: test plays excluded");
  assert(excluded.excluded_test_sessions === 1, "excluded test sessions counted");
  assert(excluded.excluded_test_visitors === 1, "excluded test visitors counted");

  assert(included.visits === 2, "filter on: all visits");
  assert(included.practice_views === 2, "filter on: all practice views");
  assert(included.play_starts === 1, "filter on: test plays included");
}

function testZeroDivisionSafe() {
  resetData();
  const from = "2026-07-24T00:00:00Z";
  const to = "2026-07-25T00:00:00Z";
  const snap = snapshotJson(from, to, false);

  assert(snap.visits === 0, "empty period visits");
  assert(snap.play_starts === 0, "empty period plays");
  assert(snap.completions === 0, "empty period completions");
  assert(snap.registrations === 0, "empty period registrations");
  // Rate formatting is done in TS; SQL just returns zeros.
}

function testConversionDisplayContract() {
  // Keep SQL numbers aligned with UI Math.round contract.
  assert(Math.round((26 / 61) * 100) === 43, "UI contract 26/61 => 43%");
}

function main() {
  setupSchema();
  testSmallPeriod();
  testExact1000();
  test1001NoLoss();
  test1264AuditShape();
  testOver5000IndependentOfRowLimit();
  testSemiOpenBounds();
  testSharedBoundsAcrossCards();
  testTestFilterToggle();
  testZeroDivisionSafe();
  testConversionDisplayContract();
  console.log("admin-analytics-dashboard-snapshot-sql-unit: ok");
}

main();

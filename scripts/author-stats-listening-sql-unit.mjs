#!/usr/bin/env node
/**
 * Author listening-time SQL on an isolated database.
 * Uses the local Postgres superuser when Docker is not available.
 * Never touches a production database.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB = "audiolad_author_listening_test";
const CONTAINER = process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db";

function dockerAvailable() {
  try {
    const listed = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      encoding: "utf8",
    });
    return listed.split("\n").includes(CONTAINER);
  } catch {
    return false;
  }
}

const useDocker = dockerAvailable();

function psqlArgs(database, extra) {
  if (useDocker) {
    return ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", ...extra];
  }
  return ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", ...extra];
}

function psql(database, sql) {
  const command = useDocker ? "docker" : "sudo";
  return execFileSync(command, psqlArgs(database, ["-c", sql]), {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psqlFile(database, path) {
  const command = useDocker ? "docker" : "sudo";
  const args = useDocker
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"]
    : ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-f", path];
  if (useDocker) {
    execFileSync(command, args, {
      encoding: "utf8",
      input: readFileSync(path),
      maxBuffer: 20 * 1024 * 1024,
    });
    return;
  }
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function recreateDb() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB};`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
}

const bootstrap = `
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors(id),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  PRIMARY KEY (author_id, user_id)
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published'
);

CREATE TABLE public.analytics_sessions (
  id uuid PRIMARY KEY,
  anonymous_id text NOT NULL,
  user_id uuid NULL,
  utm_campaign text NULL,
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human'
);

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY,
  event_name text NOT NULL,
  practice_id uuid NULL,
  user_id uuid NULL,
  anonymous_session_id text NULL,
  session_id uuid NULL REFERENCES public.analytics_sessions(id),
  occurred_at timestamptz NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human'
);

CREATE TABLE public.playback_usage_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  listening_time_valid_from timestamptz NOT NULL
);

INSERT INTO public.playback_usage_settings (singleton, listening_time_valid_from)
VALUES (true, timestamptz '2026-09-26 00:00:00+03');

CREATE TABLE public.playback_usage_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL UNIQUE,
  sample_seq bigint NOT NULL CHECK (sample_seq >= 1),
  listening_key text NOT NULL,
  session_id uuid NULL REFERENCES public.analytics_sessions(id),
  user_id uuid NULL,
  anonymous_id text NULL,
  practice_id uuid NOT NULL,
  listened_ms bigint NOT NULL CHECK (listened_ms > 0),
  position_ms bigint NOT NULL CHECK (position_ms >= 0),
  phase text NOT NULL,
  occurred_at timestamptz NOT NULL,
  author_id_snapshot uuid NULL
);

CREATE OR REPLACE FUNCTION public.admin_analytics_visitor_key(
  p_user_id uuid,
  p_anonymous_id text,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_user_id IS NOT NULL THEN p_user_id::text
    WHEN nullif(btrim(coalesce(p_anonymous_id, '')), '') IS NOT NULL THEN btrim(p_anonymous_id)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_test_anonymous_id(p_anonymous_id text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN false
    ELSE (
      lower(btrim(p_anonymous_id)) LIKE 'aaaaaaaa%'
      OR lower(btrim(p_anonymous_id)) LIKE 'bbbbbbbb%'
      OR lower(btrim(p_anonymous_id)) LIKE 'manual-%'
      OR lower(btrim(p_anonymous_id)) LIKE 'test-%'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_analytics_test_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_test_analytics_session(
  p_utm_campaign text,
  p_anonymous_id text
)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(public.is_test_anonymous_id(p_anonymous_id), false)
    OR coalesce(lower(btrim(coalesce(p_utm_campaign, ''))), '') LIKE '%test%';
$$;

CREATE OR REPLACE FUNCTION public.analytics_product_event_facts(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS TABLE (event_name text, visitor_key text)
LANGUAGE sql STABLE AS $$
  SELECT
    e.event_name,
    public.admin_analytics_visitor_key(
      e.user_id,
      coalesce(s.anonymous_id, e.anonymous_session_id),
      e.occurred_at
    )
  FROM public.analytics_events AS e
  LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
  JOIN public.practices AS pr ON pr.id = e.practice_id
  WHERE (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at < p_to)
    AND (p_author_id IS NULL OR pr.author_id = p_author_id)
    AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
    AND e.event_name IN (
      'practice_view', 'audio_play_started', 'audio_progress_25',
      'audio_completed', 'first_manual_library_save'
    )
    AND (
      coalesce(p_include_test, false) OR NOT (
        coalesce(e.is_staff, false)
        OR coalesce(e.is_test, false)
        OR coalesce(e.is_bot, false)
        OR coalesce(e.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
        OR coalesce(s.is_staff, false)
        OR coalesce(s.is_test, false)
        OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
      )
    )
    AND (
      e.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.author_members AS am
        WHERE am.author_id = pr.author_id AND am.user_id = e.user_id
      )
    );
$$;
`;

function main() {
  recreateDb();
  psql(TEST_DB, bootstrap);
  psqlFile(TEST_DB, join(ROOT, "supabase/migrations/20261128120000_author_stats_listening_time.sql"));
  psqlFile(TEST_DB, join(ROOT, "supabase/tests/author_stats_listening_isolated.sql"));
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB};`);
  console.log("author-stats-listening-sql-unit: ok");
}

main();

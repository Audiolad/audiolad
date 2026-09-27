-- Minimal deps for isolated A3 Business Playback Attribution tests.
-- Never apply to production.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role BYPASSRLS;
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'Author',
  slug text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors(id),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  PRIMARY KEY (author_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors(id),
  title text NOT NULL DEFAULT 'Track',
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published',
  product_kind text NOT NULL DEFAULT 'music'
);

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Audio',
  audio_path text NOT NULL DEFAULT 'x.mp3',
  position integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL DEFAULT 'anon',
  user_id uuid NULL,
  utm_source text NULL,
  utm_campaign text NULL,
  device_type text NULL,
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human',
  started_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  practice_id uuid NULL,
  user_id uuid NULL,
  anonymous_session_id text NULL,
  session_id uuid NULL REFERENCES public.analytics_sessions(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  is_staff boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  is_bot boolean NOT NULL DEFAULT false,
  traffic_class text NOT NULL DEFAULT 'human'
);

CREATE OR REPLACE FUNCTION public.admin_analytics_visitor_key(
  p_user_id uuid,
  p_anonymous_id text,
  p_at timestamptz DEFAULT now()
) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_user_id IS NOT NULL THEN p_user_id::text
    WHEN nullif(btrim(coalesce(p_anonymous_id, '')), '') IS NOT NULL THEN btrim(p_anonymous_id)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_utm_matches(
  p_filter text,
  p_value text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(coalesce(p_filter, '')), '') IS NULL
    OR lower(btrim(coalesce(p_value, ''))) = lower(btrim(p_filter));
$$;

CREATE OR REPLACE FUNCTION public.is_test_anonymous_id(p_anonymous_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_analytics_test_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_test_analytics_session(p_utm_campaign text, p_anonymous_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.analytics_product_event_facts(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS TABLE (event_name text, visitor_key text)
LANGUAGE sql STABLE AS $$
  SELECT e.event_name::text, NULL::text
  FROM public.analytics_events AS e
  WHERE false;
$$;

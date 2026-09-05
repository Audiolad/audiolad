-- Minimal schema for isolated admin Ratings RPC + RLS tests.
-- Never apply to production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END
$roles$;

ALTER ROLE service_role BYPASSRLS;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  name text,
  slug text
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  title text,
  slug text,
  product_kind text,
  author_id uuid REFERENCES public.authors (id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id),
  full_name text,
  email text,
  created_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.practice_listen_stats (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  real_listened_ms bigint NOT NULL DEFAULT 0,
  rating_eligible_at timestamptz,
  PRIMARY KEY (user_id, practice_id)
);

GRANT ALL ON TABLE public.authors TO service_role;
GRANT ALL ON TABLE public.practices TO service_role;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.practice_listen_stats TO service_role;
GRANT ALL ON TABLE auth.users TO service_role;

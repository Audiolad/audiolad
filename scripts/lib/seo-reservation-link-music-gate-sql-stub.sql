-- Scratch schema for link_seo_reservation_to_product music-gate tests.
-- Never apply to production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

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
    CREATE ROLE anon NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors(id),
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (author_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors(id),
  title text NOT NULL DEFAULT 'Practice',
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  moderation_status text NOT NULL DEFAULT 'not_submitted',
  deleted_at timestamptz NULL,
  product_kind text NOT NULL DEFAULT 'practice',
  publication_class text NULL,
  seo_primary_query text NULL,
  primary_seo_query_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_queries (
  id uuid PRIMARY KEY,
  query_text text NOT NULL,
  normalized_query text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_primary_seo_query_id_fkey;
ALTER TABLE public.practices
  ADD CONSTRAINT practices_primary_seo_query_id_fkey
  FOREIGN KEY (primary_seo_query_id) REFERENCES public.seo_queries(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.seo_query_reservations (
  id uuid PRIMARY KEY,
  query_id uuid NOT NULL REFERENCES public.seo_queries(id),
  author_id uuid NOT NULL REFERENCES public.authors(id),
  product_id uuid NULL REFERENCES public.practices(id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  released_at timestamptz NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.guard_practice_primary_seo_query()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (
    (TG_OP = 'INSERT' AND NEW.primary_seo_query_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.primary_seo_query_id IS DISTINCT FROM OLD.primary_seo_query_id)
  ) AND current_setting('audiolad.allow_primary_seo_query_link', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'primary_seo_query_requires_rpc' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practices_primary_seo_query_guard ON public.practices;
CREATE TRIGGER practices_primary_seo_query_guard
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_primary_seo_query();

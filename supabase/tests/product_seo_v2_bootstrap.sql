-- Minimal disposable PostgreSQL schema for Product SEO v2 smoke tests.
-- It mirrors the production contracts consumed by the two Product SEO v2
-- migrations without loading any production data or Supabase services.
\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  author_type text NOT NULL DEFAULT 'person',
  access_status text NOT NULL DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.authors (id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published',
  is_free boolean NOT NULL DEFAULT false,
  price integer NOT NULL DEFAULT 0,
  is_catalog_listed boolean NOT NULL DEFAULT true,
  catalog_visibility text NOT NULL DEFAULT 'listed',
  deleted_at timestamptz NULL,
  seo_primary_query text NULL,
  seo_title text NULL,
  seo_description text NULL,
  CONSTRAINT practices_catalog_visibility_check
    CHECK (catalog_visibility IN ('listed', 'unlisted', 'selected_users'))
);

CREATE TABLE IF NOT EXISTS public.author_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor',
  CONSTRAINT author_members_role_check CHECK (role IN ('owner', 'editor')),
  CONSTRAINT author_members_author_user_unique UNIQUE (author_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_practice_author_member(
  p_practice_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    JOIN public.author_members AS am ON am.author_id = p.author_id
    WHERE p.id = p_practice_id
      AND am.user_id = p_user_id
      AND am.role IN ('owner', 'editor')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(
  p_user_id uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT false;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC;
GRANT SELECT ON TABLE public.practices TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_practice_author_member(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid, text)
  TO authenticated, service_role;

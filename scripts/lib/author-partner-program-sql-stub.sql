-- Minimal schema for isolated author partner program tests.
-- Never apply to production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'author',
  slug text
);

CREATE TABLE IF NOT EXISTS public.author_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_id, user_id),
  CONSTRAINT author_members_role_check CHECK (role IN ('owner', 'editor'))
);

GRANT SELECT ON TABLE public.authors TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.author_members TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  author_project_limit_override integer,
  author_projects_unlimited boolean NOT NULL DEFAULT false,
  author_premium_enabled boolean NOT NULL DEFAULT false,
  author_project_slots_purchased integer NOT NULL DEFAULT 0
);

-- Optional columns used by create/approve/studio bodies in activation smoke.
ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS author_type text,
  ADD COLUMN IF NOT EXISTS access_status text,
  ADD COLUMN IF NOT EXISTS short_bio text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS access_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_status_changed_by uuid;
CREATE UNIQUE INDEX IF NOT EXISTS authors_slug_key ON public.authors (slug);
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.author_slug_redirects (
  old_slug text PRIMARY KEY,
  author_id uuid REFERENCES public.authors (id) ON DELETE CASCADE
);

-- Needed so PR3 can CREATE OR REPLACE approve_author_application (%ROWTYPE).
CREATE TABLE IF NOT EXISTS public.author_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Applicant',
  status text NOT NULL DEFAULT 'submitted',
  author_id uuid NULL REFERENCES public.authors (id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  admin_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  actor_user_id uuid,
  target_auth_user_id uuid,
  target_email_hash text,
  counts jsonb,
  status text
);

-- Minimal helpers referenced by create_author_project / approve / studio bodies.
CREATE OR REPLACE FUNCTION public.slugify_author_display_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(lower(regexp_replace(btrim(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.allocate_unique_author_slug(p_name text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_base text := coalesce(public.slugify_author_display_name(p_name), 'author');
  v_slug text := v_base;
  v_i int := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.authors WHERE slug = v_slug)
     OR EXISTS (SELECT 1 FROM public.author_slug_redirects WHERE old_slug = v_slug) LOOP
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i::text;
  END LOOP;
  RETURN v_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_author_slug_namespace_lock(p_slug text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('author_slug:' || coalesce(p_slug, ''), 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_user_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(p_user_id uuid, p_permission text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_user_id IS NOT NULL AND p_permission IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.log_author_application_status_event(
  p_application_id uuid,
  p_from_status text,
  p_to_status text,
  p_actor uuid,
  p_comment text,
  p_meta jsonb
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_author_access_status_event(
  p_author_id uuid,
  p_from_status text,
  p_to_status text,
  p_actor uuid,
  p_comment text,
  p_application_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RETURN;
END;
$$;

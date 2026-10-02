-- Scratch schema for admin_release_seo_query_reservation. Never apply to production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  moderation_status text NOT NULL DEFAULT 'not_submitted',
  seo_primary_query text NULL,
  primary_seo_query_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_queries (
  id uuid PRIMARY KEY,
  query_text text NOT NULL,
  normalized_query text NOT NULL UNIQUE
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_query_reservations_status_check CHECK (
    status IN ('active', 'released', 'used')
  ),
  CONSTRAINT seo_query_reservations_released_check CHECK (
    (status = 'released') = (released_at IS NOT NULL)
  ),
  CONSTRAINT seo_query_reservations_product_active_check CHECK (
    product_id IS NULL OR status IN ('active', 'used')
  )
);

CREATE TABLE IF NOT EXISTS public.test_platform_permissions (
  user_id uuid NOT NULL,
  permission_code text NOT NULL,
  PRIMARY KEY (user_id, permission_code)
);

CREATE OR REPLACE FUNCTION public.has_platform_permission(
  p_user_id uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.test_platform_permissions
    WHERE user_id = p_user_id
      AND permission_code = p_permission_code
  )
$$;

CREATE OR REPLACE FUNCTION public.guard_practice_primary_seo_query()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canonical text;
BEGIN
  IF (
    (TG_OP = 'INSERT' AND NEW.primary_seo_query_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.primary_seo_query_id IS DISTINCT FROM OLD.primary_seo_query_id)
  ) AND current_setting('audiolad.allow_primary_seo_query_link', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'primary_seo_query_requires_rpc' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.primary_seo_query_id IS NOT NULL
     AND NEW.seo_primary_query IS DISTINCT FROM OLD.seo_primary_query
     AND current_setting('audiolad.allow_primary_seo_query_link', true) IS DISTINCT FROM 'on' THEN
    SELECT query_text INTO v_canonical
    FROM public.seo_queries
    WHERE id = NEW.primary_seo_query_id;

    IF NOT FOUND OR NEW.seo_primary_query IS DISTINCT FROM v_canonical THEN
      RAISE EXCEPTION 'linked_primary_seo_query_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practices_primary_seo_query_guard ON public.practices;
CREATE TRIGGER practices_primary_seo_query_guard
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_primary_seo_query();

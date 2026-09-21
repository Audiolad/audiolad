-- Minimal stub for admin_review_seo_query_proposal isolated tests.
-- Never apply to production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END
$roles$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.authors(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Practice',
  slug text NOT NULL DEFAULT 'practice',
  status text NOT NULL DEFAULT 'draft',
  deleted_at timestamptz NULL,
  product_kind text NOT NULL DEFAULT 'practice',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  normalized_query text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  frequency integer NULL,
  intent text NULL,
  recommended_format text NULL,
  audio_fit text NULL,
  analysis_status text NOT NULL DEFAULT 'not_analyzed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_queries_analysis_status_check CHECK (
    analysis_status IN ('not_analyzed', 'analyzed', 'not_applicable')
  ),
  CONSTRAINT seo_queries_normalized_query_unique UNIQUE (normalized_query)
);

CREATE TABLE IF NOT EXISTS public.seo_query_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.seo_queries(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  product_id uuid NULL REFERENCES public.practices(id) ON DELETE SET NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  released_at timestamptz NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_query_reservations_status_check CHECK (
    status IN ('active', 'released', 'used')
  ),
  CONSTRAINT seo_query_reservations_expiry_check CHECK (
    expires_at IS NULL OR expires_at > reserved_at
  ),
  CONSTRAINT seo_query_reservations_released_check CHECK (
    (status = 'released') = (released_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS seo_query_reservations_one_open_or_used_query_idx
  ON public.seo_query_reservations(query_id)
  WHERE status IN ('active', 'used');

CREATE TABLE IF NOT EXISTS public.seo_query_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.seo_queries(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_query_proposals_query_author_unique UNIQUE (query_id, author_id)
);

CREATE OR REPLACE FUNCTION public.normalize_seo_query(p_query text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(lower(translate(p_query, 'Ёё', 'Ее')), '[[:punct:]]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.set_seo_query_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.query_text := btrim(NEW.query_text);
  NEW.normalized_query := public.normalize_seo_query(NEW.query_text);
  IF NEW.normalized_query = '' THEN
    RAISE EXCEPTION 'seo_query_empty' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seo_queries_normalize_before_write ON public.seo_queries;
CREATE TRIGGER seo_queries_normalize_before_write
  BEFORE INSERT OR UPDATE OF query_text ON public.seo_queries
  FOR EACH ROW EXECUTE FUNCTION public.set_seo_query_normalized();

CREATE OR REPLACE FUNCTION public.expire_seo_query_reservation(
  p_query_id uuid DEFAULT NULL,
  p_author_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.seo_query_reservations
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE status = 'active'
    AND product_id IS NULL
    AND expires_at IS NOT NULL
    AND expires_at <= now()
    AND (p_query_id IS NULL OR query_id = p_query_id)
    AND (p_author_id IS NULL OR author_id = p_author_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

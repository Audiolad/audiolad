-- Minimal stub for attach_published_seo_query_to_product isolated tests.
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
  product_kind text NOT NULL DEFAULT 'practice'
    CHECK (product_kind IN ('practice', 'music')),
  seo_primary_query text NULL,
  primary_seo_query_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practices_seo_primary_query_length_check CHECK (
    seo_primary_query IS NULL OR char_length(btrim(seo_primary_query)) <= 120
  )
);

CREATE TABLE IF NOT EXISTS public.seo_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  normalized_query text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  frequency integer NULL,
  frequency_checked_at timestamptz NULL,
  cluster_id uuid NULL REFERENCES public.seo_clusters(id) ON DELETE SET NULL,
  intent text NULL,
  recommended_format text NULL,
  audio_fit text NULL,
  analysis_status text NOT NULL DEFAULT 'not_analyzed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_queries_query_text_not_blank CHECK (btrim(query_text) <> ''),
  CONSTRAINT seo_queries_source_check CHECK (
    source IN ('manual', 'wordstat', 'search_console', 'yandex_webmaster', 'other')
  ),
  CONSTRAINT seo_queries_frequency_non_negative CHECK (
    frequency IS NULL OR frequency >= 0
  ),
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
  ),
  CONSTRAINT seo_query_reservations_product_active_check CHECK (
    product_id IS NULL OR status IN ('active', 'used')
  )
);

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_primary_seo_query_id_fkey;
ALTER TABLE public.practices
  ADD CONSTRAINT practices_primary_seo_query_id_fkey
  FOREIGN KEY (primary_seo_query_id) REFERENCES public.seo_queries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS seo_query_reservations_one_open_or_used_query_idx
  ON public.seo_query_reservations(query_id)
  WHERE status IN ('active', 'used');
CREATE UNIQUE INDEX IF NOT EXISTS practices_primary_seo_query_unique_idx
  ON public.practices(primary_seo_query_id)
  WHERE primary_seo_query_id IS NOT NULL;

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

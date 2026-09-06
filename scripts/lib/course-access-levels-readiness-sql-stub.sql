-- Minimal schema for isolated assert_practice_moderation_ready access-level tests.
-- Never apply to production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'author',
  access_status text NOT NULL DEFAULT 'free'
);

CREATE OR REPLACE FUNCTION public.author_access_allows_content_mutations(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IS DISTINCT FROM 'suspended'
     AND p_status IS DISTINCT FROM 'terminated'
$$;

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors (id),
  title text NOT NULL DEFAULT 'practice',
  publication_class text NULL,
  product_kind text NULL,
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  required_access_level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_lesson_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.course_lessons (id) ON DELETE CASCADE,
  type text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_id uuid NULL
);

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  audio_path text NULL,
  duration_seconds integer NULL
);

CREATE TABLE IF NOT EXISTS public.publication_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  storage_path text NULL,
  original_name text NULL,
  size_bytes integer NULL
);

CREATE TABLE IF NOT EXISTS public.practice_access_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  level integer NOT NULL,
  title text NOT NULL,
  description text NULL,
  upgrade_price integer NULL,
  currency text NOT NULL DEFAULT 'RUB',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, level)
);

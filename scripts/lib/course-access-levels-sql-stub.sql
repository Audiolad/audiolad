-- Minimal pre-Phase-1 schema for isolated course access-level tests.
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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'author'
);

CREATE TABLE IF NOT EXISTS public.author_members (
  author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  UNIQUE (author_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors (id),
  title text NOT NULL DEFAULT 'practice',
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'published',
  price integer NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'RUB',
  publication_class text NULL,
  deleted_at timestamptz NULL,
  CONSTRAINT practices_currency_rub_check CHECK (currency = 'RUB')
);

CREATE TABLE IF NOT EXISTS public.user_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  access_source text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_practices_user_practice_unique UNIQUE (user_id, practice_id),
  CONSTRAINT user_practices_access_source_check
    CHECK (access_source IN (
      'starter',
      'free_claim',
      'purchase',
      'gift',
      'subscription',
      'program',
      'admin'
    ))
);

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  practice_id uuid NOT NULL REFERENCES public.practices (id),
  status text NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RUB',
  practice_title_snapshot text NOT NULL DEFAULT 'practice',
  practice_slug_snapshot text NOT NULL DEFAULT 'practice',
  price_minor_snapshot bigint NOT NULL DEFAULT 0,
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_practices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_practices FROM PUBLIC;
REVOKE ALL ON TABLE public.user_practices FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_practices TO authenticated;
GRANT ALL ON TABLE public.user_practices TO service_role;

DROP POLICY IF EXISTS "Users can view own library" ON public.user_practices;
CREATE POLICY "Users can view own library"
  ON public.user_practices
  FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT ON TABLE public.practices TO authenticated;
GRANT SELECT ON TABLE public.author_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_lessons TO authenticated;
GRANT ALL ON TABLE public.course_lessons TO service_role;
GRANT ALL ON TABLE public.orders TO service_role;

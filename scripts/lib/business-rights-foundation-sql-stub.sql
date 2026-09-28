-- Minimal deps for isolated A4 Music Rights Foundation tests.
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
  product_kind text NOT NULL DEFAULT 'music',
  music_usage_permission text NULL,
  platform_reuse_allowed boolean NULL
);

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Audio',
  audio_path text NOT NULL DEFAULT 'x.mp3',
  position integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published',
  music_track_code text NULL
);

-- Sentinel: Studio / catalog fields exist in stub but A4 must not auto-convert them.
COMMENT ON COLUMN public.practices.music_usage_permission IS
  'Studio/catalog permission listen_only|platform_reuse_allowed — NOT B2B Rights Grant.';

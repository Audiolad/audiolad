-- Minimal stubs for the practice-covers storage policy smoke test.
-- Safe on a plain PostgreSQL cluster and on a scratch database inside the
-- supabase/postgres image (roles already exist there).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets (id),
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.author_members (
  author_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL
);

GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT SELECT ON public.practices, public.author_members TO anon, authenticated, service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('practice-covers', 'practice-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Fixtures: practice P1 owned by author A1; U1 = editor of A1, U2 = stranger.
INSERT INTO public.practices (id, author_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.author_members (author_id, user_id, role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'editor'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'viewer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'owner');

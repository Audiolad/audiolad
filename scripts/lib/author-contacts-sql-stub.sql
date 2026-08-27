-- Minimal schema for isolated author_contacts RLS/constraint tests.
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

GRANT SELECT ON TABLE public.author_members TO anon, authenticated, service_role;

-- Existing author-assets storage RLS (from 20260717160000), isolated here so
-- contact icon paths authors/{author_id}/contacts/... can be proven against
-- the same split_part(name, '/', 2) membership rule. Never applied to production.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read author assets" ON storage.objects;
CREATE POLICY "Public can read author assets"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'author-assets');

DROP POLICY IF EXISTS "Author members can upload author assets" ON storage.objects;
CREATE POLICY "Author members can upload author assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can update author assets" ON storage.objects;
CREATE POLICY "Author members can update author assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can delete author assets" ON storage.objects;
CREATE POLICY "Author members can delete author assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'author-assets'
    AND EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = split_part(name, '/', 2)::uuid
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON TABLE storage.objects TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE storage.objects TO authenticated, service_role;

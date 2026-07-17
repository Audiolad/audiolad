BEGIN;

-- ---------------------------------------------------------------------------
-- Listener profile avatars
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text NULL,
  ADD COLUMN IF NOT EXISTS avatar_path text NULL;

COMMENT ON COLUMN public.profiles.avatar_url IS
  'Signed or public URL for the user avatar; may include cache-busting query.';

COMMENT ON COLUMN public.profiles.avatar_path IS
  'Storage object path in user-avatars bucket: {user_id}/{file_id}.webp';

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Required table storage.buckets does not exist';
  END IF;
END;
$$;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'user-avatars',
  'user-avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own avatar" ON storage.objects;
CREATE POLICY "Users can read own avatar"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

COMMIT;

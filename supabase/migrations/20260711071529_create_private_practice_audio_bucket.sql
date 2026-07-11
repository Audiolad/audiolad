BEGIN;

-- ---------------------------------------------------------------------------
-- Private practice audio storage (bucket + entitlement-aware SELECT policy)
-- Object path convention: practices/{practice_id}/audio.mp3
-- Bucket: practice-audio (private, audio/mpeg only, 100 MiB max)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bucket_exists_count integer;
  policy_exists_count integer;
  objects_rls_enabled boolean;
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Required table storage.buckets does not exist';
  END IF;

  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Required table storage.objects does not exist';
  END IF;

  IF to_regclass('public.user_practices') IS NULL THEN
    RAISE EXCEPTION 'Required table public.user_practices does not exist';
  END IF;

  IF to_regclass('public.practices') IS NULL THEN
    RAISE EXCEPTION 'Required table public.practices does not exist';
  END IF;

  SELECT count(*)
  INTO bucket_exists_count
  FROM storage.buckets
  WHERE id = 'practice-audio';

  IF bucket_exists_count > 0 THEN
    RAISE EXCEPTION 'Bucket practice-audio already exists';
  END IF;

  SELECT count(*)
  INTO policy_exists_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Authenticated users can read entitled practice audio';

  IF policy_exists_count > 0 THEN
    RAISE EXCEPTION 'Storage policy "Authenticated users can read entitled practice audio" already exists';
  END IF;

  SELECT c.relrowsecurity
  INTO objects_rls_enabled
  FROM pg_class AS c
  INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects';

  IF objects_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Row level security must be enabled on storage.objects';
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
  'practice-audio',
  'practice-audio',
  false,
  104857600,
  ARRAY['audio/mpeg']::text[]
);

CREATE POLICY "Authenticated users can read entitled practice audio"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'practice-audio'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_practices AS up
      WHERE up.user_id = auth.uid()
        AND up.practice_id::text = split_part(name, '/', 2)
        AND (
          up.expires_at IS NULL
          OR up.expires_at > now()
        )
    )
  );

DO $$
DECLARE
  bucket_public boolean;
  bucket_file_size_limit bigint;
  bucket_allowed_mime_types text[];
  select_policy_count integer;
  write_policy_count integer;
  object_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'practice-audio'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: bucket practice-audio was not created';
  END IF;

  SELECT public, file_size_limit, allowed_mime_types
  INTO bucket_public, bucket_file_size_limit, bucket_allowed_mime_types
  FROM storage.buckets
  WHERE id = 'practice-audio';

  IF bucket_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Post-check failed: bucket practice-audio must be private';
  END IF;

  IF bucket_file_size_limit IS DISTINCT FROM 104857600::bigint THEN
    RAISE EXCEPTION 'Post-check failed: bucket file_size_limit must be 104857600 bytes';
  END IF;

  IF bucket_allowed_mime_types IS DISTINCT FROM ARRAY['audio/mpeg']::text[] THEN
    RAISE EXCEPTION 'Post-check failed: bucket allowed_mime_types must contain only audio/mpeg';
  END IF;

  SELECT count(*)
  INTO select_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Authenticated users can read entitled practice audio'
    AND cmd = 'SELECT';

  IF select_policy_count <> 1 THEN
    RAISE EXCEPTION 'Post-check failed: SELECT policy was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read entitled practice audio'
      AND 'authenticated' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'Post-check failed: SELECT policy must apply to authenticated role';
  END IF;

  SELECT count(*)
  INTO write_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

  IF write_policy_count > 0 THEN
    RAISE EXCEPTION 'Post-check failed: unexpected INSERT/UPDATE/DELETE policies on storage.objects';
  END IF;

  SELECT count(*)
  INTO object_count
  FROM storage.objects
  WHERE bucket_id = 'practice-audio';

  IF object_count > 0 THEN
    RAISE EXCEPTION 'Post-check failed: bucket practice-audio must start empty';
  END IF;
END;
$$;

COMMIT;

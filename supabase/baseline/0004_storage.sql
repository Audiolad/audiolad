-- BASELINE FOR EMPTY DATABASES ONLY.
-- DO NOT APPLY TO THE EXISTING PRODUCTION DATABASE.
--
-- Storage bucket and entitlement-aware SELECT policy for practice audio.
-- Prerequisites:
--   - Supabase storage schema (storage.buckets, storage.objects)
--   - 0001_core_schema.sql and 0003_rls_and_policies.sql applied
-- Does NOT include audio files.

BEGIN;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Required table storage.buckets does not exist (Supabase storage schema required)';
  END IF;

  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Required table storage.objects does not exist (Supabase storage schema required)';
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
)
ON CONFLICT (id) DO NOTHING;

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

COMMIT;

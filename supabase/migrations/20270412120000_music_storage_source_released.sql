BEGIN;

ALTER TABLE public.music_storage_copies
  ADD COLUMN IF NOT EXISTS source_released_at timestamptz NULL;

COMMENT ON COLUMN public.music_storage_copies.source_released_at IS
  'Set after the Supabase master copy was deleted post-cutover. S3 remains canonical.';

CREATE INDEX IF NOT EXISTS music_storage_copies_cutover_release_idx
  ON public.music_storage_copies (status, source_released_at)
  WHERE target_provider = 'timeweb_s3';

COMMIT;
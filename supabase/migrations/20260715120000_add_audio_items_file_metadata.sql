-- Persist original MP3 filename and file size on audio_items.
-- Idempotent. Nullable for legacy rows and empty draft slots.

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS original_file_name text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audio_items_file_size_bytes_non_negative_check'
  ) THEN
    ALTER TABLE public.audio_items
      ADD CONSTRAINT audio_items_file_size_bytes_non_negative_check
        CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.audio_items.original_file_name IS
  'Original client filename at upload time, including extension.';

COMMENT ON COLUMN public.audio_items.file_size_bytes IS
  'Original uploaded file size in bytes.';

-- Tighten playlists.description max length from 1000 to 300.
-- Additive constraint only. Do NOT truncate existing text.
-- Fail-closed: if any row is already longer than 300 characters, abort
-- so production can inspect those rows before applying.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE description IS NOT NULL
      AND char_length(description) > 300
  ) THEN
    RAISE EXCEPTION
      'playlists.description has rows longer than 300 characters; refusing to add the tighter CHECK without an explicit data decision'
      USING ERRCODE = '23514';
  END IF;
END
$$;

ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS playlists_description_length_check;

ALTER TABLE public.playlists
  ADD CONSTRAINT playlists_description_length_check
  CHECK (
    description IS NULL
    OR char_length(description) <= 300
  );

COMMENT ON COLUMN public.playlists.description IS
  'Optional playlist description. Max 300 characters. NULL allowed.';

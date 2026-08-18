-- Music playlist items: multiple audio_item_id values from one practice
-- stay independent rows. Isolated test DB only.
--
-- Requires playlists + audio_items schema through
-- 20260818180000_playlist_item_audio_track.sql.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regprocedure('public.add_editorial_playlist_practices(uuid,uuid[],uuid[])') IS NULL THEN
    RAISE EXCEPTION '3-arg add_editorial_playlist_practices missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlist_items'
      AND column_name = 'audio_item_id'
  ) THEN
    RAISE EXCEPTION 'playlist_items.audio_item_id missing';
  END IF;
END;
$$;

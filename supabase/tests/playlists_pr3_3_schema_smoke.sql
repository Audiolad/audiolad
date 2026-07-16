-- Playlists PR3.3 schema smoke on isolated test DB.
-- Expects playlists PR1+PR3 applied and this migration applied.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'playlists' AND column_name = 'cover_path'
  ) THEN
    RAISE EXCEPTION 'cover_path missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'playlists' AND column_name = 'cover_updated_at'
  ) THEN
    RAISE EXCEPTION 'cover_updated_at missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'playlists' AND column_name = 'cover_path'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'cover_path must be nullable';
  END IF;

  IF to_regprocedure('public.get_owned_playlist_mosaic_covers()') IS NULL THEN
    RAISE EXCEPTION 'mosaic RPC missing';
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'playlist-covers') THEN
      RAISE EXCEPTION 'playlist-covers bucket missing in this database';
    END IF;

    IF EXISTS (
      SELECT 1 FROM storage.buckets WHERE id = 'playlist-covers' AND public IS TRUE
    ) THEN
      RAISE EXCEPTION 'playlist-covers must be private';
    END IF;
  END IF;
END;
$$;

SELECT 'PR3_3_SCHEMA_SMOKE_PASS' AS result;

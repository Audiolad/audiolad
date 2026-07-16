-- Playlists PR3.3: custom cover path + private playlist-covers bucket.
-- Idempotent. Apply to production only after review/backup approval.
-- Storage path convention: {user_id}/{playlist_id}/{uuid}.webp
-- cover_path NULL => automatic UI mosaic from product covers.
-- Browser has no storage.objects policies: signed URLs via server (service role).

-- ---------------------------------------------------------------------------
-- playlists: custom cover columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS cover_path text;

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS cover_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'playlists_cover_path_nonempty_check'
  ) THEN
    ALTER TABLE public.playlists
      ADD CONSTRAINT playlists_cover_path_nonempty_check
      CHECK (cover_path IS NULL OR char_length(btrim(cover_path)) > 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.playlists.cover_path IS
  'Private storage object path in playlist-covers bucket. NULL = automatic mosaic.';
COMMENT ON COLUMN public.playlists.cover_updated_at IS
  'Timestamp of last custom cover upload/replace. NULL when using automatic mosaic.';

-- ---------------------------------------------------------------------------
-- Storage bucket playlist-covers (private, service-role writes via API)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'playlist-covers'
  ) THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'playlist-covers',
      'playlist-covers',
      false,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    );
  END IF;
END;
$$;

-- No anon/authenticated storage.objects policies for playlist-covers.
-- Upload/delete/signed URL only through server after session ownership checks.

-- ---------------------------------------------------------------------------
-- Mosaic sources: first 4 item covers per owned playlist (avoid N+1 / full scan)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_owned_playlist_mosaic_covers()
RETURNS TABLE (
  playlist_id uuid,
  item_position integer,
  cover_url text,
  practice_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    pl.id AS playlist_id,
    src.item_position,
    pr.cover_url,
    pr.updated_at AS practice_updated_at
  FROM public.playlists AS pl
  CROSS JOIN LATERAL (
    SELECT pi.practice_id, pi.position AS item_position
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = pl.id
    ORDER BY pi.position ASC
    LIMIT 4
  ) AS src
  INNER JOIN public.practices AS pr
    ON pr.id = src.practice_id
  WHERE pl.user_id = auth.uid()
  ORDER BY pl.id, src.item_position ASC;
$$;

REVOKE ALL ON FUNCTION public.get_owned_playlist_mosaic_covers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owned_playlist_mosaic_covers() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_owned_playlist_mosaic_covers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owned_playlist_mosaic_covers() TO service_role;

COMMENT ON FUNCTION public.get_owned_playlist_mosaic_covers() IS
  'PR3.3: first four playlist item product cover URLs for auth.uid() owner only (SECURITY DEFINER; automatic mosaic).';

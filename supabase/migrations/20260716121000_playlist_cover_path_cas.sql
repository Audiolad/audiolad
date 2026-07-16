-- Playlists PR3.3 follow-up: cover path compare-and-swap + drop unused Storage SELECT policy.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Drop browser SELECT policy if an earlier draft created it (not needed:
-- covers are served only via server-generated signed URLs).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Playlist owners can read own playlist covers'
  ) THEN
    DROP POLICY "Playlist owners can read own playlist covers" ON storage.objects;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Compare-and-swap cover_path (serialize concurrent replace/clear)
-- p_new_path NULL => clear custom cover (return to automatic mosaic)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_playlist_cover_path(
  p_playlist_id uuid,
  p_expected_old_path text,
  p_new_path text
)
RETURNS TABLE (
  status text,
  previous_path text,
  cover_path text,
  cover_updated_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.playlists%ROWTYPE;
  v_expected text;
  v_new text;
  v_now timestamptz := clock_timestamp();
  v_path_re constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$';
BEGIN
  IF v_user_id IS NULL THEN
    status := 'unauthorized';
    previous_path := NULL;
    cover_path := NULL;
    cover_updated_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_playlist_id IS NULL THEN
    status := 'not_found';
    previous_path := NULL;
    cover_path := NULL;
    cover_updated_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_expected := NULLIF(btrim(COALESCE(p_expected_old_path, '')), '');
  v_new := NULLIF(btrim(COALESCE(p_new_path, '')), '');

  SELECT *
  INTO v_row
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    status := 'not_found';
    previous_path := NULL;
    cover_path := NULL;
    cover_updated_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.user_id IS DISTINCT FROM v_user_id THEN
    -- Neutral not_found (do not reveal foreign playlist existence).
    status := 'not_found';
    previous_path := NULL;
    cover_path := NULL;
    cover_updated_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_new IS NOT NULL THEN
    IF v_new !~* v_path_re THEN
      RAISE EXCEPTION 'invalid_cover_path' USING ERRCODE = '22023';
    END IF;

    IF split_part(v_new, '/', 1) IS DISTINCT FROM v_user_id::text
       OR split_part(v_new, '/', 2) IS DISTINCT FROM p_playlist_id::text THEN
      RAISE EXCEPTION 'invalid_cover_path_owner' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_expected IS NOT NULL AND v_expected !~* v_path_re THEN
    RAISE EXCEPTION 'invalid_expected_cover_path' USING ERRCODE = '22023';
  END IF;

  IF v_row.cover_path IS DISTINCT FROM v_expected THEN
    status := 'conflict';
    previous_path := v_row.cover_path;
    cover_path := v_row.cover_path;
    cover_updated_at := v_row.cover_updated_at;
    updated_at := v_row.updated_at;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Idempotent no-op (same path or already cleared).
  IF v_row.cover_path IS NOT DISTINCT FROM v_new THEN
    status := 'ok';
    previous_path := v_row.cover_path;
    cover_path := v_row.cover_path;
    cover_updated_at := v_row.cover_updated_at;
    updated_at := v_row.updated_at;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.playlists AS pl
  SET
    cover_path = v_new,
    cover_updated_at = CASE WHEN v_new IS NULL THEN NULL ELSE v_now END,
    updated_at = v_now
  WHERE pl.id = p_playlist_id
  RETURNING * INTO v_row;

  status := 'ok';
  previous_path := v_expected;
  cover_path := v_row.cover_path;
  cover_updated_at := v_row.cover_updated_at;
  updated_at := v_row.updated_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_playlist_cover_path(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_playlist_cover_path(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_playlist_cover_path(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_playlist_cover_path(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.replace_playlist_cover_path(uuid, text, text) IS
  'PR3.3: atomic cover_path compare-and-swap for playlist owner (auth.uid()); p_new_path NULL clears custom cover.';

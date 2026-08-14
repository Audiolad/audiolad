BEGIN;

-- =============================================================================
-- Stage 2: atomic replace of one editorial playlist item
-- Additive. Does not change Stage 1 ownership, RLS, or collaborator model.
-- Needed because UNIQUE (playlist_id, practice_id) + UNIQUE (playlist_id, position)
-- make delete+add+move unsafe for "keep position 3, swap product A → B".
-- Do not apply to production until review.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_playlist_item(
  p_playlist_id uuid,
  p_old_practice_id uuid,
  p_new_practice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_playlist public.playlists%ROWTYPE;
  v_item public.playlist_items%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_audio_count integer;
  v_has_new boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_playlist_id IS NULL THEN
    RAISE EXCEPTION 'playlist_id_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_old_practice_id IS NULL OR p_new_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT pl.*
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_user_edit_playlist(v_playlist.id, v_user_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_playlist.is_editorial IS NOT TRUE
    OR v_playlist.owner_type IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'not_editorial_playlist'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pi.*
  INTO v_item
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = v_playlist.id
    AND pi.practice_id = p_old_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_old_practice_id = p_new_practice_id THEN
    RETURN jsonb_build_object(
      'playlist_id', v_playlist.id,
      'position', v_item.position,
      'old_practice_id', p_old_practice_id,
      'new_practice_id', p_new_practice_id,
      'replaced', false
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = v_playlist.id
      AND pi.practice_id = p_new_practice_id
  )
  INTO v_has_new;

  IF v_has_new THEN
    RAISE EXCEPTION 'already_in_playlist'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_new_practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.is_catalog_listed IS NOT TRUE THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.slug IS NULL OR btrim(v_practice.slug) = '' THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  IF v_practice.author_id IS NULL THEN
    RAISE EXCEPTION 'practice_not_publishable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  SELECT count(*)
  INTO v_audio_count
  FROM public.audio_items AS ai
  WHERE ai.practice_id = v_practice.id
    AND ai.status = 'published';

  IF v_audio_count = 0
    AND (
      v_practice.audio_url IS NULL
      OR btrim(v_practice.audio_url) = ''
    ) THEN
    RAISE EXCEPTION 'practice_not_playable'
      USING ERRCODE = 'P0001',
        DETAIL = format('practice_id=%s', p_new_practice_id);
  END IF;

  UPDATE public.playlist_items
  SET practice_id = p_new_practice_id
  WHERE id = v_item.id
    AND playlist_id = v_playlist.id
    AND position = v_item.position;

  UPDATE public.playlists
  SET updated_at = clock_timestamp()
  WHERE id = v_playlist.id;

  PERFORM public.log_playlist_audit(
    v_playlist.id,
    'item_replaced',
    jsonb_build_object(
      'old_practice_id', p_old_practice_id,
      'new_practice_id', p_new_practice_id,
      'position', v_item.position
    )
  );

  RETURN jsonb_build_object(
    'playlist_id', v_playlist.id,
    'position', v_item.position,
    'old_practice_id', p_old_practice_id,
    'new_practice_id', p_new_practice_id,
    'replaced', true
  );
END;
$$;

COMMENT ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid) IS
  'Atomic editorial item replace: keep position, swap practice_id. playlists.manage or collaborator. Same eligibility as add_editorial_playlist_practices. Audits item_replaced once.';

GRANT EXECUTE ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.replace_playlist_item(uuid, uuid, uuid)
  FROM anon;

DO $$
BEGIN
  IF to_regprocedure('public.replace_playlist_item(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: replace_playlist_item missing';
  END IF;
END;
$$;

COMMIT;

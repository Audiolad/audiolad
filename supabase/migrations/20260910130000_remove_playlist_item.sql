BEGIN;

-- =============================================================================
-- Atomic playlist item remove (product row or concrete audio_item track).
-- Direct JWT DELETE on playlist_items fires touch_playlist_listing_aggregates
-- as SECURITY INVOKER; authenticated cannot EXECUTE
-- refresh_playlist_listing_aggregates, so the DELETE rolls back with 500.
-- Add/move/replace already go through SECURITY DEFINER RPCs. Same authority:
-- can_user_edit_playlist (user owner, playlists.manage, collaborator,
-- direction_editor). Do not weaken table RLS.
-- Do not apply to production until review.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_playlist_item(
  p_playlist_id uuid,
  p_practice_id uuid,
  p_audio_item_id uuid DEFAULT NULL
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
  v_max_pos integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_playlist_id IS NULL OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_user_edit_playlist(p_playlist_id, v_user_id) THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_item
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id
    AND pi.practice_id = p_practice_id
    AND pi.audio_item_id IS NOT DISTINCT FROM p_audio_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.playlist_items
  WHERE id = v_item.id;

  SELECT COALESCE(MAX(pi.position), 0)
  INTO v_max_pos
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id;

  IF v_max_pos >= 2147483647 THEN
    RAISE EXCEPTION 'reorder_conflict'
      USING ERRCODE = 'P0001';
  END IF;

  -- Park remaining rows after the hole, then compact. Avoids UNIQUE
  -- (playlist_id, position) collisions while shifting down.
  IF v_max_pos > 0 THEN
    UPDATE public.playlist_items AS pi
    SET position = pi.position + v_max_pos
    WHERE pi.playlist_id = p_playlist_id
      AND pi.position > v_item.position;

    UPDATE public.playlist_items AS pi
    SET position = pi.position - v_max_pos - 1
    WHERE pi.playlist_id = p_playlist_id
      AND pi.position > v_max_pos;
  END IF;

  UPDATE public.playlists AS pl
  SET updated_at = v_now
  WHERE pl.id = p_playlist_id;

  PERFORM public.log_playlist_audit(
    p_playlist_id,
    'item_removed',
    jsonb_build_object(
      'practice_id', p_practice_id,
      'audio_item_id', p_audio_item_id,
      'position', v_item.position
    )
  );

  RETURN jsonb_build_object(
    'removed', true,
    'playlist_id', p_playlist_id,
    'practice_id', p_practice_id,
    'audio_item_id', p_audio_item_id,
    'position', v_item.position
  );
END;
$$;

COMMENT ON FUNCTION public.remove_playlist_item(uuid, uuid, uuid) IS
  'Atomic playlist_items delete + position compact + playlists.updated_at. Composite identity practice_id + audio_item_id. Same authority as move_playlist_item (can_user_edit_playlist).';

GRANT EXECUTE ON FUNCTION public.remove_playlist_item(uuid, uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.remove_playlist_item(uuid, uuid, uuid)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.remove_playlist_item(uuid, uuid, uuid)
  FROM anon;

DO $$
BEGIN
  IF to_regprocedure('public.remove_playlist_item(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: remove_playlist_item missing';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.remove_playlist_item(uuid,uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: anon must not EXECUTE remove_playlist_item';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.remove_playlist_item(uuid,uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must EXECUTE remove_playlist_item';
  END IF;
END;
$$;

COMMIT;

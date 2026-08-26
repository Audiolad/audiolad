-- Extend the same move_playlist_item RPC with an optional target position.
-- One drop = one call. Old {direction: up|down} (3-arg / 4-arg) stays.
-- Not a new table and not a second sort system.

CREATE OR REPLACE FUNCTION public.move_playlist_item(
  p_playlist_id uuid,
  p_practice_id uuid,
  p_direction text,
  p_audio_item_id uuid,
  p_target_position integer
)
RETURNS TABLE (
  moved boolean,
  from_position integer,
  to_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_direction text;
  v_playlist public.playlists%ROWTYPE;
  v_current public.playlist_items%ROWTYPE;
  v_neighbor public.playlist_items%ROWTYPE;
  v_from integer;
  v_original_from integer;
  v_to integer;
  v_temp integer;
  v_max_pos integer;
  v_now timestamptz := clock_timestamp();
  v_steps integer := 0;
  v_moved boolean := false;
  v_target_exists boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_playlist_id IS NULL OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_direction := lower(btrim(COALESCE(p_direction, '')));

  IF v_direction IS DISTINCT FROM 'up' AND v_direction IS DISTINCT FROM 'down' THEN
    RAISE EXCEPTION 'invalid_direction'
      USING ERRCODE = '22023';
  END IF;

  IF p_target_position IS NOT NULL AND p_target_position < 1 THEN
    RAISE EXCEPTION 'invalid_target_position'
      USING ERRCODE = '22023';
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

  IF p_target_position IS NOT NULL THEN
    PERFORM 1
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = p_playlist_id
    ORDER BY pi.id
    FOR UPDATE;
  END IF;

  SELECT *
  INTO v_current
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id
    AND pi.practice_id = p_practice_id
    AND pi.audio_item_id IS NOT DISTINCT FROM p_audio_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_from := v_current.position;
  v_original_from := v_from;

  IF p_target_position IS NOT NULL THEN
    IF p_target_position = v_from THEN
      moved := false;
      from_position := v_from;
      to_position := v_from;
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.playlist_items AS pi
      WHERE pi.playlist_id = p_playlist_id
        AND pi.position = p_target_position
    )
    INTO v_target_exists;

    IF NOT v_target_exists THEN
      RAISE EXCEPTION 'invalid_target_position'
        USING ERRCODE = '22023';
    END IF;

    IF p_target_position < v_from AND v_direction IS DISTINCT FROM 'up' THEN
      RAISE EXCEPTION 'invalid_direction'
        USING ERRCODE = '22023';
    END IF;

    IF p_target_position > v_from AND v_direction IS DISTINCT FROM 'down' THEN
      RAISE EXCEPTION 'invalid_direction'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  LOOP
    IF p_target_position IS NOT NULL AND v_from = p_target_position THEN
      EXIT;
    END IF;

    IF p_target_position IS NULL AND v_steps >= 1 THEN
      EXIT;
    END IF;

    IF v_steps >= 100 THEN
      RAISE EXCEPTION 'reorder_conflict'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_direction = 'up' THEN
      SELECT *
      INTO v_neighbor
      FROM public.playlist_items AS pi
      WHERE pi.playlist_id = p_playlist_id
        AND pi.position < v_from
      ORDER BY pi.position DESC
      LIMIT 1
      FOR UPDATE;
    ELSE
      SELECT *
      INTO v_neighbor
      FROM public.playlist_items AS pi
      WHERE pi.playlist_id = p_playlist_id
        AND pi.position > v_from
      ORDER BY pi.position ASC
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      EXIT;
    END IF;

    v_to := v_neighbor.position;

    SELECT COALESCE(MAX(pi.position), 0)
    INTO v_max_pos
    FROM public.playlist_items AS pi
    WHERE pi.playlist_id = p_playlist_id;

    IF v_max_pos >= 2147483647 THEN
      RAISE EXCEPTION 'reorder_conflict'
        USING ERRCODE = 'P0001';
    END IF;

    v_temp := v_max_pos + 1;

    UPDATE public.playlist_items AS pi
    SET position = v_temp
    WHERE pi.id = v_current.id;

    UPDATE public.playlist_items AS pi
    SET position = v_from
    WHERE pi.id = v_neighbor.id;

    UPDATE public.playlist_items AS pi
    SET position = v_to
    WHERE pi.id = v_current.id;

    v_from := v_to;
    v_current.position := v_to;
    v_steps := v_steps + 1;
    v_moved := true;
  END LOOP;

  IF NOT v_moved THEN
    moved := false;
    from_position := v_original_from;
    to_position := v_original_from;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.playlists AS pl
  SET updated_at = v_now
  WHERE pl.id = p_playlist_id;

  PERFORM public.log_playlist_audit(
    p_playlist_id,
    'item_moved',
    jsonb_build_object(
      'practice_id', p_practice_id,
      'audio_item_id', p_audio_item_id,
      'from_position', v_original_from,
      'to_position', v_from
    )
  );

  moved := true;
  from_position := v_original_from;
  to_position := v_from;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid, integer) IS
  'Atomic playlist_items.position move. Optional target position does repeated neighbour swaps in one call. NULL target = one step.';

GRANT EXECUTE ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid, integer)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid, integer)
  FROM anon;

CREATE OR REPLACE FUNCTION public.move_playlist_item(
  p_playlist_id uuid,
  p_practice_id uuid,
  p_direction text,
  p_audio_item_id uuid
)
RETURNS TABLE (
  moved boolean,
  from_position integer,
  to_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.move_playlist_item(
    p_playlist_id,
    p_practice_id,
    p_direction,
    p_audio_item_id,
    NULL::integer
  );
END;
$$;

COMMENT ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid) IS
  'Atomic swap of playlist_items.position. Optional audio_item_id selects a track row.';

GRANT EXECUTE ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text, uuid)
  FROM anon;

DO $$
BEGIN
  IF to_regprocedure('public.move_playlist_item(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 3-arg move_playlist_item missing';
  END IF;

  IF to_regprocedure('public.move_playlist_item(uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 4-arg move_playlist_item missing';
  END IF;

  IF to_regprocedure('public.move_playlist_item(uuid,uuid,text,uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: 5-arg move_playlist_item missing';
  END IF;
END;
$$;

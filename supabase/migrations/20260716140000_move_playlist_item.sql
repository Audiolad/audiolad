-- Playlists PR4: atomic move playlist item up/down (practice_id within playlist).
-- Idempotent. Do not apply to production until review/backup/deploy approval.
-- Client sends only direction; positions of two neighbours are swapped safely.
-- Temp position = max(position)+1 under playlist lock (never fixed 1e9 offset).

CREATE OR REPLACE FUNCTION public.move_playlist_item(
  p_playlist_id uuid,
  p_practice_id uuid,
  p_direction text
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
  v_to integer;
  v_temp integer;
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

  v_direction := lower(btrim(COALESCE(p_direction, '')));

  IF v_direction IS DISTINCT FROM 'up' AND v_direction IS DISTINCT FROM 'down' THEN
    RAISE EXCEPTION 'invalid_direction'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize mutations on this playlist (membership / cover CAS also lock parent).
  SELECT *
  INTO v_playlist
  FROM public.playlists AS pl
  WHERE pl.id = p_playlist_id
  FOR UPDATE;

  IF NOT FOUND OR v_playlist.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_current
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id
    AND pi.practice_id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_or_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_from := v_current.position;

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
    -- Already first (up) or last (down): idempotent no-op, no updated_at bump.
    moved := false;
    from_position := v_from;
    to_position := v_from;
    RETURN NEXT;
    RETURN;
  END IF;

  v_to := v_neighbor.position;

  -- Temp position above current max under the same playlist lock.
  -- Avoids UNIQUE collision and fixed-offset clashes with large user positions.
  SELECT COALESCE(MAX(pi.position), 0)
  INTO v_max_pos
  FROM public.playlist_items AS pi
  WHERE pi.playlist_id = p_playlist_id;

  IF v_max_pos >= 2147483647 THEN
    RAISE EXCEPTION 'reorder_conflict'
      USING ERRCODE = 'P0001';
  END IF;

  v_temp := v_max_pos + 1;

  -- Two-phase swap avoids UNIQUE (playlist_id, position) mid-update.
  UPDATE public.playlist_items AS pi
  SET position = v_temp
  WHERE pi.id = v_current.id;

  UPDATE public.playlist_items AS pi
  SET position = v_from
  WHERE pi.id = v_neighbor.id;

  UPDATE public.playlist_items AS pi
  SET position = v_to
  WHERE pi.id = v_current.id;

  UPDATE public.playlists AS pl
  SET updated_at = v_now
  WHERE pl.id = p_playlist_id;

  moved := true;
  from_position := v_from;
  to_position := v_to;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_playlist_item(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_playlist_item(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_playlist_item(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.move_playlist_item(uuid, uuid, text) IS
  'PR4: owner-only atomic swap of playlist_items.position with neighbour (up/down); auth.uid(); no entitlement writes.';

-- PROPOSAL: 400 days, awaiting Sergey's confirmation. No scheduling or data deletion
-- on apply. Only the service role may opt in to a bounded cleanup run.
BEGIN;

CREATE INDEX business_player_listening_history_retention_idx
  ON public.business_player_listening_history (last_confirmed_at, id);

CREATE FUNCTION public.cleanup_business_player_listening_history(
  p_enabled boolean DEFAULT false,
  p_delete_enabled boolean DEFAULT false,
  p_batch_size integer DEFAULT 500,
  p_max_batches integer DEFAULT 20
) RETURNS TABLE (cutoff timestamptz, candidates bigint, deleted bigint, batches integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  -- Exact UTC duration; never use first_confirmed_at (long sessions can still be live).
  cutoff := statement_timestamp() - interval '9600 hours';
  candidates := 0; deleted := 0; batches := 0;
  IF p_enabled IS DISTINCT FROM true THEN RETURN NEXT; RETURN; END IF;
  IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 500
     OR p_max_batches IS NULL OR p_max_batches NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'invalid_retention_batch_limits' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO candidates FROM public.business_player_listening_history h
  WHERE h.last_confirmed_at < cutoff;
  -- Dry-run never locks rows or executes DELETE.
  IF p_delete_enabled IS DISTINCT FROM true THEN RETURN NEXT; RETURN; END IF;

  FOR i IN 1..p_max_batches LOOP
    WITH expired AS (
      SELECT h.id FROM public.business_player_listening_history h
      WHERE h.last_confirmed_at < cutoff
      ORDER BY h.last_confirmed_at, h.id
      LIMIT p_batch_size FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.business_player_listening_history h USING expired e
    WHERE h.id = e.id AND h.last_confirmed_at < cutoff;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    EXIT WHEN v_count = 0;
    deleted := deleted + v_count;
    batches := batches + 1;
    EXIT WHEN v_count < p_batch_size;
  END LOOP;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_business_player_listening_history(boolean, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_business_player_listening_history(boolean, boolean, integer, integer)
  TO service_role;
COMMENT ON FUNCTION public.cleanup_business_player_listening_history(boolean, boolean, integer, integer) IS
  'PROPOSAL awaiting Sergey: 400-day history retention, disabled by default, dry-run unless explicitly opted in. Never touches heartbeat or playback state.';

COMMIT;

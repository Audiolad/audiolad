-- t1289u: send the total unique-ahead count, not hundreds of preview UUIDs.
BEGIN;

ALTER TABLE public.business_player_now_playing
  ADD COLUMN queue_ahead_count integer NOT NULL DEFAULT 0
    CHECK (queue_ahead_count >= 0 AND queue_ahead_count <= 100000);

-- Adding a parameter with CREATE OR REPLACE would leave a PostgREST overload.
DROP FUNCTION public.report_business_point_now_playing(text, uuid, integer, integer, uuid[]);

CREATE FUNCTION public.report_business_point_now_playing(
  p_token text,
  p_audio_item_id uuid,
  p_position_ms integer,
  p_duration_ms integer,
  p_queue uuid[],
  p_queue_ahead integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := btrim(coalesce(p_token, ''));
  v_session public.business_point_sessions%ROWTYPE;
  v_queue uuid[] := coalesce(p_queue, '{}');
BEGIN
  IF v_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;
  IF p_queue_ahead IS NULL OR p_queue_ahead < 0 OR p_queue_ahead > 100000
    OR cardinality(v_queue) > 20 OR array_position(v_queue, NULL) IS NOT NULL
    OR coalesce(p_position_ms, -1) < 0 OR p_position_ms > 86400000
    OR (p_duration_ms IS NOT NULL AND (p_duration_ms <= 0 OR p_duration_ms > 86400000)) THEN
    RAISE EXCEPTION 'invalid_now_playing' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.business_point_sessions
  WHERE token_hash = public.business_point_sha256(v_token) AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.business_player_now_playing AS n (
    player_id, organization_id, location_id, audio_item_id, position_ms, duration_ms, queue_audio_item_ids, queue_ahead_count, reported_at
  ) VALUES (
    v_session.player_id, v_session.organization_id, v_session.location_id,
    p_audio_item_id, p_position_ms, p_duration_ms, v_queue, p_queue_ahead, statement_timestamp()
  )
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    location_id = EXCLUDED.location_id,
    audio_item_id = EXCLUDED.audio_item_id,
    position_ms = EXCLUDED.position_ms,
    duration_ms = EXCLUDED.duration_ms,
    queue_audio_item_ids = EXCLUDED.queue_audio_item_ids,
    queue_ahead_count = EXCLUDED.queue_ahead_count,
    reported_at = EXCLUDED.reported_at;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.report_business_point_now_playing(text, uuid, integer, integer, uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_business_point_now_playing(text, uuid, integer, integer, uuid[], integer) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback (in a transaction): drop the six-argument function, restore the previous
-- five-argument function body/signature from 20270228120000_business_point_now_playing.sql
-- and its REVOKE PUBLIC / GRANT EXECUTE to anon, authenticated, service_role;
-- ALTER TABLE public.business_player_now_playing DROP COLUMN queue_ahead_count;
-- NOTIFY pgrst, 'reload schema'; then COMMIT.

-- Extract the existing A3 attribution/media-time algorithm into one private function.
-- Both the legacy credential path and paired-device path call it. No new evidence ledger.
BEGIN;
CREATE OR REPLACE FUNCTION public.apply_business_player_usage_sample(
  p_player_id uuid,
  p_client_event_id uuid,
  p_playback_session_id uuid,
  p_sample_seq bigint,
  p_audio_item_id uuid,
  p_position_ms bigint,
  p_client_media_delta_ms bigint DEFAULT NULL,
  p_playback_rate numeric DEFAULT NULL,
  p_phase text DEFAULT 'advance'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player_id uuid := p_player_id;
  v_player_status text;
  v_player_org uuid;
  v_zone_id uuid;
  v_location_id uuid;
  v_location_org uuid;
  v_org_id uuid;
  v_practice_id uuid;
  v_product_kind text;
  v_author uuid;
  v_listening_key text;
  v_now timestamptz := clock_timestamp();
  v_accepted bigint := 0;
  v_duplicate boolean := false;
BEGIN
  IF p_client_event_id IS NULL
     OR p_playback_session_id IS NULL
     OR p_audio_item_id IS NULL
     OR p_sample_seq IS NULL
     OR p_sample_seq < 1
  THEN
    RAISE EXCEPTION 'playback_usage_invalid_args' USING ERRCODE = '22023';
  END IF;

  -- Serialize vs assign reassignment: share lock on Player row.
  SELECT p.status, p.organization_id
  INTO v_player_status, v_player_org
  FROM public.business_players AS p
  WHERE p.id = v_player_id
  FOR SHARE;

  IF v_player_status IS NULL THEN
    RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501';
  END IF;

  IF v_player_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'player_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT a.zone_id, z.location_id, l.organization_id, l.organization_id
  INTO v_zone_id, v_location_id, v_location_org, v_org_id
  FROM public.business_player_assignments AS a
  JOIN public.business_zones AS z ON z.id = a.zone_id
  JOIN public.business_locations AS l ON l.id = z.location_id
  WHERE a.player_id = v_player_id
    AND a.unassigned_at IS NULL;

  IF v_zone_id IS NULL THEN
    RAISE EXCEPTION 'player_not_assigned' USING ERRCODE = 'P0002';
  END IF;

  IF v_org_id IS DISTINCT FROM v_player_org OR v_location_org IS DISTINCT FROM v_player_org THEN
    RAISE EXCEPTION 'cross_organization_assignment' USING ERRCODE = '22023';
  END IF;

  SELECT ai.practice_id, pr.product_kind, pr.author_id
  INTO v_practice_id, v_product_kind, v_author
  FROM public.audio_items AS ai
  JOIN public.practices AS pr ON pr.id = ai.practice_id
  WHERE ai.id = p_audio_item_id;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'audio_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_kind IS DISTINCT FROM 'music' THEN
    RAISE EXCEPTION 'audio_item_not_music' USING ERRCODE = '22023';
  END IF;

  v_listening_key := 'business:' || v_player_id::text || ':' || p_playback_session_id::text;

  IF char_length(v_listening_key) > 200 THEN
    RAISE EXCEPTION 'playback_usage_invalid_args' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.playback_usage_contexts c
    WHERE c.listening_key = v_listening_key
      AND (
        c.usage_kind IS DISTINCT FROM 'business'
        OR c.player_id IS DISTINCT FROM v_player_id
      )
  ) THEN
    RAISE EXCEPTION 'listening_key_identity_conflict' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playback_usage_contexts (
    listening_key,
    practice_id,
    audio_item_id,
    last_position_ms,
    accepted_listened_ms,
    created_at,
    updated_at,
    usage_kind,
    organization_id,
    location_id,
    zone_id,
    player_id
  ) VALUES (
    v_listening_key,
    v_practice_id,
    p_audio_item_id,
    0,
    0,
    v_now,
    v_now,
    'business',
    v_org_id,
    v_location_id,
    v_zone_id,
    v_player_id
  )
  ON CONFLICT (listening_key) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    location_id = EXCLUDED.location_id,
    zone_id = EXCLUDED.zone_id,
    player_id = EXCLUDED.player_id,
    -- Attribution boundary: interval started under Zone A must not credit Zone B.
    -- Clear last_reported_at so the first sample after reassignment is a media-time baseline (+0).
    -- Keep last_sample_seq (monotonic) and accepted_listened_ms (lifetime budget within session).
    last_reported_at = CASE
      WHEN public.playback_usage_contexts.organization_id IS DISTINCT FROM EXCLUDED.organization_id
        OR public.playback_usage_contexts.location_id IS DISTINCT FROM EXCLUDED.location_id
        OR public.playback_usage_contexts.zone_id IS DISTINCT FROM EXCLUDED.zone_id
        OR public.playback_usage_contexts.player_id IS DISTINCT FROM EXCLUDED.player_id
      THEN NULL
      ELSE public.playback_usage_contexts.last_reported_at
    END,
    last_position_ms = CASE
      WHEN public.playback_usage_contexts.organization_id IS DISTINCT FROM EXCLUDED.organization_id
        OR public.playback_usage_contexts.location_id IS DISTINCT FROM EXCLUDED.location_id
        OR public.playback_usage_contexts.zone_id IS DISTINCT FROM EXCLUDED.zone_id
        OR public.playback_usage_contexts.player_id IS DISTINCT FROM EXCLUDED.player_id
      THEN 0
      ELSE public.playback_usage_contexts.last_position_ms
    END,
    updated_at = v_now;

  SELECT a.accepted_ms, a.duplicate
  INTO v_accepted, v_duplicate
  FROM public.apply_playback_usage_heartbeat(
    p_client_event_id,
    v_listening_key,
    p_sample_seq,
    NULL,           -- no consumer user
    NULL,           -- no anonymous
    NULL,           -- no analytics session
    v_practice_id,
    p_audio_item_id,
    p_position_ms,
    p_client_media_delta_ms,
    p_playback_rate,
    COALESCE(p_phase, 'advance'),
    v_now
  ) AS a;

  RETURN jsonb_build_object(
    'ok', true,
    'accepted_ms', COALESCE(v_accepted, 0),
    'duplicate', COALESCE(v_duplicate, false),
    'server_time', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_business_player_usage_sample(uuid, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_player_usage_sample(uuid, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_business_playback_usage_heartbeat(
  p_credential text, p_client_event_id uuid, p_playback_session_id uuid, p_sample_seq bigint,
  p_audio_item_id uuid, p_position_ms bigint, p_client_media_delta_ms bigint DEFAULT NULL,
  p_playback_rate numeric DEFAULT NULL, p_phase text DEFAULT 'advance'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_player uuid;
BEGIN
  IF btrim(coalesce(p_credential,'')) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501'; END IF;
  SELECT player_id INTO v_player FROM public.business_player_credentials
    WHERE credential_hash = public.business_player_hash_credential(btrim(p_credential));
  IF v_player IS NULL THEN RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501'; END IF;
  RETURN public.apply_business_player_usage_sample(v_player, p_client_event_id, p_playback_session_id,
    p_sample_seq, p_audio_item_id, p_position_ms, p_client_media_delta_ms, p_playback_rate, p_phase);
END; $$;

REVOKE ALL ON FUNCTION public.apply_business_playback_usage_heartbeat(text, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_business_playback_usage_heartbeat(text, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text) TO anon, authenticated, service_role;

CREATE FUNCTION public.apply_business_point_usage_sample(
  p_token text, p_client_event_id uuid, p_playback_session_id uuid, p_sample_seq bigint,
  p_audio_item_id uuid, p_position_ms bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_session public.business_point_sessions%ROWTYPE; v_player uuid;
BEGIN
  IF btrim(coalesce(p_token,'')) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_session FROM public.business_point_sessions
    WHERE token_hash = public.business_point_sha256(btrim(p_token)) AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501'; END IF;
  -- Same lock order as A2/A3. A moved player cannot attribute the old session to its new location.
  SELECT id INTO v_player FROM public.business_players WHERE id = v_session.player_id AND status = 'active' FOR SHARE;
  IF v_player IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_player_assignments a
    JOIN public.business_zones z ON z.id = a.zone_id AND z.status = 'active'
    JOIN public.business_locations l ON l.id = z.location_id AND l.status = 'active'
    WHERE a.player_id = v_player AND a.unassigned_at IS NULL
      AND l.id = v_session.location_id AND l.organization_id = v_session.organization_id
  ) THEN RAISE EXCEPTION 'point_assignment_changed' USING ERRCODE = '42501'; END IF;
  IF public.resolve_business_track_eligibility(p_audio_item_id, v_session.location_id, NULL,
    'business_background_playback', clock_timestamp())->>'decision' IS DISTINCT FROM 'ELIGIBLE' THEN
    RAISE EXCEPTION 'track_not_eligible' USING ERRCODE = '42501'; END IF;
  RETURN public.apply_business_player_usage_sample(v_player, p_client_event_id, p_playback_session_id,
    p_sample_seq, p_audio_item_id, p_position_ms, NULL, 1, 'advance');
END; $$;
REVOKE ALL ON FUNCTION public.apply_business_point_usage_sample(text, uuid, uuid, bigint, uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_business_point_usage_sample(text, uuid, uuid, bigint, uuid, bigint) TO anon, authenticated, service_role;
-- Preserve live-state behavior, but reject a stale assignment before heartbeat or state writes.
CREATE OR REPLACE FUNCTION public.report_business_point_player(
  p_token text,
  p_kind text,
  p_state text,
  p_audio_item_id uuid,
  p_playing_confirmed boolean,
  p_error_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := btrim(coalesce(p_token, ''));
  v_session public.business_point_sessions%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_hash bytea;
  v_track uuid := p_audio_item_id;
  v_confirmed boolean := coalesce(p_playing_confirmed, false);
  v_decision text;
BEGIN
  IF v_token !~ '^[0-9a-f]{64}$' OR p_kind NOT IN ('heartbeat', 'playback') THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'playback' AND (p_state IS NULL OR p_state NOT IN ('playing', 'paused', 'stopped', 'error')) THEN
    RAISE EXCEPTION 'invalid_live_state' USING ERRCODE = '22023';
  END IF;

  v_hash := public.business_point_sha256(v_token);
  SELECT * INTO v_session
  FROM public.business_point_sessions
  WHERE token_hash = v_hash AND revoked_at IS NULL FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.business_players WHERE id=v_session.player_id AND status='active' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.business_player_assignments a
    JOIN public.business_zones z ON z.id=a.zone_id AND z.status='active'
    JOIN public.business_locations l ON l.id=z.location_id AND l.status='active'
    WHERE a.player_id=v_session.player_id AND a.unassigned_at IS NULL
      AND l.id=v_session.location_id AND l.organization_id=v_session.organization_id
  ) THEN RAISE EXCEPTION 'point_assignment_changed' USING ERRCODE='42501'; END IF;

  UPDATE public.business_point_sessions
  SET last_seen_at = v_now
  WHERE id = v_session.id;

  UPDATE public.business_player_runtime
  SET last_heartbeat_at = v_now
  WHERE player_id = v_session.player_id;

  INSERT INTO public.business_player_device_heartbeat AS h (
    player_id, organization_id, device_session_hash, claimed_at, last_seen_at
  ) VALUES (
    v_session.player_id, v_session.organization_id, v_hash, v_now, v_now
  )
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    device_session_hash = EXCLUDED.device_session_hash,
    last_seen_at = EXCLUDED.last_seen_at,
    claimed_at = CASE
      WHEN h.device_session_hash = EXCLUDED.device_session_hash THEN h.claimed_at
      ELSE EXCLUDED.claimed_at
    END;

  IF p_kind = 'heartbeat' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_track IS NOT NULL THEN
    v_decision := public.resolve_business_track_eligibility(
      v_track, v_session.location_id, NULL, 'business_background_playback', v_now
    )->>'decision';
    IF v_decision IS DISTINCT FROM 'ELIGIBLE' THEN
      v_track := NULL;
      v_confirmed := false;
    END IF;
  END IF;

  IF v_confirmed AND (p_state IS DISTINCT FROM 'playing' OR v_track IS NULL) THEN
    v_confirmed := false;
  END IF;

  INSERT INTO public.business_player_playback_state AS s (
    player_id, organization_id, playback_state, audio_item_id, error_code,
    state_changed_at, reported_at, playing_confirmed_at
  ) VALUES (
    v_session.player_id, v_session.organization_id, p_state, v_track, p_error_code,
    v_now, v_now, CASE WHEN v_confirmed THEN v_now END
  )
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    state_changed_at = CASE
      WHEN s.playback_state IS DISTINCT FROM EXCLUDED.playback_state
        OR s.audio_item_id IS DISTINCT FROM EXCLUDED.audio_item_id THEN v_now
      ELSE s.state_changed_at
    END,
    playback_state = EXCLUDED.playback_state,
    audio_item_id = EXCLUDED.audio_item_id,
    error_code = EXCLUDED.error_code,
    reported_at = v_now,
    playing_confirmed_at = CASE
      WHEN v_confirmed THEN v_now
      WHEN s.audio_item_id IS DISTINCT FROM EXCLUDED.audio_item_id THEN NULL
      ELSE s.playing_confirmed_at
    END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMIT;
-- Rollback only after client rollback: restore the original A3 function from 20261203120000;
-- revoke execution on apply_business_point_usage_sample and private apply_business_player_usage_sample.
-- Keep playback_usage_contexts/facts: no cleanup or rewriting of evidence.

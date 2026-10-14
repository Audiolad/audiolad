-- c02fe282 real-1b: additive only; apply is a separate owner decision.
BEGIN;
CREATE TABLE public.business_player_live_state (
  player_id uuid PRIMARY KEY REFERENCES public.business_players(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  last_seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  playback_state text NULL CHECK (playback_state IN ('playing','paused','stopped','error')),
  playback_confirmed_at timestamptz NULL,
  audio_item_id uuid NULL REFERENCES public.audio_items(id) ON DELETE RESTRICT,
  track_started_at timestamptz NULL,
  error_code text NULL CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 80),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.business_player_live_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_player_live_state FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.report_business_spa_player_live_state(
  p_player_id uuid, p_state text, p_audio_item_id uuid,
  p_playing_confirmed boolean, p_error_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_location uuid;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_state IS NULL OR p_state NOT IN ('playing','paused','stopped','error')
    OR p_playing_confirmed IS NULL
    OR (p_playing_confirmed AND (p_state <> 'playing' OR p_audio_item_id IS NULL))
    OR (p_error_code IS NOT NULL AND char_length(p_error_code) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'invalid_live_state' USING ERRCODE = '22023';
  END IF;
  SELECT p.organization_id, l.id INTO v_org, v_location
  FROM public.business_players p
  JOIN public.business_player_assignments a ON a.player_id = p.id
  JOIN public.business_zones z ON z.id = a.zone_id
  JOIN public.business_locations l ON l.id = z.location_id AND l.organization_id = p.organization_id
  WHERE p.id = p_player_id AND p.status = 'active'
    AND a.unassigned_at IS NULL AND a.assigned_at <= v_now
  FOR SHARE OF p, a;
  IF v_org IS NULL OR NOT public.has_business_pilot_access(v_org) THEN
    RAISE EXCEPTION 'no_access' USING ERRCODE = '42501';
  END IF;
  -- No arbitrary/cross-org track IDs, even from a crafted RPC request.
  IF p_audio_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_programs p
    JOIN public.business_program_items i ON i.program_id = p.id
    WHERE p.organization_id = v_org AND p.kind = 'spa' AND p.status <> 'archived'
      AND i.audio_item_id = p_audio_item_id AND i.excluded_at IS NULL
      AND public.business_spa_track_visible(i.audio_item_id)
      AND coalesce(public.resolve_business_track_eligibility(i.audio_item_id, v_location, NULL,
        'business_background_playback', v_now)->>'decision' = 'ELIGIBLE', false)
  ) THEN
    RAISE EXCEPTION 'track_not_allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.business_player_live_state AS live
    (player_id, organization_id, last_seen_at, playback_state, playback_confirmed_at,
     audio_item_id, track_started_at, error_code, updated_at)
  VALUES (p_player_id, v_org, v_now, p_state, CASE WHEN p_playing_confirmed THEN v_now END,
    p_audio_item_id, CASE WHEN p_playing_confirmed THEN v_now END, p_error_code, v_now)
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    last_seen_at = EXCLUDED.last_seen_at,
    playback_state = EXCLUDED.playback_state,
    playback_confirmed_at = CASE WHEN p_playing_confirmed THEN v_now ELSE live.playback_confirmed_at END,
    track_started_at = CASE WHEN live.audio_item_id IS DISTINCT FROM p_audio_item_id
      THEN CASE WHEN p_playing_confirmed THEN v_now END
      WHEN p_playing_confirmed THEN coalesce(live.track_started_at, v_now) ELSE live.track_started_at END,
    audio_item_id = EXCLUDED.audio_item_id,
    error_code = EXCLUDED.error_code,
    updated_at = EXCLUDED.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.report_business_spa_player_live_state(uuid,text,uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_business_spa_player_live_state(uuid,text,uuid,boolean,text) TO authenticated;

CREATE FUNCTION public.get_business_owner_player_live_state(p_location_id uuid)
RETURNS TABLE (player_id uuid, organization_id uuid, last_seen_at timestamptz,
  playback_state text, playback_confirmed_at timestamptz, current_track_title text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  p_organization_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT l.organization_id INTO p_organization_id FROM public.business_locations l WHERE l.id = p_location_id;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'invalid_organization_id' USING ERRCODE = '22023';
  END IF;
  -- Exact membership predicate from get_business_player_health.
  IF NOT public.is_business_organization_member(p_organization_id, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_member' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.player_id, s.organization_id, s.last_seen_at, s.playback_state, s.playback_confirmed_at,
    (SELECT ai.title FROM public.audio_items ai WHERE ai.id = s.audio_item_id
      AND public.business_spa_track_visible(ai.id)
      AND EXISTS (SELECT 1 FROM public.business_programs bp
        JOIN public.business_program_items i ON i.program_id = bp.id
        WHERE bp.organization_id = p_organization_id AND bp.kind = 'spa' AND bp.status <> 'archived'
          AND i.audio_item_id = ai.id AND i.excluded_at IS NULL)
      AND coalesce(public.resolve_business_track_eligibility(ai.id, p_location_id, NULL,
        'business_background_playback', statement_timestamp())->>'decision' = 'ELIGIBLE', false))
  FROM public.business_player_live_state s
  JOIN public.business_players p ON p.id = s.player_id AND p.organization_id = s.organization_id
  JOIN public.business_player_assignments a ON a.player_id = p.id
  JOIN public.business_zones z ON z.id = a.zone_id
  WHERE s.organization_id = p_organization_id AND p.status = 'active'
    AND z.location_id = p_location_id AND a.unassigned_at IS NULL
    AND a.assigned_at <= statement_timestamp() AND s.last_seen_at >= a.assigned_at
  ORDER BY s.last_seen_at DESC, s.player_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_business_owner_player_live_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_owner_player_live_state(uuid) TO authenticated;
COMMIT;

/* Rollback (separate explicit approval required; removes only new live telemetry):
BEGIN;
DROP FUNCTION public.get_business_owner_player_live_state(uuid);
DROP FUNCTION public.report_business_spa_player_live_state(uuid,text,uuid,boolean,text);
DROP TABLE public.business_player_live_state;
COMMIT;
*/

-- Venue player: cafe programs next to spa programs.
--
-- report_business_spa_player_playback and get_business_owner_player_live_state
-- accepted only business_programs.kind = 'spa'. A cafe venue playing its cafe
-- program would get track_not_allowed and no title in the owner live state.
-- Only change: bp.kind = 'spa' -> bp.kind IN ('spa', 'cafe'). Bodies are
-- otherwise byte-identical to 20261231160000 (verified against production
-- pg_get_functiondef on 2026-10-23). Rights stay with
-- resolve_business_track_eligibility (ELIGIBLE only). Grants unchanged.
-- The app-side list lives in src/lib/business-app/venue-programs.ts.

BEGIN;

CREATE OR REPLACE FUNCTION public.report_business_spa_player_playback(
  p_player_id uuid, p_device_secret text, p_state text, p_audio_item_id uuid,
  p_playing_confirmed boolean, p_error_code text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_org uuid; v_location uuid; v_hist uuid;
  v_track uuid := p_audio_item_id; v_confirmed boolean := p_playing_confirmed; v_result text := 'ok';
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('playing','paused','stopped','error')
    OR p_playing_confirmed IS NULL
    OR (p_playing_confirmed AND (p_state <> 'playing' OR p_audio_item_id IS NULL))
    OR (p_error_code IS NOT NULL AND char_length(p_error_code) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'invalid_live_state' USING ERRCODE = '22023';
  END IF;
  SELECT c.organization_id, c.location_id INTO v_org, v_location
  FROM public.business_player_live_claim(p_player_id, p_device_secret, v_now) c;
  -- No arbitrary/cross-org track ids. If the track is not (or no longer, e.g. permission
  -- expired mid-track) allowed, only the track part is rejected: the heartbeat above and the
  -- state stay recorded, without track, confirmation or history.
  IF v_track IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_programs bp
    JOIN public.business_program_items i ON i.program_id = bp.id
    WHERE bp.organization_id = v_org AND bp.kind IN ('spa', 'cafe') AND bp.status <> 'archived'
      AND i.audio_item_id = p_audio_item_id AND i.excluded_at IS NULL
      AND public.business_spa_track_visible(i.audio_item_id)
      AND coalesce(public.resolve_business_track_eligibility(i.audio_item_id, v_location, NULL,
        'business_background_playback', v_now)->>'decision' = 'ELIGIBLE', false)
  ) THEN
    v_track := NULL; v_confirmed := false; v_result := 'track_not_allowed';
  END IF;

  INSERT INTO public.business_player_playback_state AS s
    (player_id, organization_id, playback_state, audio_item_id, error_code, state_changed_at, reported_at, playing_confirmed_at)
  VALUES (p_player_id, v_org, p_state, v_track, p_error_code, v_now, v_now,
    CASE WHEN v_confirmed THEN v_now END)
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    state_changed_at = CASE WHEN s.playback_state IS DISTINCT FROM EXCLUDED.playback_state
      OR s.audio_item_id IS DISTINCT FROM EXCLUDED.audio_item_id THEN v_now ELSE s.state_changed_at END,
    playback_state = EXCLUDED.playback_state,
    audio_item_id = EXCLUDED.audio_item_id,
    error_code = EXCLUDED.error_code,
    reported_at = v_now,
    -- Confirmation belongs to the current track only; a new track starts unconfirmed.
    playing_confirmed_at = CASE WHEN v_confirmed THEN v_now
      WHEN s.audio_item_id IS DISTINCT FROM EXCLUDED.audio_item_id THEN NULL
      ELSE s.playing_confirmed_at END;

  IF v_confirmed THEN
    -- One row per continuous confirmed listening of a track (long tracks stay one row).
    SELECT h.id INTO v_hist FROM public.business_player_listening_history h
    WHERE h.player_id = p_player_id AND h.audio_item_id = v_track
      AND h.last_confirmed_at >= v_now - interval '5 minutes'
    ORDER BY h.last_confirmed_at DESC LIMIT 1 FOR UPDATE;
    IF v_hist IS NULL THEN
      INSERT INTO public.business_player_listening_history
        (player_id, organization_id, location_id, audio_item_id, first_confirmed_at, last_confirmed_at)
      VALUES (p_player_id, v_org, v_location, v_track, v_now, v_now);
    ELSE
      UPDATE public.business_player_listening_history SET last_confirmed_at = v_now WHERE id = v_hist;
    END IF;
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.report_business_spa_player_playback(uuid, text, text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_business_spa_player_playback(uuid, text, text, uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_owner_player_live_state(p_location_id uuid)
RETURNS TABLE (player_id uuid, organization_id uuid, last_seen_at timestamptz,
  playback_state text, playback_reported_at timestamptz, playing_confirmed_at timestamptz,
  current_track_title text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT l.organization_id INTO v_org FROM public.business_locations l WHERE l.id = p_location_id;
  -- Same answer for unknown and foreign locations: nothing about other orgs leaks.
  IF v_org IS NULL OR NOT public.is_business_organization_member(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_member' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.organization_id, hb.last_seen_at, ps.playback_state, ps.reported_at, ps.playing_confirmed_at,
    (SELECT ai.title FROM public.audio_items ai WHERE ai.id = ps.audio_item_id
      AND public.business_spa_track_visible(ai.id)
      AND EXISTS (SELECT 1 FROM public.business_programs bp
        JOIN public.business_program_items i ON i.program_id = bp.id
        WHERE bp.organization_id = v_org AND bp.kind IN ('spa', 'cafe') AND bp.status <> 'archived'
          AND i.audio_item_id = ai.id AND i.excluded_at IS NULL)
      AND coalesce(public.resolve_business_track_eligibility(ai.id, p_location_id, NULL,
        'business_background_playback', statement_timestamp())->>'decision' = 'ELIGIBLE', false))
  FROM public.business_players p
  LEFT JOIN public.business_player_device_heartbeat hb ON hb.player_id = p.id AND hb.organization_id = v_org
  LEFT JOIN public.business_player_playback_state ps ON ps.player_id = p.id AND ps.organization_id = v_org
  WHERE p.organization_id = v_org AND p.status = 'active' AND (hb.player_id IS NOT NULL OR ps.player_id IS NOT NULL)
    -- EXISTS, not JOIN: several active assignments must not duplicate a player.
    AND EXISTS (SELECT 1 FROM public.business_player_assignments a
      JOIN public.business_zones z ON z.id = a.zone_id
      WHERE a.player_id = p.id AND a.unassigned_at IS NULL AND z.location_id = p_location_id)
  ORDER BY hb.last_seen_at DESC NULLS LAST, p.id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_business_owner_player_live_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_owner_player_live_state(uuid) TO authenticated;

DO $$
BEGIN
  IF position($k$bp.kind = 'spa'$k$ IN pg_get_functiondef('public.report_business_spa_player_playback(uuid,text,text,uuid,boolean,text)'::regprocedure)) > 0
     OR position($k$bp.kind = 'spa'$k$ IN pg_get_functiondef('public.get_business_owner_player_live_state(uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Post-check failed: spa-only program filter still present';
  END IF;
END;
$$;

COMMIT;

/* Rollback (restores the spa-only filter; no data touched):
   re-run the two CREATE OR REPLACE FUNCTION blocks from
   20261231160000_business_player_live_state.sql (as CREATE OR REPLACE) with the
   same REVOKE/GRANT lines. */

-- c02fe282 real-1b: player live signals for the owner home. Additive only; applying is a
-- separate owner decision. Three independent facts, never mixed:
--   1. business_player_device_heartbeat   — last time the device was on the line (connectivity).
--   2. business_player_playback_state     — what the device last reported it is doing now.
--   3. business_player_listening_history  — confirmed listening only (audio element advancing).
-- A heartbeat never implies sound; a reported state never becomes history unless confirmed.
-- Writers are bound to one device session per player: the browser holds a random secret, the
-- DB stores only its sha256. While a claim is fresh (5 min) no other session can write that
-- player's state, so one device cannot forge another device's signals.
BEGIN;

CREATE TABLE public.business_player_device_heartbeat (
  player_id uuid PRIMARY KEY REFERENCES public.business_players(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  device_session_hash bytea NOT NULL CHECK (octet_length(device_session_hash) = 32),
  claimed_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);

CREATE TABLE public.business_player_playback_state (
  player_id uuid PRIMARY KEY REFERENCES public.business_players(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  playback_state text NOT NULL CHECK (playback_state IN ('playing','paused','stopped','error')),
  audio_item_id uuid NULL REFERENCES public.audio_items(id) ON DELETE RESTRICT,
  error_code text NULL CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 80),
  state_changed_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL,
  -- Server time of the last report whose audio element was actually advancing.
  playing_confirmed_at timestamptz NULL
);

CREATE TABLE public.business_player_listening_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.business_players(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.business_locations(id) ON DELETE RESTRICT,
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE RESTRICT,
  first_confirmed_at timestamptz NOT NULL,
  last_confirmed_at timestamptz NOT NULL,
  CONSTRAINT business_player_listening_history_time_check CHECK (last_confirmed_at >= first_confirmed_at)
);
CREATE INDEX business_player_listening_history_player_idx
  ON public.business_player_listening_history (player_id, last_confirmed_at DESC);
CREATE INDEX business_player_listening_history_location_idx
  ON public.business_player_listening_history (location_id, first_confirmed_at DESC);
CREATE INDEX business_player_listening_history_org_idx ON public.business_player_listening_history (organization_id);
CREATE INDEX business_player_listening_history_audio_idx ON public.business_player_listening_history (audio_item_id);
CREATE INDEX business_player_device_heartbeat_org_idx ON public.business_player_device_heartbeat (organization_id);
CREATE INDEX business_player_playback_state_org_idx ON public.business_player_playback_state (organization_id);
CREATE INDEX business_player_playback_state_audio_idx ON public.business_player_playback_state (audio_item_id);

ALTER TABLE public.business_player_device_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_player_playback_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_player_listening_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_player_device_heartbeat FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_player_playback_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_player_listening_history FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.business_player_device_heartbeat IS
  'audiolad:business-player-live; connectivity only (server time). Never proof of sound.';
COMMENT ON TABLE public.business_player_playback_state IS
  'audiolad:business-player-live; last reported playback state. Not history, not Proof of Play.';
COMMENT ON TABLE public.business_player_listening_history IS
  'audiolad:business-player-live; confirmed listening intervals (audio element advancing). Not Proof of Play; playback_usage_facts stays canonical.';

-- The caller's own pilot player, resolved exactly like the /spa page context: first enabled
-- allowlist org -> its first location -> one active assignment (deterministic even if several
-- active assignments exist). Writes are only accepted for this player. Private helper.
CREATE FUNCTION public.business_spa_session_player(p_now timestamptz)
RETURNS TABLE (player_id uuid, organization_id uuid, location_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH org AS (
    SELECT al.organization_id FROM public.business_pilot_allowlist al
    WHERE al.user_id = auth.uid() AND al.enabled AND public.has_business_pilot_access(al.organization_id)
    ORDER BY al.organization_id LIMIT 1
  ), loc AS (
    SELECT l.id, l.organization_id FROM public.business_locations l JOIN org ON org.organization_id = l.organization_id
    ORDER BY l.created_at, l.id LIMIT 1
  )
  SELECT p.id, loc.organization_id, loc.id
  FROM loc
  JOIN public.business_zones z ON z.location_id = loc.id
  JOIN public.business_player_assignments a ON a.zone_id = z.id AND a.unassigned_at IS NULL AND a.assigned_at <= p_now
  JOIN public.business_players p ON p.id = a.player_id AND p.organization_id = loc.organization_id AND p.status = 'active'
  ORDER BY a.assigned_at DESC, p.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.business_spa_session_player(timestamptz) FROM PUBLIC, anon, authenticated;

-- Shared gate: p_player_id must be the caller's own session player, and the caller must hold
-- the device session for it. Refreshes the heartbeat. Returns (org, location). Private helper.
CREATE FUNCTION public.business_player_live_claim(p_player_id uuid, p_device_secret text, p_now timestamptz)
RETURNS TABLE (organization_id uuid, location_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_player uuid; v_org uuid; v_location uuid; v_hash bytea; v_row public.business_player_device_heartbeat%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_device_secret IS NULL OR char_length(p_device_secret) NOT BETWEEN 32 AND 128 THEN
    RAISE EXCEPTION 'invalid_device_session' USING ERRCODE = '22023';
  END IF;
  SELECT sp.player_id, sp.organization_id, sp.location_id INTO v_player, v_org, v_location
  FROM public.business_spa_session_player(p_now) sp;
  IF v_player IS NULL OR v_player IS DISTINCT FROM p_player_id THEN
    RAISE EXCEPTION 'no_access' USING ERRCODE = '42501';
  END IF;
  v_hash := sha256(convert_to(p_device_secret, 'UTF8'));
  SELECT * INTO v_row FROM public.business_player_device_heartbeat h WHERE h.player_id = p_player_id FOR UPDATE;
  IF FOUND AND v_row.device_session_hash <> v_hash AND v_row.last_seen_at > p_now - interval '5 minutes' THEN
    RAISE EXCEPTION 'device_session_conflict' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.business_player_device_heartbeat AS h (player_id, organization_id, device_session_hash, claimed_at, last_seen_at)
  VALUES (p_player_id, v_org, v_hash, p_now, p_now)
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    claimed_at = CASE WHEN h.device_session_hash = EXCLUDED.device_session_hash THEN h.claimed_at ELSE EXCLUDED.claimed_at END,
    device_session_hash = EXCLUDED.device_session_hash,
    last_seen_at = EXCLUDED.last_seen_at;
  organization_id := v_org; location_id := v_location;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.business_player_live_claim(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- (1) Heartbeat: connectivity only.
CREATE FUNCTION public.report_business_spa_player_heartbeat(p_player_id uuid, p_device_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.business_player_live_claim(p_player_id, p_device_secret, statement_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.report_business_spa_player_heartbeat(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_business_spa_player_heartbeat(uuid, text) TO authenticated;

-- (2) Current state + (3) confirmed history. A report also counts as a heartbeat.
CREATE FUNCTION public.report_business_spa_player_playback(
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
    WHERE bp.organization_id = v_org AND bp.kind = 'spa' AND bp.status <> 'archived'
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

-- Owner read: heartbeat and playback returned as separate columns; title only, no URLs.
CREATE FUNCTION public.get_business_owner_player_live_state(p_location_id uuid)
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
        WHERE bp.organization_id = v_org AND bp.kind = 'spa' AND bp.status <> 'archived'
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

COMMIT;

/* Rollback — preserves accumulated data (needs separate explicit approval):
   0. Backup first: pg_dump --data-only -t public.business_player_device_heartbeat
        -t public.business_player_playback_state -t public.business_player_listening_history
   1. Stop all writes and reads (the app falls back to neutral states automatically):
BEGIN;
REVOKE EXECUTE ON FUNCTION public.report_business_spa_player_heartbeat(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.report_business_spa_player_playback(uuid, text, text, uuid, boolean, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_business_owner_player_live_state(uuid) FROM authenticated;
COMMIT;
   Tables and their rows are kept as they are (no DROP). Re-enable later with the matching GRANTs.
   Physical removal of tables is a separate, later decision after the backup is verified.
*/

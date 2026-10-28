-- Point pairing: one-time code and a device session for one venue player.
-- Additive. Existing tables and rows are not changed.
-- Codes and tokens are stored only as SHA-256. Plaintext is returned once by the function.

BEGIN;

CREATE TABLE public.business_point_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.business_organizations (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL
    REFERENCES public.business_locations (id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL
    REFERENCES public.business_zones (id) ON DELETE RESTRICT,
  player_id uuid NOT NULL
    REFERENCES public.business_players (id) ON DELETE RESTRICT,
  code_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_point_pairings_code_hash_len_check
    CHECK (octet_length(code_hash) = 32),
  CONSTRAINT business_point_pairings_code_hash_unique UNIQUE (code_hash)
);

COMMENT ON TABLE public.business_point_pairings IS
  'audiolad:business-point; one-time pairing code. Plaintext is never stored.';

CREATE TABLE public.business_point_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.business_organizations (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL
    REFERENCES public.business_locations (id) ON DELETE RESTRICT,
  player_id uuid NOT NULL
    REFERENCES public.business_players (id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL,
  pairing_id uuid NULL
    REFERENCES public.business_point_pairings (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT business_point_sessions_token_hash_len_check
    CHECK (octet_length(token_hash) = 32),
  CONSTRAINT business_point_sessions_token_hash_unique UNIQUE (token_hash)
);

COMMENT ON TABLE public.business_point_sessions IS
  'audiolad:business-point; device session. The cookie value is never stored, only its SHA-256.';

CREATE UNIQUE INDEX business_point_sessions_one_live_per_player_uidx
  ON public.business_point_sessions (player_id)
  WHERE revoked_at IS NULL;

CREATE INDEX business_point_pairings_location_open_idx
  ON public.business_point_pairings (location_id, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.business_point_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_point_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_point_pairings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_point_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_point_pairings TO service_role;
GRANT ALL ON TABLE public.business_point_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.business_point_sha256(p_value text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT sha256(convert_to(p_value, 'UTF8'));
$$;

REVOKE ALL ON FUNCTION public.business_point_sha256(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_business_point_pairing(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_zone uuid;
  v_player uuid;
  v_open integer;
  v_code text;
  v_hash bytea;
  v_expires timestamptz := statement_timestamp() + interval '10 minutes';
  v_created jsonb;
  v_assigned jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id AND l.status = 'active';

  IF v_org IS NULL OR NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  SELECT z.id INTO v_zone
  FROM public.business_zones AS z
  WHERE z.location_id = p_location_id AND z.status = 'active'
  ORDER BY z.is_default DESC, z.created_at
  LIMIT 1;

  IF v_zone IS NULL THEN
    RAISE EXCEPTION 'zone_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.id INTO v_player
  FROM public.business_players AS p
  JOIN public.business_player_assignments AS a
    ON a.player_id = p.id AND a.unassigned_at IS NULL AND a.zone_id = v_zone
  WHERE p.organization_id = v_org AND p.status = 'active'
  ORDER BY a.assigned_at DESC
  LIMIT 1;

  IF v_player IS NULL THEN
    v_created := public.create_business_player(v_org, 'Устройство в зале');
    v_player := (v_created->>'player_id')::uuid;
    IF v_player IS NULL THEN
      RAISE EXCEPTION 'player_not_created' USING ERRCODE = 'P0001';
    END IF;
    v_assigned := public.assign_business_player_to_zone(v_player, v_zone);
    IF coalesce(v_assigned->>'ok', '') <> 'true' THEN
      RAISE EXCEPTION 'player_not_assigned' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*) INTO v_open
  FROM public.business_point_pairings
  WHERE location_id = p_location_id
    AND consumed_at IS NULL
    AND expires_at > statement_timestamp();

  IF v_open >= 5 THEN
    RAISE EXCEPTION 'too_many_open_codes' USING ERRCODE = '22023';
  END IF;

  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_hash := public.business_point_sha256(v_code);

  INSERT INTO public.business_point_pairings (
    organization_id, location_id, zone_id, player_id, code_hash, expires_at, created_by
  ) VALUES (
    v_org, p_location_id, v_zone, v_player, v_hash, v_expires, v_user_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_code,
    'expires_at', v_expires
  );
END;
$$;

COMMENT ON FUNCTION public.create_business_point_pairing(uuid) IS
  'audiolad:business-point; owner-only one-time code. Plaintext is returned once and not stored.';

REVOKE ALL ON FUNCTION public.create_business_point_pairing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_point_pairing(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_business_point_pairing(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_row public.business_point_pairings%ROWTYPE;
  v_token text;
  v_hash bytea;
  v_name text;
BEGIN
  IF v_code !~ '^[0-9a-f]{10}$' THEN
    RAISE EXCEPTION 'invalid_point_code' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.business_point_pairings
  WHERE code_hash = public.business_point_sha256(v_code)
  FOR UPDATE;

  IF NOT FOUND OR v_row.consumed_at IS NOT NULL OR v_row.expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'invalid_point_code' USING ERRCODE = '42501';
  END IF;

  UPDATE public.business_point_pairings
  SET consumed_at = statement_timestamp()
  WHERE id = v_row.id;

  UPDATE public.business_point_sessions
  SET revoked_at = statement_timestamp()
  WHERE player_id = v_row.player_id AND revoked_at IS NULL;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash := public.business_point_sha256(v_token);

  INSERT INTO public.business_point_sessions (
    organization_id, location_id, player_id, token_hash, pairing_id, last_seen_at
  ) VALUES (
    v_row.organization_id, v_row.location_id, v_row.player_id, v_hash, v_row.id, statement_timestamp()
  );

  SELECT l.name INTO v_name
  FROM public.business_locations AS l
  WHERE l.id = v_row.location_id;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_token,
    'location_name', coalesce(v_name, '')
  );
END;
$$;

COMMENT ON FUNCTION public.consume_business_point_pairing(text) IS
  'audiolad:business-point; exchange a code once. Wrong, used and expired codes share one error. Returns the token once.';

REVOKE ALL ON FUNCTION public.consume_business_point_pairing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_business_point_pairing(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_business_point_sessions(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id;

  IF v_org IS NULL OR NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.business_point_sessions
  SET revoked_at = statement_timestamp()
  WHERE location_id = p_location_id AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'revoked', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_business_point_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_business_point_sessions(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_business_point_link(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_seen timestamptz;
  v_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id;

  IF v_org IS NULL OR NOT public.is_business_organization_member(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_member' USING ERRCODE = '42501';
  END IF;

  SELECT s.last_seen_at, p.player_code
  INTO v_seen, v_code
  FROM public.business_point_sessions AS s
  JOIN public.business_players AS p ON p.id = s.player_id
  WHERE s.location_id = p_location_id AND s.revoked_at IS NULL
  ORDER BY s.last_seen_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'linked', v_seen IS NOT NULL,
    'last_seen_at', v_seen,
    'player_code', v_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_point_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_point_link(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.business_point_session_alive(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.business_point_sessions AS s
      WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
        AND s.revoked_at IS NULL
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.business_point_session_alive(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_point_session_alive(text) TO anon, authenticated, service_role;

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
  WHERE token_hash = v_hash AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;

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

COMMENT ON FUNCTION public.report_business_point_player(text, text, text, uuid, boolean, text) IS
  'audiolad:business-point; only a live point session may write venue heartbeat and playback.';

REVOKE ALL ON FUNCTION public.report_business_point_player(text, text, text, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_business_point_player(text, text, text, uuid, boolean, text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_business_point_sound_settings(
  p_token text,
  p_location_id uuid,
  p_character text,
  p_direction text,
  p_daypart_mode text,
  p_energy_offset smallint,
  p_morning_start time,
  p_morning_end time,
  p_day_start time,
  p_day_end time,
  p_evening_start time,
  p_evening_end time
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := btrim(coalesce(p_token, ''));
  v_location uuid;
BEGIN
  IF v_token !~ '^[0-9a-f]{64}$' OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;

  SELECT s.location_id INTO v_location
  FROM public.business_point_sessions AS s
  WHERE s.token_hash = public.business_point_sha256(v_token)
    AND s.revoked_at IS NULL;

  IF v_location IS NULL OR v_location IS DISTINCT FROM p_location_id THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;

  RETURN public.business_location_sound_settings_apply(
    p_location_id,
    'point',
    NULL,
    p_character,
    p_direction,
    p_daypart_mode,
    p_energy_offset,
    p_morning_start,
    p_morning_end,
    p_day_start,
    p_day_end,
    p_evening_start,
    p_evening_end,
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.save_business_point_sound_settings(
  text, uuid, text, text, text, smallint, time, time, time, time, time, time
) IS
  'audiolad:business-point; point session may change atmosphere only while point_can_edit_settings is true.';

REVOKE ALL ON FUNCTION public.save_business_point_sound_settings(
  text, uuid, text, text, text, smallint, time, time, time, time, time, time
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_business_point_sound_settings(
  text, uuid, text, text, text, smallint, time, time, time, time, time, time
) TO anon, authenticated, service_role;

DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'business_point_pairings' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'business_point_sessions' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Post-check failed: point tables need RLS';
  END IF;

  IF has_table_privilege('anon', 'public.business_point_pairings', 'SELECT')
    OR has_table_privilege('authenticated', 'public.business_point_sessions', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: point tables must not be readable';
  END IF;

  IF NOT has_function_privilege('anon', 'public.consume_business_point_pairing(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: consume must be granted to anon';
  END IF;

  IF has_function_privilege('anon', 'public.create_business_point_pairing(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: create must stay owner-only';
  END IF;
END
$post$;

COMMIT;

-- Rollback after a backup and a separate decision. Does not delete other tables.
-- Live sessions stop working when these functions and tables are removed.
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.save_business_point_sound_settings(text, uuid, text, text, text, smallint, time, time, time, time, time, time);
-- CREATE the closed body from 20270205120000 again before dropping the session table, if atmosphere saves must stay closed.
-- DROP FUNCTION IF EXISTS public.report_business_point_player(text, text, text, uuid, boolean, text);
-- DROP FUNCTION IF EXISTS public.get_business_point_link(uuid);
-- DROP FUNCTION IF EXISTS public.revoke_business_point_sessions(uuid);
-- DROP FUNCTION IF EXISTS public.consume_business_point_pairing(text);
-- DROP FUNCTION IF EXISTS public.create_business_point_pairing(uuid);
-- DROP FUNCTION IF EXISTS public.business_point_sha256(text);
-- DROP TABLE IF EXISTS public.business_point_sessions;
-- DROP TABLE IF EXISTS public.business_point_pairings;
-- COMMIT;

-- The venue device has no user session, so it cannot read the settings row.
-- This function returns only that device's atmosphere and the permission flag.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_business_point_sound_settings(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location uuid;
  v_row public.business_location_sound_settings%ROWTYPE;
BEGIN
  IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT s.location_id INTO v_location
  FROM public.business_point_sessions AS s
  WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
    AND s.revoked_at IS NULL;
  IF v_location IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO v_row
  FROM public.business_location_sound_settings
  WHERE location_id = v_location;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'found', false,
      'point_can_edit_settings', true
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'character', v_row.character,
    'direction', v_row.direction,
    'daypart_mode', v_row.daypart_mode,
    'energy_offset', v_row.energy_offset,
    'morning_start', to_char(v_row.morning_start, 'HH24:MI'),
    'morning_end', to_char(v_row.morning_end, 'HH24:MI'),
    'day_start', to_char(v_row.day_start, 'HH24:MI'),
    'day_end', to_char(v_row.day_end, 'HH24:MI'),
    'evening_start', to_char(v_row.evening_start, 'HH24:MI'),
    'evening_end', to_char(v_row.evening_end, 'HH24:MI'),
    'point_can_edit_settings', v_row.point_can_edit_settings,
    'settings_version', v_row.settings_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_point_sound_settings(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_point_sound_settings(text) TO anon, authenticated, service_role;

COMMIT;

-- Rollback is a separate decision after a backup. The settings table stays.
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.get_business_point_sound_settings(text);
-- COMMIT;

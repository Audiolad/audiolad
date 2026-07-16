BEGIN;

-- ---------------------------------------------------------------------------
-- PWA install tracking on profiles + pwa_* analytics events
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pwa_installed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pwa_install_platform text NULL,
  ADD COLUMN IF NOT EXISTS pwa_last_standalone_opened_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.pwa_installed_at IS
  'First confirmed PWA install timestamp (analytics; device-specific UX uses local storage).';

COMMENT ON COLUMN public.profiles.pwa_install_platform IS
  'Platform label for last known PWA install/open (android, ios, desktop_chromium, desktop_other, unknown).';

COMMENT ON COLUMN public.profiles.pwa_last_standalone_opened_at IS
  'Last time user opened Audiolad in standalone display mode.';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pwa_install_platform_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pwa_install_platform_check
  CHECK (
    pwa_install_platform IS NULL
    OR pwa_install_platform IN (
      'android',
      'ios',
      'desktop_chromium',
      'desktop_other',
      'unknown'
    )
  );

CREATE OR REPLACE FUNCTION public.insert_analytics_event(
  p_event_name text,
  p_practice_id uuid DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_anonymous_session_id text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_current_position integer DEFAULT NULL,
  p_duration integer DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
  v_allowed boolean;
BEGIN
  v_user_id := auth.uid();

  IF p_event_name IS NULL OR btrim(p_event_name) = '' THEN
    RAISE EXCEPTION 'event_name_required'
      USING ERRCODE = '22023';
  END IF;

  v_allowed := btrim(p_event_name) LIKE 'promo\_%' ESCAPE '\'
    OR btrim(p_event_name) LIKE 'pwa\_%' ESCAPE '\';

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'event_name_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF p_practice_id IS NOT NULL THEN
    PERFORM 1 FROM public.practices WHERE id = p_practice_id;
    IF NOT FOUND THEN
      p_practice_id := NULL;
    END IF;
  END IF;

  INSERT INTO public.analytics_events (
    event_name,
    practice_id,
    track_id,
    user_id,
    anonymous_session_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer,
    current_position,
    duration,
    payload
  )
  VALUES (
    btrim(p_event_name),
    p_practice_id,
    p_track_id,
    v_user_id,
    NULLIF(btrim(COALESCE(p_anonymous_session_id, '')), ''),
    NULLIF(left(btrim(COALESCE(p_utm_source, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_medium, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_campaign, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_content, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_referrer, '')), 512), ''),
    p_current_position,
    p_duration,
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_analytics_event(
  text, uuid, uuid, text, text, text, text, text, text, integer, integer, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_analytics_event(
  text, uuid, uuid, text, text, text, text, text, text, integer, integer, jsonb
) TO anon, authenticated;

COMMENT ON FUNCTION public.insert_analytics_event IS
  'audiolad:analytics:v2; inserts promo_* and pwa_* analytics events; practice_id validated when provided';

COMMIT;

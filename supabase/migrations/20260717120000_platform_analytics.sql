BEGIN;

-- ---------------------------------------------------------------------------
-- Platform analytics: sessions + extended events (MVP)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  anonymous_id text NOT NULL,

  user_id uuid NULL
    REFERENCES auth.users (id)
    ON DELETE SET NULL,

  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,

  referrer_domain text NULL,
  landing_path text NULL,

  device_type text NOT NULL DEFAULT 'desktop',

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT analytics_sessions_anonymous_id_check
    CHECK (
      char_length(btrim(anonymous_id)) > 0
      AND char_length(anonymous_id) <= 128
    ),

  CONSTRAINT analytics_sessions_device_type_check
    CHECK (device_type IN ('mobile', 'tablet', 'desktop'))
);

CREATE INDEX IF NOT EXISTS analytics_sessions_started_at_idx
  ON public.analytics_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS analytics_sessions_anonymous_id_idx
  ON public.analytics_sessions (anonymous_id);

CREATE INDEX IF NOT EXISTS analytics_sessions_user_id_idx
  ON public.analytics_sessions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_sessions_utm_source_idx
  ON public.analytics_sessions (utm_source)
  WHERE utm_source IS NOT NULL;

REVOKE ALL ON public.analytics_sessions FROM PUBLIC;
REVOKE ALL ON public.analytics_sessions FROM anon, authenticated;

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;

-- Extend existing analytics_events for platform events
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS session_id uuid NULL
    REFERENCES public.analytics_sessions (id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS path text NULL,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx
  ON public.analytics_events (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx
  ON public.analytics_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_occurred_at_idx
  ON public.analytics_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_user_id_occurred_at_idx
  ON public.analytics_events (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Platform event allowlist
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_analytics_event(p_event_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(COALESCE(p_event_name, '')) IN (
    'page_view',
    'practice_view',
    'listen_page_view',
    'audio_play_started',
    'audio_progress_25',
    'audio_progress_50',
    'audio_progress_75',
    'audio_progress_90',
    'audio_completed',
    'signup_started',
    'signup_completed',
    'author_application_started',
    'author_application_submitted'
  );
$$;

-- ---------------------------------------------------------------------------
-- upsert_analytics_session — create or refresh visitor session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_analytics_session(
  p_session_id uuid DEFAULT NULL,
  p_anonymous_id text DEFAULT NULL,
  p_landing_path text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_referrer_domain text DEFAULT NULL,
  p_device_type text DEFAULT 'desktop'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_session_id uuid;
  v_now timestamptz := now();
  v_timeout interval := interval '30 minutes';
  v_device text;
BEGIN
  v_user_id := auth.uid();

  IF p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RAISE EXCEPTION 'anonymous_id_required'
      USING ERRCODE = '22023';
  END IF;

  v_device := CASE
    WHEN p_device_type IN ('mobile', 'tablet', 'desktop') THEN p_device_type
    ELSE 'desktop'
  END;

  IF p_session_id IS NOT NULL THEN
    SELECT s.id
    INTO v_session_id
    FROM public.analytics_sessions AS s
    WHERE s.id = p_session_id
      AND s.anonymous_id = btrim(p_anonymous_id)
      AND s.last_seen_at >= v_now - v_timeout;

    IF FOUND THEN
      UPDATE public.analytics_sessions AS s
      SET
        last_seen_at = v_now,
        user_id = COALESCE(v_user_id, s.user_id)
      WHERE s.id = v_session_id;

      RETURN v_session_id;
    END IF;
  END IF;

  INSERT INTO public.analytics_sessions (
    anonymous_id,
    user_id,
    started_at,
    last_seen_at,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer_domain,
    landing_path,
    device_type
  )
  VALUES (
    btrim(p_anonymous_id),
    v_user_id,
    v_now,
    v_now,
    NULLIF(left(btrim(COALESCE(p_utm_source, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_medium, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_campaign, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_content, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_referrer_domain, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_landing_path, '')), 512), ''),
    v_device
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- link_analytics_session_user — attach authenticated user to session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_analytics_session_user(
  p_session_id uuid,
  p_anonymous_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RETURN false;
  END IF;

  UPDATE public.analytics_sessions AS s
  SET user_id = v_user_id
  WHERE s.id = p_session_id
    AND s.anonymous_id = btrim(p_anonymous_id);

  UPDATE public.analytics_events AS e
  SET user_id = v_user_id
  WHERE e.session_id = p_session_id
    AND e.user_id IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.link_analytics_session_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_analytics_session_user(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- insert_platform_analytics_event — validated platform event insert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_platform_analytics_event(
  p_session_id uuid,
  p_anonymous_id text,
  p_event_name text,
  p_path text DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_audio_item_id uuid DEFAULT NULL,
  p_properties jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
  v_session_anonymous text;
BEGIN
  v_user_id := auth.uid();

  IF NOT public.is_platform_analytics_event(p_event_name) THEN
    RAISE EXCEPTION 'event_name_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RAISE EXCEPTION 'session_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.anonymous_id
  INTO v_session_anonymous
  FROM public.analytics_sessions AS s
  WHERE s.id = p_session_id;

  IF NOT FOUND OR v_session_anonymous IS DISTINCT FROM btrim(p_anonymous_id) THEN
    RAISE EXCEPTION 'session_mismatch'
      USING ERRCODE = '22023';
  END IF;

  IF p_practice_id IS NOT NULL THEN
    PERFORM 1 FROM public.practices WHERE id = p_practice_id;
    IF NOT FOUND THEN
      p_practice_id := NULL;
    END IF;
  END IF;

  UPDATE public.analytics_sessions AS s
  SET
    last_seen_at = now(),
    user_id = COALESCE(v_user_id, s.user_id)
  WHERE s.id = p_session_id;

  INSERT INTO public.analytics_events (
    event_name,
    practice_id,
    track_id,
    user_id,
    anonymous_session_id,
    session_id,
    path,
    payload,
    occurred_at
  )
  VALUES (
    btrim(p_event_name),
    p_practice_id,
    p_audio_item_id,
    v_user_id,
    btrim(p_anonymous_id),
    p_session_id,
    NULLIF(left(btrim(COALESCE(p_path, '')), 512), ''),
    COALESCE(p_properties, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb
) TO anon, authenticated;

COMMENT ON TABLE public.analytics_sessions IS
  'audiolad:platform-analytics:v1; first-touch visitor sessions without IP/fingerprint';

COMMENT ON FUNCTION public.insert_platform_analytics_event IS
  'audiolad:platform-analytics:v1; inserts allowlisted platform analytics events';

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- Idempotent signup_completed for instant and delayed auth paths
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_signup_completed_user_uidx
  ON public.analytics_events (user_id)
  WHERE event_name = 'signup_completed' AND user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_platform_signup_completed(
  p_session_id uuid,
  p_anonymous_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_profile_created_at timestamptz;
  v_analytics_launch_cutoff constant timestamptz := timestamptz '2026-07-16 00:00:00+00';
  v_event_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'not_authenticated');
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'session_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.analytics_sessions AS s
    WHERE s.id = p_session_id
      AND s.anonymous_id = btrim(p_anonymous_id)
  ) THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'session_mismatch');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.analytics_events AS e
    WHERE e.event_name = 'signup_completed'
      AND e.user_id = v_user_id
  ) THEN
    PERFORM public.link_analytics_session_user(p_session_id, p_anonymous_id);
    RETURN jsonb_build_object('recorded', false, 'reason', 'already_recorded');
  END IF;

  SELECT p.created_at
  INTO v_profile_created_at
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  IF NOT FOUND OR v_profile_created_at < v_analytics_launch_cutoff THEN
    PERFORM public.link_analytics_session_user(p_session_id, p_anonymous_id);
    RETURN jsonb_build_object('recorded', false, 'reason', 'not_new_registration');
  END IF;

  PERFORM public.link_analytics_session_user(p_session_id, p_anonymous_id);

  INSERT INTO public.analytics_events (
    event_name,
    user_id,
    anonymous_session_id,
    session_id,
    path,
    payload,
    occurred_at
  )
  VALUES (
    'signup_completed',
    v_user_id,
    btrim(p_anonymous_id),
    p_session_id,
    '/auth/sign-up',
    '{}'::jsonb,
    now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'already_recorded');
  END IF;

  RETURN jsonb_build_object('recorded', true, 'event_id', v_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_platform_signup_completed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_platform_signup_completed(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.record_platform_signup_completed IS
  'audiolad:platform-analytics:v1; idempotent signup_completed for instant and delayed auth';

COMMIT;

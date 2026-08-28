-- Previous origin/main RPC bodies (20260725160000 / 20260717130000).
-- Intentionally NO function-level lock_timeout — used only to prove the
-- upgrade path replaces them with SET lock_timeout = '250ms'.

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
  v_updated int := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RETURN false;
  END IF;

  UPDATE public.analytics_sessions AS s
  SET
    user_id = v_user_id,
    is_staff = s.is_staff OR public.is_platform_staff(v_user_id),
    is_test = s.is_test OR public.is_analytics_test_user(v_user_id),
    traffic_class = CASE
      WHEN s.is_bot THEN 'bot'
      WHEN s.is_staff OR public.is_platform_staff(v_user_id) THEN 'staff'
      WHEN s.is_test OR public.is_analytics_test_user(v_user_id) THEN 'test'
      ELSE 'human'
    END
  WHERE s.id = p_session_id
    AND s.anonymous_id = btrim(p_anonymous_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.analytics_events AS e
  SET user_id = v_user_id
  WHERE e.session_id = p_session_id
    AND e.user_id IS NULL;

  PERFORM public.link_analytics_identity(btrim(p_anonymous_id), 'session_link', 24);

  RETURN v_updated > 0;
END;
$$;

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

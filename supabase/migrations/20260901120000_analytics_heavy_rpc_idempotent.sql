BEGIN;

-- P1: already-linked analytics sessions must return immediately.
-- No advisory lock, no mass event UPDATE, no identity re-link, no extra writes.
-- First-touch advisory locks only when a first-touch row is actually missing.

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
  v_session public.analytics_sessions%ROWTYPE;
  v_updated int := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RETURN false;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.id = p_session_id
    AND s.anonymous_id = btrim(p_anonymous_id);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- cheap idempotent return: already owned by this user
  IF v_session.user_id IS NOT DISTINCT FROM v_user_id THEN
    RETURN true;
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

  -- Real first link only: attach leftover anonymous events.
  UPDATE public.analytics_events AS e
  SET user_id = v_user_id
  WHERE e.session_id = p_session_id
    AND e.user_id IS NULL;

  PERFORM public.link_analytics_identity(btrim(p_anonymous_id), 'session_link', 24);

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.link_analytics_session_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_analytics_session_user(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.link_analytics_session_user(uuid, text) IS
  'audiolad:analytics-rpc-protection:v1; cheap idempotent return when session already owned; first-link still writes + identity';

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
  v_session_user_id uuid;
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

  SELECT s.user_id
  INTO v_session_user_id
  FROM public.analytics_sessions AS s
  WHERE s.id = p_session_id
    AND s.anonymous_id = btrim(p_anonymous_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'session_mismatch');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.analytics_events AS e
    WHERE e.event_name = 'signup_completed'
      AND e.user_id = v_user_id
  ) THEN
    IF v_session_user_id IS NOT DISTINCT FROM v_user_id THEN
      RETURN jsonb_build_object('recorded', false, 'reason', 'already_recorded');
    END IF;

    PERFORM public.link_analytics_session_user(p_session_id, p_anonymous_id);
    RETURN jsonb_build_object('recorded', false, 'reason', 'already_recorded');
  END IF;

  SELECT p.created_at
  INTO v_profile_created_at
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  IF NOT FOUND OR v_profile_created_at < v_analytics_launch_cutoff THEN
    IF v_session_user_id IS NOT DISTINCT FROM v_user_id THEN
      RETURN jsonb_build_object('recorded', false, 'reason', 'not_new_registration');
    END IF;

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

COMMENT ON FUNCTION public.record_platform_signup_completed(uuid, text) IS
  'audiolad:analytics-rpc-protection:v1; idempotent signup_completed; skip link when already owned';

CREATE OR REPLACE FUNCTION public.ensure_anonymous_first_touch(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.analytics_sessions%ROWTYPE;
  v_existing public.analytics_first_touches%ROWTYPE;
  v_id uuid;
  v_landing text;
  v_class text;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_required');
  END IF;

  SELECT s.* INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_missing');
  END IF;

  IF coalesce(v_session.is_bot, false)
     OR coalesce(v_session.is_test, false)
     OR coalesce(v_session.is_staff, false)
     OR v_session.traffic_class IN ('bot', 'test', 'staff') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'excluded_traffic');
  END IF;

  SELECT t.* INTO v_existing
  FROM public.analytics_first_touches AS t
  WHERE t.subject_type = 'anonymous'
    AND t.anonymous_id = v_session.anonymous_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'id', v_existing.id,
      'reason', 'already_exists'
    );
  END IF;

  -- advisory lock only when mutating first-touch
  PERFORM pg_advisory_xact_lock(hashtext('ft:anon:' || v_session.anonymous_id));

  SELECT t.* INTO v_existing
  FROM public.analytics_first_touches AS t
  WHERE t.subject_type = 'anonymous'
    AND t.anonymous_id = v_session.anonymous_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'id', v_existing.id,
      'reason', 'already_exists'
    );
  END IF;

  SELECT s.* INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.anonymous_id = v_session.anonymous_id
    AND coalesce(s.is_bot, false) = false
    AND coalesce(s.is_test, false) = false
    AND coalesce(s.is_staff, false) = false
    AND s.traffic_class = 'human'
  ORDER BY s.started_at ASC, s.created_at ASC, s.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_eligible_session');
  END IF;

  v_landing := public.sanitize_checkout_origin_path(v_session.landing_path);
  v_class := public.classify_acquisition_source_class(
    v_session.utm_source,
    v_session.utm_medium,
    v_session.utm_campaign,
    v_session.referrer_domain
  );

  BEGIN
    INSERT INTO public.analytics_first_touches (
      subject_type,
      anonymous_id,
      user_id,
      first_session_id,
      first_seen_at,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      referrer_domain,
      landing_path,
      source_class,
      confidence,
      origin
    )
    VALUES (
      'anonymous',
      v_session.anonymous_id,
      NULL,
      v_session.id,
      v_session.started_at,
      public.sanitize_analytics_utm_value(v_session.utm_source),
      public.sanitize_analytics_utm_value(v_session.utm_medium),
      public.sanitize_analytics_utm_value(v_session.utm_campaign),
      public.sanitize_analytics_utm_value(v_session.utm_content),
      public.sanitize_analytics_utm_value(v_session.utm_term),
      public.sanitize_analytics_utm_value(v_session.referrer_domain),
      v_landing,
      v_class,
      'exact',
      'session_insert'
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT t.id INTO v_id
      FROM public.analytics_first_touches AS t
      WHERE t.subject_type = 'anonymous'
        AND t.anonymous_id = v_session.anonymous_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'id', v_id,
        'reason', 'race_exists'
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'id', v_id,
    'confidence', 'exact',
    'origin', 'session_insert'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_anonymous_first_touch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_anonymous_first_touch(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_anonymous_first_touch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_anonymous_first_touch(uuid) TO postgres;

CREATE OR REPLACE FUNCTION public.ensure_user_first_touch(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.analytics_first_touches%ROWTYPE;
  v_cand record;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_required');
  END IF;

  IF public.is_platform_staff(p_user_id)
     OR public.is_analytics_test_user(p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'excluded_user');
  END IF;

  SELECT t.* INTO v_existing
  FROM public.analytics_first_touches AS t
  WHERE t.subject_type = 'user'
    AND t.user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'id', v_existing.id,
      'reason', 'already_exists'
    );
  END IF;

  -- advisory lock only when mutating first-touch
  PERFORM pg_advisory_xact_lock(hashtext('ft:user:' || p_user_id::text));

  SELECT t.* INTO v_existing
  FROM public.analytics_first_touches AS t
  WHERE t.subject_type = 'user'
    AND t.user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'id', v_existing.id,
      'reason', 'already_exists'
    );
  END IF;

  SELECT * INTO v_cand
  FROM public.resolve_user_first_touch_candidate(p_user_id);

  IF NOT v_cand.ok THEN
    RETURN jsonb_build_object('ok', false, 'reason', coalesce(v_cand.reason, 'no_candidate'));
  END IF;

  BEGIN
    INSERT INTO public.analytics_first_touches (
      subject_type,
      anonymous_id,
      user_id,
      first_session_id,
      first_seen_at,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      referrer_domain,
      landing_path,
      source_class,
      confidence,
      origin
    )
    VALUES (
      'user',
      NULL,
      p_user_id,
      v_cand.first_session_id,
      v_cand.first_seen_at,
      v_cand.utm_source,
      v_cand.utm_medium,
      v_cand.utm_campaign,
      v_cand.utm_content,
      v_cand.utm_term,
      v_cand.referrer_domain,
      v_cand.landing_path,
      v_cand.source_class,
      v_cand.confidence,
      v_cand.origin
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT t.id INTO v_id
      FROM public.analytics_first_touches AS t
      WHERE t.subject_type = 'user' AND t.user_id = p_user_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'id', v_id,
        'reason', 'race_exists'
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'id', v_id,
    'confidence', v_cand.confidence,
    'origin', v_cand.origin,
    'candidate_reason', v_cand.reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_first_touch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_first_touch(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_first_touch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_user_first_touch(uuid) TO postgres;

COMMIT;

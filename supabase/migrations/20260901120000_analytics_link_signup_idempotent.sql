BEGIN;

-- =============================================================================
-- Stop PostgREST pool starvation from link/signup RPC repeats.
--
-- Repeats used to UPDATE analytics_sessions, scan/UPDATE analytics_events,
-- touch analytics_identity_links, then take pg_advisory_xact_lock
-- hashtext('ft:user:' || user_id) via link_analytics_identity →
-- ensure_user_first_touch. Each repeat held a PostgREST connection for the
-- whole wait (lock_timeout 8s → 55P03 → pool saturate → PGRST003).
--
-- App-only single-flight is not enough: each tab / Next isolate still
-- reaches PostgREST. Early-return here before any UPDATE / advisory lock.
-- Advisory locks are kept — they are not the stampede; repeats are.
-- =============================================================================

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
  v_session_user uuid;
  v_updated int := 0;
  v_already_linked boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RETURN false;
  END IF;

  -- Snapshot read only (AccessShare). Does not wait on RowExclusive from a
  -- concurrent first-time UPDATE. Committed already-linked sessions return
  -- before any row or advisory lock.
  SELECT s.user_id
  INTO v_session_user
  FROM public.analytics_sessions AS s
  WHERE s.id = p_session_id
    AND s.anonymous_id = btrim(p_anonymous_id);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_session_user IS NOT DISTINCT FROM v_user_id THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.analytics_identity_links AS l
      WHERE l.anonymous_id = btrim(p_anonymous_id)
        AND l.user_id = v_user_id
        AND l.unlinked_at IS NULL
    )
    INTO v_already_linked;

    IF v_already_linked THEN
      RETURN true;
    END IF;
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

REVOKE ALL ON FUNCTION public.link_analytics_session_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_analytics_session_user(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.link_analytics_session_user(uuid, text) IS
  'audiolad:platform-analytics:stampede; attach user to session; fast no-op when already linked';

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

  -- Exactly-once: unique index analytics_events_signup_completed_user_uidx.
  -- Repeats must not enter the heavy link path first.
  IF EXISTS (
    SELECT 1
    FROM public.analytics_events AS e
    WHERE e.event_name = 'signup_completed'
      AND e.user_id = v_user_id
  ) THEN
    PERFORM public.link_analytics_session_user(p_session_id, p_anonymous_id);
    RETURN jsonb_build_object('recorded', false, 'reason', 'already_recorded');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.analytics_sessions AS s
    WHERE s.id = p_session_id
      AND s.anonymous_id = btrim(p_anonymous_id)
  ) THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'session_mismatch');
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
  'audiolad:platform-analytics:stampede; idempotent signup_completed; repeats skip heavy link work';

COMMIT;

BEGIN;

-- =============================================================================
-- Analytics RPC lock safety
--
-- Production 2026-08-27: PostgREST's 10-slot pool filled with backends waiting
-- on Lock inside link_analytics_session_user / record_platform_signup_completed.
-- PostgreSQL max_connections was ~36/100. Catalog/home/role lookups then 500/504.
--
-- Root lock sequence (pre-fix):
--   link:  analytics_sessions → analytics_events → identity_links
--          → (staff retro) analytics_sessions again → analytics_events again
--          → advisory xact lock in ensure_user_first_touch
--   signup: reads, then ALWAYS calls link, then INSERT signup_completed
--           (unique index on user_id)
-- Opposite order: sessions/events first, then identity, then sessions again
-- (staff retro) produced transactionid / tuple waits and deadlock chains.
--
-- This migration keeps analytics business outcomes, but:
--   1. no-op fast path when rows are already in the desired state
--   2. stable lock order: identity_links → analytics_sessions → analytics_events
--   3. skip nested identity/first-touch/staff-retro when already linked
--   4. fail-open on lock timeout (do not occupy a PostgREST slot waiting)
--   5. persist the production lock_timeout safety net on both RPCs
--
-- lock_timeout = 250ms:
--   Proven emergency value that restored production (catalog 60–90ms, 0 waiters).
--   After the fast path, a healthy call does not wait. A waiter above 250ms is
--   already a pool-risk: 10 × long lock-waits starve product traffic.
--   Raising this would only increase blast radius during a future storm.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.link_analytics_session_user(
  p_session_id uuid,
  p_anonymous_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '250ms'
AS $$
DECLARE
  v_user_id uuid;
  v_session public.analytics_sessions%ROWTYPE;
  v_staff boolean := false;
  v_test boolean := false;
  v_needs_session_update boolean := false;
  v_needs_event_backfill boolean := false;
  v_needs_identity boolean := false;
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

  v_staff := public.is_platform_staff(v_user_id);
  v_test := public.is_analytics_test_user(v_user_id);

  v_needs_session_update :=
    v_session.user_id IS DISTINCT FROM v_user_id
    OR (v_staff AND NOT v_session.is_staff)
    OR (v_test AND NOT v_session.is_test);

  v_needs_event_backfill := EXISTS (
    SELECT 1
    FROM public.analytics_events AS e
    WHERE e.session_id = p_session_id
      AND e.user_id IS NULL
  );

  v_needs_identity := NOT EXISTS (
    SELECT 1
    FROM public.analytics_identity_links AS l
    WHERE l.anonymous_id = btrim(p_anonymous_id)
      AND l.unlinked_at IS NULL
      AND l.user_id = v_user_id
  );

  -- Idempotent hot path: no exclusive locks, no nested identity / first-touch.
  IF NOT v_needs_session_update
     AND NOT v_needs_event_backfill
     AND NOT v_needs_identity THEN
    RETURN true;
  END IF;

  -- Stable order: identity_links → analytics_sessions → analytics_events.
  -- lock_timeout raises to the caller so the HTTP layer can fail-open as deferred
  -- instead of treating a timeout as a completed no-op.
  IF v_needs_identity THEN
    PERFORM public.link_analytics_identity(
      btrim(p_anonymous_id),
      'session_link',
      24
    );
  END IF;

  IF v_needs_session_update THEN
    UPDATE public.analytics_sessions AS s
    SET
      user_id = v_user_id,
      is_staff = s.is_staff OR v_staff,
      is_test = s.is_test OR v_test,
      traffic_class = CASE
        WHEN s.is_bot THEN 'bot'
        WHEN s.is_staff OR v_staff THEN 'staff'
        WHEN s.is_test OR v_test THEN 'test'
        ELSE 'human'
      END
    WHERE s.id = p_session_id
      AND s.anonymous_id = btrim(p_anonymous_id)
      AND (
        s.user_id IS DISTINCT FROM v_user_id
        OR (v_staff AND NOT s.is_staff)
        OR (v_test AND NOT s.is_test)
      );
  END IF;

  IF v_needs_event_backfill THEN
    UPDATE public.analytics_events AS e
    SET user_id = v_user_id
    WHERE e.session_id = p_session_id
      AND e.user_id IS NULL;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.link_analytics_session_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_analytics_session_user(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.link_analytics_session_user(uuid, text) IS
  'audiolad:analytics-lock-safety; best-effort session link; lock_timeout=250ms; identity→session→events; no-op if already linked';

CREATE OR REPLACE FUNCTION public.record_platform_signup_completed(
  p_session_id uuid,
  p_anonymous_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '250ms'
AS $$
DECLARE
  v_user_id uuid;
  v_profile_created_at timestamptz;
  v_analytics_launch_cutoff constant timestamptz := timestamptz '2026-07-16 00:00:00+00';
  v_event_id uuid;
  v_already_recorded boolean := false;
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

  v_already_recorded := EXISTS (
    SELECT 1
    FROM public.analytics_events AS e
    WHERE e.event_name = 'signup_completed'
      AND e.user_id = v_user_id
  );

  IF v_already_recorded THEN
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

  BEGIN
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
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('recorded', false, 'reason', 'lock_timeout');
    WHEN query_canceled THEN
      RETURN jsonb_build_object('recorded', false, 'reason', 'lock_timeout');
  END;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'already_recorded');
  END IF;

  RETURN jsonb_build_object('recorded', true, 'event_id', v_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_platform_signup_completed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_platform_signup_completed(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.record_platform_signup_completed(uuid, text) IS
  'audiolad:analytics-lock-safety; idempotent signup_completed; lock_timeout=250ms; fail-open on lock wait';

COMMIT;

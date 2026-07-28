BEGIN;

-- ---------------------------------------------------------------------------
-- Harden privileges on admin_analytics_p2_* SECURITY DEFINER RPCs.
-- These functions have no auth.uid() / is_platform_admin() gate and must not
-- be callable by anon or authenticated clients. Admin UI uses service_role.
-- Idempotent: safe to re-apply.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_analytics_p2_summary',
        'admin_analytics_p2_timeseries',
        'admin_analytics_p2_practices',
        'admin_analytics_p2_authors',
        'admin_analytics_p2_acquisition',
        'admin_analytics_p2_window_metrics',
        'admin_analytics_p2_utm_matches',
        'admin_analytics_p2_utm_label'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END;
$$;

-- Post-check: anon/authenticated must not retain EXECUTE
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(routine_name || ':' || grantee, ', ' ORDER BY routine_name, grantee)
  INTO v_bad
  FROM information_schema.routine_privileges
  WHERE specific_schema = 'public'
    AND routine_name LIKE 'admin_analytics_p2%'
    AND privilege_type = 'EXECUTE'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Post-check failed: admin_analytics_p2 privileges still open: %', v_bad;
  END IF;
END;
$$;

COMMIT;

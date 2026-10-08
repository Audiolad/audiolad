BEGIN;

-- Follow-up to 20261223120000 (#808). On production the week and month listening
-- cards still failed with SQLSTATE 57014. The authenticator statement_timeout is
-- 8 s, and SUM(listened_ms) over playback_usage_admin_facts ran past it. That
-- function evaluates SECURITY DEFINER helpers (is_platform_staff,
-- is_analytics_test_user, is_test_analytics_session, admin_analytics_visitor_key)
-- once per fact row. The planner cannot inline them.
--
-- playback_usage_admin_listened_ms first sums facts per
-- (session_id, user_id, anonymous_id, practice_id, author_id_snapshot) in a
-- MATERIALIZED CTE. It then applies the same filters as
-- playback_usage_admin_facts once per group. Every predicate depends only on
-- those keys, the joined practices and analytics_sessions rows, and the
-- parameters. None depends on occurred_at or listened_ms, so each group is kept
-- or dropped as a whole. SUM distributes over the groups, so the result equals
-- sum(listened_ms) FROM playback_usage_admin_facts(...) for every argument.
-- MATERIALIZED is required. Without it the planner pushes the per-user helpers
-- back below the aggregate.
--
-- admin_analytics_listening_time keeps its signature and its #808 body. Only the
-- SUM statement changes. The query_canceled guard still covers the denominators
-- only. A canceled SUM still fails the RPC, and the dashboard shows
-- "unavailable" rather than a substituted zero.
-- No table change, no index, no backfill, no timeout change. The only new grant
-- is service_role EXECUTE on the new helper, with the same REVOKE/GRANT pattern
-- as playback_usage_admin_facts.
-- Rollback: re-apply the admin_analytics_listening_time body from
-- 20261223120000_admin_listening_time_keep_sum.sql. The helper may stay, unused.

CREATE OR REPLACE FUNCTION public.playback_usage_admin_listened_ms(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH g AS MATERIALIZED (
    SELECT
      f.session_id,
      f.user_id,
      f.anonymous_id,
      f.practice_id,
      f.author_id_snapshot,
      sum(f.listened_ms)::bigint AS listened_ms
    FROM public.playback_usage_facts AS f
    WHERE f.listened_ms > 0
      AND f.usage_kind = 'consumer'
      AND (p_from IS NULL OR f.occurred_at >= p_from)
      AND (p_to IS NULL OR f.occurred_at < p_to)
      AND (p_practice_id IS NULL OR f.practice_id = p_practice_id)
    GROUP BY f.session_id, f.user_id, f.anonymous_id, f.practice_id, f.author_id_snapshot
  )
  SELECT coalesce(sum(g.listened_ms), 0)::bigint
  FROM g
  LEFT JOIN public.practices AS pr ON pr.id = g.practice_id
  LEFT JOIN public.analytics_sessions AS s ON s.id = g.session_id
  WHERE (
      p_author_id IS NULL
      OR coalesce(g.author_id_snapshot, pr.author_id) = p_author_id
    )
    AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
    AND (
      nullif(btrim(coalesce(p_device_type, '')), '') IS NULL
      OR s.device_type = nullif(btrim(coalesce(p_device_type, '')), '')
    )
    AND (
      coalesce(p_include_test, false)
      OR NOT (
        coalesce(public.is_test_anonymous_id(g.anonymous_id), false)
        OR coalesce(public.is_test_anonymous_id(s.anonymous_id), false)
        OR (g.user_id IS NOT NULL AND coalesce(public.is_platform_staff(g.user_id), false))
        OR (g.user_id IS NOT NULL AND coalesce(public.is_analytics_test_user(g.user_id), false))
        OR coalesce(s.is_staff, false)
        OR coalesce(s.is_test, false)
        OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, coalesce(s.anonymous_id, g.anonymous_id)), false)
      )
    )
    AND (
      g.user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.author_members AS am
        WHERE am.author_id = coalesce(g.author_id_snapshot, pr.author_id)
          AND am.user_id = g.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.playback_usage_admin_listened_ms(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; equals sum(listened_ms) FROM playback_usage_admin_facts(same args). Pre-aggregates per session/user/anonymous/practice/author snapshot in a MATERIALIZED CTE, then applies the same filters once per group.';

REVOKE ALL ON FUNCTION public.playback_usage_admin_listened_ms(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.playback_usage_admin_listened_ms(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_analytics_listening_time(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid_from timestamptz;
  v_effective_from timestamptz;
  v_unmeasured boolean := false;
  v_partial boolean := false;
  v_rolling_total boolean := false;
  v_listened bigint := 0;
  v_listeners integer := NULL;
  v_starts integer := NULL;
  v_metrics jsonb;
BEGIN
  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_unmeasured := p_to IS NOT NULL AND v_valid_from IS NOT NULL AND p_to <= v_valid_from;
  v_partial := NOT v_unmeasured
    AND v_valid_from IS NOT NULL
    AND (p_from IS NULL OR p_from < v_valid_from);
  v_rolling_total := p_from IS NOT NULL
    AND p_to IS NOT NULL
    AND (
      (p_to - p_from) = interval '7 days'
      OR (p_to - p_from) = interval '30 days'
    );

  IF v_valid_from IS NULL THEN
    v_effective_from := p_from;
  ELSIF p_from IS NULL OR p_from < v_valid_from THEN
    v_effective_from := v_valid_from;
  ELSE
    v_effective_from := p_from;
  END IF;

  IF NOT v_unmeasured THEN
    -- Same value as the SUM over playback_usage_admin_facts with these arguments.
    -- The helper runs the per-user filters once per group, not once per fact.
    v_listened := public.playback_usage_admin_listened_ms(
      v_effective_from,
      p_to,
      p_include_test,
      p_author_id,
      p_practice_id,
      p_utm_source,
      p_device_type
    );

    IF NOT v_rolling_total THEN
      BEGIN
        v_metrics := public.admin_analytics_p2_window_metrics(
          v_effective_from,
          p_to,
          coalesce(p_include_test, false),
          p_author_id,
          p_practice_id,
          p_utm_source,
          p_device_type
        );
        v_listeners := coalesce((v_metrics ->> 'listeners')::integer, 0);
        v_starts := coalesce((v_metrics ->> 'play_starts')::integer, 0);
      EXCEPTION
        WHEN query_canceled THEN
          PERFORM set_config('statement_timeout', '0', true);
          v_listeners := NULL;
          v_starts := NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'listened_ms', CASE WHEN v_unmeasured THEN NULL ELSE v_listened END,
    'measured_listeners', CASE
      WHEN v_unmeasured OR v_listeners IS NULL THEN NULL
      ELSE v_listeners
    END,
    'measured_play_starts', CASE
      WHEN v_unmeasured OR v_starts IS NULL THEN NULL
      ELSE v_starts
    END,
    'effective_from', CASE WHEN v_unmeasured THEN NULL ELSE v_effective_from END,
    'valid_from', v_valid_from,
    'partial', v_partial,
    'unmeasured', v_unmeasured
  );
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_listening_time(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; SUM(listened_ms) via playback_usage_admin_listened_ms (grouped, same value as playback_usage_admin_facts) plus measured-window listeners and audio_play_started for averages. Exact 7-day and 30-day intervals skip denominators. A canceled denominator scan keeps the sum and returns JSON null listeners, not zero.';

NOTIFY pgrst, 'reload schema';

COMMIT;

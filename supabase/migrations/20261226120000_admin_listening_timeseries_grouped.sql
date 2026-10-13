BEGIN;

-- Follow-up to 20261224120000 (#809). admin_analytics_listening_time was fixed,
-- but admin_analytics_listening_time_timeseries still summed
-- playback_usage_admin_facts(...) grouped by bucket. That function runs the
-- SECURITY DEFINER helpers (is_platform_staff, is_analytics_test_user,
-- is_test_analytics_session, admin_analytics_visitor_key) once per fact row.
-- On production this took 6.6-6.8 s per call for 30d / 90d / 120d / weekly
-- ranges when run alone, so under the dashboard's concurrent RPCs it crossed the
-- 8 s authenticator statement_timeout (SQLSTATE 57014).
--
-- playback_usage_admin_listened_ms_by_bucket groups facts per
-- (bucket, session_id, user_id, anonymous_id, practice_id, author_id_snapshot)
-- in a MATERIALIZED CTE, then applies the same filters as
-- playback_usage_admin_facts once per group. Every predicate depends only on
-- those keys, the joined practices / analytics_sessions rows and the
-- parameters, so a group is kept or dropped as a whole and the per-bucket sum
-- equals sum(listened_ms) GROUP BY bucket over playback_usage_admin_facts.
-- MATERIALIZED is required; otherwise the planner pushes the per-user helpers
-- back below the aggregate.
--
-- admin_analytics_listening_time_timeseries keeps its signature, bucket policy
-- and JSON shape. Only the usage_points CTE changes. No table change, no index,
-- no backfill, no timeout change. New grant: service_role EXECUTE on the helper
-- only (same REVOKE/GRANT pattern as playback_usage_admin_facts).
-- Rollback: re-apply the admin_analytics_listening_time_timeseries body from
-- 20261127120000_playback_usage_facts.sql. The helper may stay, unused.

CREATE OR REPLACE FUNCTION public.playback_usage_admin_listened_ms_by_bucket(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_granularity text DEFAULT 'day',
  p_tz text DEFAULT 'Europe/Moscow'
)
RETURNS TABLE (bucket_local timestamp, listened_ms bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH g AS MATERIALIZED (
    SELECT
      date_trunc(
        CASE WHEN p_granularity = 'week' THEN 'week' ELSE 'day' END,
        f.occurred_at AT TIME ZONE p_tz
      ) AS bucket_local,
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
    GROUP BY 1, f.session_id, f.user_id, f.anonymous_id, f.practice_id, f.author_id_snapshot
  )
  SELECT g.bucket_local, sum(g.listened_ms)::bigint
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
    )
  GROUP BY g.bucket_local;
$$;

COMMENT ON FUNCTION public.playback_usage_admin_listened_ms_by_bucket(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text
) IS
  'audiolad:playback-usage; per-bucket sum(listened_ms) equal to date_trunc(granularity, occurred_at AT TIME ZONE tz) GROUP BY over playback_usage_admin_facts(same args). Pre-aggregates per session/user/anonymous/practice/author snapshot in a MATERIALIZED CTE, then applies the same filters once per group. granularity: week or day.';

REVOKE ALL ON FUNCTION public.playback_usage_admin_listened_ms_by_bucket(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.playback_usage_admin_listened_ms_by_bucket(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_analytics_listening_time_timeseries(
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
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz constant text := 'Europe/Moscow';
  v_max_points constant int := 400;
  v_include_test boolean := coalesce(p_include_test, false);
  v_from timestamptz;
  v_to timestamptz;
  v_earliest timestamptz;
  v_span_days numeric;
  v_granularity text;
  v_step interval;
  v_start_local timestamp;
  v_end_local timestamp;
  v_points int;
  v_data_from timestamptz;
  v_valid_from timestamptz;
  v_result jsonb;
BEGIN
  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_to := coalesce(p_to, now());

  IF p_from IS NOT NULL THEN
    v_from := p_from;
  ELSE
    SELECT least(
      (SELECT min(s.started_at) FROM public.analytics_sessions AS s WHERE s.started_at < v_to),
      (SELECT min(e.occurred_at) FROM public.analytics_events AS e WHERE e.occurred_at < v_to)
    )
    INTO v_earliest;

    v_from := coalesce(v_earliest, v_to - interval '29 days');
  END IF;

  IF v_from >= v_to THEN
    v_from := v_to - interval '1 day';
  END IF;

  v_span_days := extract(epoch FROM (v_to - v_from)) / 86400.0;

  IF v_span_days > 120 THEN
    v_granularity := 'week';
    v_step := interval '7 days';
  ELSE
    v_granularity := 'day';
    v_step := interval '1 day';
  END IF;

  v_start_local := date_trunc(v_granularity, (v_from AT TIME ZONE v_tz));
  v_end_local := date_trunc(
    v_granularity,
    ((v_to - interval '1 microsecond') AT TIME ZONE v_tz)
  );

  IF v_end_local < v_start_local THEN
    v_end_local := v_start_local;
  END IF;

  v_points := 1 + floor(
    extract(epoch FROM (v_end_local - v_start_local)) / extract(epoch FROM v_step)
  )::int;

  IF v_points > v_max_points THEN
    v_start_local := v_end_local - (v_step * (v_max_points - 1));
    v_points := v_max_points;
  END IF;

  v_data_from := greatest(v_start_local AT TIME ZONE v_tz, v_from);

  WITH buckets AS (
    SELECT g AS bucket_local
    FROM generate_series(v_start_local, v_end_local, v_step) AS g
  ),
  usage_points AS (
    SELECT
      u.bucket_local,
      u.listened_ms
    FROM public.playback_usage_admin_listened_ms_by_bucket(
      v_data_from, v_to, v_include_test, p_author_id, p_practice_id, p_utm_source, p_device_type,
      v_granularity, v_tz
    ) AS u
  )
  SELECT jsonb_build_object(
    'granularity', v_granularity,
    'valid_from', v_valid_from,
    'points', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket', to_char(b.bucket_local, 'YYYY-MM-DD'),
          'listened_ms', CASE
            WHEN v_valid_from IS NOT NULL
              AND ((b.bucket_local + v_step) AT TIME ZONE v_tz) <= v_valid_from
              THEN NULL
            ELSE coalesce(up.listened_ms, 0)
          END
        )
        ORDER BY b.bucket_local
      )
      FROM buckets AS b
      LEFT JOIN usage_points AS up ON up.bucket_local = b.bucket_local
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(
    v_result,
    jsonb_build_object('granularity', v_granularity, 'valid_from', v_valid_from, 'points', '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_listening_time_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; listening time buckets aligned with admin_analytics_p2_timeseries, summed via playback_usage_admin_listened_ms_by_bucket (grouped, same value as playback_usage_admin_facts). Buckets that end before listening_time_valid_from are JSON null, not zero.';

NOTIFY pgrst, 'reload schema';

COMMIT;

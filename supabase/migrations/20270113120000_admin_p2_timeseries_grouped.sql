BEGIN;

-- Replace the latest P2 timeseries body (20261006120000), using the current
-- canonical event semantics from 20261006120200. Avoid SECURITY DEFINER calls
-- for every event: materialize counts by bucket/session/user/anonymous/practice/
-- event/active identity, then evaluate test-session and visitor helpers per group.
-- Sessions and registrations already have one row per session/profile; their
-- predicates and the complete bucket/JSON policy are unchanged.
-- Identity lookup stays time-aware (including unlink boundaries); grouping by
-- bucket alone would silently change distinct-person metrics.
-- No table/index changes. Rollback: restore the previous function body.

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_timeseries(
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
  v_device text := nullif(btrim(coalesce(p_device_type, '')), '');
  v_product_filter boolean := (p_author_id IS NOT NULL OR p_practice_id IS NOT NULL);
  v_session_filter boolean := (
    nullif(btrim(coalesce(p_utm_source, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(p_device_type, '')), '') IS NOT NULL
  );
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
  v_result jsonb;
BEGIN
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

  -- Hard cap on returned points; keep the most recent buckets.
  IF v_points > v_max_points THEN
    v_start_local := v_end_local - (v_step * (v_max_points - 1));
    v_points := v_max_points;
  END IF;

  v_data_from := greatest(v_start_local AT TIME ZONE v_tz, v_from);

  WITH buckets AS (
    SELECT g AS bucket_local
    FROM generate_series(v_start_local, v_end_local, v_step) AS g
  ),
  period_sessions AS (
    SELECT
      date_trunc(v_granularity, s.started_at AT TIME ZONE v_tz) AS bucket_local,
      public.admin_analytics_visitor_key(s.user_id, s.anonymous_id, s.started_at) AS visitor_key
    FROM public.analytics_sessions AS s
    WHERE s.started_at >= v_data_from
      AND s.started_at < v_to
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
      AND (
        v_include_test
        OR NOT (
          s.is_staff OR s.is_test OR s.is_bot
          OR public.is_test_analytics_session(s.utm_campaign, s.anonymous_id)
        )
      )
  ),
  -- Cheap row predicates first; all remaining predicates depend on group keys.
  -- The active identity link is part of the key: login/unlink within one bucket
  -- must not merge different visitors. Match visitor_key's ORDER BY exactly.
  event_groups AS MATERIALIZED (
    SELECT
      date_trunc(v_granularity, e.occurred_at AT TIME ZONE v_tz) AS bucket_local,
      e.event_name, e.user_id, e.session_id, e.anonymous_session_id,
      e.practice_id,
      CASE WHEN e.user_id IS NULL THEN (
        SELECT l.user_id
        FROM public.analytics_identity_links l
        WHERE l.anonymous_id = btrim(coalesce(s.anonymous_id, e.anonymous_session_id))
          AND l.linked_at <= e.occurred_at
          AND (l.unlinked_at IS NULL OR l.unlinked_at > e.occurred_at)
        ORDER BY l.linked_at DESC LIMIT 1
      ) END AS linked_user_id,
      min(e.occurred_at) AS identity_at,
      count(*) AS event_count
    FROM public.analytics_events e
    LEFT JOIN public.analytics_sessions s ON s.id = e.session_id
    WHERE e.occurred_at >= v_data_from AND e.occurred_at < v_to
      AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
      AND e.event_name IN ('practice_view', 'audio_play_started',
        'audio_progress_25', 'audio_completed', 'first_manual_library_save')
      AND (v_include_test OR NOT (
        coalesce(e.is_staff, false) OR coalesce(e.is_test, false)
        OR coalesce(e.is_bot, false)
        OR coalesce(e.traffic_class, 'human') <> 'human'
      ))
    GROUP BY 1, 2, 3, 4, 5, 6, 7
  ),
  included_events AS MATERIALIZED (
    SELECT g.bucket_local, g.event_name, g.user_id, g.event_count,
      public.admin_analytics_visitor_key(
        g.user_id, coalesce(s.anonymous_id, g.anonymous_session_id), g.identity_at
      ) AS visitor_key
    FROM event_groups g
    LEFT JOIN public.analytics_sessions s ON s.id = g.session_id
    JOIN public.practices pr ON pr.id = g.practice_id
    WHERE (p_author_id IS NULL OR pr.author_id = p_author_id)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
      AND (v_include_test OR NOT (
        coalesce(public.is_test_anonymous_id(g.anonymous_session_id), false)
        OR coalesce(s.is_staff, false) OR coalesce(s.is_test, false)
        OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
      ))
      AND (g.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.author_members am
        WHERE am.author_id = pr.author_id AND am.user_id = g.user_id
      ))
  ),
  period_profiles AS (
    SELECT p.id, p.created_at
    FROM public.profiles AS p
    WHERE p.created_at >= v_data_from
      AND p.created_at < v_to
  ),
  profile_sessions AS (
    SELECT
      s.user_id,
      (s.is_staff OR s.is_test OR s.is_bot
        OR public.is_test_analytics_session(s.utm_campaign, s.anonymous_id)
      ) AS is_service,
      (
        public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
        AND (v_device IS NULL OR s.device_type = v_device)
      ) AS matches_filters
    FROM public.analytics_sessions AS s
    WHERE s.user_id IN (SELECT id FROM period_profiles)
  ),
  included_profiles AS (
    SELECT
      date_trunc(v_granularity, pp.created_at AT TIME ZONE v_tz) AS bucket_local
    FROM period_profiles AS pp
    WHERE (
        v_include_test
        OR (
          NOT coalesce(public.is_platform_staff(pp.id), false)
          AND NOT coalesce(public.is_analytics_test_user(pp.id), false)
          AND (
            NOT EXISTS (
              SELECT 1 FROM profile_sessions AS ps WHERE ps.user_id = pp.id
            )
            OR EXISTS (
              SELECT 1 FROM profile_sessions AS ps
              WHERE ps.user_id = pp.id AND NOT ps.is_service
            )
          )
        )
      )
      AND (
        NOT v_session_filter
        OR EXISTS (
          SELECT 1 FROM profile_sessions AS ps
          WHERE ps.user_id = pp.id
            AND ps.matches_filters
            AND (v_include_test OR NOT ps.is_service)
        )
      )
      AND (
        NOT v_product_filter
        OR EXISTS (
          SELECT 1 FROM included_events AS ie WHERE ie.user_id = pp.id
        )
      )
  ),
  session_points AS (
    SELECT bucket_local, count(DISTINCT visitor_key)::int AS visitors
    FROM period_sessions
    WHERE visitor_key IS NOT NULL
    GROUP BY bucket_local
  ),
  event_visitor_points AS (
    SELECT bucket_local, count(DISTINCT visitor_key)::int AS visitors
    FROM included_events
    WHERE visitor_key IS NOT NULL
    GROUP BY bucket_local
  ),
  registration_points AS (
    SELECT bucket_local, count(*)::int AS registrations
    FROM included_profiles
    GROUP BY bucket_local
  ),
  event_points AS (
    SELECT
      bucket_local,
      sum(event_count) FILTER (WHERE event_name = 'practice_view')::int AS practice_views,
      sum(event_count) FILTER (WHERE event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
      )::int AS listeners,
      sum(event_count) FILTER (WHERE event_name = 'audio_completed')::int AS completions,
      sum(event_count) FILTER (WHERE event_name = 'first_manual_library_save')::int AS saves
    FROM included_events
    GROUP BY bucket_local
  )
  SELECT jsonb_build_object(
    'granularity', v_granularity,
    'points', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket', to_char(b.bucket_local, 'YYYY-MM-DD'),
          'visitors', CASE
            WHEN v_product_filter THEN coalesce(evp.visitors, 0)
            ELSE coalesce(sp.visitors, 0)
          END,
          'registrations', coalesce(rp.registrations, 0),
          'practice_views', coalesce(ep.practice_views, 0),
          'play_starts', coalesce(ep.play_starts, 0),
          'listeners', coalesce(ep.listeners, 0),
          'completions', coalesce(ep.completions, 0),
          'saves', coalesce(ep.saves, 0)
        )
        ORDER BY b.bucket_local
      )
      FROM buckets AS b
      LEFT JOIN session_points AS sp ON sp.bucket_local = b.bucket_local
      LEFT JOIN event_visitor_points AS evp ON evp.bucket_local = b.bucket_local
      LEFT JOIN registration_points AS rp ON rp.bucket_local = b.bucket_local
      LEFT JOIN event_points AS ep ON ep.bucket_local = b.bucket_local
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(v_result, jsonb_build_object('granularity', v_granularity, 'points', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_p2_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

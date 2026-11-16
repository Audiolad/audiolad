-- Rollback for 20270315120000_analytics_prefetch_ghost_visitors.sql (t1508u).
-- Restores the previous production bodies, then drops the helper.

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_timeseries(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_include_test boolean DEFAULT false, p_author_id uuid DEFAULT NULL::uuid, p_practice_id uuid DEFAULT NULL::uuid, p_utm_source text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  included_events AS (
    SELECT date_trunc(v_granularity,occurred_at AT TIME ZONE v_tz) AS bucket_local,event_name,user_id,visitor_key
    FROM public.analytics_product_event_facts(v_data_from,v_to,p_author_id,p_practice_id,v_include_test)
    WHERE public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (v_device IS NULL OR device_type=v_device)
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
      count(*) FILTER (WHERE event_name = 'practice_view')::int AS practice_views,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
      )::int AS listeners,
      count(*) FILTER (WHERE event_name = 'audio_completed')::int AS completions,
      count(*) FILTER (WHERE event_name = 'first_manual_library_save')::int AS saves
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_window_metrics(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_include_test boolean DEFAULT false, p_author_id uuid DEFAULT NULL::uuid, p_practice_id uuid DEFAULT NULL::uuid, p_utm_source text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_include_test boolean := coalesce(p_include_test, false);
  v_device text := nullif(btrim(coalesce(p_device_type, '')), '');
  v_product_filter boolean := (p_author_id IS NOT NULL OR p_practice_id IS NOT NULL);
  v_session_filter boolean := (
    nullif(btrim(coalesce(p_utm_source, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(p_device_type, '')), '') IS NOT NULL
  );
  v_result jsonb;
BEGIN
  WITH period_sessions AS (
    SELECT
      s.id,
      s.started_at,
      (s.is_staff OR s.is_test OR s.is_bot
        OR public.is_test_analytics_session(s.utm_campaign, s.anonymous_id)
      ) AS is_service,
      public.admin_analytics_visitor_key(s.user_id, s.anonymous_id, s.started_at) AS visitor_key
    FROM public.analytics_sessions AS s
    WHERE (p_from IS NULL OR s.started_at >= p_from)
      AND (p_to IS NULL OR s.started_at < p_to)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
  ),
  included_sessions AS (
    SELECT * FROM period_sessions WHERE v_include_test OR NOT is_service
  ),
  excluded_service AS (
    SELECT
      count(*)::int AS sessions,
      count(DISTINCT visitor_key)::int AS visitors
    FROM period_sessions
    WHERE is_service
  ),
  period_events AS (
    SELECT * FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,v_include_test)
    WHERE public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (v_device IS NULL OR device_type=v_device)
  ),
  included_events AS (
    SELECT * FROM period_events
  ),
  period_profiles AS (
    SELECT p.id, p.created_at
    FROM public.profiles AS p
    WHERE (p_from IS NULL OR p.created_at >= p_from)
      AND (p_to IS NULL OR p.created_at < p_to)
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
    SELECT pp.id, pp.created_at
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
  )
  SELECT jsonb_build_object(
    'sessions', CASE
      WHEN v_product_filter THEN (
        SELECT count(DISTINCT ie.session_id)::int
        FROM included_events AS ie
        WHERE ie.session_id IS NOT NULL
      )
      ELSE (SELECT count(*)::int FROM included_sessions)
    END,
    'visitors', CASE
      WHEN v_product_filter THEN (
        SELECT count(DISTINCT ie.visitor_key)::int
        FROM included_events AS ie
        WHERE ie.visitor_key IS NOT NULL
      )
      ELSE (
        SELECT count(DISTINCT s.visitor_key)::int
        FROM included_sessions AS s
        WHERE s.visitor_key IS NOT NULL
      )
    END,
    'registrations', (SELECT count(*)::int FROM included_profiles),
    'excluded_service_sessions', (SELECT sessions FROM excluded_service),
    'excluded_service_visitors', (SELECT visitors FROM excluded_service),
    'practice_views', (
      SELECT count(*)::int FROM included_events WHERE event_name = 'practice_view'
    ),
    'play_starts', (
      SELECT count(*)::int FROM included_events WHERE event_name = 'audio_play_started'
    ),
    'completions', (
      SELECT count(*)::int FROM included_events WHERE event_name = 'audio_completed'
    ),
    'saves', (
      SELECT count(*)::int FROM included_events WHERE event_name = 'first_manual_library_save'
    ),
    'practice_visitors', (
      SELECT count(DISTINCT visitor_key)::int
      FROM included_events
      WHERE event_name = 'practice_view' AND visitor_key IS NOT NULL
    ),
    'listeners', (
      SELECT count(DISTINCT visitor_key)::int
      FROM included_events
      WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
    ),
    'completers', (
      SELECT count(DISTINCT visitor_key)::int
      FROM included_events
      WHERE event_name = 'audio_completed' AND visitor_key IS NOT NULL
    ),
    'savers', (
      SELECT count(DISTINCT visitor_key)::int
      FROM included_events
      WHERE event_name = 'first_manual_library_save' AND visitor_key IS NOT NULL
    )
  )
  INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_acquisition(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_include_test boolean DEFAULT false, p_author_id uuid DEFAULT NULL::uuid, p_practice_id uuid DEFAULT NULL::uuid, p_utm_source text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort text DEFAULT 'sessions'::text, p_sort_dir text DEFAULT 'desc'::text, p_group text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_include_test boolean := coalesce(p_include_test, false);
  v_device text := nullif(btrim(coalesce(p_device_type, '')), '');
  v_product_filter boolean := (p_author_id IS NOT NULL OR p_practice_id IS NOT NULL);
  v_session_filter boolean := (
    nullif(btrim(coalesce(p_utm_source, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(p_device_type, '')), '') IS NOT NULL
  );
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort text := lower(btrim(coalesce(p_sort, '')));
  v_dir text := lower(btrim(coalesce(p_sort_dir, '')));
  v_group text := lower(btrim(coalesce(p_group, '')));
  v_result jsonb;
BEGIN
  IF v_sort NOT IN (
    'group', 'sessions', 'visitors', 'registrations', 'play_starts', 'listeners', 'saves'
  ) THEN
    v_sort := 'sessions';
  END IF;
  IF v_dir NOT IN ('asc', 'desc') THEN
    v_dir := 'desc';
  END IF;
  IF v_group NOT IN ('source', 'campaign', 'medium') THEN
    v_group := '';
  END IF;
  WITH included_events AS (
    SELECT user_id,session_id,event_name,btrim(coalesce(utm_source,'')) AS utm_source,btrim(coalesce(utm_medium,'')) AS utm_medium,btrim(coalesce(utm_campaign,'')) AS utm_campaign,btrim(coalesce(utm_content,'')) AS utm_content,visitor_key
    FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,v_include_test)
    WHERE public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (v_device IS NULL OR device_type=v_device)
  ),
  period_sessions AS (
    SELECT
      s.id,
      btrim(coalesce(s.utm_source, '')) AS utm_source,
      btrim(coalesce(s.utm_medium, '')) AS utm_medium,
      btrim(coalesce(s.utm_campaign, '')) AS utm_campaign,
      btrim(coalesce(s.utm_content, '')) AS utm_content,
      public.admin_analytics_visitor_key(s.user_id, s.anonymous_id, s.started_at) AS visitor_key
    FROM public.analytics_sessions AS s
    WHERE (p_from IS NULL OR s.started_at >= p_from)
      AND (p_to IS NULL OR s.started_at < p_to)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
      AND (
        v_include_test
        OR NOT (
          s.is_staff OR s.is_test OR s.is_bot
          OR public.is_test_analytics_session(s.utm_campaign, s.anonymous_id)
        )
      )
      AND (
        NOT v_product_filter
        OR s.id IN (
          SELECT ie.session_id FROM included_events AS ie WHERE ie.session_id IS NOT NULL
        )
      )
  ),
  session_stats AS (
    SELECT
      utm_source, utm_medium, utm_campaign, utm_content,
      count(*)::int AS sessions,
      count(DISTINCT visitor_key)::int AS visitors
    FROM period_sessions
    GROUP BY utm_source, utm_medium, utm_campaign, utm_content
  ),
  event_stats AS (
    SELECT
      utm_source, utm_medium, utm_campaign, utm_content,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
      )::int AS listeners,
      count(*) FILTER (WHERE event_name = 'first_manual_library_save')::int AS saves
    FROM included_events
    GROUP BY utm_source, utm_medium, utm_campaign, utm_content
  ),
  period_profiles AS (
    SELECT p.id, p.created_at
    FROM public.profiles AS p
    WHERE (p_from IS NULL OR p.created_at >= p_from)
      AND (p_to IS NULL OR p.created_at < p_to)
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
    SELECT pp.id
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
        NOT v_product_filter
        OR EXISTS (
          SELECT 1 FROM included_events AS ie WHERE ie.user_id = pp.id
        )
      )
  ),
  registration_touch AS (
    SELECT
      ip.id AS user_id,
      touch.utm_source,
      touch.utm_medium,
      touch.utm_campaign,
      touch.utm_content
    FROM included_profiles AS ip
    LEFT JOIN LATERAL (
      SELECT
        btrim(coalesce(s.utm_source, '')) AS utm_source,
        btrim(coalesce(s.utm_medium, '')) AS utm_medium,
        btrim(coalesce(s.utm_campaign, '')) AS utm_campaign,
        btrim(coalesce(s.utm_content, '')) AS utm_content
      FROM public.analytics_sessions AS s
      WHERE s.user_id = ip.id
        AND (p_from IS NULL OR s.started_at >= p_from)
        AND (p_to IS NULL OR s.started_at < p_to)
        AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
        AND (v_device IS NULL OR s.device_type = v_device)
        AND (
          v_include_test
          OR NOT (
            s.is_staff OR s.is_test OR s.is_bot
            OR public.is_test_analytics_session(s.utm_campaign, s.anonymous_id)
          )
        )
      ORDER BY s.started_at ASC, s.id ASC
      LIMIT 1
    ) AS touch ON true
    WHERE touch.utm_source IS NOT NULL
      OR NOT (v_session_filter OR v_product_filter)
  ),
  registration_stats AS (
    SELECT
      coalesce(utm_source, '') AS utm_source,
      coalesce(utm_medium, '') AS utm_medium,
      coalesce(utm_campaign, '') AS utm_campaign,
      coalesce(utm_content, '') AS utm_content,
      count(*)::int AS registrations
    FROM registration_touch
    GROUP BY 1, 2, 3, 4
  ),
  keys AS (
    SELECT utm_source, utm_medium, utm_campaign, utm_content FROM session_stats
    UNION
    SELECT utm_source, utm_medium, utm_campaign, utm_content FROM event_stats
    UNION
    SELECT utm_source, utm_medium, utm_campaign, utm_content FROM registration_stats
  ),
  rows_all AS (
    SELECT
      k.utm_source,
      k.utm_medium,
      k.utm_campaign,
      k.utm_content,
      coalesce(ss.sessions, 0) AS sessions,
      coalesce(ss.visitors, 0) AS visitors,
      coalesce(rs.registrations, 0) AS registrations,
      coalesce(es.play_starts, 0) AS play_starts,
      coalesce(es.listeners, 0) AS listeners,
      coalesce(es.saves, 0) AS saves
    FROM keys AS k
    LEFT JOIN session_stats AS ss
      ON ss.utm_source = k.utm_source
      AND ss.utm_medium = k.utm_medium
      AND ss.utm_campaign = k.utm_campaign
      AND ss.utm_content = k.utm_content
    LEFT JOIN event_stats AS es
      ON es.utm_source = k.utm_source
      AND es.utm_medium = k.utm_medium
      AND es.utm_campaign = k.utm_campaign
      AND es.utm_content = k.utm_content
    LEFT JOIN registration_stats AS rs
      ON rs.utm_source = k.utm_source
      AND rs.utm_medium = k.utm_medium
      AND rs.utm_campaign = k.utm_campaign
      AND rs.utm_content = k.utm_content
  ),
  rolled AS (
    SELECT
      r.utm_source,
      r.utm_medium,
      r.utm_campaign,
      r.utm_content,
      r.sessions,
      r.visitors,
      r.registrations,
      r.play_starts,
      r.listeners,
      r.saves,
      public.admin_analytics_p2_utm_label(
        r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content
      ) AS sort_label
    FROM rows_all AS r
    WHERE v_group = ''
    UNION ALL
    SELECT
      CASE WHEN v_group = 'source' THEN g.group_key ELSE '' END,
      CASE WHEN v_group = 'medium' THEN g.group_key ELSE '' END,
      CASE WHEN v_group = 'campaign' THEN g.group_key ELSE '' END,
      ''::text,
      g.sessions,
      g.visitors,
      g.registrations,
      g.play_starts,
      g.listeners,
      g.saves,
      CASE
        WHEN g.group_key = '' THEN 'Без UTM / прямые и неопределённые переходы'
        ELSE g.group_key
      END
    FROM (
      SELECT
        CASE v_group
          WHEN 'campaign' THEN utm_campaign
          WHEN 'medium' THEN utm_medium
          ELSE utm_source
        END AS group_key,
        sum(sessions)::int AS sessions,
        sum(visitors)::int AS visitors,
        sum(registrations)::int AS registrations,
        sum(play_starts)::int AS play_starts,
        sum(listeners)::int AS listeners,
        sum(saves)::int AS saves
      FROM rows_all
      WHERE v_group <> ''
      GROUP BY 1
    ) AS g
  ),
  ranked AS (
    SELECT
      rolled.*,
      CASE v_sort
        WHEN 'group' THEN NULL
        WHEN 'sessions' THEN rolled.sessions::numeric
        WHEN 'visitors' THEN rolled.visitors::numeric
        WHEN 'registrations' THEN rolled.registrations::numeric
        WHEN 'play_starts' THEN rolled.play_starts::numeric
        WHEN 'listeners' THEN rolled.listeners::numeric
        WHEN 'saves' THEN rolled.saves::numeric
        ELSE rolled.sessions::numeric
      END AS sort_value,
      CASE WHEN v_sort = 'group' THEN rolled.sort_label ELSE NULL END AS sort_text
    FROM rolled
  ),
  page AS (
    SELECT *
    FROM ranked
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN sort_value END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_value END DESC NULLS LAST,
      CASE WHEN v_dir = 'asc' THEN sort_text END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_text END DESC NULLS LAST,
      sessions DESC,
      visitors DESC,
      registrations DESC,
      utm_source ASC,
      utm_medium ASC,
      utm_campaign ASC,
      utm_content ASC,
      sort_label ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'attribution', 'session_touch',
    'total', (SELECT count(*)::int FROM ranked),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'utmSource', pg.utm_source,
          'utmMedium', pg.utm_medium,
          'utmCampaign', pg.utm_campaign,
          'utmContent', pg.utm_content,
          'label', pg.sort_label,
          'sessions', pg.sessions,
          'visitors', pg.visitors,
          'registrations', pg.registrations,
          'playStarts', pg.play_starts,
          'listeners', pg.listeners,
          'saves', pg.saves
        )
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN pg.sort_value END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_value END DESC NULLS LAST,
          CASE WHEN v_dir = 'asc' THEN pg.sort_text END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_text END DESC NULLS LAST,
          pg.sessions DESC,
          pg.visitors DESC,
          pg.registrations DESC,
          pg.utm_source ASC,
          pg.utm_medium ASC,
          pg.utm_campaign ASC,
          pg.utm_content ASC,
          pg.sort_label ASC
      )
      FROM page AS pg
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(
    v_result,
    jsonb_build_object('attribution', 'session_touch', 'total', 0, 'rows', '[]'::jsonb)
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.analytics_session_is_prefetch_ghost(
  uuid, uuid, text, timestamptz, timestamptz, text, text, text
);

BEGIN;

-- Shared product-analytics facts. This is deliberately a function, rather than
-- a view/materialization: it keeps the event predicate in one audited place and
-- applies the content owner at the event's practice.
CREATE OR REPLACE FUNCTION public.analytics_product_event_facts(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS TABLE (
  event_id uuid,
  session_id uuid,
  user_id uuid,
  event_name text,
  practice_id uuid,
  author_id uuid,
  occurred_at timestamptz,
  listening_day date,
  visitor_key text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  device_type text,
  referrer_domain text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id, e.session_id, e.user_id, e.event_name, e.practice_id, pr.author_id,
    e.occurred_at,
    (e.occurred_at AT TIME ZONE 'Europe/Moscow')::date,
    coalesce(public.admin_analytics_visitor_key(
      e.user_id, coalesce(s.anonymous_id, e.anonymous_session_id), e.occurred_at
    ), e.id::text),
    s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.device_type, s.referrer_domain
  FROM public.analytics_events e
  LEFT JOIN public.analytics_sessions s ON s.id = e.session_id
  JOIN public.practices pr ON pr.id = e.practice_id
  WHERE (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at < p_to)
    AND (p_author_id IS NULL OR pr.author_id = p_author_id)
    AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
    AND e.event_name IN (
      'practice_view', 'audio_play_started', 'audio_progress_25',
      'audio_completed', 'first_manual_library_save'
    )
    AND (
      p_include_test OR NOT (
        coalesce(e.is_staff, false)
        OR coalesce(e.is_test, false)
        OR coalesce(e.is_bot, false)
        OR coalesce(e.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
        OR coalesce(s.is_staff, false)
        OR coalesce(s.is_test, false)
        OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
      )
    )
    -- This is content-owner scoped: being a member of Author A never hides an
    -- event for Author B.
    AND (
      e.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.author_members am
        WHERE am.author_id = pr.author_id AND am.user_id = e.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.analytics_product_event_facts(timestamptz, timestamptz, uuid, uuid, boolean) IS
  'audiolad:analytics:shared-product-semantics; canonical human product events, identity, owner-scoped self-traffic exclusion, and Europe/Moscow listening day';



CREATE OR REPLACE FUNCTION public.admin_analytics_p2_window_metrics(
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
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_prev_from timestamptz DEFAULT NULL,
  p_prev_to timestamptz DEFAULT NULL,
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
  v_current jsonb;
  v_previous jsonb := NULL;
BEGIN
  v_current := public.admin_analytics_p2_window_metrics(
    p_from, p_to, coalesce(p_include_test, false),
    p_author_id, p_practice_id, p_utm_source, p_device_type
  );

  IF p_prev_from IS NOT NULL AND p_prev_to IS NOT NULL THEN
    v_previous := public.admin_analytics_p2_window_metrics(
      p_prev_from, p_prev_to, coalesce(p_include_test, false),
      p_author_id, p_practice_id, p_utm_source, p_device_type
    );
  END IF;

  RETURN jsonb_build_object(
    'audience', jsonb_build_object(
      'sessions', v_current -> 'sessions',
      'visitors', v_current -> 'visitors',
      'registrations', v_current -> 'registrations',
      'excluded_service_sessions', v_current -> 'excluded_service_sessions',
      'excluded_service_visitors', v_current -> 'excluded_service_visitors'
    ),
    'events', jsonb_build_object(
      'practice_views', v_current -> 'practice_views',
      'play_starts', v_current -> 'play_starts',
      'completions', v_current -> 'completions',
      'saves', v_current -> 'saves'
    ),
    'people', jsonb_build_object(
      'practice_visitors', v_current -> 'practice_visitors',
      'listeners', v_current -> 'listeners',
      'completers', v_current -> 'completers',
      'savers', v_current -> 'savers'
    ),
    'purchases', NULL::jsonb,
    'previous', CASE
      WHEN v_previous IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object(
        'sessions', v_previous -> 'sessions',
        'visitors', v_previous -> 'visitors',
        'registrations', v_previous -> 'registrations',
        'practice_views', v_previous -> 'practice_views',
        'play_starts', v_previous -> 'play_starts',
        'listeners', v_previous -> 'listeners',
        'completions', v_previous -> 'completions',
        'saves', v_previous -> 'saves',
        'savers', v_previous -> 'savers'
      )
    END
  );
END;
$$;

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
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_practices(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_sort text DEFAULT 'play_starts',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_include_test boolean := coalesce(p_include_test, false);
  v_device text := nullif(btrim(coalesce(p_device_type, '')), '');
  v_sort text := lower(btrim(coalesce(p_sort, '')));
  v_dir text := lower(btrim(coalesce(p_sort_dir, '')));
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF v_sort NOT IN (
    'views', 'play_starts', 'listeners', 'completions', 'saves',
    'view_to_play', 'play_to_complete'
  ) THEN
    v_sort := 'play_starts';
  END IF;

  IF v_dir NOT IN ('asc', 'desc') THEN
    v_dir := 'desc';
  END IF;

  included_events AS (
    SELECT practice_id,event_name,visitor_key FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,v_include_test)
    WHERE practice_id IS NOT NULL AND public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (v_device IS NULL OR device_type=v_device)
  ),
  practice_stats AS (
    SELECT
      practice_id,
      count(*) FILTER (WHERE event_name = 'practice_view')::int AS views,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'practice_view' AND visitor_key IS NOT NULL
      )::int AS unique_visitors,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
      )::int AS unique_listeners,
      count(*) FILTER (WHERE event_name = 'audio_completed')::int AS completions,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'audio_completed' AND visitor_key IS NOT NULL
      )::int AS unique_completers,
      count(*) FILTER (WHERE event_name = 'first_manual_library_save')::int AS saves,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'first_manual_library_save' AND visitor_key IS NOT NULL
      )::int AS unique_savers
    FROM included_events
    GROUP BY practice_id
  ),
  ranked AS (
    SELECT
      ps.*,
      CASE v_sort
        WHEN 'views' THEN ps.views::numeric
        WHEN 'play_starts' THEN ps.play_starts::numeric
        WHEN 'listeners' THEN ps.unique_listeners::numeric
        WHEN 'completions' THEN ps.completions::numeric
        WHEN 'saves' THEN ps.saves::numeric
        WHEN 'view_to_play'
          THEN coalesce(ps.play_starts::numeric / nullif(ps.views, 0)::numeric, 0)
        WHEN 'play_to_complete'
          THEN coalesce(ps.completions::numeric / nullif(ps.play_starts, 0)::numeric, 0)
        ELSE ps.play_starts::numeric
      END AS sort_value
    FROM practice_stats AS ps
  ),
  page AS (
    SELECT *
    FROM ranked
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN sort_value END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_value END DESC NULLS LAST,
      play_starts DESC,
      views DESC,
      practice_id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM practice_stats),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'practiceId', pg.practice_id,
          'title', coalesce(nullif(btrim(pr.title), ''), 'Практика'),
          'authorId', pr.author_id,
          'authorName', coalesce(nullif(btrim(a.name), ''), 'Автор'),
          'authorSlug', a.slug,
          'practiceSlug', pr.slug,
          'href', CASE
            WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
              AND nullif(btrim(coalesce(pr.slug, '')), '') IS NOT NULL
              THEN '/practice/' || btrim(a.slug) || '/' || btrim(pr.slug)
            ELSE NULL
          END,
          'views', pg.views,
          'uniqueVisitors', pg.unique_visitors,
          'playStarts', pg.play_starts,
          'uniqueListeners', pg.unique_listeners,
          'completions', pg.completions,
          'uniqueCompleters', pg.unique_completers,
          'saves', pg.saves,
          'uniqueSavers', pg.unique_savers
        )
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN pg.sort_value END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_value END DESC NULLS LAST,
          pg.play_starts DESC,
          pg.views DESC,
          pg.practice_id ASC
      )
      FROM page AS pg
      LEFT JOIN public.practices AS pr ON pr.id = pg.practice_id
      LEFT JOIN public.authors AS a ON a.id = pr.author_id
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(v_result, jsonb_build_object('total', 0, 'rows', '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_authors(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_sort text DEFAULT 'play_starts',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_include_test boolean := coalesce(p_include_test, false);
  v_device text := nullif(btrim(coalesce(p_device_type, '')), '');
  v_sort text := lower(btrim(coalesce(p_sort, '')));
  v_dir text := lower(btrim(coalesce(p_sort_dir, '')));
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF v_sort NOT IN (
    'views', 'play_starts', 'listeners', 'completions', 'saves',
    'published_practices', 'view_to_play', 'play_to_complete'
  ) THEN
    v_sort := 'play_starts';
  END IF;

  IF v_dir NOT IN ('asc', 'desc') THEN
    v_dir := 'desc';
  END IF;

  included_events AS (
    SELECT author_id,event_name,visitor_key FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,p_practice_id,v_include_test)
    WHERE author_id IS NOT NULL AND public.admin_analytics_p2_utm_matches(p_utm_source,utm_source) AND (v_device IS NULL OR device_type=v_device)
  ),
  author_stats AS (
    SELECT
      author_id,
      count(*) FILTER (WHERE event_name = 'practice_view')::int AS views,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
      )::int AS unique_listeners,
      count(*) FILTER (WHERE event_name = 'audio_completed')::int AS completions,
      count(*) FILTER (WHERE event_name = 'first_manual_library_save')::int AS saves
    FROM included_events
    GROUP BY author_id
  ),
  published_counts AS (
    SELECT p.author_id, count(*)::int AS published_practices
    FROM public.practices AS p
    WHERE p.status = 'published'
      AND p.author_id IN (SELECT author_id FROM author_stats)
    GROUP BY p.author_id
  ),
  ranked AS (
    SELECT
      st.*,
      coalesce(pc.published_practices, 0) AS published_practices,
      CASE v_sort
        WHEN 'views' THEN st.views::numeric
        WHEN 'play_starts' THEN st.play_starts::numeric
        WHEN 'listeners' THEN st.unique_listeners::numeric
        WHEN 'completions' THEN st.completions::numeric
        WHEN 'saves' THEN st.saves::numeric
        WHEN 'published_practices' THEN coalesce(pc.published_practices, 0)::numeric
        WHEN 'view_to_play'
          THEN coalesce(st.play_starts::numeric / nullif(st.views, 0)::numeric, 0)
        WHEN 'play_to_complete'
          THEN coalesce(st.completions::numeric / nullif(st.play_starts, 0)::numeric, 0)
        ELSE st.play_starts::numeric
      END AS sort_value
    FROM author_stats AS st
    LEFT JOIN published_counts AS pc ON pc.author_id = st.author_id
  ),
  page AS (
    SELECT *
    FROM ranked
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN sort_value END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_value END DESC NULLS LAST,
      play_starts DESC,
      views DESC,
      author_id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM author_stats),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'authorId', pg.author_id,
          'name', coalesce(nullif(btrim(a.name), ''), 'Автор'),
          'slug', a.slug,
          'href', CASE
            WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
              THEN '/authors/' || btrim(a.slug)
            ELSE NULL
          END,
          'publishedPractices', pg.published_practices,
          'views', pg.views,
          'playStarts', pg.play_starts,
          'uniqueListeners', pg.unique_listeners,
          'completions', pg.completions,
          'saves', pg.saves
        )
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN pg.sort_value END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_value END DESC NULLS LAST,
          pg.play_starts DESC,
          pg.views DESC,
          pg.author_id ASC
      )
      FROM page AS pg
      LEFT JOIN public.authors AS a ON a.id = pg.author_id
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(v_result, jsonb_build_object('total', 0, 'rows', '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_acquisition(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_include_test boolean := coalesce(p_include_test, false);
  v_device text := nullif(btrim(coalesce(p_device_type, '')), '');
  v_product_filter boolean := (p_author_id IS NOT NULL OR p_practice_id IS NOT NULL);
  v_session_filter boolean := (
    nullif(btrim(coalesce(p_utm_source, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(p_device_type, '')), '') IS NOT NULL
  );
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  included_events AS (
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
  page AS (
    SELECT *
    FROM rows_all
    ORDER BY
      sessions DESC,
      visitors DESC,
      registrations DESC,
      utm_source ASC,
      utm_medium ASC,
      utm_campaign ASC,
      utm_content ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'attribution', 'session_touch',
    'total', (SELECT count(*)::int FROM rows_all),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'utmSource', pg.utm_source,
          'utmMedium', pg.utm_medium,
          'utmCampaign', pg.utm_campaign,
          'utmContent', pg.utm_content,
          'label', public.admin_analytics_p2_utm_label(
            pg.utm_source, pg.utm_medium, pg.utm_campaign, pg.utm_content
          ),
          'sessions', pg.sessions,
          'visitors', pg.visitors,
          'registrations', pg.registrations,
          'playStarts', pg.play_starts,
          'listeners', pg.listeners,
          'saves', pg.saves
        )
        ORDER BY
          pg.sessions DESC,
          pg.visitors DESC,
          pg.registrations DESC,
          pg.utm_source ASC,
          pg.utm_medium ASC,
          pg.utm_campaign ASC,
          pg.utm_content ASC
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
$$;

CREATE OR REPLACE FUNCTION public.author_stats_summary(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_sales jsonb;
  v_purchases integer;
  v_refund_sales integer;
  v_net_sales integer;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_sales := public.author_canonical_sales_counts(
    p_author_id, p_from, p_to, false, true
  );
  v_purchases := coalesce((v_sales->>'gross_purchases')::int, 0);
  v_refund_sales := coalesce((v_sales->>'refund_sales')::int, 0);
  v_net_sales := coalesce((v_sales->>'net_sales')::int, 0);

  WITH members AS (
    SELECT am.user_id
    FROM public.author_members AS am
    WHERE am.author_id = p_author_id
  ),
  practice_events AS (
    SELECT event_name,session_id,occurred_at,visitor_key FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false)
  ),
  author_page_events AS (
    SELECT
      e.id,
      public.admin_analytics_visitor_key(
        e.user_id,
        coalesce(s.anonymous_id, e.anonymous_session_id),
        e.occurred_at
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    WHERE e.event_name = 'author_page_view'
      AND e.author_id = p_author_id
      AND (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND coalesce(e.is_staff, false) = false
      AND coalesce(e.is_test, false) = false
      AND coalesce(e.is_bot, false) = false
      AND coalesce(e.traffic_class, 'human') = 'human'
      AND (
        e.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = e.user_id)
      )
  ),
  library_saves AS (
    SELECT count(*)::int AS cnt
    FROM public.user_practices AS up
    JOIN public.practices AS pr ON pr.id = up.practice_id
    WHERE pr.author_id = p_author_id
      AND up.access_source = 'free_claim'
      AND (p_from IS NULL OR up.granted_at >= p_from)
      AND (p_to IS NULL OR up.granted_at < p_to)
      AND (
        up.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = up.user_id)
      )
  ),
  counts AS (
    SELECT
      (SELECT count(*)::int FROM author_page_events) AS author_page_views,
      (SELECT count(DISTINCT visitor_key)::int FROM author_page_events WHERE visitor_key IS NOT NULL) AS author_page_unique_visitors,
      (SELECT count(*)::int FROM practice_events WHERE event_name = 'practice_view') AS practice_views,
      (SELECT count(DISTINCT visitor_key)::int FROM practice_events WHERE event_name = 'practice_view' AND visitor_key IS NOT NULL) AS practice_unique_visitors,
      (SELECT count(*)::int FROM practice_events WHERE event_name = 'audio_play_started') AS plays,
      (SELECT count(*)::int FROM practice_events WHERE event_name = 'audio_progress_25') AS progress_25,
      (SELECT count(*)::int FROM practice_events WHERE event_name = 'audio_completed') AS completions,
      (SELECT cnt FROM library_saves) AS library_saves,
      v_purchases AS gross_purchases,
      v_refund_sales AS refund_sales,
      v_net_sales AS net_sales
  )
  SELECT jsonb_build_object(
    'author_page_views', c.author_page_views,
    'author_page_unique_visitors', c.author_page_unique_visitors,
    'practice_views', c.practice_views,
    'practice_unique_visitors', c.practice_unique_visitors,
    'plays', c.plays,
    'progress_25', c.progress_25,
    'completions', c.completions,
    'library_saves', c.library_saves,
    'net_sales', c.net_sales,
    'gross_purchases', coalesce((v_sales->>'gross_purchases')::int, 0),
    'refund_sales', coalesce((v_sales->>'refund_sales')::int, 0),
    'full_refunds', coalesce((v_sales->>'full_refunds')::int, 0),
    'partial_refunds', coalesce((v_sales->>'partial_refunds')::int, 0),
    'gross_revenue_minor', coalesce((v_sales->>'gross_revenue_minor')::bigint, 0),
    'refunded_amount_minor', coalesce((v_sales->>'refunded_amount_minor')::bigint, 0),
    'net_revenue_minor', coalesce((v_sales->>'net_revenue_minor')::bigint, 0),
    'view_to_play_rate', public.author_stats_rate(c.plays, c.practice_views),
    'play_to_complete_rate', public.author_stats_rate(c.completions, c.plays),
    'view_to_save_rate', public.author_stats_rate(c.library_saves, c.practice_views),
    'view_to_purchase_rate', public.author_stats_rate(c.gross_purchases, c.practice_views)
  )
  INTO v_result
  FROM counts AS c;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.author_stats_timeseries(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_to := coalesce(p_to, now());

  IF p_from IS NULL THEN
    SELECT least(
      coalesce((
        SELECT min(e.occurred_at)
        FROM public.analytics_events AS e
        JOIN public.practices AS pr ON pr.id = e.practice_id
        WHERE pr.author_id = p_author_id
          AND e.event_name IN (
            'practice_view', 'audio_play_started', 'audio_progress_25', 'audio_completed'
          )
      ), v_to),
      coalesce((
        SELECT min(e.occurred_at)
        FROM public.analytics_events AS e
        WHERE e.author_id = p_author_id AND e.event_name = 'author_page_view'
      ), v_to),
      coalesce((
        SELECT min(up.granted_at)
        FROM public.user_practices AS up
        JOIN public.practices AS pr ON pr.id = up.practice_id
        WHERE pr.author_id = p_author_id AND up.access_source = 'free_claim'
      ), v_to),
      coalesce((
        SELECT min(s.paid_at)
        FROM public.author_canonical_sales_base(p_author_id, false, true) AS s
      ), v_to)
    )
    INTO v_from;

    IF v_from IS NULL OR v_from >= v_to THEN
      v_from := v_to - interval '1 day';
    END IF;
  ELSE
    v_from := p_from;
  END IF;

  WITH members AS (
    SELECT am.user_id FROM public.author_members AS am WHERE am.author_id = p_author_id
  ),
  days AS (
    SELECT generate_series(
      date_trunc('day', v_from AT TIME ZONE 'Europe/Moscow'),
      date_trunc('day', (v_to - interval '1 second') AT TIME ZONE 'Europe/Moscow'),
      interval '1 day'
    )::date AS day_local
  ),
  practice_events AS (
    SELECT listening_day AS day_local,event_name,visitor_key FROM public.analytics_product_event_facts(v_from,v_to,p_author_id,NULL,false)
  ),
  author_page_events AS (
    SELECT
      (e.occurred_at AT TIME ZONE 'Europe/Moscow')::date AS day_local,
      public.admin_analytics_visitor_key(
        e.user_id,
        coalesce(s.anonymous_id, e.anonymous_session_id),
        e.occurred_at
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    WHERE e.event_name = 'author_page_view'
      AND e.author_id = p_author_id
      AND e.occurred_at >= v_from
      AND e.occurred_at < v_to
      AND coalesce(e.is_staff, false) = false
      AND coalesce(e.is_test, false) = false
      AND coalesce(e.is_bot, false) = false
      AND coalesce(e.traffic_class, 'human') = 'human'
      AND (
        e.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = e.user_id)
      )
  ),
  saves AS (
    SELECT
      (up.granted_at AT TIME ZONE 'Europe/Moscow')::date AS day_local,
      count(*)::int AS library_saves
    FROM public.user_practices AS up
    JOIN public.practices AS pr ON pr.id = up.practice_id
    WHERE pr.author_id = p_author_id
      AND up.access_source = 'free_claim'
      AND up.granted_at >= v_from
      AND up.granted_at < v_to
      AND (
        up.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = up.user_id)
      )
    GROUP BY 1
  ),
  purchases AS (
    SELECT
      (s.paid_at AT TIME ZONE 'Europe/Moscow')::date AS day_local,
      count(*)::int AS gross_purchases,
      count(*) FILTER (WHERE s.refund_status <> 'none')::int AS refund_sales,
      count(*) FILTER (WHERE s.refund_status = 'full')::int AS full_refunds,
      count(*) FILTER (WHERE s.refund_status = 'partial')::int AS partial_refunds,
      count(*) FILTER (WHERE s.refund_status <> 'full')::int AS net_sales,
      coalesce(sum(s.amount_minor), 0)::bigint AS gross_revenue_minor,
      coalesce(sum(s.refunded_amount_minor), 0)::bigint AS refunded_amount_minor,
      coalesce(sum(s.net_amount_minor), 0)::bigint AS net_revenue_minor
    FROM public.author_canonical_sales_base(p_author_id, false, true) AS s
    WHERE s.paid_at >= v_from
      AND s.paid_at < v_to
    GROUP BY 1
  ),
  practice_agg AS (
    SELECT
      day_local,
      count(*) FILTER (WHERE event_name = 'practice_view')::int AS practice_views,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'practice_view' AND visitor_key IS NOT NULL
      )::int AS practice_unique_visitors,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS plays,
      count(*) FILTER (WHERE event_name = 'audio_progress_25')::int AS progress_25,
      count(*) FILTER (WHERE event_name = 'audio_completed')::int AS completions
    FROM practice_events
    GROUP BY day_local
  ),
  page_agg AS (
    SELECT
      day_local,
      count(*)::int AS author_page_views,
      count(DISTINCT visitor_key)::int AS author_page_unique_visitors
    FROM author_page_events
    WHERE visitor_key IS NOT NULL
    GROUP BY day_local
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'date', d.day_local::text,
      'practice_views', coalesce(pa.practice_views, 0),
      'practice_unique_visitors', coalesce(pa.practice_unique_visitors, 0),
      'plays', coalesce(pa.plays, 0),
      'progress_25', coalesce(pa.progress_25, 0),
      'completions', coalesce(pa.completions, 0),
      'library_saves', coalesce(sv.library_saves, 0),
      'gross_purchases', coalesce(pu.gross_purchases, 0),
      'refund_sales', coalesce(pu.refund_sales, 0),
      'full_refunds', coalesce(pu.full_refunds, 0),
      'partial_refunds', coalesce(pu.partial_refunds, 0),
      'net_sales', coalesce(pu.net_sales, 0),
      'gross_revenue_minor', coalesce(pu.gross_revenue_minor, 0),
      'refunded_amount_minor', coalesce(pu.refunded_amount_minor, 0),
      'net_revenue_minor', coalesce(pu.net_revenue_minor, 0),
      'author_page_views', coalesce(pg.author_page_views, 0),
      'author_page_unique_visitors', coalesce(pg.author_page_unique_visitors, 0)
    )
    ORDER BY d.day_local
  ), '[]'::jsonb)
  INTO v_result
  FROM days AS d
  LEFT JOIN practice_agg AS pa ON pa.day_local = d.day_local
  LEFT JOIN page_agg AS pg ON pg.day_local = d.day_local
  LEFT JOIN saves AS sv ON sv.day_local = d.day_local
  LEFT JOIN purchases AS pu ON pu.day_local = d.day_local;

  RETURN jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'points', coalesce(v_result, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.author_stats_products(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH members AS (
    SELECT am.user_id FROM public.author_members AS am WHERE am.author_id = p_author_id
  ),
  author_practices AS (
    SELECT
      pr.id,
      pr.title,
      pr.slug,
      pr.status,
      pr.is_free,
      pr.price
    FROM public.practices AS pr
    WHERE pr.author_id = p_author_id
  ),
  practice_events AS (
    SELECT practice_id,event_name,visitor_key FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false)
  ),
  event_agg AS (
    SELECT
      practice_id,
      count(*) FILTER (WHERE event_name = 'practice_view')::int AS practice_views,
      count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'practice_view' AND visitor_key IS NOT NULL
      )::int AS practice_unique_visitors,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS plays,
      count(*) FILTER (WHERE event_name = 'audio_progress_25')::int AS progress_25,
      count(*) FILTER (WHERE event_name = 'audio_completed')::int AS completions
    FROM practice_events
    GROUP BY practice_id
  ),
  saves AS (
    SELECT
      up.practice_id,
      count(*)::int AS library_saves
    FROM public.user_practices AS up
    WHERE up.practice_id IN (SELECT id FROM author_practices)
      AND up.access_source = 'free_claim'
      AND (p_from IS NULL OR up.granted_at >= p_from)
      AND (p_to IS NULL OR up.granted_at < p_to)
      AND (
        up.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = up.user_id)
      )
    GROUP BY up.practice_id
  ),
  purchases AS (
    SELECT
      s.practice_id,
      count(*)::int AS gross_purchases,
      count(*) FILTER (WHERE s.refund_status <> 'none')::int AS refund_sales,
      count(*) FILTER (WHERE s.refund_status = 'full')::int AS full_refunds,
      count(*) FILTER (WHERE s.refund_status = 'partial')::int AS partial_refunds,
      count(*) FILTER (WHERE s.refund_status <> 'full')::int AS net_sales,
      coalesce(sum(s.amount_minor), 0)::bigint AS gross_revenue_minor,
      coalesce(sum(s.refunded_amount_minor), 0)::bigint AS refunded_amount_minor,
      coalesce(sum(s.net_amount_minor), 0)::bigint AS net_revenue_minor
    FROM public.author_canonical_sales_base(p_author_id, false, true) AS s
    WHERE (p_from IS NULL OR s.paid_at >= p_from)
      AND (p_to IS NULL OR s.paid_at < p_to)
    GROUP BY s.practice_id
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_slug', ap.slug,
      'title', ap.title,
      'slug', ap.slug,
      'status', ap.status,
      'is_free', coalesce(ap.is_free, false),
      'price', ap.price,
      'practice_views', coalesce(ea.practice_views, 0),
      'practice_unique_visitors', coalesce(ea.practice_unique_visitors, 0),
      'plays', coalesce(ea.plays, 0),
      'progress_25', coalesce(ea.progress_25, 0),
      'completions', coalesce(ea.completions, 0),
      'library_saves', coalesce(sv.library_saves, 0),
      'gross_purchases', coalesce(pu.gross_purchases, 0),
      'refund_sales', coalesce(pu.refund_sales, 0),
      'net_sales', coalesce(pu.net_sales, 0),
      'full_refunds', coalesce(pu.full_refunds, 0),
      'partial_refunds', coalesce(pu.partial_refunds, 0),
      'gross_revenue_minor', coalesce(pu.gross_revenue_minor, 0),
      'refunded_amount_minor', coalesce(pu.refunded_amount_minor, 0),
      'net_revenue_minor', coalesce(pu.net_revenue_minor, 0),
      'view_to_play_rate', public.author_stats_rate(coalesce(ea.plays, 0), coalesce(ea.practice_views, 0)),
      'play_to_complete_rate', public.author_stats_rate(coalesce(ea.completions, 0), coalesce(ea.plays, 0))
    )
    ORDER BY coalesce(ea.practice_views, 0) DESC, ap.title ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM author_practices AS ap
  LEFT JOIN event_agg AS ea ON ea.practice_id = ap.id
  LEFT JOIN saves AS sv ON sv.practice_id = ap.id
  LEFT JOIN purchases AS pu ON pu.practice_id = ap.id;

  RETURN jsonb_build_object('rows', coalesce(v_result, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.author_stats_sources(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH members AS (
    SELECT am.user_id FROM public.author_members AS am WHERE am.author_id = p_author_id
  ),
  buckets AS (
    SELECT unnest(ARRAY[
      'direct', 'internal', 'telegram', 'vk', 'max', 'search', 'other_external', 'unknown'
    ]) AS bucket
  ),
  attributed AS (
    SELECT public.author_stats_source_bucket(f.utm_source,f.referrer_domain) AS bucket,f.visitor_key,f.event_name FROM public.analytics_product_event_facts(p_from,p_to,p_author_id,NULL,false) f WHERE f.event_name IN ('practice_view','audio_play_started')
    UNION ALL SELECT public.author_stats_source_bucket(s.utm_source,s.referrer_domain),public.admin_analytics_visitor_key(e.user_id,coalesce(s.anonymous_id,e.anonymous_session_id),e.occurred_at),e.event_name FROM public.analytics_events e LEFT JOIN public.analytics_sessions s ON s.id=e.session_id WHERE e.event_name='author_page_view' AND e.author_id=p_author_id AND (p_from IS NULL OR e.occurred_at>=p_from) AND (p_to IS NULL OR e.occurred_at<p_to) AND coalesce(e.is_staff,false)=false AND coalesce(e.is_test,false)=false AND coalesce(e.is_bot,false)=false AND coalesce(e.traffic_class,'human')='human' AND (e.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id=e.user_id))
  ),
  agg AS (
    SELECT
      bucket,
      count(*) FILTER (WHERE event_name IN ('practice_view', 'author_page_view'))::int AS views,
      count(DISTINCT visitor_key)::int AS visitors,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS plays
    FROM attributed
    WHERE visitor_key IS NOT NULL
    GROUP BY bucket
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'bucket', b.bucket,
      'views', coalesce(a.views, 0),
      'visitors', coalesce(a.visitors, 0),
      'plays', coalesce(a.plays, 0)
    )
    ORDER BY coalesce(a.visitors, 0) DESC, b.bucket
  ), '[]'::jsonb)
  INTO v_result
  FROM buckets AS b
  LEFT JOIN agg AS a ON a.bucket = b.bucket;

  RETURN jsonb_build_object('rows', coalesce(v_result, '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.analytics_product_event_facts(timestamptz,timestamptz,uuid,uuid,boolean) TO service_role;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT oid::regprocedure r FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('admin_analytics_p2_window_metrics','admin_analytics_p2_summary','admin_analytics_p2_timeseries','admin_analytics_p2_practices','admin_analytics_p2_authors','admin_analytics_p2_acquisition','author_stats_summary','author_stats_timeseries','author_stats_products','author_stats_sources') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',p.r); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p.r); END LOOP; END $$; COMMIT;

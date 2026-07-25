BEGIN;

-- ---------------------------------------------------------------------------
-- Platform analytics P2: filtered dashboard aggregates (summary, timeseries,
-- practices, authors, acquisition).
--
-- Additive only. admin_analytics_dashboard_snapshot (P0/P1) is untouched and
-- keeps serving the current admin dashboard.
--
-- Shared conventions:
--   * semi-open period: p_from <= ts < p_to (NULL bound = unbounded);
--   * service traffic (staff / test / bot) is excluded unless
--     p_include_test = true;
--   * visitors/listeners/… identity comes from admin_analytics_visitor_key,
--     so anonymous activity merges into the user after login (P1 identity);
--   * product events considered by P2: practice_view, audio_play_started,
--     audio_completed, first_manual_library_save.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Indexes
-- (event_name, occurred_at DESC) already exists and also serves ascending
-- scans, so P2 only adds the per-practice + event_name lookup on occurred_at
-- used by the practice/author breakdowns.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS analytics_events_practice_event_occurred_idx
  ON public.analytics_events (practice_id, event_name, occurred_at DESC)
  WHERE practice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Filter helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_utm_matches(
  p_filter text,
  p_utm_source text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(p_filter, '')), '') IS NULL THEN true
    WHEN lower(btrim(p_filter)) = '__none__'
      THEN nullif(btrim(coalesce(p_utm_source, '')), '') IS NULL
    ELSE lower(btrim(coalesce(p_utm_source, ''))) = lower(btrim(p_filter))
  END;
$$;

COMMENT ON FUNCTION public.admin_analytics_p2_utm_matches IS
  'audiolad:platform-analytics:p2; utm_source filter predicate; __none__ matches empty/null source';

CREATE OR REPLACE FUNCTION public.admin_analytics_p2_utm_label(
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(
      array_to_string(
        ARRAY[
          nullif(btrim(coalesce(p_utm_source, '')), ''),
          nullif(btrim(coalesce(p_utm_medium, '')), ''),
          nullif(btrim(coalesce(p_utm_campaign, '')), ''),
          nullif(btrim(coalesce(p_utm_content, '')), '')
        ]::text[],
        ' / '
      ),
      ''
    ),
    'Без UTM / прямые и неопределённые переходы'
  );
$$;

COMMENT ON FUNCTION public.admin_analytics_p2_utm_label IS
  'audiolad:platform-analytics:p2; human label for a UTM tuple; empty tuple = direct/undefined';

-- ---------------------------------------------------------------------------
-- Window metrics (internal): one filtered period → flat metric object.
-- admin_analytics_p2_summary calls it for the current and previous window.
-- ---------------------------------------------------------------------------

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
    SELECT
      e.id,
      e.session_id,
      e.user_id,
      e.event_name,
      e.practice_id,
      e.occurred_at,
      CASE
        WHEN v_include_test THEN true
        ELSE NOT (
          coalesce(e.is_staff, false)
          OR coalesce(e.is_test, false)
          OR coalesce(e.is_bot, false)
          OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
          OR coalesce(s.is_staff OR s.is_test OR s.is_bot, false)
          OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
        )
      END AS is_included,
      coalesce(
        public.admin_analytics_visitor_key(
          e.user_id,
          coalesce(s.anonymous_id, e.anonymous_session_id),
          e.occurred_at
        ),
        e.id::text
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    LEFT JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND e.event_name IN (
        'practice_view',
        'audio_play_started',
        'audio_completed',
        'first_manual_library_save'
      )
      AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
      AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
  ),
  included_events AS (
    SELECT * FROM period_events WHERE is_included
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

COMMENT ON FUNCTION public.admin_analytics_p2_window_metrics IS
  'audiolad:platform-analytics:p2; internal flat metrics for one filtered window; used by admin_analytics_p2_summary for current and previous periods';

-- ---------------------------------------------------------------------------
-- A. Summary
-- ---------------------------------------------------------------------------

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

COMMENT ON FUNCTION public.admin_analytics_p2_summary IS
  'audiolad:platform-analytics:p2; filtered dashboard summary (audience/events/people + optional previous window).
Service traffic (staff/test/bot) is excluded unless p_include_test.
Registrations come from profiles.created_at (not the client signup event) with the P1 staff/test exclusion.
p_utm_source = ''__none__'' selects sessions without utm_source.
Product filters (p_author_id / p_practice_id) restrict events to matching practices; in that case audience
sessions/visitors are derived from the sessions/visitors present on those filtered events, and a registration
counts only when the same user_id appears on the filtered events.
purchases is intentionally null until the payment stage lands.';

-- ---------------------------------------------------------------------------
-- B. Timeseries
-- ---------------------------------------------------------------------------

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
    SELECT
      date_trunc(v_granularity, e.occurred_at AT TIME ZONE v_tz) AS bucket_local,
      e.event_name,
      e.user_id,
      coalesce(
        public.admin_analytics_visitor_key(
          e.user_id,
          coalesce(s.anonymous_id, e.anonymous_session_id),
          e.occurred_at
        ),
        e.id::text
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    LEFT JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE e.occurred_at >= v_data_from
      AND e.occurred_at < v_to
      AND e.event_name IN (
        'practice_view',
        'audio_play_started',
        'audio_completed',
        'first_manual_library_save'
      )
      AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
      AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
      AND (
        v_include_test
        OR NOT (
          coalesce(e.is_staff, false)
          OR coalesce(e.is_test, false)
          OR coalesce(e.is_bot, false)
          OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
          OR coalesce(s.is_staff OR s.is_test OR s.is_bot, false)
          OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
        )
      )
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

COMMENT ON FUNCTION public.admin_analytics_p2_timeseries IS
  'audiolad:platform-analytics:p2; Europe/Moscow day buckets with zero-filled gaps.
Granularity is "day" for periods up to 120 days and "week" above that; output is additionally capped at
400 points (most recent buckets win). NULL p_from starts at the earliest session/event (fallback: 29 days back).
Additive across points: registrations, practice_views, play_starts, completions, saves.
NOT additive: visitors and listeners are unique per bucket, so SUM(points) >= period-unique value from
admin_analytics_p2_summary.';

-- ---------------------------------------------------------------------------
-- C. Practices breakdown
-- ---------------------------------------------------------------------------

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

  WITH included_events AS (
    SELECT
      e.practice_id,
      e.event_name,
      coalesce(
        public.admin_analytics_visitor_key(
          e.user_id,
          coalesce(s.anonymous_id, e.anonymous_session_id),
          e.occurred_at
        ),
        e.id::text
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    LEFT JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND e.practice_id IS NOT NULL
      AND e.event_name IN (
        'practice_view',
        'audio_play_started',
        'audio_completed',
        'first_manual_library_save'
      )
      AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
      AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
      AND (
        v_include_test
        OR NOT (
          coalesce(e.is_staff, false)
          OR coalesce(e.is_test, false)
          OR coalesce(e.is_bot, false)
          OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
          OR coalesce(s.is_staff OR s.is_test OR s.is_bot, false)
          OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
        )
      )
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

COMMENT ON FUNCTION public.admin_analytics_p2_practices IS
  'audiolad:platform-analytics:p2; per-practice aggregates for practices with at least one relevant event
in the period (practice_view / audio_play_started / audio_completed / first_manual_library_save).
Pagination applies to aggregated practice rows, not raw events; total is the number of matching practices.
Sort whitelist: views, play_starts, listeners, completions, saves, view_to_play, play_to_complete
(ratios use nullif to stay division-safe; unknown sort falls back to play_starts desc).
href follows the public product URL /practice/{authorSlug}/{practiceSlug}.';

-- ---------------------------------------------------------------------------
-- D. Authors breakdown
-- ---------------------------------------------------------------------------

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

  WITH included_events AS (
    SELECT
      pr.author_id,
      e.event_name,
      coalesce(
        public.admin_analytics_visitor_key(
          e.user_id,
          coalesce(s.anonymous_id, e.anonymous_session_id),
          e.occurred_at
        ),
        e.id::text
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND pr.author_id IS NOT NULL
      AND e.event_name IN (
        'practice_view',
        'audio_play_started',
        'audio_completed',
        'first_manual_library_save'
      )
      AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
      AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
      AND (
        v_include_test
        OR NOT (
          coalesce(e.is_staff, false)
          OR coalesce(e.is_test, false)
          OR coalesce(e.is_bot, false)
          OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
          OR coalesce(s.is_staff OR s.is_test OR s.is_bot, false)
          OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
        )
      )
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

COMMENT ON FUNCTION public.admin_analytics_p2_authors IS
  'audiolad:platform-analytics:p2; per-author aggregates over practice events in the period.
Only authors with at least one relevant event are returned; publishedPractices counts practices with
status = ''published'' for those authors. Registrations are never attributed to authors.
Pagination applies to aggregated author rows; sort whitelist: views, play_starts, listeners, completions,
saves, published_practices, view_to_play, play_to_complete.';

-- ---------------------------------------------------------------------------
-- E. Acquisition (session-touch UTM breakdown)
-- ---------------------------------------------------------------------------

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
  WITH included_events AS (
    SELECT
      e.user_id,
      e.session_id,
      e.event_name,
      btrim(coalesce(s.utm_source, '')) AS utm_source,
      btrim(coalesce(s.utm_medium, '')) AS utm_medium,
      btrim(coalesce(s.utm_campaign, '')) AS utm_campaign,
      btrim(coalesce(s.utm_content, '')) AS utm_content,
      coalesce(
        public.admin_analytics_visitor_key(
          e.user_id,
          coalesce(s.anonymous_id, e.anonymous_session_id),
          e.occurred_at
        ),
        e.id::text
      ) AS visitor_key
    FROM public.analytics_events AS e
    JOIN public.analytics_sessions AS s ON s.id = e.session_id
    LEFT JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND e.event_name IN (
        'practice_view',
        'audio_play_started',
        'audio_completed',
        'first_manual_library_save'
      )
      AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
      AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
      AND (v_device IS NULL OR s.device_type = v_device)
      AND (
        v_include_test
        OR NOT (
          coalesce(e.is_staff, false)
          OR coalesce(e.is_test, false)
          OR coalesce(e.is_bot, false)
          OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
          OR coalesce(s.is_staff OR s.is_test OR s.is_bot, false)
          OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
        )
      )
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

COMMENT ON FUNCTION public.admin_analytics_p2_acquisition IS
  'audiolad:platform-analytics:p2; session-touch UTM breakdown (utm_source/medium/campaign/content trimmed,
empty string when absent; all-empty tuple gets the "Без UTM / прямые и неопределённые переходы" label).
Sessions/visitors come from sessions started in the period; play/listener/save counts are attributed to the
UTM tuple of the event session, so events without a session row are not represented here.
Registrations use session-touch attribution: the first non-service session of the user inside the period.
When no filter is active, registrations without any session fall into the empty-UTM row.
Rows are sorted by sessions desc and paginated; total is the number of UTM groups.';

-- ---------------------------------------------------------------------------
-- Grants: service_role only (admin panel goes through the server API)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_analytics_p2_utm_matches(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_utm_label(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_window_metrics(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_summary(
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_p2_acquisition(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, int, int
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_utm_matches(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_utm_label(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_window_metrics(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_summary(
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int
) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int
) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_acquisition(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, int, int
) TO service_role;

-- ---------------------------------------------------------------------------
-- Post-checks: P0/P1 snapshot must still exist, P2 functions must be callable.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_analytics_dashboard_snapshot'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: admin_analytics_dashboard_snapshot is missing';
  END IF;

  PERFORM public.admin_analytics_p2_summary(
    now() - interval '1 day', now(), false,
    now() - interval '2 days', now() - interval '1 day',
    NULL, NULL, NULL, NULL
  );
  PERFORM public.admin_analytics_p2_timeseries(now() - interval '1 day', now(), false);
  PERFORM public.admin_analytics_p2_practices(now() - interval '1 day', now(), false);
  PERFORM public.admin_analytics_p2_authors(now() - interval '1 day', now(), false);
  PERFORM public.admin_analytics_p2_acquisition(now() - interval '1 day', now(), false);
END
$$;

COMMIT;

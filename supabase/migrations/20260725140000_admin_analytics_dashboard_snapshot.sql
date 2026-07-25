BEGIN;

-- ---------------------------------------------------------------------------
-- Admin analytics dashboard snapshot (P0)
-- Aggregates in PostgreSQL so the admin panel does not depend on
-- PostgREST PGRST_DB_MAX_ROWS when scanning analytics_events/sessions.
-- Semi-open range: p_from <= ts < p_to (NULL bound = unbounded).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_test_utm_campaign(p_campaign text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_campaign IS NULL OR btrim(p_campaign) = '' THEN false
    WHEN lower(btrim(p_campaign)) IN (
      'analytics_dev_fixture',
      'analytics_dev_test',
      'platform_analytics_prod_smoke',
      'analytics_dev_test_signup',
      'analytics_dev_fixture_signup'
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM unnest(string_to_array(lower(btrim(p_campaign)), '_')) AS seg(value)
      WHERE seg.value IN ('test', 'qa', 'smoke', 'e2e', 'fixture', 'playwright')
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_test_anonymous_id(p_anonymous_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN false
    ELSE (
      lower(btrim(p_anonymous_id)) LIKE 'aaaaaaaa%'
      OR lower(btrim(p_anonymous_id)) LIKE 'bbbbbbbb%'
      OR lower(btrim(p_anonymous_id)) LIKE 'manual-%'
      OR lower(btrim(p_anonymous_id)) LIKE 'test-%'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_test_analytics_session(
  p_utm_campaign text,
  p_anonymous_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.is_test_utm_campaign(p_utm_campaign) THEN true
    WHEN coalesce(btrim(p_utm_campaign), '') = ''
      AND public.is_test_anonymous_id(p_anonymous_id) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_traffic_source(
  p_utm_source text,
  p_referrer_domain text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(lower(coalesce(p_utm_source, ''))), '') IS NOT NULL
      THEN left(btrim(lower(p_utm_source)), 128)
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%t.me%'
      OR lower(p_referrer_domain) LIKE '%telegram.%'
    ) THEN 'telegram'
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%vk.com%'
      OR lower(p_referrer_domain) LIKE '%vk.ru%'
    ) THEN 'vk'
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%max.ru%'
      OR lower(p_referrer_domain) LIKE '%oneme.ru%'
    ) THEN 'max'
    WHEN nullif(btrim(p_referrer_domain), '') IS NOT NULL THEN 'other'
    ELSE 'direct'
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_source_group(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_source, ''))) = 'max' THEN 'max'
    WHEN lower(btrim(coalesce(p_source, ''))) IN ('telegram', 'tg') THEN 'telegram'
    WHEN lower(btrim(coalesce(p_source, ''))) IN ('vk', 'vkontakte') THEN 'vk'
    WHEN lower(btrim(coalesce(p_source, ''))) IN ('', 'direct') THEN 'direct'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_dashboard_snapshot(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH period_sessions AS (
    SELECT
      s.id,
      s.anonymous_id,
      s.user_id,
      s.utm_source,
      s.utm_campaign,
      s.referrer_domain,
      s.started_at,
      public.is_test_analytics_session(s.utm_campaign, s.anonymous_id) AS is_test,
      public.admin_analytics_source_group(
        public.admin_analytics_traffic_source(s.utm_source, s.referrer_domain)
      ) AS source_group,
      COALESCE(s.user_id::text, s.anonymous_id) AS visitor_key
    FROM public.analytics_sessions AS s
    WHERE (p_from IS NULL OR s.started_at >= p_from)
      AND (p_to IS NULL OR s.started_at < p_to)
  ),
  included_sessions AS (
    SELECT *
    FROM period_sessions
    WHERE p_include_test OR NOT is_test
  ),
  excluded_test AS (
    SELECT
      count(*)::int AS excluded_test_sessions,
      count(DISTINCT visitor_key)::int AS excluded_test_visitors
    FROM period_sessions
    WHERE is_test
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
      s.id,
      s.utm_source,
      s.utm_campaign,
      s.referrer_domain,
      s.started_at,
      public.is_test_analytics_session(s.utm_campaign, s.anonymous_id) AS is_test,
      public.admin_analytics_source_group(
        public.admin_analytics_traffic_source(s.utm_source, s.referrer_domain)
      ) AS source_group,
      row_number() OVER (
        PARTITION BY s.user_id
        ORDER BY s.started_at ASC, s.id ASC
      ) AS rn_all,
      row_number() OVER (
        PARTITION BY s.user_id
        ORDER BY
          CASE WHEN public.is_test_analytics_session(s.utm_campaign, s.anonymous_id)
            THEN 1 ELSE 0 END,
          s.started_at ASC,
          s.id ASC
      ) AS rn_prefer_non_test
    FROM public.analytics_sessions AS s
    WHERE s.user_id IN (SELECT id FROM period_profiles)
  ),
  included_profiles AS (
    SELECT
      pp.id,
      pp.created_at,
      CASE
        WHEN p_include_test THEN (
          SELECT ps.source_group
          FROM profile_sessions AS ps
          WHERE ps.user_id = pp.id AND ps.rn_all = 1
        )
        ELSE (
          SELECT ps.source_group
          FROM profile_sessions AS ps
          WHERE ps.user_id = pp.id AND ps.rn_prefer_non_test = 1 AND NOT ps.is_test
        )
      END AS source_group
    FROM period_profiles AS pp
    WHERE
      p_include_test
      OR NOT EXISTS (
        SELECT 1 FROM profile_sessions AS ps WHERE ps.user_id = pp.id
      )
      OR EXISTS (
        SELECT 1
        FROM profile_sessions AS ps
        WHERE ps.user_id = pp.id AND NOT ps.is_test
      )
  ),
  period_events AS (
    SELECT
      e.id,
      e.session_id,
      e.user_id,
      e.anonymous_session_id,
      e.event_name,
      e.practice_id,
      e.occurred_at,
      CASE
        WHEN p_include_test THEN true
        WHEN e.session_id IS NOT NULL THEN (
          s_period.id IS NOT NULL AND NOT s_period.is_test
        )
        ELSE NOT public.is_test_anonymous_id(e.anonymous_session_id)
      END AS is_included,
      COALESCE(
        e.user_id::text,
        s_any.user_id::text,
        s_any.anonymous_id,
        e.anonymous_session_id,
        e.id::text
      ) AS visitor_key,
      COALESCE(e.session_id::text, e.id::text) AS funnel_session_key,
      public.admin_analytics_source_group(
        public.admin_analytics_traffic_source(s_any.utm_source, s_any.referrer_domain)
      ) AS source_group
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s_any ON s_any.id = e.session_id
    LEFT JOIN period_sessions AS s_period ON s_period.id = e.session_id
    WHERE (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND e.event_name IN (
        'page_view',
        'practice_view',
        'listen_page_view',
        'audio_play_started',
        'audio_progress_25',
        'audio_progress_50',
        'audio_progress_75',
        'audio_progress_90',
        'audio_completed',
        'signup_started',
        'signup_completed',
        'author_application_started',
        'author_application_submitted'
      )
  ),
  included_events AS (
    SELECT *
    FROM period_events
    WHERE is_included
  ),
  metrics AS (
    SELECT
      (SELECT count(*)::int FROM included_sessions) AS visits,
      (SELECT count(DISTINCT visitor_key)::int FROM included_sessions) AS visitors,
      (SELECT count(*)::int FROM included_profiles) AS registrations,
      (SELECT excluded_test_sessions FROM excluded_test) AS excluded_test_sessions,
      (SELECT excluded_test_visitors FROM excluded_test) AS excluded_test_visitors,
      (
        SELECT count(*)::int
        FROM included_events
        WHERE event_name = 'practice_view'
      ) AS practice_views,
      (
        SELECT count(*)::int
        FROM included_events
        WHERE event_name = 'audio_play_started'
      ) AS play_starts,
      (
        SELECT count(DISTINCT visitor_key)::int
        FROM included_events
        WHERE event_name = 'audio_play_started'
      ) AS listeners,
      (
        SELECT count(*)::int
        FROM included_events
        WHERE event_name = 'audio_completed'
      ) AS completions,
      (
        SELECT count(*)::int
        FROM included_events
        WHERE event_name = 'author_application_submitted'
      ) AS author_applications,
      (
        SELECT count(DISTINCT funnel_session_key)::int
        FROM included_events
        WHERE event_name = 'practice_view'
      ) AS funnel_practice_view_sessions,
      (
        SELECT count(DISTINCT funnel_session_key)::int
        FROM included_events
        WHERE event_name = 'audio_play_started'
      ) AS funnel_play_sessions,
      (
        SELECT count(DISTINCT funnel_session_key)::int
        FROM included_events
        WHERE event_name = 'audio_completed'
      ) AS funnel_completion_sessions
  ),
  source_groups AS (
    SELECT unnest(ARRAY['max', 'telegram', 'vk', 'direct', 'other']) AS source_group
  ),
  source_visitors AS (
    SELECT source_group, count(DISTINCT visitor_key)::int AS visitors
    FROM included_sessions
    GROUP BY source_group
  ),
  source_plays AS (
    SELECT source_group, count(DISTINCT visitor_key)::int AS play_starts
    FROM included_events
    WHERE event_name = 'audio_play_started'
    GROUP BY source_group
  ),
  source_completions AS (
    SELECT source_group, count(DISTINCT visitor_key)::int AS completions
    FROM included_events
    WHERE event_name = 'audio_completed'
    GROUP BY source_group
  ),
  source_applications AS (
    SELECT source_group, count(DISTINCT visitor_key)::int AS applications
    FROM included_events
    WHERE event_name = 'author_application_submitted'
    GROUP BY source_group
  ),
  -- Profiles without any usable session land in direct (resolveRegistrationSource(null)).
  source_registrations_with_direct AS (
    SELECT
      coalesce(source_group, 'direct') AS source_group,
      count(*)::int AS registrations
    FROM included_profiles
    GROUP BY coalesce(source_group, 'direct')
  ),
  sources AS (
    SELECT
      sg.source_group AS source,
      coalesce(sv.visitors, 0) AS visitors,
      coalesce(sr.registrations, 0) AS registrations,
      coalesce(sp.play_starts, 0) AS play_starts,
      coalesce(sc.completions, 0) AS completions,
      coalesce(sa.applications, 0) AS applications
    FROM source_groups AS sg
    LEFT JOIN source_visitors AS sv ON sv.source_group = sg.source_group
    LEFT JOIN source_registrations_with_direct AS sr ON sr.source_group = sg.source_group
    LEFT JOIN source_plays AS sp ON sp.source_group = sg.source_group
    LEFT JOIN source_completions AS sc ON sc.source_group = sg.source_group
    LEFT JOIN source_applications AS sa ON sa.source_group = sg.source_group
  ),
  practice_stats AS (
    SELECT
      practice_id,
      count(*) FILTER (WHERE event_name = 'practice_view')::int AS views,
      count(*) FILTER (WHERE event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT visitor_key) FILTER (WHERE event_name = 'audio_play_started')::int AS unique_listeners,
      count(*) FILTER (WHERE event_name = 'audio_completed')::int AS completions
    FROM included_events
    WHERE practice_id IS NOT NULL
      AND event_name IN ('practice_view', 'audio_play_started', 'audio_completed')
    GROUP BY practice_id
  ),
  popular_practices AS (
    SELECT
      ps.practice_id,
      coalesce(p.title, 'Практика') AS title,
      coalesce(nullif(btrim(a.name), ''), 'Автор') AS author_name,
      ps.views,
      ps.play_starts,
      ps.unique_listeners,
      ps.completions
    FROM practice_stats AS ps
    LEFT JOIN public.practices AS p ON p.id = ps.practice_id
    LEFT JOIN public.authors AS a ON a.id = p.author_id
    ORDER BY ps.play_starts DESC, ps.views DESC, ps.practice_id
    LIMIT 10
  ),
  recent_registrations AS (
    SELECT
      ('registration:' || ip.id::text) AS id,
      ip.created_at AS occurred_at,
      'registration'::text AS kind,
      NULL::text AS practice_title
    FROM included_profiles AS ip
    ORDER BY ip.created_at DESC
    LIMIT 6
  ),
  recent_behavior AS (
    SELECT
      ie.id::text AS id,
      ie.occurred_at,
      CASE
        WHEN ie.event_name = 'author_application_submitted' THEN 'author_application'
        WHEN ie.event_name = 'audio_completed' THEN 'audio_completed'
        ELSE 'audio_play'
      END AS kind,
      p.title AS practice_title
    FROM included_events AS ie
    LEFT JOIN public.practices AS p ON p.id = ie.practice_id
    WHERE ie.event_name IN (
      'author_application_submitted',
      'audio_play_started',
      'audio_completed'
    )
    ORDER BY ie.occurred_at DESC
    LIMIT 12
  ),
  recent_activity AS (
    SELECT id, occurred_at, kind, practice_title
    FROM (
      SELECT * FROM recent_registrations
      UNION ALL
      SELECT * FROM recent_behavior
    ) AS combined
    ORDER BY occurred_at DESC
    LIMIT 12
  )
  SELECT jsonb_build_object(
    'visits', m.visits,
    'visitors', m.visitors,
    'registrations', m.registrations,
    'excluded_test_sessions', m.excluded_test_sessions,
    'excluded_test_visitors', m.excluded_test_visitors,
    'practice_views', m.practice_views,
    'play_starts', m.play_starts,
    'listeners', m.listeners,
    'completions', m.completions,
    'author_applications', m.author_applications,
    'funnel_practice_view_sessions', m.funnel_practice_view_sessions,
    'funnel_play_sessions', m.funnel_play_sessions,
    'funnel_completion_sessions', m.funnel_completion_sessions,
    'sources', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'source', s.source,
          'visitors', s.visitors,
          'registrations', s.registrations,
          'playStarts', s.play_starts,
          'completions', s.completions,
          'applications', s.applications
        )
        ORDER BY s.source
      )
      FROM sources AS s
    ), '[]'::jsonb),
    'popular_practices', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'practiceId', pp.practice_id,
          'title', pp.title,
          'authorName', pp.author_name,
          'views', pp.views,
          'playStarts', pp.play_starts,
          'uniqueListeners', pp.unique_listeners,
          'completions', pp.completions
        )
      )
      FROM popular_practices AS pp
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ra.id,
          'occurredAt', ra.occurred_at,
          'kind', ra.kind,
          'practiceTitle', ra.practice_title
        )
        ORDER BY ra.occurred_at DESC
      )
      FROM recent_activity AS ra
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM metrics AS m;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.is_test_utm_campaign(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_test_anonymous_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_test_analytics_session(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_traffic_source(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_source_group(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_dashboard_snapshot(timestamptz, timestamptz, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_test_utm_campaign(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_test_anonymous_id(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_test_analytics_session(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_traffic_source(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_source_group(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_dashboard_snapshot(timestamptz, timestamptz, boolean) TO service_role;

COMMENT ON FUNCTION public.admin_analytics_dashboard_snapshot IS
  'audiolad:platform-analytics:v1; admin dashboard aggregates without PostgREST row-limit dependency';

COMMIT;

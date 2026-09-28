BEGIN;

-- Column sort for statistics tables.
-- Metric formulas are unchanged. Sort keys are whitelisted.
-- Search, period, and other filters run before ORDER BY. LIMIT is last.
-- NULL sort values stay last in both directions. Ties break on title/name then id.

DROP FUNCTION IF EXISTS public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int
);

CREATE FUNCTION public.admin_analytics_p2_practices(
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
  p_offset int DEFAULT 0,
  p_query text DEFAULT NULL
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
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(left(btrim(coalesce(p_query, '')), 200), '');
  v_valid_from timestamptz;
  v_partial boolean := false;
  v_unmeasured boolean := false;
  v_result jsonb;
BEGIN
  IF v_sort NOT IN (
    'views', 'play_starts', 'listeners', 'completions', 'saves',
    'view_to_play', 'play_to_complete', 'listened_ms', 'title', 'author'
  ) THEN
    v_sort := 'play_starts';
  END IF;

  IF v_dir NOT IN ('asc', 'desc') THEN
    v_dir := 'desc';
  END IF;

  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_unmeasured := p_to IS NOT NULL AND v_valid_from IS NOT NULL AND p_to <= v_valid_from;
  v_partial := NOT v_unmeasured
    AND v_valid_from IS NOT NULL
    AND (p_from IS NULL OR p_from < v_valid_from);

  WITH included_events AS (
    SELECT practice_id, event_name, visitor_key
    FROM public.analytics_product_event_facts(
      p_from, p_to, p_author_id, p_practice_id, v_include_test
    )
    WHERE practice_id IS NOT NULL
      AND public.admin_analytics_p2_utm_matches(p_utm_source, utm_source)
      AND (v_device IS NULL OR device_type = v_device)
  ),
  usage_by_practice AS (
    SELECT
      practice_id,
      coalesce(sum(listened_ms), 0)::bigint AS listened_ms,
      (array_agg(author_id_snapshot) FILTER (WHERE author_id_snapshot IS NOT NULL))[1] AS author_id_snapshot
    FROM public.playback_usage_admin_facts(
      p_from, p_to, v_include_test, p_author_id, p_practice_id, p_utm_source, p_device_type
    )
    GROUP BY practice_id
  ),
  practice_ids AS (
    SELECT practice_id FROM included_events
    UNION
    SELECT practice_id FROM usage_by_practice
  ),
  practice_stats AS (
    SELECT
      ids.practice_id,
      count(*) FILTER (WHERE e.event_name = 'practice_view')::int AS views,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'practice_view' AND e.visitor_key IS NOT NULL
      )::int AS unique_visitors,
      count(*) FILTER (WHERE e.event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'audio_play_started' AND e.visitor_key IS NOT NULL
      )::int AS unique_listeners,
      count(*) FILTER (WHERE e.event_name = 'audio_completed')::int AS completions,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'audio_completed' AND e.visitor_key IS NOT NULL
      )::int AS unique_completers,
      count(*) FILTER (WHERE e.event_name = 'first_manual_library_save')::int AS saves,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'first_manual_library_save' AND e.visitor_key IS NOT NULL
      )::int AS unique_savers,
      coalesce(max(u.listened_ms), 0)::bigint AS listened_ms,
      (array_agg(u.author_id_snapshot) FILTER (WHERE u.author_id_snapshot IS NOT NULL))[1] AS author_id_snapshot
    FROM practice_ids AS ids
    LEFT JOIN included_events AS e ON e.practice_id = ids.practice_id
    LEFT JOIN usage_by_practice AS u ON u.practice_id = ids.practice_id
    GROUP BY ids.practice_id
  ),
  labeled AS (
    SELECT
      ps.*,
      CASE
        WHEN pr.id IS NULL THEN 'Удалённая практика'
        ELSE coalesce(nullif(btrim(pr.title), ''), 'Практика')
      END AS title,
      coalesce(pr.author_id, ps.author_id_snapshot) AS author_id,
      coalesce(nullif(btrim(a.name), ''), 'Автор') AS author_name,
      a.slug AS author_slug,
      pr.slug AS practice_slug,
      CASE
        WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
          AND nullif(btrim(coalesce(pr.slug, '')), '') IS NOT NULL
          THEN '/practice/' || btrim(a.slug) || '/' || btrim(pr.slug)
        ELSE NULL
      END AS href
    FROM practice_stats AS ps
    LEFT JOIN public.practices AS pr ON pr.id = ps.practice_id
    LEFT JOIN public.authors AS a ON a.id = coalesce(pr.author_id, ps.author_id_snapshot)
  ),
  filtered AS (
    SELECT *
    FROM labeled
    WHERE v_query IS NULL
      OR strpos(
        lower(concat_ws(
          ' ',
          title,
          coalesce(practice_slug, ''),
          author_name,
          coalesce(author_slug, '')
        )),
        lower(v_query)
      ) > 0
  ),
  ranked AS (
    SELECT
      f.*,
      CASE v_sort
        WHEN 'title' THEN NULL
        WHEN 'author' THEN NULL
        WHEN 'views' THEN f.views::numeric
        WHEN 'play_starts' THEN f.play_starts::numeric
        WHEN 'listeners' THEN f.unique_listeners::numeric
        WHEN 'completions' THEN f.completions::numeric
        WHEN 'saves' THEN f.saves::numeric
        WHEN 'view_to_play'
          THEN coalesce(f.play_starts::numeric / nullif(f.views, 0)::numeric, 0)
        WHEN 'play_to_complete'
          THEN coalesce(f.completions::numeric / nullif(f.play_starts, 0)::numeric, 0)
        WHEN 'listened_ms' THEN CASE
          WHEN v_unmeasured THEN NULL
          ELSE f.listened_ms::numeric
        END
        ELSE f.play_starts::numeric
      END AS sort_value,
      CASE v_sort
        WHEN 'title' THEN f.title
        WHEN 'author' THEN f.author_name
        ELSE NULL
      END AS sort_text
    FROM filtered AS f
  ),
  page AS (
    SELECT *
    FROM ranked
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN sort_value END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_value END DESC NULLS LAST,
      CASE WHEN v_dir = 'asc' THEN sort_text END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_text END DESC NULLS LAST,
      play_starts DESC,
      views DESC,
      title ASC,
      practice_id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM filtered),
    'listeningTimeValidFrom', v_valid_from,
    'listeningTimePartial', v_partial,
    'listeningTimeUnmeasured', v_unmeasured,
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'practiceId', pg.practice_id,
          'title', pg.title,
          'authorId', pg.author_id,
          'authorName', pg.author_name,
          'authorSlug', pg.author_slug,
          'practiceSlug', pg.practice_slug,
          'href', pg.href,
          'views', pg.views,
          'uniqueVisitors', pg.unique_visitors,
          'playStarts', pg.play_starts,
          'uniqueListeners', pg.unique_listeners,
          'completions', pg.completions,
          'uniqueCompleters', pg.unique_completers,
          'saves', pg.saves,
          'uniqueSavers', pg.unique_savers,
          'listenedMs', CASE WHEN v_unmeasured THEN NULL ELSE pg.listened_ms END
        )
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN pg.sort_value END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_value END DESC NULLS LAST,
          CASE WHEN v_dir = 'asc' THEN pg.sort_text END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_text END DESC NULLS LAST,
          pg.play_starts DESC,
          pg.views DESC,
          pg.title ASC,
          pg.practice_id ASC
      )
      FROM page AS pg
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(v_result, jsonb_build_object('total', 0, 'rows', '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int, text
) IS
  'audiolad:platform-analytics:p2; per-practice aggregates. Filters and whitelisted sort run before LIMIT. listened_ms sorts as a number, null when the window is unmeasured. Search is a literal substring, not SQL.';

REVOKE ALL ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int, text
) TO service_role;

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
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF v_sort NOT IN (
    'name', 'views', 'play_starts', 'listeners', 'completions', 'saves',
    'published_practices', 'view_to_play', 'play_to_complete'
  ) THEN
    v_sort := 'play_starts';
  END IF;

  IF v_dir NOT IN ('asc', 'desc') THEN
    v_dir := 'desc';
  END IF;

  WITH included_events AS (
    SELECT author_id, event_name, visitor_key
    FROM public.analytics_product_event_facts(
      p_from, p_to, p_author_id, p_practice_id, v_include_test
    )
    WHERE author_id IS NOT NULL
      AND public.admin_analytics_p2_utm_matches(p_utm_source, utm_source)
      AND (v_device IS NULL OR device_type = v_device)
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
      coalesce(nullif(btrim(a.name), ''), 'Автор') AS author_name,
      a.slug AS author_slug,
      CASE
        WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
          THEN '/authors/' || btrim(a.slug)
        ELSE NULL
      END AS href,
      CASE v_sort
        WHEN 'name' THEN NULL
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
      END AS sort_value,
      CASE WHEN v_sort = 'name' THEN coalesce(nullif(btrim(a.name), ''), 'Автор') ELSE NULL END AS sort_text
    FROM author_stats AS st
    LEFT JOIN published_counts AS pc ON pc.author_id = st.author_id
    LEFT JOIN public.authors AS a ON a.id = st.author_id
  ),
  page AS (
    SELECT *
    FROM ranked
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN sort_value END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_value END DESC NULLS LAST,
      CASE WHEN v_dir = 'asc' THEN sort_text END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_text END DESC NULLS LAST,
      play_starts DESC,
      views DESC,
      author_name ASC,
      author_id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM author_stats),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'authorId', pg.author_id,
          'name', pg.author_name,
          'slug', pg.author_slug,
          'href', pg.href,
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
          CASE WHEN v_dir = 'asc' THEN pg.sort_text END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_text END DESC NULLS LAST,
          pg.play_starts DESC,
          pg.views DESC,
          pg.author_name ASC,
          pg.author_id ASC
      )
      FROM page AS pg
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(v_result, jsonb_build_object('total', 0, 'rows', '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_p2_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int
) IS
  'audiolad:platform-analytics:p2; per-author aggregates. Whitelisted sort runs before LIMIT. Name sort is text, not a filter.';

DROP FUNCTION IF EXISTS public.admin_analytics_p2_acquisition(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, int, int
);

CREATE FUNCTION public.admin_analytics_p2_acquisition(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_sort text DEFAULT 'sessions',
  p_sort_dir text DEFAULT 'desc',
  p_group text DEFAULT NULL
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
$$;

COMMENT ON FUNCTION public.admin_analytics_p2_acquisition(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, int, int, text, text, text
) IS
  'audiolad:platform-analytics:p2; session-touch UTM. Optional p_group rolls the full tuple set up before sort and LIMIT. Metric sums are unchanged.';

REVOKE ALL ON FUNCTION public.admin_analytics_p2_acquisition(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, int, int, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_acquisition(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, int, int, text, text, text
) TO service_role;

COMMIT;

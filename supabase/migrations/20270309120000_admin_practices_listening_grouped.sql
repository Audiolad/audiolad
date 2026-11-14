BEGIN;

-- t1450u. Admin «Обзор» → «Разрезы по практикам» did not load for 30 days and
-- «Всё время». /api/admin/analytics/breakdown got HTTP 500 from PostgREST for
-- admin_analytics_p2_practices (SQLSTATE 57014, authenticator
-- statement_timeout of 8 s). On production (2026-11-14) the RPC alone took
-- 2.6 s for 7 days, 12.0 s for 30 days and 23.0 s for all time. Almost all of
-- that is the usage_by_practice CTE: it summed listened_ms over
-- playback_usage_admin_facts(...), which runs the SECURITY DEFINER helpers
-- (admin_analytics_visitor_key, is_platform_staff, is_analytics_test_user,
-- is_test_analytics_session) once per fact row (~370k rows in 30 days,
-- ~680k all time). The planner cannot inline them.
--
-- Same approach as 20261224120000 (#809) and 20261226120000 for the listening
-- cards and timeseries. playback_usage_admin_listened_ms_by_practice sums facts
-- per (session_id, user_id, anonymous_id, practice_id, author_id_snapshot) in a
-- MATERIALIZED CTE, then applies the same filters as playback_usage_admin_facts
-- once per group. Every predicate depends only on those keys, the joined
-- practices / analytics_sessions rows and the parameters, never on
-- occurred_at or listened_ms, so each group is kept or dropped as a whole and
-- the per-practice sum equals sum(listened_ms) GROUP BY practice_id over
-- playback_usage_admin_facts. author_id_snapshot is the same per-practice
-- "any non-null coalesce(f.author_id_snapshot, pr.author_id)" as before.
-- MATERIALIZED is required; otherwise the planner pushes the per-user helpers
-- back below the aggregate.
--
-- admin_analytics_p2_practices keeps its signature, sort whitelist, filters,
-- metric formulas and JSON shape. Only the usage_by_practice CTE changes.
-- No table change, no index, no backfill, no timeout change. New grant:
-- service_role EXECUTE on the helper only (same REVOKE/GRANT pattern as
-- playback_usage_admin_facts).
-- Rollback: re-apply the admin_analytics_p2_practices body from
-- 20261206120100_stats_table_column_sort.sql. The helper may stay, unused.

CREATE OR REPLACE FUNCTION public.playback_usage_admin_listened_ms_by_practice(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS TABLE (practice_id uuid, listened_ms bigint, author_id_snapshot uuid)
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
  SELECT
    g.practice_id,
    coalesce(sum(g.listened_ms), 0)::bigint,
    (array_agg(coalesce(g.author_id_snapshot, pr.author_id))
      FILTER (WHERE coalesce(g.author_id_snapshot, pr.author_id) IS NOT NULL))[1]
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
  GROUP BY g.practice_id;
$$;

COMMENT ON FUNCTION public.playback_usage_admin_listened_ms_by_practice(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; per-practice sum(listened_ms) equal to GROUP BY practice_id over playback_usage_admin_facts(same args), plus any non-null author snapshot. Pre-aggregates per session/user/anonymous/practice/author snapshot in a MATERIALIZED CTE, then applies the same filters once per group.';

REVOKE ALL ON FUNCTION public.playback_usage_admin_listened_ms_by_practice(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.playback_usage_admin_listened_ms_by_practice(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

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
    -- Grouped helper (20270309120000): same per-practice sum and author
    -- snapshot as GROUP BY practice_id over playback_usage_admin_facts.
    SELECT
      u.practice_id,
      u.listened_ms,
      u.author_id_snapshot
    FROM public.playback_usage_admin_listened_ms_by_practice(
      p_from, p_to, v_include_test, p_author_id, p_practice_id, p_utm_source, p_device_type
    ) AS u
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
  'audiolad:platform-analytics:p2; per-practice aggregates. Filters and whitelisted sort run before LIMIT. listened_ms sorts as a number, null when the window is unmeasured. Search is a literal substring, not SQL. Listening time comes from playback_usage_admin_listened_ms_by_practice (grouped, t1450u).';

REVOKE ALL ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int, text
) TO service_role;

COMMIT;

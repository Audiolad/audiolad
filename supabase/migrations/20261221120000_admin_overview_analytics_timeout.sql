BEGIN;

-- Обзор timed out because analytics_owner_overview scanned every overview
-- event (including page_view) from the start of analytics_events, once per
-- window, and computed admin_analytics_visitor_key on each row. The fatal
-- client path treats either that RPC or admin_analytics_p2_summary as a
-- hard failure. This keeps the same counts:
--   * one bounded scan of the selected period via analytics_overview_event_facts
--   * WAL/MAL from audio_play_started in the last 60 days only
--   * new/returning listeners via index probes of prior audio_play_started
--     rows that can match the current listener keys
-- Does not change the database timeout, add tables, or grant new callers.

CREATE INDEX IF NOT EXISTS analytics_events_play_started_occurred_idx
  ON public.analytics_events (occurred_at DESC)
  WHERE event_name = 'audio_play_started';

CREATE INDEX IF NOT EXISTS analytics_events_play_started_anon_occurred_idx
  ON public.analytics_events (anonymous_session_id, occurred_at DESC)
  WHERE event_name = 'audio_play_started'
    AND user_id IS NULL
    AND anonymous_session_id IS NOT NULL;

-- Play-start slice of analytics_overview_event_facts. Filters match that
-- function; event_name is fixed so the partial index can be used.
CREATE OR REPLACE FUNCTION public.analytics_overview_play_starts(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS TABLE (
  visitor_key text,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.admin_analytics_visitor_key(
      e.user_id,
      coalesce(s.anonymous_id, e.anonymous_session_id),
      e.occurred_at
    ),
    e.occurred_at
  FROM public.analytics_events AS e
  LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
  LEFT JOIN public.practices AS pr ON pr.id = e.practice_id
  WHERE e.event_name = 'audio_play_started'
    AND (p_from IS NULL OR e.occurred_at >= p_from)
    AND (p_to IS NULL OR e.occurred_at < p_to)
    AND (p_author_id IS NULL OR pr.author_id = p_author_id)
    AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
    AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
    AND (
      nullif(btrim(coalesce(p_device_type, '')), '') IS NULL
      OR s.device_type = p_device_type
    )
    AND (
      coalesce(p_include_test, false) OR NOT (
        coalesce(e.is_staff, false) OR coalesce(e.is_test, false) OR coalesce(e.is_bot, false)
        OR coalesce(e.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
        OR coalesce(s.is_staff, false) OR coalesce(s.is_test, false) OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
      )
    )
    AND (
      e.user_id IS NULL OR pr.author_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.author_members AS am
        WHERE am.author_id = pr.author_id AND am.user_id = e.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.analytics_overview_play_starts(
  timestamptz, timestamptz, uuid, uuid, boolean, text, text
) IS
  'audiolad:owner-overview; audio_play_started rows with the same human, self-traffic, UTM and device filters as analytics_overview_event_facts.';

-- Prior audio_play_started visitor keys that intersect p_keys.
-- Equivalent to the old historical_starts CTE: overview facts with an open
-- start, an upper bound of p_before, and null author, practice, UTM and
-- device, keeping only audio_play_started. page_view rows are not read.
CREATE OR REPLACE FUNCTION public.analytics_overview_prior_play_start_keys(
  p_before timestamptz,
  p_include_test boolean,
  p_keys text[]
)
RETURNS TABLE (visitor_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH keys AS (
    SELECT DISTINCT btrim(raw_key) AS visitor_key
    FROM unnest(coalesce(p_keys, ARRAY[]::text[])) AS raw_key
    WHERE nullif(btrim(raw_key), '') IS NOT NULL
  ),
  user_ids AS (
    SELECT keys.visitor_key::uuid AS user_id
    FROM keys
    WHERE keys.visitor_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  link_anons AS (
    SELECT DISTINCT l.anonymous_id
    FROM public.analytics_identity_links AS l
    JOIN user_ids AS u ON u.user_id = l.user_id
  ),
  candidate_anons AS (
    SELECT keys.visitor_key AS anonymous_id FROM keys
    UNION
    SELECT link_anons.anonymous_id FROM link_anons
  ),
  candidate_events AS (
    SELECT e.id
    FROM public.analytics_events AS e
    JOIN user_ids AS u ON u.user_id = e.user_id
    WHERE p_before IS NOT NULL
      AND e.event_name = 'audio_play_started'
      AND e.occurred_at < p_before
    UNION
    SELECT e.id
    FROM public.analytics_sessions AS s
    JOIN candidate_anons AS c ON c.anonymous_id = s.anonymous_id
    JOIN public.analytics_events AS e ON e.session_id = s.id
    WHERE p_before IS NOT NULL
      AND e.event_name = 'audio_play_started'
      AND e.user_id IS NULL
      AND e.occurred_at < p_before
    UNION
    SELECT e.id
    FROM public.analytics_events AS e
    JOIN candidate_anons AS c ON c.anonymous_id = e.anonymous_session_id
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    WHERE p_before IS NOT NULL
      AND e.event_name = 'audio_play_started'
      AND e.user_id IS NULL
      AND e.occurred_at < p_before
      AND s.anonymous_id IS NULL
  ),
  qualified AS (
    SELECT
      public.admin_analytics_visitor_key(
        e.user_id,
        coalesce(s.anonymous_id, e.anonymous_session_id),
        e.occurred_at
      ) AS visitor_key
    FROM candidate_events AS candidate
    JOIN public.analytics_events AS e ON e.id = candidate.id
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    LEFT JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE (
      coalesce(p_include_test, false) OR NOT (
        coalesce(e.is_staff, false) OR coalesce(e.is_test, false) OR coalesce(e.is_bot, false)
        OR coalesce(e.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_anonymous_id(e.anonymous_session_id), false)
        OR coalesce(s.is_staff, false) OR coalesce(s.is_test, false) OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, s.anonymous_id), false)
      )
    )
    AND (
      e.user_id IS NULL OR pr.author_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.author_members AS am
        WHERE am.author_id = pr.author_id AND am.user_id = e.user_id
      )
    )
  )
  SELECT DISTINCT qualified.visitor_key
  FROM qualified
  JOIN keys ON keys.visitor_key = qualified.visitor_key
  WHERE qualified.visitor_key IS NOT NULL;
$$;

COMMENT ON FUNCTION public.analytics_overview_prior_play_start_keys(timestamptz, boolean, text[]) IS
  'audiolad:owner-overview; which of p_keys already had a qualifying audio_play_started before p_before. Same inclusion rules as analytics_overview_event_facts with null author, practice, UTM and device.';

CREATE OR REPLACE FUNCTION public.analytics_owner_overview(
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
  v_to timestamptz := coalesce(p_to, now());
  v_result jsonb;
BEGIN
  WITH period_facts AS (
    SELECT *
    FROM public.analytics_overview_event_facts(
      p_from, p_to, NULL, NULL, p_include_test, p_utm_source, p_device_type
    )
  ),
  product_facts AS (
    SELECT *
    FROM period_facts
    WHERE (p_author_id IS NULL OR author_id = p_author_id)
      AND (p_practice_id IS NULL OR practice_id = p_practice_id)
  ),
  current_listeners AS (
    SELECT DISTINCT visitor_key
    FROM product_facts
    WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
  ),
  historical_starts AS (
    SELECT prior.visitor_key
    FROM public.analytics_overview_prior_play_start_keys(
      p_from,
      coalesce(p_include_test, false),
      (
        SELECT coalesce(array_agg(current_listeners.visitor_key), ARRAY[]::text[])
        FROM current_listeners
      )
    ) AS prior
  ),
  rolling_starts AS (
    SELECT starts.visitor_key, starts.occurred_at
    FROM public.analytics_overview_play_starts(
      v_to - interval '60 days',
      v_to,
      p_author_id,
      p_practice_id,
      p_include_test,
      p_utm_source,
      p_device_type
    ) AS starts
    WHERE starts.visitor_key IS NOT NULL
  ),
  wal AS (
    SELECT count(DISTINCT visitor_key)::int AS n
    FROM rolling_starts
    WHERE occurred_at >= v_to - interval '7 days' AND occurred_at < v_to
  ),
  previous_wal AS (
    SELECT count(DISTINCT visitor_key)::int AS n
    FROM rolling_starts
    WHERE occurred_at >= v_to - interval '14 days'
      AND occurred_at < v_to - interval '7 days'
  ),
  mal AS (
    SELECT count(DISTINCT visitor_key)::int AS n
    FROM rolling_starts
    WHERE occurred_at >= v_to - interval '30 days' AND occurred_at < v_to
  ),
  previous_mal AS (
    SELECT count(DISTINCT visitor_key)::int AS n
    FROM rolling_starts
    WHERE occurred_at >= v_to - interval '60 days'
      AND occurred_at < v_to - interval '30 days'
  )
  SELECT jsonb_build_object(
    'real_visitors', (
      SELECT count(DISTINCT visitor_key)::int
      FROM period_facts
      WHERE event_name = 'page_view' AND visitor_key IS NOT NULL
    ),
    'practice_visitors', (
      SELECT count(DISTINCT visitor_key)::int
      FROM product_facts
      WHERE event_name = 'practice_view' AND visitor_key IS NOT NULL
    ),
    'listeners', (SELECT count(*)::int FROM current_listeners),
    'completers', (
      SELECT count(DISTINCT visitor_key)::int
      FROM product_facts
      WHERE event_name = 'audio_completed' AND visitor_key IS NOT NULL
    ),
    'completers_among_listeners', (
      SELECT count(*)::int
      FROM current_listeners AS c
      WHERE EXISTS (
        SELECT 1
        FROM product_facts AS f
        WHERE f.event_name = 'audio_completed' AND f.visitor_key = c.visitor_key
      )
    ),
    'practice_views', (
      SELECT count(*)::int FROM product_facts WHERE event_name = 'practice_view'
    ),
    'play_starts', (
      SELECT count(*)::int FROM product_facts WHERE event_name = 'audio_play_started'
    ),
    'completions', (
      SELECT count(*)::int FROM product_facts WHERE event_name = 'audio_completed'
    ),
    'new_listeners', (
      SELECT count(*)::int
      FROM current_listeners AS c
      WHERE NOT EXISTS (
        SELECT 1 FROM historical_starts AS h WHERE h.visitor_key = c.visitor_key
      )
    ),
    'returning_listeners', (
      SELECT count(*)::int
      FROM current_listeners AS c
      WHERE EXISTS (
        SELECT 1 FROM historical_starts AS h WHERE h.visitor_key = c.visitor_key
      )
    ),
    'repeat_listeners', (
      SELECT count(*)::int
      FROM (
        SELECT visitor_key
        FROM product_facts
        WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
        GROUP BY visitor_key
        HAVING count(DISTINCT listening_day) >= 2
      ) AS repeated
    ),
    'wal', (SELECT n FROM wal),
    'previous_wal', (SELECT n FROM previous_wal),
    'mal', (SELECT n FROM mal),
    'previous_mal', (SELECT n FROM previous_mal)
  )
  INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.analytics_owner_overview(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:owner-overview; people, WAL/MAL and completers_among_listeners unchanged. Prior listener history is probed from audio_play_started instead of scanning every overview event.';

REVOKE ALL ON FUNCTION public.analytics_overview_play_starts(
  timestamptz, timestamptz, uuid, uuid, boolean, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_overview_prior_play_start_keys(
  timestamptz, boolean, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_owner_overview(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.analytics_overview_play_starts(
  timestamptz, timestamptz, uuid, uuid, boolean, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_overview_prior_play_start_keys(
  timestamptz, boolean, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_owner_overview(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- Author dashboard stats (MVP): service_role-only read aggregates.
-- Access is enforced in Next.js via requireAuthorStatsAccess + membership.
-- These RPCs intentionally have no browser EXECUTE grants.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_stats_source_bucket(
  p_utm_source text,
  p_referrer_domain text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- UTM wins when present
    WHEN nullif(btrim(lower(coalesce(p_utm_source, ''))), '') IS NOT NULL THEN
      CASE
        WHEN lower(btrim(p_utm_source)) IN ('telegram', 'tg', 'bothelp-telegram') THEN 'telegram'
        WHEN lower(btrim(p_utm_source)) IN ('vk', 'vkontakte') THEN 'vk'
        WHEN lower(btrim(p_utm_source)) IN ('max', 'bothelp-maks') THEN 'max'
        WHEN lower(btrim(p_utm_source)) IN ('direct') THEN 'direct'
        WHEN lower(btrim(p_utm_source)) IN ('internal', 'audiolad') THEN 'internal'
        WHEN lower(btrim(p_utm_source)) IN ('google', 'yandex', 'bing', 'duckduckgo', 'search') THEN 'search'
        ELSE 'other_external'
      END
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%audiolad.ru%'
      OR lower(p_referrer_domain) = 'localhost'
      OR lower(p_referrer_domain) LIKE '127.0.0.1%'
    ) THEN 'internal'
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%t.me%'
      OR lower(p_referrer_domain) LIKE '%telegram.%'
      OR lower(p_referrer_domain) LIKE '%org.telegram%'
    ) THEN 'telegram'
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%vk.com%'
      OR lower(p_referrer_domain) LIKE '%vk.ru%'
    ) THEN 'vk'
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%max.ru%'
      OR lower(p_referrer_domain) LIKE '%oneme.ru%'
      OR lower(p_referrer_domain) = 'max'
    ) THEN 'max'
    WHEN p_referrer_domain IS NOT NULL AND (
      lower(p_referrer_domain) LIKE '%google.%'
      OR lower(p_referrer_domain) LIKE '%yandex.%'
      OR lower(p_referrer_domain) LIKE '%bing.%'
      OR lower(p_referrer_domain) LIKE '%duckduckgo.%'
    ) THEN 'search'
    WHEN nullif(btrim(coalesce(p_referrer_domain, '')), '') IS NOT NULL THEN 'other_external'
    WHEN p_utm_source IS NULL AND p_referrer_domain IS NULL THEN 'direct'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.author_stats_rate(p_num numeric, p_den numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_den IS NULL OR p_den <= 0 THEN NULL
    ELSE round((GREATEST(p_num, 0) / p_den) * 1000) / 10
  END;
$$;

-- Shared: human non-member events for an author in a window
-- Implemented inline in each RPC for clarity/stability.

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
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH members AS (
    SELECT am.user_id
    FROM public.author_members AS am
    WHERE am.author_id = p_author_id
  ),
  practice_events AS (
    SELECT
      e.event_name,
      e.session_id,
      e.occurred_at,
      public.admin_analytics_visitor_key(
        e.user_id,
        coalesce(s.anonymous_id, e.anonymous_session_id),
        e.occurred_at
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE pr.author_id = p_author_id
      AND e.event_name IN (
        'practice_view',
        'audio_play_started',
        'audio_progress_25',
        'audio_completed'
      )
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
  paid_purchases AS (
    SELECT count(*)::int AS cnt
    FROM public.orders AS o
    LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
    WHERE o.status = 'paid'
      AND o.paid_at IS NOT NULL
      AND coalesce(o.is_test, false) = false
      AND (
        o.author_id_snapshot = p_author_id
        OR (o.author_id_snapshot IS NULL AND pr.author_id = p_author_id)
      )
      AND (p_from IS NULL OR o.paid_at >= p_from)
      AND (p_to IS NULL OR o.paid_at < p_to)
      AND (
        o.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = o.user_id)
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
      (SELECT cnt FROM paid_purchases) AS paid_purchases
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
    'paid_purchases', c.paid_purchases,
    'view_to_play_rate', public.author_stats_rate(c.plays, c.practice_views),
    'play_to_complete_rate', public.author_stats_rate(c.completions, c.plays),
    'view_to_save_rate', public.author_stats_rate(c.library_saves, c.practice_views),
    'view_to_purchase_rate', public.author_stats_rate(c.paid_purchases, c.practice_views)
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
        SELECT min(o.paid_at)
        FROM public.orders AS o
        LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
        WHERE o.status = 'paid'
          AND coalesce(o.is_test, false) = false
          AND (
            o.author_id_snapshot = p_author_id
            OR (o.author_id_snapshot IS NULL AND pr.author_id = p_author_id)
          )
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
    SELECT
      (e.occurred_at AT TIME ZONE 'Europe/Moscow')::date AS day_local,
      e.event_name,
      public.admin_analytics_visitor_key(
        e.user_id,
        coalesce(s.anonymous_id, e.anonymous_session_id),
        e.occurred_at
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE pr.author_id = p_author_id
      AND e.event_name IN (
        'practice_view', 'audio_play_started', 'audio_progress_25', 'audio_completed'
      )
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
      (o.paid_at AT TIME ZONE 'Europe/Moscow')::date AS day_local,
      count(*)::int AS paid_purchases
    FROM public.orders AS o
    LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
    WHERE o.status = 'paid'
      AND o.paid_at IS NOT NULL
      AND coalesce(o.is_test, false) = false
      AND (
        o.author_id_snapshot = p_author_id
        OR (o.author_id_snapshot IS NULL AND pr.author_id = p_author_id)
      )
      AND o.paid_at >= v_from
      AND o.paid_at < v_to
      AND (
        o.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = o.user_id)
      )
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
      'paid_purchases', coalesce(pu.paid_purchases, 0),
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
    SELECT
      e.practice_id,
      e.event_name,
      public.admin_analytics_visitor_key(
        e.user_id,
        coalesce(s.anonymous_id, e.anonymous_session_id),
        e.occurred_at
      ) AS visitor_key
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    WHERE e.practice_id IN (SELECT id FROM author_practices)
      AND e.event_name IN (
        'practice_view', 'audio_play_started', 'audio_progress_25', 'audio_completed'
      )
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
      o.practice_id,
      count(*)::int AS paid_purchases
    FROM public.orders AS o
    WHERE o.practice_id IN (SELECT id FROM author_practices)
      AND o.status = 'paid'
      AND o.paid_at IS NOT NULL
      AND coalesce(o.is_test, false) = false
      AND (
        o.author_id_snapshot = p_author_id
        OR o.author_id_snapshot IS NULL
      )
      AND (p_from IS NULL OR o.paid_at >= p_from)
      AND (p_to IS NULL OR o.paid_at < p_to)
      AND (
        o.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = o.user_id)
      )
    GROUP BY o.practice_id
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'practice_id', ap.id,
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
      'paid_purchases', coalesce(pu.paid_purchases, 0),
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
    SELECT
      public.author_stats_source_bucket(s.utm_source, s.referrer_domain) AS bucket,
      public.admin_analytics_visitor_key(
        e.user_id,
        coalesce(s.anonymous_id, e.anonymous_session_id),
        e.occurred_at
      ) AS visitor_key,
      e.event_name
    FROM public.analytics_events AS e
    LEFT JOIN public.analytics_sessions AS s ON s.id = e.session_id
    LEFT JOIN public.practices AS pr ON pr.id = e.practice_id
    WHERE (
        (e.event_name = 'author_page_view' AND e.author_id = p_author_id)
        OR (
          e.event_name IN ('practice_view', 'audio_play_started')
          AND pr.author_id = p_author_id
        )
      )
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

REVOKE ALL ON FUNCTION public.author_stats_source_bucket(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_stats_rate(numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_stats_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_stats_timeseries(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_stats_products(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_stats_sources(uuid, timestamptz, timestamptz) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.author_stats_source_bucket(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_rate(numeric, numeric) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_summary(uuid, timestamptz, timestamptz) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_timeseries(uuid, timestamptz, timestamptz) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_products(uuid, timestamptz, timestamptz) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_sources(uuid, timestamptz, timestamptz) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.author_stats_source_bucket(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_rate(numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_summary(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_timeseries(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_products(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_sources(uuid, timestamptz, timestamptz) TO service_role;

COMMENT ON FUNCTION public.author_stats_summary IS
  'audiolad:author-stats:mvp; membership enforced in Next API; service_role only';

COMMIT;

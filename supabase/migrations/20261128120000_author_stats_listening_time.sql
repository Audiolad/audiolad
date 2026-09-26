BEGIN;

-- Author dashboard listening time reads playback_usage_facts.
-- It does not add a timer, a second ledger, or a new listen definition.
-- Existing author_stats_summary / timeseries / products KPI counts are unchanged.

CREATE INDEX IF NOT EXISTS playback_usage_facts_author_snapshot_occurred_idx
  ON public.playback_usage_facts (author_id_snapshot, occurred_at)
  WHERE listened_ms > 0 AND author_id_snapshot IS NOT NULL;

-- Measured window shared by the author listening RPCs.
-- effective_from = greatest(selected_from, listening_time_valid_from).
-- NULL selected_from (All) uses listening_time_valid_from.
-- A window that ends at or before valid_from is unmeasured, not zero.
CREATE OR REPLACE FUNCTION public.author_stats_listening_window(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid_from timestamptz;
  v_effective_from timestamptz;
  v_unmeasured boolean := false;
  v_partial boolean := false;
BEGIN
  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  IF v_valid_from IS NULL THEN
    v_unmeasured := true;
  ELSE
    v_unmeasured := p_to IS NOT NULL AND p_to <= v_valid_from;
    v_partial := NOT v_unmeasured AND (p_from IS NULL OR p_from < v_valid_from);
    IF NOT v_unmeasured THEN
      IF p_from IS NULL OR p_from < v_valid_from THEN
        v_effective_from := v_valid_from;
      ELSE
        v_effective_from := p_from;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valid_from', v_valid_from,
    'effective_from', v_effective_from,
    'partial', v_partial,
    'unmeasured', v_unmeasured
  );
END;
$$;

COMMENT ON FUNCTION public.author_stats_listening_window(timestamptz, timestamptz) IS
  'audiolad:author-stats; measured listening window. effective_from is greatest(selected_from, listening_time_valid_from), with NULL selected_from meaning All. Unmeasured when the window ends at or before valid_from.';

-- Positive facts for one author workspace.
-- Attribution is author_id_snapshot only. Current practices.author_id is not a fallback:
-- an owner transfer must not rewrite past usage, and a deleted practice stays in the total.
-- Human/test/staff/bot exclusion matches playback_usage_admin_facts with include_test false.
-- Workspace self-traffic matches author stats: author_members of this snapshot author are excluded.
-- Anonymous and authenticated non-member listening both remain.
CREATE OR REPLACE FUNCTION public.author_stats_listening_facts(
  p_author_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  practice_id uuid,
  listened_ms bigint,
  occurred_at timestamptz,
  listening_day date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    f.practice_id,
    f.listened_ms,
    f.occurred_at,
    (f.occurred_at AT TIME ZONE 'Europe/Moscow')::date
  FROM public.playback_usage_facts AS f
  LEFT JOIN public.analytics_sessions AS s ON s.id = f.session_id
  WHERE f.listened_ms > 0
    AND f.author_id_snapshot = p_author_id
    AND (p_from IS NULL OR f.occurred_at >= p_from)
    AND (p_to IS NULL OR f.occurred_at < p_to)
    AND NOT (
      coalesce(public.is_test_anonymous_id(f.anonymous_id), false)
      OR coalesce(public.is_test_anonymous_id(s.anonymous_id), false)
      OR (f.user_id IS NOT NULL AND coalesce(public.is_platform_staff(f.user_id), false))
      OR (f.user_id IS NOT NULL AND coalesce(public.is_analytics_test_user(f.user_id), false))
      OR coalesce(s.is_staff, false)
      OR coalesce(s.is_test, false)
      OR coalesce(s.is_bot, false)
      OR coalesce(s.traffic_class, 'human') <> 'human'
      OR coalesce(
        public.is_test_analytics_session(
          s.utm_campaign,
          coalesce(s.anonymous_id, f.anonymous_id)
        ),
        false
      )
    )
    AND (
      f.user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.author_members AS am
        WHERE am.author_id = p_author_id
          AND am.user_id = f.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.author_stats_listening_facts(uuid, timestamptz, timestamptz) IS
  'audiolad:author-stats; listened_ms for one author_id_snapshot. No current-owner fallback. Excludes staff, test, bot, non-human, and that author''s members. Service role only.';

CREATE OR REPLACE FUNCTION public.author_stats_listening_summary(
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
  v_window jsonb;
  v_valid_from timestamptz;
  v_effective_from timestamptz;
  v_unmeasured boolean;
  v_partial boolean;
  v_listened bigint := 0;
  v_listeners integer := 0;
  v_starts integer := 0;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_window := public.author_stats_listening_window(p_from, p_to);
  v_valid_from := (v_window ->> 'valid_from')::timestamptz;
  v_effective_from := (v_window ->> 'effective_from')::timestamptz;
  v_unmeasured := coalesce((v_window ->> 'unmeasured')::boolean, true);
  v_partial := coalesce((v_window ->> 'partial')::boolean, false);

  IF NOT v_unmeasured THEN
    SELECT coalesce(sum(f.listened_ms), 0)::bigint
    INTO v_listened
    FROM public.author_stats_listening_facts(p_author_id, v_effective_from, p_to) AS f;

    -- Same product-event filter as author stats plays (include_test false,
    -- current practice owner, member/staff/test exclusion), but only inside
    -- the measured window. Ordinary period play/listener KPIs are not used.
    SELECT
      coalesce(count(DISTINCT visitor_key) FILTER (
        WHERE event_name = 'audio_play_started' AND visitor_key IS NOT NULL
      ), 0)::int,
      coalesce(count(*) FILTER (WHERE event_name = 'audio_play_started'), 0)::int
    INTO v_listeners, v_starts
    FROM public.analytics_product_event_facts(
      v_effective_from, p_to, p_author_id, NULL, false
    );
  END IF;

  RETURN jsonb_build_object(
    'listened_ms', CASE WHEN v_unmeasured THEN NULL ELSE v_listened END,
    'measured_listeners', CASE WHEN v_unmeasured THEN NULL ELSE v_listeners END,
    'measured_play_starts', CASE WHEN v_unmeasured THEN NULL ELSE v_starts END,
    'average_listen_per_listener_ms', CASE
      WHEN v_unmeasured OR v_listeners <= 0 OR v_listened <= 0 THEN NULL
      ELSE round(v_listened::numeric / v_listeners)::bigint
    END,
    'average_listen_per_start_ms', CASE
      WHEN v_unmeasured OR v_starts <= 0 OR v_listened <= 0 THEN NULL
      ELSE round(v_listened::numeric / v_starts)::bigint
    END,
    'valid_from', v_valid_from,
    'effective_from', CASE WHEN v_unmeasured THEN NULL ELSE v_effective_from END,
    'partial', v_partial,
    'unmeasured', v_unmeasured
  );
END;
$$;

COMMENT ON FUNCTION public.author_stats_listening_summary(uuid, timestamptz, timestamptz) IS
  'audiolad:author-stats; trusted listened_ms for author_id_snapshot plus measured-window unique listeners and audio_play_started. Does not rewrite author_stats_summary.';

-- Daily Europe/Moscow buckets, same calendar as author_stats_timeseries.
-- A day that ends at or before listening_time_valid_from is JSON null, not zero.
-- All (p_from NULL) starts at valid_from; the API still marks earlier chart days unmeasured.
CREATE OR REPLACE FUNCTION public.author_stats_listening_timeseries(
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
  v_window jsonb;
  v_valid_from timestamptz;
  v_effective_from timestamptz;
  v_unmeasured boolean;
  v_partial boolean;
  v_from timestamptz;
  v_to timestamptz;
  v_points jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_window := public.author_stats_listening_window(p_from, p_to);
  v_valid_from := (v_window ->> 'valid_from')::timestamptz;
  v_effective_from := (v_window ->> 'effective_from')::timestamptz;
  v_unmeasured := coalesce((v_window ->> 'unmeasured')::boolean, true);
  v_partial := coalesce((v_window ->> 'partial')::boolean, false);

  v_to := coalesce(p_to, now());
  IF p_from IS NULL THEN
    v_from := coalesce(v_valid_from, v_to - interval '1 day');
  ELSE
    v_from := p_from;
  END IF;

  IF v_from >= v_to THEN
    v_from := v_to - interval '1 day';
  END IF;

  WITH days AS (
    SELECT generate_series(
      date_trunc('day', v_from AT TIME ZONE 'Europe/Moscow'),
      date_trunc('day', (v_to - interval '1 second') AT TIME ZONE 'Europe/Moscow'),
      interval '1 day'
    )::date AS day_local
  ),
  usage AS (
    SELECT
      f.listening_day AS day_local,
      sum(f.listened_ms)::bigint AS listened_ms
    FROM public.author_stats_listening_facts(
      p_author_id,
      CASE WHEN v_unmeasured THEN NULL ELSE v_effective_from END,
      CASE WHEN v_unmeasured THEN NULL ELSE p_to END
    ) AS f
    WHERE NOT v_unmeasured
    GROUP BY f.listening_day
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'date', d.day_local::text,
      'listened_ms', CASE
        WHEN v_valid_from IS NOT NULL
          AND ((d.day_local + interval '1 day')::timestamp AT TIME ZONE 'Europe/Moscow') <= v_valid_from
          THEN NULL
        WHEN v_unmeasured THEN NULL
        ELSE coalesce(u.listened_ms, 0)
      END
    )
    ORDER BY d.day_local
  ), '[]'::jsonb)
  INTO v_points
  FROM days AS d
  LEFT JOIN usage AS u ON u.day_local = d.day_local;

  RETURN jsonb_build_object(
    'valid_from', v_valid_from,
    'effective_from', CASE WHEN v_unmeasured THEN NULL ELSE v_effective_from END,
    'partial', v_partial,
    'unmeasured', v_unmeasured,
    'points', coalesce(v_points, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.author_stats_listening_timeseries(uuid, timestamptz, timestamptz) IS
  'audiolad:author-stats; daily listened_ms in Europe/Moscow. Days that end at or before listening_time_valid_from are JSON null, not zero.';

-- Current products only. Historical usage of a deleted or transferred practice
-- is omitted here and remains in author_stats_listening_summary via author_id_snapshot.
CREATE OR REPLACE FUNCTION public.author_stats_listening_products(
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
  v_window jsonb;
  v_valid_from timestamptz;
  v_effective_from timestamptz;
  v_unmeasured boolean;
  v_partial boolean;
  v_rows jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_window := public.author_stats_listening_window(p_from, p_to);
  v_valid_from := (v_window ->> 'valid_from')::timestamptz;
  v_effective_from := (v_window ->> 'effective_from')::timestamptz;
  v_unmeasured := coalesce((v_window ->> 'unmeasured')::boolean, true);
  v_partial := coalesce((v_window ->> 'partial')::boolean, false);

  IF v_unmeasured THEN
    v_rows := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'practice_id', grouped.practice_id,
        'product_slug', grouped.product_slug,
        'listened_ms', grouped.listened_ms
      )
      ORDER BY grouped.listened_ms DESC, grouped.product_slug ASC NULLS LAST
    ), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        f.practice_id,
        pr.slug AS product_slug,
        sum(f.listened_ms)::bigint AS listened_ms
      FROM public.author_stats_listening_facts(p_author_id, v_effective_from, p_to) AS f
      -- Slug is exposed only while this author still owns the practice.
      LEFT JOIN public.practices AS pr
        ON pr.id = f.practice_id
       AND pr.author_id = p_author_id
      GROUP BY f.practice_id, pr.slug
    ) AS grouped;
  END IF;

  RETURN jsonb_build_object(
    'valid_from', v_valid_from,
    'effective_from', CASE WHEN v_unmeasured THEN NULL ELSE v_effective_from END,
    'partial', v_partial,
    'unmeasured', v_unmeasured,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.author_stats_listening_products(uuid, timestamptz, timestamptz) IS
  'audiolad:author-stats; listened_ms by snapshot practice_id. product_slug is set only for practices this author still owns. Deleted-practice usage stays in the summary total.';

REVOKE ALL ON FUNCTION public.author_stats_listening_window(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_listening_facts(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_listening_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_listening_timeseries(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_stats_listening_products(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.author_stats_listening_window(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_listening_facts(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_listening_summary(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_listening_timeseries(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.author_stats_listening_products(uuid, timestamptz, timestamptz) TO service_role;

COMMIT;

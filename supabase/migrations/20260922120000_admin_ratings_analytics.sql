BEGIN;

-- Stage 3 admin Ratings analytics. Read-only RPCs for the existing
-- AdminAnalyticsWorkbench tab. Does not change Stage 1 listen-stats or
-- Stage 2 set_practice_rating / HMAC / public aggregate semantics.
--
-- Temporal membership for rating windows uses practice_ratings.created_at
-- (FIRST rating timestamp). It does NOT use practice_rating_events.occurred_at.
-- Example A: created yesterday, now stars=5 → in 7d and 30d with contribution 5.
-- Example B: created a year ago, edited today to 5 → all-time contribution 5;
--            NOT in the 7d or 30d first-rating cohort.
--
-- Aggregates count excluded_at IS NULL unless the surface is labelled excluded.
-- Internal average = totalStars / ratingCount (NULL when count = 0).
-- Journal is audit only. No exclude/restore mutation in this migration.

CREATE INDEX IF NOT EXISTS practice_ratings_created_at_active_idx
  ON public.practice_ratings (created_at)
  WHERE excluded_at IS NULL;

CREATE INDEX IF NOT EXISTS practice_rating_events_occurred_at_id_idx
  ON public.practice_rating_events (occurred_at DESC, id DESC);

COMMENT ON INDEX public.practice_ratings_created_at_active_idx IS
  'Admin 7d/30d first-rating windows. created_at is immutable first-rating time.';

COMMENT ON INDEX public.practice_rating_events_occurred_at_id_idx IS
  'Admin journal pagination: newest first, id tie-break to avoid dupes/skips.';

CREATE OR REPLACE FUNCTION public.admin_ratings_summary(
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
  v_rating_count integer := 0;
  v_total_stars bigint := 0;
  v_unique_raters integer := 0;
  v_eligible integer := 0;
  v_rated_eligible integer := 0;
  v_active_count integer := 0;
  v_excluded_count integer := 0;
BEGIN
  -- Window membership: practice_ratings.created_at (FIRST rating), not events.
  SELECT
    count(*)::integer,
    coalesce(sum(r.stars), 0)::bigint,
    count(DISTINCT r.user_id)::integer
  INTO v_rating_count, v_total_stars, v_unique_raters
  FROM public.practice_ratings AS r
  WHERE r.excluded_at IS NULL
    AND (p_from IS NULL OR r.created_at >= p_from)
    AND (p_to IS NULL OR r.created_at < p_to);

  SELECT
    count(*) FILTER (WHERE r.excluded_at IS NULL)::integer,
    count(*) FILTER (WHERE r.excluded_at IS NOT NULL)::integer
  INTO v_active_count, v_excluded_count
  FROM public.practice_ratings AS r;

  -- Eligible grain is user×practice. Period uses rating_eligible_at.
  SELECT count(*)::integer
  INTO v_eligible
  FROM public.practice_listen_stats AS s
  WHERE s.rating_eligible_at IS NOT NULL
    AND (p_from IS NULL OR s.rating_eligible_at >= p_from)
    AND (p_to IS NULL OR s.rating_eligible_at < p_to);

  SELECT count(*)::integer
  INTO v_rated_eligible
  FROM public.practice_listen_stats AS s
  WHERE s.rating_eligible_at IS NOT NULL
    AND (p_from IS NULL OR s.rating_eligible_at >= p_from)
    AND (p_to IS NULL OR s.rating_eligible_at < p_to)
    AND EXISTS (
      SELECT 1
      FROM public.practice_ratings AS r
      WHERE r.user_id = s.user_id
        AND r.practice_id = s.practice_id
        AND r.excluded_at IS NULL
    );

  RETURN jsonb_build_object(
    'rating_count', v_rating_count,
    'total_stars', v_total_stars,
    'unique_raters', v_unique_raters,
    'average', CASE
      WHEN v_rating_count <= 0 THEN NULL
      ELSE (v_total_stars::numeric / v_rating_count::numeric)
    END,
    'eligible_listeners', v_eligible,
    'eligible_unrated', greatest(v_eligible - v_rated_eligible, 0),
    'rated_eligible', v_rated_eligible,
    'conversion', CASE
      WHEN v_eligible <= 0 THEN NULL
      ELSE (v_rated_eligible::numeric / v_eligible::numeric)
    END,
    'active_count', v_active_count,
    'excluded_count', v_excluded_count,
    'notes', jsonb_build_object(
      'temporal', 'created_at_first_rating',
      'average', 'admin_only_total_stars_div_rating_count',
      'eligible_grain', 'user_x_practice',
      'excluded', 'aggregates_excluded_at_is_null'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_summary(timestamptz, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_summary(timestamptz, timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_summary(timestamptz, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.admin_ratings_summary(timestamptz, timestamptz) IS
  'audiolad:admin-ratings:v1; Stage 3 summary cards. Rating windows use created_at (first rating), not event.occurred_at. Example A: created yesterday now stars=5 counts in 7d/30d as 5. Example B: created a year ago edited today is all-time only. service_role only; API still requires analytics.view.';

CREATE OR REPLACE FUNCTION public.admin_ratings_products(
  p_from_7d timestamptz DEFAULT NULL,
  p_from_30d timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'total_stars',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'total_stars');
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_sort NOT IN ('total_stars', 'rating_count', 'stars_30d', 'stars_7d', 'conversion') THEN
    v_sort := 'total_stars';
  END IF;

  WITH active AS (
    SELECT r.user_id, r.practice_id, r.stars, r.created_at
    FROM public.practice_ratings AS r
    WHERE r.excluded_at IS NULL
  ),
  lifetime AS (
    SELECT
      a.practice_id,
      coalesce(sum(a.stars), 0)::bigint AS total_stars,
      count(*)::integer AS rating_count
    FROM active AS a
    GROUP BY a.practice_id
  ),
  w7 AS (
    SELECT
      a.practice_id,
      coalesce(sum(a.stars), 0)::bigint AS stars_7d,
      count(*)::integer AS count_7d
    FROM active AS a
    WHERE p_from_7d IS NOT NULL
      AND a.created_at >= p_from_7d
      AND (p_to IS NULL OR a.created_at < p_to)
    GROUP BY a.practice_id
  ),
  w30 AS (
    SELECT
      a.practice_id,
      coalesce(sum(a.stars), 0)::bigint AS stars_30d,
      count(*)::integer AS count_30d
    FROM active AS a
    WHERE p_from_30d IS NOT NULL
      AND a.created_at >= p_from_30d
      AND (p_to IS NULL OR a.created_at < p_to)
    GROUP BY a.practice_id
  ),
  eligible AS (
    SELECT
      s.practice_id,
      count(*)::integer AS eligible_listeners,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM active AS a
          WHERE a.user_id = s.user_id
            AND a.practice_id = s.practice_id
        )
      )::integer AS rated_eligible
    FROM public.practice_listen_stats AS s
    WHERE s.rating_eligible_at IS NOT NULL
    GROUP BY s.practice_id
  ),
  ids AS (
    SELECT practice_id FROM lifetime
    UNION
    SELECT practice_id FROM eligible
  ),
  scored AS (
    SELECT
      i.practice_id,
      coalesce(nullif(btrim(p.title), ''), 'Практика') AS title,
      p.slug AS practice_slug,
      coalesce(
        CASE
          WHEN p.product_kind IN ('practice', 'music', 'audio_post') THEN p.product_kind
          ELSE 'practice'
        END,
        'practice'
      ) AS product_kind,
      p.author_id,
      coalesce(nullif(btrim(a.name), ''), 'Автор') AS author_name,
      a.slug AS author_slug,
      CASE
        WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
          AND nullif(btrim(coalesce(p.slug, '')), '') IS NOT NULL
          THEN '/practice/' || btrim(a.slug) || '/' || btrim(p.slug)
        ELSE NULL
      END AS href,
      coalesce(l.total_stars, 0)::bigint AS total_stars,
      coalesce(l.rating_count, 0)::integer AS rating_count,
      CASE
        WHEN coalesce(l.rating_count, 0) <= 0 THEN NULL
        ELSE (coalesce(l.total_stars, 0)::numeric / l.rating_count::numeric)
      END AS average,
      coalesce(w7.stars_7d, 0)::bigint AS stars_7d,
      coalesce(w7.count_7d, 0)::integer AS count_7d,
      coalesce(w30.stars_30d, 0)::bigint AS stars_30d,
      coalesce(w30.count_30d, 0)::integer AS count_30d,
      coalesce(e.eligible_listeners, 0)::integer AS eligible_listeners,
      coalesce(e.rated_eligible, 0)::integer AS rated_eligible,
      CASE
        WHEN coalesce(e.eligible_listeners, 0) <= 0 THEN NULL
        ELSE (coalesce(e.rated_eligible, 0)::numeric / e.eligible_listeners::numeric)
      END AS conversion
    FROM ids AS i
    JOIN public.practices AS p ON p.id = i.practice_id
    LEFT JOIN public.authors AS a ON a.id = p.author_id
    LEFT JOIN lifetime AS l ON l.practice_id = i.practice_id
    LEFT JOIN w7 ON w7.practice_id = i.practice_id
    LEFT JOIN w30 ON w30.practice_id = i.practice_id
    LEFT JOIN eligible AS e ON e.practice_id = i.practice_id
    WHERE v_q IS NULL
      OR p.title ILIKE '%' || v_q || '%'
      OR coalesce(a.name, '') ILIKE '%' || v_q || '%'
      OR coalesce(p.slug, '') ILIKE '%' || v_q || '%'
      OR coalesce(a.slug, '') ILIKE '%' || v_q || '%'
  )
  SELECT
    (SELECT count(*)::integer FROM scored),
    coalesce(
      (
        SELECT jsonb_agg(
          row_json
          ORDER BY sort_asc ASC NULLS LAST, sort_desc DESC NULLS LAST, practice_id ASC
        )
        FROM (
          SELECT
            s.practice_id,
            jsonb_build_object(
              'practice_id', s.practice_id,
              'title', s.title,
              'practice_slug', s.practice_slug,
              'product_kind', s.product_kind,
              'author_id', s.author_id,
              'author_name', s.author_name,
              'author_slug', s.author_slug,
              'href', s.href,
              'total_stars', s.total_stars,
              'rating_count', s.rating_count,
              'average', s.average,
              'stars_7d', s.stars_7d,
              'count_7d', s.count_7d,
              'stars_30d', s.stars_30d,
              'count_30d', s.count_30d,
              'eligible_listeners', s.eligible_listeners,
              'rated_eligible', s.rated_eligible,
              'conversion', s.conversion
            ) AS row_json,
            CASE
              WHEN v_dir = 'asc' THEN
                CASE v_sort
                  WHEN 'rating_count' THEN s.rating_count::numeric
                  WHEN 'stars_30d' THEN s.stars_30d::numeric
                  WHEN 'stars_7d' THEN s.stars_7d::numeric
                  WHEN 'conversion' THEN coalesce(s.conversion, -1)
                  ELSE s.total_stars::numeric
                END
              ELSE NULL
            END AS sort_asc,
            CASE
              WHEN v_dir = 'desc' THEN
                CASE v_sort
                  WHEN 'rating_count' THEN s.rating_count::numeric
                  WHEN 'stars_30d' THEN s.stars_30d::numeric
                  WHEN 'stars_7d' THEN s.stars_7d::numeric
                  WHEN 'conversion' THEN coalesce(s.conversion, -1)
                  ELSE s.total_stars::numeric
                END
              ELSE NULL
            END AS sort_desc
          FROM scored AS s
          ORDER BY
            CASE
              WHEN v_dir = 'asc' THEN
                CASE v_sort
                  WHEN 'rating_count' THEN s.rating_count::numeric
                  WHEN 'stars_30d' THEN s.stars_30d::numeric
                  WHEN 'stars_7d' THEN s.stars_7d::numeric
                  WHEN 'conversion' THEN coalesce(s.conversion, -1)
                  ELSE s.total_stars::numeric
                END
            END ASC NULLS LAST,
            CASE
              WHEN v_dir = 'desc' THEN
                CASE v_sort
                  WHEN 'rating_count' THEN s.rating_count::numeric
                  WHEN 'stars_30d' THEN s.stars_30d::numeric
                  WHEN 'stars_7d' THEN s.stars_7d::numeric
                  WHEN 'conversion' THEN coalesce(s.conversion, -1)
                  ELSE s.total_stars::numeric
                END
            END DESC NULLS LAST,
            s.total_stars DESC,
            s.practice_id ASC
          LIMIT v_limit OFFSET v_offset
        ) AS page
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'sort', v_sort,
    'sort_dir', v_dir,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_products(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_products(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_products(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_ratings_products(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) IS
  'audiolad:admin-ratings:v1; product aggregates. 7d/30d columns use created_at first-rating time with CURRENT stars. Default sort total_stars DESC. service_role only.';

CREATE OR REPLACE FUNCTION public.admin_ratings_authors(
  p_from_7d timestamptz DEFAULT NULL,
  p_from_30d timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'total_stars',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'total_stars');
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_sort NOT IN ('total_stars', 'rating_count', 'stars_30d', 'stars_7d', 'unique_raters') THEN
    v_sort := 'total_stars';
  END IF;

  -- No author_ratings table. Author totals = sum of current non-excluded
  -- stars across practices.author_id.
  WITH active AS (
    SELECT r.user_id, r.practice_id, r.stars, r.created_at, p.author_id
    FROM public.practice_ratings AS r
    JOIN public.practices AS p ON p.id = r.practice_id
    WHERE r.excluded_at IS NULL
      AND p.author_id IS NOT NULL
  ),
  scored AS (
    SELECT
      a.author_id,
      coalesce(nullif(btrim(au.name), ''), 'Автор') AS author_name,
      au.slug AS author_slug,
      CASE
        WHEN nullif(btrim(coalesce(au.slug, '')), '') IS NOT NULL
          THEN '/authors/' || btrim(au.slug)
        ELSE NULL
      END AS href,
      coalesce(sum(a.stars), 0)::bigint AS total_stars,
      count(*)::integer AS rating_count,
      count(DISTINCT a.user_id)::integer AS unique_raters,
      count(DISTINCT a.practice_id)::integer AS rating_bearing_products,
      coalesce(sum(a.stars) FILTER (
        WHERE p_from_7d IS NOT NULL
          AND a.created_at >= p_from_7d
          AND (p_to IS NULL OR a.created_at < p_to)
      ), 0)::bigint AS stars_7d,
      count(*) FILTER (
        WHERE p_from_7d IS NOT NULL
          AND a.created_at >= p_from_7d
          AND (p_to IS NULL OR a.created_at < p_to)
      )::integer AS count_7d,
      coalesce(sum(a.stars) FILTER (
        WHERE p_from_30d IS NOT NULL
          AND a.created_at >= p_from_30d
          AND (p_to IS NULL OR a.created_at < p_to)
      ), 0)::bigint AS stars_30d,
      count(*) FILTER (
        WHERE p_from_30d IS NOT NULL
          AND a.created_at >= p_from_30d
          AND (p_to IS NULL OR a.created_at < p_to)
      )::integer AS count_30d
    FROM active AS a
    JOIN public.authors AS au ON au.id = a.author_id
    WHERE v_q IS NULL
      OR au.name ILIKE '%' || v_q || '%'
      OR coalesce(au.slug, '') ILIKE '%' || v_q || '%'
    GROUP BY a.author_id, au.name, au.slug
  )
  SELECT
    (SELECT count(*)::integer FROM scored),
    coalesce(
      (
        SELECT jsonb_agg(
          row_json
          ORDER BY sort_asc ASC NULLS LAST, sort_desc DESC NULLS LAST, author_id ASC
        )
        FROM (
          SELECT
            s.author_id,
            jsonb_build_object(
              'author_id', s.author_id,
              'author_name', s.author_name,
              'author_slug', s.author_slug,
              'href', s.href,
              'total_stars', s.total_stars,
              'rating_count', s.rating_count,
              'average', CASE
                WHEN s.rating_count <= 0 THEN NULL
                ELSE (s.total_stars::numeric / s.rating_count::numeric)
              END,
              'unique_raters', s.unique_raters,
              'stars_7d', s.stars_7d,
              'count_7d', s.count_7d,
              'stars_30d', s.stars_30d,
              'count_30d', s.count_30d,
              'rating_bearing_products', s.rating_bearing_products
            ) AS row_json,
            CASE WHEN v_dir = 'asc' THEN
              CASE v_sort
                WHEN 'rating_count' THEN s.rating_count::numeric
                WHEN 'stars_30d' THEN s.stars_30d::numeric
                WHEN 'stars_7d' THEN s.stars_7d::numeric
                WHEN 'unique_raters' THEN s.unique_raters::numeric
                ELSE s.total_stars::numeric
              END
            END AS sort_asc,
            CASE WHEN v_dir = 'desc' THEN
              CASE v_sort
                WHEN 'rating_count' THEN s.rating_count::numeric
                WHEN 'stars_30d' THEN s.stars_30d::numeric
                WHEN 'stars_7d' THEN s.stars_7d::numeric
                WHEN 'unique_raters' THEN s.unique_raters::numeric
                ELSE s.total_stars::numeric
              END
            END AS sort_desc
          FROM scored AS s
          ORDER BY
            CASE WHEN v_dir = 'asc' THEN
              CASE v_sort
                WHEN 'rating_count' THEN s.rating_count::numeric
                WHEN 'stars_30d' THEN s.stars_30d::numeric
                WHEN 'stars_7d' THEN s.stars_7d::numeric
                WHEN 'unique_raters' THEN s.unique_raters::numeric
                ELSE s.total_stars::numeric
              END
            END ASC NULLS LAST,
            CASE WHEN v_dir = 'desc' THEN
              CASE v_sort
                WHEN 'rating_count' THEN s.rating_count::numeric
                WHEN 'stars_30d' THEN s.stars_30d::numeric
                WHEN 'stars_7d' THEN s.stars_7d::numeric
                WHEN 'unique_raters' THEN s.unique_raters::numeric
                ELSE s.total_stars::numeric
              END
            END DESC NULLS LAST,
            s.total_stars DESC,
            s.author_id ASC
          LIMIT v_limit OFFSET v_offset
        ) AS page
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'sort', v_sort,
    'sort_dir', v_dir,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_authors(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_authors(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_authors(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_ratings_authors(
  timestamptz, timestamptz, timestamptz, text, text, text, integer, integer
) IS
  'audiolad:admin-ratings:v1; author aggregates via practices.author_id. No author_ratings table. service_role only.';

CREATE OR REPLACE FUNCTION public.admin_ratings_events(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_event_kind text DEFAULT NULL,
  p_excluded text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_kind text := nullif(btrim(coalesce(p_event_kind, '')), '');
  v_excluded text := nullif(btrim(coalesce(p_excluded, '')), '');
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_kind IS NOT NULL AND v_kind NOT IN ('first', 'changed') THEN
    v_kind := NULL;
  END IF;
  IF v_excluded IS NOT NULL AND v_excluded NOT IN ('included', 'excluded') THEN
    v_excluded := NULL;
  END IF;

  -- Journal period filters occurred_at (audit time). Ranking windows still
  -- use created_at. Stable order: occurred_at DESC, id DESC.
  WITH filtered AS (
    SELECT
      e.id,
      e.occurred_at,
      e.old_stars,
      e.new_stars,
      e.user_id,
      e.practice_id,
      p.title,
      p.slug AS practice_slug,
      p.author_id,
      a.name AS author_name,
      a.slug AS author_slug,
      CASE
        WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
          AND nullif(btrim(coalesce(p.slug, '')), '') IS NOT NULL
          THEN '/practice/' || btrim(a.slug) || '/' || btrim(p.slug)
        ELSE NULL
      END AS href,
      CASE
        WHEN e.old_stars IS NULL THEN 'first'
        ELSE 'changed'
      END AS event_kind,
      r.excluded_at,
      r.excluded_reason,
      coalesce(
        nullif(btrim(pr.full_name), ''),
        nullif(split_part(coalesce(pr.email, ''), '@', 1), ''),
        'Слушатель'
      ) AS listener_label
    FROM public.practice_rating_events AS e
    JOIN public.practices AS p ON p.id = e.practice_id
    LEFT JOIN public.authors AS a ON a.id = p.author_id
    LEFT JOIN public.profiles AS pr ON pr.id = e.user_id
    LEFT JOIN public.practice_ratings AS r
      ON r.user_id = e.user_id
     AND r.practice_id = e.practice_id
    WHERE (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
      AND (p_author_id IS NULL OR p.author_id = p_author_id)
      AND (
        v_kind IS NULL
        OR (v_kind = 'first' AND e.old_stars IS NULL)
        OR (v_kind = 'changed' AND e.old_stars IS NOT NULL)
      )
      AND (
        v_excluded IS NULL
        OR (v_excluded = 'included' AND r.excluded_at IS NULL)
        OR (v_excluded = 'excluded' AND r.excluded_at IS NOT NULL)
      )
  )
  SELECT
    (SELECT count(*)::integer FROM filtered),
    coalesce(
      (
        SELECT jsonb_agg(row_json ORDER BY occurred_at DESC, id DESC)
        FROM (
          SELECT
            f.id,
            f.occurred_at,
            jsonb_build_object(
              'id', f.id,
              'occurred_at', f.occurred_at,
              'old_stars', f.old_stars,
              'new_stars', f.new_stars,
              'event_kind', f.event_kind,
              'user_id', f.user_id,
              'listener_label', f.listener_label,
              'practice_id', f.practice_id,
              'title', coalesce(nullif(btrim(f.title), ''), 'Практика'),
              'href', f.href,
              'author_id', f.author_id,
              'author_name', coalesce(nullif(btrim(f.author_name), ''), 'Автор'),
              'excluded', f.excluded_at IS NOT NULL,
              'excluded_reason', f.excluded_reason
            ) AS row_json
          FROM filtered AS f
          ORDER BY f.occurred_at DESC, f.id DESC
          LIMIT v_limit OFFSET v_offset
        ) AS page
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_events(
  timestamptz, timestamptz, uuid, uuid, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_events(
  timestamptz, timestamptz, uuid, uuid, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_events(
  timestamptz, timestamptz, uuid, uuid, text, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_ratings_events(
  timestamptz, timestamptz, uuid, uuid, text, text, integer, integer
) IS
  'audiolad:admin-ratings:v1; rating journal. Audit only. Newest first, id tie-break. Does not expose HMAC or raw IP. service_role only.';

CREATE OR REPLACE FUNCTION public.admin_ratings_diagnostics(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := coalesce(p_now, now());
  v_observations jsonb := '[]'::jsonb;
  v_burst integer := 0;
  v_shared_ip integer := 0;
  v_shared_ip_max integer := 0;
  v_shared_dev integer := 0;
  v_shared_dev_max integer := 0;
  v_mass_product integer := 0;
  v_mass_product_max integer := 0;
  v_mass_author integer := 0;
  v_mass_author_max integer := 0;
  v_short_path integer := 0;
BEGIN
  -- Observe only. Neutral wording. Never accuse abuse. Never return raw IP
  -- or HMAC values. Nothing is auto-excluded.

  SELECT count(*)::integer
  INTO v_burst
  FROM public.practice_ratings AS r
  WHERE r.excluded_at IS NULL
    AND r.created_at >= v_now - interval '15 minutes';

  IF v_burst >= 8 THEN
    v_observations := v_observations || jsonb_build_array(jsonb_build_object(
      'kind', 'burst_new_ratings',
      'label', 'Повышенная активность',
      'detail', v_burst::text || ' новых оценок за последние 15 минут',
      'count', v_burst
    ));
  END IF;

  SELECT count(*)::integer, coalesce(max(user_n), 0)::integer
  INTO v_shared_ip, v_shared_ip_max
  FROM (
    SELECT count(DISTINCT r.user_id) AS user_n
    FROM public.practice_ratings AS r
    WHERE r.excluded_at IS NULL
      AND r.vote_ip_hmac IS NOT NULL
      AND btrim(r.vote_ip_hmac) <> ''
    GROUP BY r.vote_ip_hmac
    HAVING count(DISTINCT r.user_id) >= 3
  ) AS g;

  IF v_shared_ip > 0 THEN
    v_observations := v_observations || jsonb_build_array(jsonb_build_object(
      'kind', 'shared_ip_signal',
      'label', 'Совпадающий IP-сигнал',
      'detail', v_shared_ip::text || ' IP-сигналов на ' || v_shared_ip_max::text || ' и более аккаунтов',
      'count', v_shared_ip
    ));
  END IF;

  SELECT count(*)::integer, coalesce(max(user_n), 0)::integer
  INTO v_shared_dev, v_shared_dev_max
  FROM (
    SELECT count(DISTINCT r.user_id) AS user_n
    FROM public.practice_ratings AS r
    WHERE r.excluded_at IS NULL
      AND r.device_id_hmac IS NOT NULL
      AND btrim(r.device_id_hmac) <> ''
    GROUP BY r.device_id_hmac
    HAVING count(DISTINCT r.user_id) >= 3
  ) AS g;

  IF v_shared_dev > 0 THEN
    v_observations := v_observations || jsonb_build_array(jsonb_build_object(
      'kind', 'shared_device_signal',
      'label', 'Совпадающий device-сигнал',
      'detail', v_shared_dev::text || ' device-сигналов на ' || v_shared_dev_max::text || ' и более аккаунтов',
      'count', v_shared_dev
    ));
  END IF;

  SELECT count(*)::integer, coalesce(max(n), 0)::integer
  INTO v_mass_product, v_mass_product_max
  FROM (
    SELECT count(*) AS n
    FROM public.practice_ratings AS r
    WHERE r.excluded_at IS NULL
      AND r.created_at >= v_now - interval '24 hours'
    GROUP BY r.practice_id
    HAVING count(*) >= 10
  ) AS g;

  IF v_mass_product > 0 THEN
    v_observations := v_observations || jsonb_build_array(jsonb_build_object(
      'kind', 'mass_product',
      'label', 'Повышенная активность',
      'detail', v_mass_product::text || ' продукт(ов) с ' || v_mass_product_max::text || '+ оценками за 24 часа',
      'count', v_mass_product
    ));
  END IF;

  SELECT count(*)::integer, coalesce(max(n), 0)::integer
  INTO v_mass_author, v_mass_author_max
  FROM (
    SELECT count(*) AS n
    FROM public.practice_ratings AS r
    JOIN public.practices AS p ON p.id = r.practice_id
    WHERE r.excluded_at IS NULL
      AND r.created_at >= v_now - interval '24 hours'
      AND p.author_id IS NOT NULL
    GROUP BY p.author_id
    HAVING count(*) >= 15
  ) AS g;

  IF v_mass_author > 0 THEN
    v_observations := v_observations || jsonb_build_array(jsonb_build_object(
      'kind', 'mass_author',
      'label', 'Повышенная активность',
      'detail', v_mass_author::text || ' автор(ов) с ' || v_mass_author_max::text || '+ оценками за 24 часа',
      'count', v_mass_author
    ));
  END IF;

  -- Short registration→eligibility→rating uses profiles.created_at when present.
  SELECT count(*)::integer
  INTO v_short_path
  FROM public.practice_ratings AS r
  JOIN public.practice_listen_stats AS s
    ON s.user_id = r.user_id
   AND s.practice_id = r.practice_id
   AND s.rating_eligible_at IS NOT NULL
  JOIN public.profiles AS pr ON pr.id = r.user_id
  WHERE r.excluded_at IS NULL
    AND pr.created_at IS NOT NULL
    AND r.created_at >= pr.created_at
    AND s.rating_eligible_at >= pr.created_at
    AND r.created_at >= s.rating_eligible_at
    AND r.created_at - pr.created_at <= interval '10 minutes';

  IF v_short_path > 0 THEN
    v_observations := v_observations || jsonb_build_array(jsonb_build_object(
      'kind', 'short_registration_path',
      'label', 'Повышенная активность',
      'detail', v_short_path::text || ' пар регистрация→eligibility→оценка быстрее 10 минут',
      'count', v_short_path
    ));
  END IF;

  RETURN jsonb_build_object(
    'attention', jsonb_array_length(v_observations) > 0,
    'observations', v_observations,
    'notes', jsonb_build_object(
      'auto_exclude', false,
      'wording', 'neutral_observe_only',
      'hmac_exposed', false
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_diagnostics(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_diagnostics(timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_diagnostics(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.admin_ratings_diagnostics(timestamptz) IS
  'audiolad:admin-ratings:v1; observe-only diagnostics. Neutral labels only. No HMAC/IP values. No auto-exclude. service_role only.';

CREATE OR REPLACE FUNCTION public.admin_ratings_excluded(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_rows jsonb;
BEGIN
  SELECT count(*)::integer
  INTO v_total
  FROM public.practice_ratings AS r
  WHERE r.excluded_at IS NOT NULL;

  SELECT coalesce(
    jsonb_agg(row_json ORDER BY excluded_at DESC, id DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      r.id,
      r.excluded_at,
      jsonb_build_object(
        'id', r.id,
        'user_id', r.user_id,
        'practice_id', r.practice_id,
        'stars', r.stars,
        'created_at', r.created_at,
        'excluded_at', r.excluded_at,
        'excluded_reason', r.excluded_reason,
        'title', coalesce(nullif(btrim(p.title), ''), 'Практика'),
        'author_name', coalesce(nullif(btrim(a.name), ''), 'Автор')
      ) AS row_json
    FROM public.practice_ratings AS r
    JOIN public.practices AS p ON p.id = r.practice_id
    LEFT JOIN public.authors AS a ON a.id = p.author_id
    WHERE r.excluded_at IS NOT NULL
    ORDER BY r.excluded_at DESC, r.id DESC
    LIMIT v_limit OFFSET v_offset
  ) AS page;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_excluded(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_excluded(integer, integer)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_excluded(integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_ratings_excluded(integer, integer) IS
  'audiolad:admin-ratings:v1; read-only excluded ratings list. No restore mutation. service_role only.';

COMMIT;

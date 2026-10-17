BEGIN;

-- Admin «Оценки → Слушатели» (task 612f9c76). READ-ONLY RPCs.
-- Additive: two new service_role-only functions. No table changes, no index
-- changes, no change to set_practice_rating, listen-stats eligibility,
-- public aggregates, excluded_at semantics, or existing admin_ratings_* RPCs.
--
-- Grain: one row per listener (auth user) who has at least one practice_ratings
-- row (active or excluded). rating_count counts user×practice pairs (UNIQUE),
-- so it equals the number of rated products for that listener.
--
-- PII: full_name only from profiles.full_name when it is really stored;
-- email from auth.users.email (authoritative auth source), falling back to the
-- synced profiles.email. HMAC / raw IP / device values are NEVER returned;
-- detail exposes only neutral counts of OTHER accounts sharing a signal.
-- The API layer additionally requires admin_panel.access + analytics.view +
-- users.view and writes an access row into admin_operation_log.

CREATE OR REPLACE FUNCTION public.admin_ratings_listeners(
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'last_activity',
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
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 100));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 100000));
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text;
  v_uuid uuid;
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'last_activity');
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_sort NOT IN ('rating_count', 'last_activity', 'registered_at', 'average') THEN
    v_sort := 'last_activity';
  END IF;

  IF v_q IS NOT NULL THEN
    v_q := left(v_q, 120);
    -- Literal substring match: escape LIKE metacharacters.
    v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    IF v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_uuid := v_q::uuid;
    END IF;
  END IF;

  WITH per_user AS (
    SELECT
      r.user_id,
      count(*)::integer AS rating_count,
      count(*) FILTER (WHERE r.excluded_at IS NULL)::integer AS active_count,
      count(*) FILTER (WHERE r.excluded_at IS NOT NULL)::integer AS excluded_count,
      coalesce(sum(r.stars) FILTER (WHERE r.excluded_at IS NULL), 0)::bigint AS active_stars,
      min(r.created_at) AS first_rated_at,
      max(greatest(r.created_at, r.updated_at)) AS last_activity_at
    FROM public.practice_ratings AS r
    GROUP BY r.user_id
  ),
  enriched AS (
    SELECT
      u.user_id,
      nullif(btrim(pr.full_name), '') AS full_name,
      coalesce(nullif(btrim(au.email), ''), nullif(btrim(pr.email), '')) AS email,
      coalesce(au.created_at, pr.created_at) AS registered_at,
      u.rating_count,
      u.active_count,
      u.excluded_count,
      u.active_stars,
      CASE
        WHEN u.active_count <= 0 THEN NULL
        ELSE u.active_stars::numeric / u.active_count::numeric
      END AS average,
      u.first_rated_at,
      u.last_activity_at,
      EXISTS (
        SELECT 1 FROM public.analytics_test_accounts AS t WHERE t.user_id = u.user_id
      ) AS is_test
    FROM per_user AS u
    LEFT JOIN auth.users AS au ON au.id = u.user_id
    LEFT JOIN public.profiles AS pr ON pr.id = u.user_id
  ),
  filtered AS (
    SELECT e.*
    FROM enriched AS e
    WHERE v_q IS NULL
      OR (v_uuid IS NOT NULL AND e.user_id = v_uuid)
      OR coalesce(e.full_name, '') ILIKE v_pattern ESCAPE '\'
      OR coalesce(e.email, '') ILIKE v_pattern ESCAPE '\'
  ),
  keyed AS (
    SELECT
      f.*,
      CASE v_sort
        WHEN 'rating_count' THEN f.rating_count::numeric
        WHEN 'average' THEN f.average
        WHEN 'registered_at' THEN extract(epoch FROM f.registered_at)::numeric
        ELSE extract(epoch FROM f.last_activity_at)::numeric
      END AS sort_key
    FROM filtered AS f
  )
  SELECT
    (SELECT count(*)::integer FROM keyed),
    coalesce(
      (
        SELECT jsonb_agg(page.row_json ORDER BY page.ord)
        FROM (
          SELECT
            row_number() OVER (
              ORDER BY
                CASE WHEN v_dir = 'asc' THEN k.sort_key END ASC NULLS LAST,
                CASE WHEN v_dir = 'desc' THEN k.sort_key END DESC NULLS LAST,
                k.user_id ASC
            ) AS ord,
            jsonb_build_object(
              'user_id', k.user_id,
              'full_name', k.full_name,
              'email', k.email,
              'registered_at', k.registered_at,
              'rating_count', k.rating_count,
              'active_count', k.active_count,
              'excluded_count', k.excluded_count,
              'average', k.average,
              'first_rated_at', k.first_rated_at,
              'last_activity_at', k.last_activity_at,
              'is_test', k.is_test
            ) AS row_json
          FROM keyed AS k
          ORDER BY
            CASE WHEN v_dir = 'asc' THEN k.sort_key END ASC NULLS LAST,
            CASE WHEN v_dir = 'desc' THEN k.sort_key END DESC NULLS LAST,
            k.user_id ASC
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
    'sort', v_sort,
    'sort_dir', v_dir,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_listeners(text, text, text, integer, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_listeners(text, text, text, integer, integer)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_listeners(text, text, text, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_ratings_listeners(text, text, text, integer, integer) IS
  'audiolad:admin-ratings-listeners:v1; read-only list of listeners who rated (one row per user). Search full_name/email (literal ILIKE) or exact user uuid. Sort rating_count|last_activity|registered_at|average. Max page 100. average = active stars / active count (excluded_at IS NULL). No HMAC/IP. service_role only; API requires analytics.view + users.view.';

CREATE OR REPLACE FUNCTION public.admin_ratings_listener_detail(
  p_user_id uuid,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 200), 500));
  v_profile jsonb;
  v_ratings jsonb;
  v_events jsonb;
  v_rating_total integer;
  v_event_total integer;
  v_shared_ip integer := 0;
  v_shared_device integer := 0;
  v_fast_paths integer := 0;
  v_registered_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT
    jsonb_build_object(
      'user_id', x.id,
      'full_name', nullif(btrim(pr.full_name), ''),
      'email', coalesce(nullif(btrim(x.email), ''), nullif(btrim(pr.email), '')),
      'registered_at', coalesce(x.created_at, pr.created_at),
      'has_profile', pr.id IS NOT NULL,
      'is_test', EXISTS (
        SELECT 1 FROM public.analytics_test_accounts AS t WHERE t.user_id = x.id
      )
    ),
    coalesce(x.created_at, pr.created_at)
  INTO v_profile, v_registered_at
  FROM auth.users AS x
  LEFT JOIN public.profiles AS pr ON pr.id = x.id
  WHERE x.id = p_user_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT count(*)::integer INTO v_rating_total
  FROM public.practice_ratings AS r WHERE r.user_id = p_user_id;

  SELECT count(*)::integer INTO v_event_total
  FROM public.practice_rating_events AS e WHERE e.user_id = p_user_id;

  SELECT coalesce(jsonb_agg(page.row_json ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
  INTO v_ratings
  FROM (
    SELECT
      r.id,
      r.created_at,
      jsonb_build_object(
        'rating_id', r.id,
        'practice_id', r.practice_id,
        'title', coalesce(nullif(btrim(p.title), ''), 'Практика'),
        'product_kind', p.product_kind,
        'author_id', p.author_id,
        'author_name', coalesce(nullif(btrim(a.name), ''), 'Автор'),
        'href', CASE
          WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
            AND nullif(btrim(coalesce(p.slug, '')), '') IS NOT NULL
            THEN '/practice/' || btrim(a.slug) || '/' || btrim(p.slug)
          ELSE NULL
        END,
        'stars', r.stars,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'excluded', r.excluded_at IS NOT NULL,
        'rating_eligible_at', s.rating_eligible_at,
        'real_listened_ms', s.real_listened_ms
      ) AS row_json
    FROM public.practice_ratings AS r
    JOIN public.practices AS p ON p.id = r.practice_id
    LEFT JOIN public.authors AS a ON a.id = p.author_id
    LEFT JOIN public.practice_listen_stats AS s
      ON s.user_id = r.user_id AND s.practice_id = r.practice_id
    WHERE r.user_id = p_user_id
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_limit
  ) AS page;

  SELECT coalesce(jsonb_agg(page.row_json ORDER BY page.occurred_at DESC, page.id DESC), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT
      e.id,
      e.occurred_at,
      jsonb_build_object(
        'id', e.id,
        'practice_id', e.practice_id,
        'title', coalesce(nullif(btrim(p.title), ''), 'Практика'),
        'old_stars', e.old_stars,
        'new_stars', e.new_stars,
        'event_kind', CASE WHEN e.old_stars IS NULL THEN 'first' ELSE 'changed' END,
        'occurred_at', e.occurred_at
      ) AS row_json
    FROM public.practice_rating_events AS e
    JOIN public.practices AS p ON p.id = e.practice_id
    WHERE e.user_id = p_user_id
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT v_limit
  ) AS page;

  -- Neutral signal counts: number of OTHER accounts that share at least one
  -- vote IP-signal / device-signal with this listener. Values never returned.
  -- Deduplicate this listener's signal values first so a common value
  -- (e.g. a proxy address) is joined once, not once per own rating.
  SELECT count(DISTINCT o.user_id)::integer INTO v_shared_ip
  FROM (
    SELECT DISTINCT r.vote_ip_hmac AS h
    FROM public.practice_ratings AS r
    WHERE r.user_id = p_user_id
      AND r.vote_ip_hmac IS NOT NULL
      AND btrim(r.vote_ip_hmac) <> ''
  ) AS mine
  JOIN public.practice_ratings AS o
    ON o.vote_ip_hmac = mine.h
   AND o.user_id <> p_user_id;

  SELECT count(DISTINCT o.user_id)::integer INTO v_shared_device
  FROM (
    SELECT DISTINCT r.device_id_hmac AS h
    FROM public.practice_ratings AS r
    WHERE r.user_id = p_user_id
      AND r.device_id_hmac IS NOT NULL
      AND btrim(r.device_id_hmac) <> ''
  ) AS mine
  JOIN public.practice_ratings AS o
    ON o.device_id_hmac = mine.h
   AND o.user_id <> p_user_id;

  IF v_registered_at IS NOT NULL THEN
    SELECT count(*)::integer INTO v_fast_paths
    FROM public.practice_ratings AS r
    JOIN public.practice_listen_stats AS s
      ON s.user_id = r.user_id
     AND s.practice_id = r.practice_id
     AND s.rating_eligible_at IS NOT NULL
    WHERE r.user_id = p_user_id
      AND r.created_at >= v_registered_at
      AND s.rating_eligible_at >= v_registered_at
      AND r.created_at >= s.rating_eligible_at
      AND r.created_at - v_registered_at <= interval '10 minutes';
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'profile', v_profile,
    'rating_total', coalesce(v_rating_total, 0),
    'event_total', coalesce(v_event_total, 0),
    'limit', v_limit,
    'ratings', v_ratings,
    'events', v_events,
    'signals', jsonb_build_object(
      'shared_ip_other_accounts', v_shared_ip,
      'shared_device_other_accounts', v_shared_device,
      'fast_registration_paths', v_fast_paths,
      'wording', 'neutral_observe_only',
      'hmac_exposed', false,
      'auto_exclude', false
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_listener_detail(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ratings_listener_detail(uuid, integer)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_listener_detail(uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_ratings_listener_detail(uuid, integer) IS
  'audiolad:admin-ratings-listeners:v1; read-only user→product rating history (current stars + first/last dates + eligibility) and change journal for one listener. Neutral counts of other accounts sharing IP/device signals; never returns HMAC/IP. No exclude/sanction. service_role only; API requires analytics.view + users.view and logs access.';

COMMIT;

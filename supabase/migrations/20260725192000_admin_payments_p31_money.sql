BEGIN;

-- ---------------------------------------------------------------------------
-- Admin payments analytics P3.1
-- SoT: payments.status = 'succeeded' (integer amount_minor, RUB)
-- Default filter: is_test = false unless p_include_test
-- Does NOT alter P3.0 fulfill / webhook ledger / P2 analytics RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_payments_p31_payment_base(
  p_from timestamptz,
  p_to timestamptz,
  p_include_test boolean,
  p_author_id uuid,
  p_practice_id uuid
)
RETURNS TABLE (
  payment_id uuid,
  order_id uuid,
  user_id uuid,
  practice_id uuid,
  author_id uuid,
  amount_minor bigint,
  currency text,
  confirmed_at timestamptz,
  is_test boolean,
  order_status text,
  practice_title text,
  practice_slug text,
  author_name text,
  author_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id AS payment_id,
    p.order_id,
    o.user_id,
    o.practice_id,
    pr.author_id,
    p.amount_minor,
    p.currency,
    p.confirmed_at,
    p.is_test,
    o.status AS order_status,
    coalesce(nullif(btrim(o.practice_title_snapshot), ''), pr.title, 'Без названия') AS practice_title,
    coalesce(nullif(btrim(o.practice_slug_snapshot), ''), pr.slug) AS practice_slug,
    coalesce(a.name, 'Без автора') AS author_name,
    a.slug AS author_slug
  FROM public.payments AS p
  JOIN public.orders AS o ON o.id = p.order_id
  LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
  LEFT JOIN public.authors AS a ON a.id = pr.author_id
  WHERE p.status = 'succeeded'
    AND p.confirmed_at IS NOT NULL
    AND (p_include_test OR p.is_test = false)
    AND (p_from IS NULL OR p.confirmed_at >= p_from)
    AND (p_to IS NULL OR p.confirmed_at < p_to)
    AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
    AND (p_author_id IS NULL OR pr.author_id = p_author_id);
$$;

REVOKE ALL ON FUNCTION public.admin_payments_p31_payment_base(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_payment_base(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_payment_base(
  timestamptz, timestamptz, boolean, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.admin_payments_p31_payment_base IS
  'audiolad:payments-analytics:p31; succeeded payment rows with order/product/author joins; service_role only';

-- First real (non-test unless include) succeeded payment per user (global, not period-scoped)
CREATE OR REPLACE FUNCTION public.admin_payments_p31_user_first_paid_at(
  p_include_test boolean
)
RETURNS TABLE (
  user_id uuid,
  first_confirmed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    o.user_id,
    min(p.confirmed_at) AS first_confirmed_at
  FROM public.payments AS p
  JOIN public.orders AS o ON o.id = p.order_id
  WHERE p.status = 'succeeded'
    AND p.confirmed_at IS NOT NULL
    AND (p_include_test OR p.is_test = false)
  GROUP BY o.user_id;
$$;

REVOKE ALL ON FUNCTION public.admin_payments_p31_user_first_paid_at(boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_user_first_paid_at(boolean)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_user_first_paid_at(boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_payments_p31_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_prev_from timestamptz DEFAULT NULL,
  p_prev_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_curr record;
  v_prev record;
  v_new_buyers integer;
  v_repeat_buyers integer;
  v_prev_new integer;
  v_prev_repeat integer;
  v_access integer;
  v_post_play integer;
  v_funnel jsonb;
  v_spark jsonb;
BEGIN
  SELECT
    count(*)::integer AS payment_count,
    count(DISTINCT b.user_id)::integer AS unique_buyers,
    coalesce(sum(b.amount_minor), 0)::bigint AS gross_minor,
    count(*) FILTER (WHERE b.is_test)::integer AS test_payment_count,
    coalesce(sum(b.amount_minor) FILTER (WHERE b.is_test), 0)::bigint AS test_gross_minor
  INTO v_curr
  FROM public.admin_payments_p31_payment_base(
    p_from, p_to, p_include_test, p_author_id, p_practice_id
  ) AS b;

  SELECT
    count(*)::integer AS payment_count,
    count(DISTINCT b.user_id)::integer AS unique_buyers,
    coalesce(sum(b.amount_minor), 0)::bigint AS gross_minor
  INTO v_prev
  FROM public.admin_payments_p31_payment_base(
    p_prev_from, p_prev_to, p_include_test, p_author_id, p_practice_id
  ) AS b
  WHERE p_prev_from IS NOT NULL AND p_prev_to IS NOT NULL;

  IF p_prev_from IS NULL OR p_prev_to IS NULL THEN
    v_prev.payment_count := NULL;
    v_prev.unique_buyers := NULL;
    v_prev.gross_minor := NULL;
  END IF;

  SELECT
    count(*) FILTER (
      WHERE f.first_confirmed_at >= coalesce(p_from, '-infinity'::timestamptz)
        AND (p_to IS NULL OR f.first_confirmed_at < p_to)
        AND EXISTS (
          SELECT 1
          FROM public.admin_payments_p31_payment_base(
            p_from, p_to, p_include_test, p_author_id, p_practice_id
          ) AS b
          WHERE b.user_id = f.user_id
        )
    )::integer,
    count(*) FILTER (
      WHERE f.first_confirmed_at < coalesce(p_from, '-infinity'::timestamptz)
        AND EXISTS (
          SELECT 1
          FROM public.admin_payments_p31_payment_base(
            p_from, p_to, p_include_test, p_author_id, p_practice_id
          ) AS b
          WHERE b.user_id = f.user_id
        )
    )::integer
  INTO v_new_buyers, v_repeat_buyers
  FROM public.admin_payments_p31_user_first_paid_at(p_include_test) AS f;

  IF p_prev_from IS NOT NULL AND p_prev_to IS NOT NULL THEN
    SELECT
      count(*) FILTER (
        WHERE f.first_confirmed_at >= p_prev_from
          AND f.first_confirmed_at < p_prev_to
          AND EXISTS (
            SELECT 1
            FROM public.admin_payments_p31_payment_base(
              p_prev_from, p_prev_to, p_include_test, p_author_id, p_practice_id
            ) AS b
            WHERE b.user_id = f.user_id
          )
      )::integer,
      count(*) FILTER (
        WHERE f.first_confirmed_at < p_prev_from
          AND EXISTS (
            SELECT 1
            FROM public.admin_payments_p31_payment_base(
              p_prev_from, p_prev_to, p_include_test, p_author_id, p_practice_id
            ) AS b
            WHERE b.user_id = f.user_id
          )
      )::integer
    INTO v_prev_new, v_prev_repeat
    FROM public.admin_payments_p31_user_first_paid_at(p_include_test) AS f;
  ELSE
    v_prev_new := NULL;
    v_prev_repeat := NULL;
  END IF;

  SELECT count(*)::integer
  INTO v_access
  FROM public.admin_payments_p31_payment_base(
    p_from, p_to, p_include_test, p_author_id, p_practice_id
  ) AS b
  JOIN public.user_practices AS up
    ON up.user_id = b.user_id
   AND up.practice_id = b.practice_id
   AND up.access_source = 'purchase';

  SELECT count(DISTINCT b.payment_id)::integer
  INTO v_post_play
  FROM public.admin_payments_p31_payment_base(
    p_from, p_to, p_include_test, p_author_id, p_practice_id
  ) AS b
  WHERE EXISTS (
    SELECT 1
    FROM public.analytics_events AS e
    WHERE e.event_name = 'audio_play_started'
      AND e.user_id = b.user_id
      AND e.practice_id = b.practice_id
      AND e.occurred_at >= b.confirmed_at
  );

  -- Observational funnel (mixed entity types — documented in UI)
  v_funnel := jsonb_build_array(
    jsonb_build_object(
      'key', 'paid_practice_views',
      'label', 'Открыли платный продукт',
      'entity', 'event',
      'value', (
        SELECT count(*)::integer
        FROM public.analytics_events AS e
        JOIN public.practices AS pr ON pr.id = e.practice_id
        WHERE e.event_name = 'practice_view'
          AND pr.is_free IS DISTINCT FROM true
          AND coalesce(pr.price, 0) > 0
          AND (p_from IS NULL OR e.occurred_at >= p_from)
          AND (p_to IS NULL OR e.occurred_at < p_to)
          AND (p_practice_id IS NULL OR e.practice_id = p_practice_id)
          AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      )
    ),
    jsonb_build_object(
      'key', 'orders_created',
      'label', 'Создали заказ',
      'entity', 'order',
      'value', (
        SELECT count(*)::integer
        FROM public.orders AS o
        LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
        WHERE (p_include_test OR o.is_test = false)
          AND (p_from IS NULL OR o.created_at >= p_from)
          AND (p_to IS NULL OR o.created_at < p_to)
          AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
          AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      )
    ),
    jsonb_build_object(
      'key', 'payments_created',
      'label', 'Создали платёж',
      'entity', 'payment',
      'value', (
        SELECT count(*)::integer
        FROM public.payments AS p
        JOIN public.orders AS o ON o.id = p.order_id
        LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
        WHERE (p_include_test OR p.is_test = false)
          AND (p_from IS NULL OR p.created_at >= p_from)
          AND (p_to IS NULL OR p.created_at < p_to)
          AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
          AND (p_author_id IS NULL OR pr.author_id = p_author_id)
      )
    ),
    jsonb_build_object(
      'key', 'payments_succeeded',
      'label', 'Успешно оплатили',
      'entity', 'payment',
      'value', v_curr.payment_count
    ),
    jsonb_build_object(
      'key', 'access_granted',
      'label', 'Получили доступ',
      'entity', 'entitlement',
      'value', v_access
    ),
    jsonb_build_object(
      'key', 'post_purchase_play',
      'label', 'Запустили после покупки',
      'entity', 'event',
      'value', v_post_play
    )
  );

  -- KPI sparkline: always last 14 Moscow days ending at period end (capped).
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket', to_char(d.day AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD'),
        'payments', coalesce(m.payments, 0),
        'gross_minor', coalesce(m.gross_minor, 0)
      )
      ORDER BY d.day
    ),
    '[]'::jsonb
  )
  INTO v_spark
  FROM generate_series(
    date_trunc('day', coalesce(p_to, now()) AT TIME ZONE 'Europe/Moscow')
      AT TIME ZONE 'Europe/Moscow' - interval '13 days',
    date_trunc('day', coalesce(p_to, now()) AT TIME ZONE 'Europe/Moscow')
      AT TIME ZONE 'Europe/Moscow',
    interval '1 day'
  ) AS d(day)
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS payments,
      coalesce(sum(b.amount_minor), 0)::bigint AS gross_minor
    FROM public.admin_payments_p31_payment_base(
      d.day,
      d.day + interval '1 day',
      p_include_test,
      p_author_id,
      p_practice_id
    ) AS b
  ) AS m ON true;

  RETURN jsonb_build_object(
    'payment_count', v_curr.payment_count,
    'unique_buyers', v_curr.unique_buyers,
    'gross_minor', v_curr.gross_minor,
    'aov_minor', CASE
      WHEN v_curr.payment_count > 0
        THEN (v_curr.gross_minor / v_curr.payment_count)
      ELSE NULL
    END,
    'new_buyers', coalesce(v_new_buyers, 0),
    'repeat_buyers', coalesce(v_repeat_buyers, 0),
    'access_granted', v_access,
    'post_purchase_play', v_post_play,
    'test_payment_count', v_curr.test_payment_count,
    'test_gross_minor', v_curr.test_gross_minor,
    'include_test', p_include_test,
    'currency', 'RUB',
    'previous', CASE
      WHEN v_prev.payment_count IS NULL THEN NULL
      ELSE jsonb_build_object(
        'payment_count', v_prev.payment_count,
        'unique_buyers', v_prev.unique_buyers,
        'gross_minor', v_prev.gross_minor,
        'aov_minor', CASE
          WHEN v_prev.payment_count > 0
            THEN (v_prev.gross_minor / v_prev.payment_count)
          ELSE NULL
        END,
        'new_buyers', v_prev_new,
        'repeat_buyers', v_prev_repeat
      )
    END,
    'funnel', v_funnel,
    'sparkline', v_spark,
    'notes', jsonb_build_object(
      'sot', 'payments.status=succeeded',
      'refunds', 'not_connected',
      'author_payout', 'not_connected',
      'daily_unique_buyers', 'not_additive_to_period_unique'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payments_p31_summary(
  timestamptz, timestamptz, timestamptz, timestamptz, boolean, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_summary(
  timestamptz, timestamptz, timestamptz, timestamptz, boolean, uuid, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_summary(
  timestamptz, timestamptz, timestamptz, timestamptz, boolean, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.admin_payments_p31_summary IS
  'audiolad:payments-analytics:p31; money KPI summary + observational funnel; service_role only';

CREATE OR REPLACE FUNCTION public.admin_payments_p31_timeseries(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_bucket text DEFAULT 'day'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz text := 'Europe/Moscow';
  v_from timestamptz;
  v_to timestamptz;
  v_granularity text;
  v_step interval;
  v_start_local timestamp;
  v_end_local timestamp;
  v_points jsonb;
BEGIN
  -- Canonical body also shipped in 20260725192200_admin_payments_p31_timeseries_range_fix.sql
  v_to := coalesce(p_to, now());

  IF p_from IS NOT NULL THEN
    v_from := p_from;
  ELSE
    SELECT min(p.confirmed_at)
    INTO v_from
    FROM public.payments AS p
    WHERE p.status = 'succeeded'
      AND p.confirmed_at IS NOT NULL
      AND p.confirmed_at < v_to
      AND (p_include_test OR p.is_test = false);
    v_from := coalesce(v_from, v_to - interval '29 days');
  END IF;

  IF v_from >= v_to THEN
    v_from := v_to - interval '1 day';
  END IF;

  IF p_bucket = 'week' THEN
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

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket', to_char(d.bucket_local, 'YYYY-MM-DD'),
        'payments', coalesce(m.payments, 0),
        'unique_buyers', coalesce(m.unique_buyers, 0),
        'gross_minor', coalesce(m.gross_minor, 0),
        'aov_minor', CASE
          WHEN coalesce(m.payments, 0) > 0
            THEN (m.gross_minor / m.payments)
          ELSE NULL
        END
      )
      ORDER BY d.bucket_local
    ),
    '[]'::jsonb
  )
  INTO v_points
  FROM generate_series(v_start_local, v_end_local, v_step) AS d(bucket_local)
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS payments,
      count(DISTINCT b.user_id)::integer AS unique_buyers,
      coalesce(sum(b.amount_minor), 0)::bigint AS gross_minor
    FROM public.admin_payments_p31_payment_base(
      d.bucket_local AT TIME ZONE v_tz,
      (d.bucket_local + v_step) AT TIME ZONE v_tz,
      p_include_test,
      p_author_id,
      p_practice_id
    ) AS b
  ) AS m ON true;

  RETURN jsonb_build_object(
    'bucket', v_granularity,
    'points', v_points,
    'notes', jsonb_build_object(
      'unique_buyers', 'per_bucket_not_summable_to_period',
      'range', 'half_open_from_to_moscow_buckets'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payments_p31_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.admin_payments_p31_timeseries IS
  'audiolad:payments-analytics:p31; daily/weekly money timeseries with zero-fill; service_role only';

CREATE OR REPLACE FUNCTION public.admin_payments_p31_products(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'gross_minor',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 25), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'gross_minor');
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
BEGIN
  SELECT coalesce(
    jsonb_agg(to_jsonb(x)),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    WITH base AS (
      SELECT * FROM public.admin_payments_p31_payment_base(
        p_from, p_to, p_include_test, p_author_id, p_practice_id
      )
    ),
    first_paid AS (
      SELECT * FROM public.admin_payments_p31_user_first_paid_at(p_include_test)
    ),
    agg AS (
      SELECT
        b.practice_id,
        max(b.practice_title) AS practice_title,
        max(b.practice_slug) AS practice_slug,
        (max(b.author_id::text))::uuid AS author_id,
        max(b.author_name) AS author_name,
        max(b.author_slug) AS author_slug,
        count(*)::integer AS payment_count,
        count(DISTINCT b.user_id)::integer AS unique_buyers,
        coalesce(sum(b.amount_minor), 0)::bigint AS gross_minor,
        count(DISTINCT b.user_id) FILTER (
          WHERE f.first_confirmed_at >= coalesce(p_from, '-infinity'::timestamptz)
            AND (p_to IS NULL OR f.first_confirmed_at < p_to)
        )::integer AS first_time_buyers,
        count(DISTINCT b.user_id) FILTER (
          WHERE f.first_confirmed_at < coalesce(p_from, '-infinity'::timestamptz)
        )::integer AS repeat_buyers,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.user_practices AS up
            WHERE up.user_id = b.user_id
              AND up.practice_id = b.practice_id
              AND up.access_source = 'purchase'
          )
        )::integer AS access_granted,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.analytics_events AS e
            WHERE e.event_name = 'audio_play_started'
              AND e.user_id = b.user_id
              AND e.practice_id = b.practice_id
              AND e.occurred_at >= b.confirmed_at
          )
        )::integer AS post_purchase_play
      FROM base AS b
      LEFT JOIN first_paid AS f ON f.user_id = b.user_id
      WHERE v_q IS NULL
         OR b.practice_title ILIKE '%' || v_q || '%'
         OR coalesce(b.practice_slug, '') ILIKE '%' || v_q || '%'
         OR b.author_name ILIKE '%' || v_q || '%'
      GROUP BY b.practice_id
    )
    SELECT
      practice_id,
      practice_title,
      practice_slug,
      author_id,
      author_name,
      author_slug,
      payment_count,
      unique_buyers,
      gross_minor,
      CASE WHEN payment_count > 0 THEN gross_minor / payment_count ELSE NULL END AS aov_minor,
      first_time_buyers,
      repeat_buyers,
      access_granted,
      post_purchase_play,
      CASE
        WHEN payment_count > 0
          THEN round((post_purchase_play::numeric / payment_count::numeric) * 100)::integer
        ELSE NULL
      END AS play_conversion_pct
    FROM agg
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN 1 ELSE -1 END *
      CASE v_sort
        WHEN 'payment_count' THEN payment_count
        WHEN 'unique_buyers' THEN unique_buyers
        WHEN 'first_time_buyers' THEN first_time_buyers
        WHEN 'repeat_buyers' THEN repeat_buyers
        WHEN 'access_granted' THEN access_granted
        WHEN 'post_purchase_play' THEN post_purchase_play
        ELSE gross_minor
      END,
      practice_title ASC
    LIMIT v_limit OFFSET v_offset
  ) AS x;

  SELECT count(*)::integer
  INTO v_total
  FROM (
    SELECT b.practice_id
    FROM public.admin_payments_p31_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    ) AS b
    WHERE v_q IS NULL
       OR b.practice_title ILIKE '%' || v_q || '%'
       OR coalesce(b.practice_slug, '') ILIKE '%' || v_q || '%'
       OR b.author_name ILIKE '%' || v_q || '%'
    GROUP BY b.practice_id
  ) AS t;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'rows', coalesce(v_rows, '[]'::jsonb),
    'sort', v_sort,
    'sort_dir', v_dir,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payments_p31_products(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_products(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_products(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_payments_p31_products IS
  'audiolad:payments-analytics:p31; product money breakdown; service_role only';

CREATE OR REPLACE FUNCTION public.admin_payments_p31_authors(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'gross_minor',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 25), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'gross_minor');
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
BEGIN
  WITH base AS (
    SELECT * FROM public.admin_payments_p31_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    )
  ),
  first_paid AS (
    SELECT * FROM public.admin_payments_p31_user_first_paid_at(p_include_test)
  ),
  agg AS (
    SELECT
      coalesce(b.author_id, '00000000-0000-0000-0000-000000000000'::uuid) AS author_id,
      max(b.author_name) AS author_name,
      max(b.author_slug) AS author_slug,
      count(DISTINCT b.practice_id)::integer AS sold_products,
      count(*)::integer AS payment_count,
      count(DISTINCT b.user_id)::integer AS unique_buyers,
      coalesce(sum(b.amount_minor), 0)::bigint AS gross_minor,
      count(DISTINCT b.user_id) FILTER (
        WHERE f.first_confirmed_at >= coalesce(p_from, '-infinity'::timestamptz)
          AND (p_to IS NULL OR f.first_confirmed_at < p_to)
      )::integer AS first_time_buyers,
      count(DISTINCT b.user_id) FILTER (
        WHERE f.first_confirmed_at < coalesce(p_from, '-infinity'::timestamptz)
      )::integer AS repeat_buyers
    FROM base AS b
    LEFT JOIN first_paid AS f ON f.user_id = b.user_id
    WHERE v_q IS NULL
       OR b.author_name ILIKE '%' || v_q || '%'
       OR coalesce(b.author_slug, '') ILIKE '%' || v_q || '%'
    GROUP BY coalesce(b.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  SELECT count(*)::integer INTO v_total FROM agg;

  SELECT coalesce(
    jsonb_agg(to_jsonb(x) ORDER BY
      CASE WHEN v_dir = 'asc' THEN 1 ELSE -1 END *
      CASE v_sort
        WHEN 'payment_count' THEN x.payment_count
        WHEN 'unique_buyers' THEN x.unique_buyers
        WHEN 'sold_products' THEN x.sold_products
        WHEN 'published_practices' THEN x.published_practices
        ELSE x.gross_minor
      END,
      x.author_name
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      CASE
        WHEN a.author_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL
        ELSE a.author_id
      END AS author_id,
      a.author_name,
      a.author_slug,
      coalesce((
        SELECT count(*)::integer
        FROM public.practices AS pr
        WHERE pr.author_id = NULLIF(a.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND pr.status = 'published'
      ), 0) AS published_practices,
      a.sold_products,
      a.payment_count,
      a.unique_buyers,
      a.gross_minor,
      CASE WHEN a.payment_count > 0 THEN a.gross_minor / a.payment_count ELSE NULL END AS aov_minor,
      a.first_time_buyers,
      a.repeat_buyers
    FROM agg AS a
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN 1 ELSE -1 END *
      CASE v_sort
        WHEN 'payment_count' THEN a.payment_count
        WHEN 'unique_buyers' THEN a.unique_buyers
        WHEN 'sold_products' THEN a.sold_products
        ELSE a.gross_minor
      END,
      a.author_name
    LIMIT v_limit OFFSET v_offset
  ) AS x;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'rows', coalesce(v_rows, '[]'::jsonb),
    'sort', v_sort,
    'sort_dir', v_dir,
    'limit', v_limit,
    'offset', v_offset,
    'notes', jsonb_build_object(
      'gross_generated', 'not_author_payout'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payments_p31_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_payments_p31_authors IS
  'audiolad:payments-analytics:p31; author money breakdown (gross generated ≠ payout); service_role only';

DO $$
BEGIN
  IF to_regprocedure(
    'public.admin_payments_p31_summary(timestamptz,timestamptz,timestamptz,timestamptz,boolean,uuid,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: admin_payments_p31_summary missing';
  END IF;
END;
$$;

COMMIT;

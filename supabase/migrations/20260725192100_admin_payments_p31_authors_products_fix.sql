BEGIN;

-- Fix P3.1 authors/products RPCs (ordering + CTE scope).

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
  SELECT count(*)::integer
  INTO v_total
  FROM (
    SELECT coalesce(b.author_id, '00000000-0000-0000-0000-000000000000'::uuid) AS author_key
    FROM public.admin_payments_p31_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    ) AS b
    WHERE v_q IS NULL
       OR b.author_name ILIKE '%' || v_q || '%'
       OR coalesce(b.author_slug, '') ILIKE '%' || v_q || '%'
    GROUP BY 1
  ) AS t;

  SELECT coalesce(jsonb_agg(to_jsonb(x) - 'ord' ORDER BY x.ord), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      CASE
        WHEN a.author_key = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL
        ELSE a.author_key
      END AS author_id,
      a.author_name,
      a.author_slug,
      coalesce((
        SELECT count(*)::integer
        FROM public.practices AS pr
        WHERE pr.author_id = NULLIF(a.author_key, '00000000-0000-0000-0000-000000000000'::uuid)
          AND pr.status = 'published'
      ), 0) AS published_practices,
      a.sold_products,
      a.payment_count,
      a.unique_buyers,
      a.gross_minor,
      CASE WHEN a.payment_count > 0 THEN a.gross_minor / a.payment_count ELSE NULL END AS aov_minor,
      a.first_time_buyers,
      a.repeat_buyers,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN 1 ELSE -1 END *
          CASE v_sort
            WHEN 'payment_count' THEN a.payment_count
            WHEN 'unique_buyers' THEN a.unique_buyers
            WHEN 'sold_products' THEN a.sold_products
            ELSE a.gross_minor
          END,
          a.author_name
      ) AS ord
    FROM (
      SELECT
        coalesce(b.author_id, '00000000-0000-0000-0000-000000000000'::uuid) AS author_key,
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
      FROM public.admin_payments_p31_payment_base(
        p_from, p_to, p_include_test, p_author_id, p_practice_id
      ) AS b
      LEFT JOIN public.admin_payments_p31_user_first_paid_at(p_include_test) AS f
        ON f.user_id = b.user_id
      WHERE v_q IS NULL
         OR b.author_name ILIKE '%' || v_q || '%'
         OR coalesce(b.author_slug, '') ILIKE '%' || v_q || '%'
      GROUP BY 1
    ) AS a
    ORDER BY ord
    LIMIT v_limit OFFSET v_offset
  ) AS x;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'rows', coalesce(v_rows, '[]'::jsonb),
    'sort', v_sort,
    'sort_dir', v_dir,
    'limit', v_limit,
    'offset', v_offset,
    'notes', jsonb_build_object('gross_generated', 'not_author_payout')
  );
END;
$$;

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

  SELECT coalesce(jsonb_agg(to_jsonb(x) - 'ord' ORDER BY x.ord), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.practice_id,
      a.practice_title,
      a.practice_slug,
      a.author_id,
      a.author_name,
      a.author_slug,
      a.payment_count,
      a.unique_buyers,
      a.gross_minor,
      CASE WHEN a.payment_count > 0 THEN a.gross_minor / a.payment_count ELSE NULL END AS aov_minor,
      a.first_time_buyers,
      a.repeat_buyers,
      a.access_granted,
      a.post_purchase_play,
      CASE
        WHEN a.payment_count > 0
          THEN round((a.post_purchase_play::numeric / a.payment_count::numeric) * 100)::integer
        ELSE NULL
      END AS play_conversion_pct,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN 1 ELSE -1 END *
          CASE v_sort
            WHEN 'payment_count' THEN a.payment_count
            WHEN 'unique_buyers' THEN a.unique_buyers
            WHEN 'first_time_buyers' THEN a.first_time_buyers
            WHEN 'repeat_buyers' THEN a.repeat_buyers
            WHEN 'access_granted' THEN a.access_granted
            WHEN 'post_purchase_play' THEN a.post_purchase_play
            ELSE a.gross_minor
          END,
          a.practice_title
      ) AS ord
    FROM (
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
      FROM public.admin_payments_p31_payment_base(
        p_from, p_to, p_include_test, p_author_id, p_practice_id
      ) AS b
      LEFT JOIN public.admin_payments_p31_user_first_paid_at(p_include_test) AS f
        ON f.user_id = b.user_id
      WHERE v_q IS NULL
         OR b.practice_title ILIKE '%' || v_q || '%'
         OR coalesce(b.practice_slug, '') ILIKE '%' || v_q || '%'
         OR b.author_name ILIKE '%' || v_q || '%'
      GROUP BY b.practice_id
    ) AS a
    ORDER BY ord
    LIMIT v_limit OFFSET v_offset
  ) AS x;

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

REVOKE ALL ON FUNCTION public.admin_payments_p31_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_authors(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.admin_payments_p31_products(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payments_p31_products(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payments_p31_products(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, integer, integer
) TO service_role;

COMMIT;

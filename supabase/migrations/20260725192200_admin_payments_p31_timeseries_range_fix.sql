-- P3.1 hotfix: money timeseries must cover all-time and include the current bucket.
-- Previous version defaulted NULL bounds to last 29 days and ended series at
-- date_trunc(now), which dropped the current day/week (summary ≠ timeseries sum).

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
      AND (p_include_test OR p.is_test = false)
      AND (
        p_practice_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.orders AS o
          WHERE o.id = p.order_id
            AND o.practice_id = p_practice_id
        )
      )
      AND (
        p_author_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.orders AS o
          JOIN public.practices AS pr ON pr.id = o.practice_id
          WHERE o.id = p.order_id
            AND pr.author_id = p_author_id
        )
      );

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
  -- Inclusive last bucket that intersects [v_from, v_to).
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
  'audiolad:payments-analytics:p31; daily/weekly money timeseries with zero-fill; all-time from first succeeded payment; service_role only';

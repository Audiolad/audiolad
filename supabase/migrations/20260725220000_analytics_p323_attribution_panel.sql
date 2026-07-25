-- P3.2.3: admin attribution panel RPCs (first-touch vs order session-touch).
-- Money SoT unchanged: payments.status='succeeded'. No historical backfill apply.

BEGIN;

-- ---------------------------------------------------------------------------
-- Internal attribution base (not for direct client exposure)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_attribution_p323_payment_base(
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
  practice_title text,
  practice_slug text,
  author_name text,
  author_slug text,
  author_id_source text,
  is_first_purchase boolean,
  ft_present boolean,
  ft_confidence text,
  ft_origin text,
  ft_source_class text,
  ft_utm_source text,
  ft_utm_medium text,
  ft_utm_campaign text,
  ft_utm_content text,
  ft_utm_term text,
  ft_referrer_domain text,
  ft_landing_path text,
  ft_first_seen_at timestamptz,
  st_present boolean,
  st_confidence text,
  st_source_class text,
  st_utm_source text,
  st_utm_medium text,
  st_utm_campaign text,
  st_utm_content text,
  st_utm_term text,
  st_referrer_domain text,
  st_landing_path text,
  order_created_at timestamptz,
  session_started_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH first_paid AS (
    SELECT * FROM public.admin_payments_p31_user_first_paid_at(p_include_test)
  ),
  base AS (
    SELECT
      p.id AS payment_id,
      p.order_id,
      o.user_id,
      o.practice_id,
      coalesce(o.author_id_snapshot, pr.author_id) AS author_id,
      CASE
        WHEN o.author_id_snapshot IS NOT NULL THEN 'snapshot'
        WHEN pr.author_id IS NOT NULL THEN 'practice_fallback'
        ELSE 'missing'
      END AS author_id_source,
      p.amount_minor,
      p.currency,
      p.confirmed_at,
      p.is_test,
      coalesce(nullif(btrim(o.practice_title_snapshot), ''), pr.title, 'Без названия') AS practice_title,
      coalesce(nullif(btrim(o.practice_slug_snapshot), ''), pr.slug) AS practice_slug,
      coalesce(a.name, 'Без автора') AS author_name,
      a.slug AS author_slug,
      o.created_at AS order_created_at,
      o.attribution_confidence AS st_confidence_raw,
      o.session_utm_source,
      o.session_utm_medium,
      o.session_utm_campaign,
      o.session_utm_content,
      o.session_utm_term,
      o.session_referrer_domain,
      o.session_landing_path,
      o.analytics_session_id,
      ft.id AS ft_id,
      ft.confidence AS ft_confidence,
      ft.origin AS ft_origin,
      ft.source_class AS ft_source_class_raw,
      ft.utm_source AS ft_utm_source,
      ft.utm_medium AS ft_utm_medium,
      ft.utm_campaign AS ft_utm_campaign,
      ft.utm_content AS ft_utm_content,
      ft.utm_term AS ft_utm_term,
      ft.referrer_domain AS ft_referrer_domain,
      ft.landing_path AS ft_landing_path,
      ft.first_seen_at AS ft_first_seen_at,
      s.started_at AS session_started_at
    FROM public.payments AS p
    JOIN public.orders AS o ON o.id = p.order_id
    LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
    LEFT JOIN public.authors AS a
      ON a.id = coalesce(o.author_id_snapshot, pr.author_id)
    LEFT JOIN public.analytics_first_touches AS ft
      ON ft.subject_type = 'user'
     AND ft.user_id = o.user_id
    LEFT JOIN public.analytics_sessions AS s
      ON s.id = o.analytics_session_id
    WHERE p.status = 'succeeded'
      AND p.confirmed_at IS NOT NULL
      AND (p_include_test OR p.is_test = false)
      AND (p_from IS NULL OR p.confirmed_at >= p_from)
      AND (p_to IS NULL OR p.confirmed_at < p_to)
      AND (p_practice_id IS NULL OR o.practice_id = p_practice_id)
      AND (
        p_author_id IS NULL
        OR coalesce(o.author_id_snapshot, pr.author_id) = p_author_id
      )
  )
  SELECT
    b.payment_id,
    b.order_id,
    b.user_id,
    b.practice_id,
    b.author_id,
    b.amount_minor,
    b.currency,
    b.confirmed_at,
    b.is_test,
    b.practice_title,
    b.practice_slug,
    b.author_name,
    b.author_slug,
    b.author_id_source,
    (fp.first_confirmed_at IS NOT NULL AND fp.first_confirmed_at = b.confirmed_at) AS is_first_purchase,
    (b.ft_id IS NOT NULL) AS ft_present,
    b.ft_confidence,
    b.ft_origin,
    coalesce(
      b.ft_source_class_raw,
      CASE
        WHEN b.ft_id IS NULL THEN NULL
        ELSE public.classify_acquisition_source_class(
          b.ft_utm_source, b.ft_utm_medium, b.ft_utm_campaign, b.ft_referrer_domain
        )
      END
    ) AS ft_source_class,
    b.ft_utm_source,
    b.ft_utm_medium,
    b.ft_utm_campaign,
    b.ft_utm_content,
    b.ft_utm_term,
    b.ft_referrer_domain,
    b.ft_landing_path,
    b.ft_first_seen_at,
    (coalesce(b.st_confidence_raw, 'unknown') = 'exact') AS st_present,
    coalesce(nullif(b.st_confidence_raw, ''), 'unknown') AS st_confidence,
    CASE
      WHEN coalesce(b.st_confidence_raw, 'unknown') <> 'exact' THEN NULL
      ELSE public.classify_acquisition_source_class(
        b.session_utm_source,
        b.session_utm_medium,
        b.session_utm_campaign,
        b.session_referrer_domain
      )
    END AS st_source_class,
    CASE WHEN coalesce(b.st_confidence_raw, 'unknown') = 'exact' THEN b.session_utm_source END,
    CASE WHEN coalesce(b.st_confidence_raw, 'unknown') = 'exact' THEN b.session_utm_medium END,
    CASE WHEN coalesce(b.st_confidence_raw, 'unknown') = 'exact' THEN b.session_utm_campaign END,
    CASE WHEN coalesce(b.st_confidence_raw, 'unknown') = 'exact' THEN b.session_utm_content END,
    CASE WHEN coalesce(b.st_confidence_raw, 'unknown') = 'exact' THEN b.session_utm_term END,
    CASE WHEN coalesce(b.st_confidence_raw, 'unknown') = 'exact' THEN b.session_referrer_domain END,
    CASE WHEN coalesce(b.st_confidence_raw, 'unknown') = 'exact' THEN b.session_landing_path END,
    b.order_created_at,
    b.session_started_at
  FROM base AS b
  LEFT JOIN first_paid AS fp ON fp.user_id = b.user_id;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_payment_base(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_payment_base(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_payment_base(
  timestamptz, timestamptz, boolean, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_payment_base(
  timestamptz, timestamptz, boolean, uuid, uuid
) TO postgres;

COMMENT ON FUNCTION public.admin_attribution_p323_payment_base IS
  'audiolad:p323; internal succeeded-payment attribution base; first-touch + session-touch; service_role only';

-- Helper: mode-aware linkage / confidence filters as SQL fragments via function
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_row_matches(
  p_mode text,
  p_confidence text,
  p_source_class text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_landing text,
  p_search text,
  p_ft_present boolean,
  p_ft_confidence text,
  p_ft_source_class text,
  p_ft_utm_source text,
  p_ft_utm_medium text,
  p_ft_utm_campaign text,
  p_ft_landing_path text,
  p_st_present boolean,
  p_st_confidence text,
  p_st_source_class text,
  p_st_utm_source text,
  p_st_utm_medium text,
  p_st_utm_campaign text,
  p_st_landing_path text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_conf text;
  v_class text;
  v_src text;
  v_med text;
  v_camp text;
  v_land text;
  v_q text := lower(coalesce(nullif(btrim(p_search), ''), ''));
BEGIN
  IF p_mode = 'first_touch' THEN
    v_conf := p_ft_confidence;
    v_class := p_ft_source_class;
    v_src := p_ft_utm_source;
    v_med := p_ft_utm_medium;
    v_camp := p_ft_utm_campaign;
    v_land := p_ft_landing_path;
  ELSE
    v_conf := p_st_confidence;
    v_class := p_st_source_class;
    v_src := p_st_utm_source;
    v_med := p_st_utm_medium;
    v_camp := p_st_utm_campaign;
    v_land := p_st_landing_path;
  END IF;

  IF p_confidence IS NOT NULL AND p_confidence <> 'all' THEN
    IF p_mode = 'first_touch' THEN
      IF NOT p_ft_present THEN
        IF p_confidence <> 'unknown' THEN
          RETURN false;
        END IF;
      ELSIF coalesce(v_conf, 'unknown') IS DISTINCT FROM p_confidence THEN
        RETURN false;
      END IF;
    ELSE
      IF coalesce(v_conf, 'unknown') IS DISTINCT FROM p_confidence THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  IF p_source_class IS NOT NULL AND p_source_class <> 'all' THEN
    IF p_mode = 'first_touch' AND NOT p_ft_present THEN
      RETURN false;
    END IF;
    IF p_mode = 'session_touch' AND NOT p_st_present THEN
      RETURN false;
    END IF;
    IF coalesce(v_class, 'unknown') IS DISTINCT FROM p_source_class THEN
      RETURN false;
    END IF;
  END IF;

  IF p_utm_source IS NOT NULL AND btrim(p_utm_source) <> '' THEN
    IF lower(coalesce(v_src, '')) IS DISTINCT FROM lower(btrim(p_utm_source)) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_utm_medium IS NOT NULL AND btrim(p_utm_medium) <> '' THEN
    IF lower(coalesce(v_med, '')) IS DISTINCT FROM lower(btrim(p_utm_medium)) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_utm_campaign IS NOT NULL AND btrim(p_utm_campaign) <> '' THEN
    IF lower(coalesce(v_camp, '')) IS DISTINCT FROM lower(btrim(p_utm_campaign)) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_landing IS NOT NULL AND btrim(p_landing) <> '' THEN
    IF coalesce(v_land, '') IS DISTINCT FROM btrim(p_landing) THEN
      RETURN false;
    END IF;
  END IF;

  IF v_q <> '' THEN
    IF position(v_q in lower(coalesce(v_src, ''))) = 0
       AND position(v_q in lower(coalesce(v_med, ''))) = 0
       AND position(v_q in lower(coalesce(v_camp, ''))) = 0
       AND position(v_q in lower(coalesce(v_land, ''))) = 0
       AND position(v_q in lower(coalesce(v_class, ''))) = 0 THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_row_matches(
  text, text, text, text, text, text, text, text,
  boolean, text, text, text, text, text, text,
  boolean, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_row_matches(
  text, text, text, text, text, text, text, text,
  boolean, text, text, text, text, text, text,
  boolean, text, text, text, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_attribution_p323_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_mode text DEFAULT 'session_touch',
  p_confidence text DEFAULT 'all',
  p_source_class text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_landing text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := CASE WHEN p_mode = 'first_touch' THEN 'first_touch' ELSE 'session_touch' END;
  v_conf text := coalesce(nullif(btrim(p_confidence), ''), 'all');
  v_total_payments int;
  v_total_gross bigint;
  v_total_buyers int;
  v_attr_payments int;
  v_attr_gross bigint;
  v_attr_buyers int;
  v_exact int;
  v_strong int;
  v_inferred int;
  v_unknown int;
  v_missing int;
  v_direct int;
  v_ft_exact_total int;
  v_ft_inferred_total int;
BEGIN
  IF v_conf NOT IN ('all', 'exact', 'strong', 'inferred', 'unknown') THEN
    v_conf := 'all';
  END IF;

  SELECT
    count(*)::int,
    coalesce(sum(amount_minor), 0)::bigint,
    count(DISTINCT user_id)::int
  INTO v_total_payments, v_total_gross, v_total_buyers
  FROM public.admin_attribution_p323_payment_base(
    p_from, p_to, p_include_test, p_author_id, p_practice_id
  );

  SELECT
    count(*) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE WHEN v_mode = 'first_touch' THEN ft_present ELSE st_present END
    )::int,
    coalesce(sum(amount_minor) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE WHEN v_mode = 'first_touch' THEN ft_present ELSE st_present END
    ), 0)::bigint,
    count(DISTINCT user_id) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE WHEN v_mode = 'first_touch' THEN ft_present ELSE st_present END
    )::int,
    count(*) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE
        WHEN v_mode = 'first_touch' THEN ft_present AND ft_confidence = 'exact'
        ELSE st_present AND st_confidence = 'exact'
      END
    )::int,
    count(*) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE
        WHEN v_mode = 'first_touch' THEN ft_present AND ft_confidence = 'strong'
        ELSE false
      END
    )::int,
    count(*) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE
        WHEN v_mode = 'first_touch' THEN ft_present AND ft_confidence = 'inferred'
        ELSE false
      END
    )::int,
    count(*) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE
        WHEN v_mode = 'first_touch' THEN (NOT ft_present) OR ft_confidence = 'unknown'
        ELSE (NOT st_present) OR st_confidence = 'unknown'
      END
    )::int,
    count(*) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, 'all', p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE WHEN v_mode = 'first_touch' THEN NOT ft_present ELSE NOT st_present END
    )::int,
    count(*) FILTER (
      WHERE public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
        ft_utm_campaign, ft_landing_path,
        st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
        st_utm_campaign, st_landing_path
      )
      AND CASE
        WHEN v_mode = 'first_touch' THEN ft_present AND ft_source_class = 'direct_or_unknown'
        ELSE st_present AND st_source_class = 'direct_or_unknown'
      END
    )::int
  INTO
    v_attr_payments, v_attr_gross, v_attr_buyers,
    v_exact, v_strong, v_inferred, v_unknown, v_missing, v_direct
  FROM public.admin_attribution_p323_payment_base(
    p_from, p_to, p_include_test, p_author_id, p_practice_id
  );

  SELECT
    count(*) FILTER (WHERE confidence = 'exact')::int,
    count(*) FILTER (WHERE confidence = 'inferred')::int
  INTO v_ft_exact_total, v_ft_inferred_total
  FROM public.analytics_first_touches
  WHERE subject_type = 'user';

  RETURN jsonb_build_object(
    'mode', v_mode,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'include_test', coalesce(p_include_test, false),
    'currency', 'RUB',
    'payments_total', v_total_payments,
    'buyers_total', v_total_buyers,
    'gross_minor_total', v_total_gross,
    'payments_attributed', v_attr_payments,
    'payments_unattributed', greatest(v_total_payments - v_attr_payments, 0),
    'buyers_attributed', v_attr_buyers,
    'gross_minor_attributed', v_attr_gross,
    'gross_minor_unattributed', greatest(v_total_gross - v_attr_gross, 0),
    'coverage_pct', CASE
      WHEN v_total_payments = 0 THEN NULL
      ELSE round((v_attr_payments::numeric / v_total_payments::numeric) * 100, 1)
    END,
    'exact_coverage_pct', CASE
      WHEN v_total_payments = 0 THEN NULL
      ELSE round((v_exact::numeric / v_total_payments::numeric) * 100, 1)
    END,
    'inferred_coverage_pct', CASE
      WHEN v_total_payments = 0 THEN NULL
      ELSE round((v_inferred::numeric / v_total_payments::numeric) * 100, 1)
    END,
    'confidence', jsonb_build_object(
      'exact', v_exact,
      'strong', v_strong,
      'inferred', v_inferred,
      'unknown', v_unknown
    ),
    'linkage', jsonb_build_object(
      'missing_record', v_missing,
      'direct_or_unknown', v_direct,
      'note', 'direct_or_unknown is linked attribution with unknown external source; missing_record means no first-touch/session snapshot'
    ),
    'tracking', jsonb_build_object(
      'first_touch_user_exact_total', v_ft_exact_total,
      'first_touch_user_inferred_total', v_ft_inferred_total,
      'first_touch_exact_since', 'P3.2.2',
      'session_touch_exact_since', 'P3.2.0',
      'historical_backfill_applied', false,
      'small_sample', (v_mode = 'first_touch' AND v_ft_exact_total < 25)
        OR (v_mode = 'session_touch' AND v_exact < 25 AND v_total_payments > 0)
    ),
    'notes', jsonb_build_object(
      'money_sot', 'payments.status=succeeded',
      'first_touch_join', 'analytics_first_touches.user_id = orders.user_id',
      'session_touch', 'immutable order attribution snapshot',
      'author', 'orders.author_id_snapshot preferred; practices.author_id historical fallback',
      'not_multi_touch', true
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_summary(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_summary(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_summary(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Breakdowns (sources / campaigns / landings / products / authors)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_attribution_p323_sources(
  p_from timestamptz,
  p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_mode text DEFAULT 'session_touch',
  p_confidence text DEFAULT 'all',
  p_source_class text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_landing text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'gross_minor',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := CASE WHEN p_mode = 'first_touch' THEN 'first_touch' ELSE 'session_touch' END;
  v_conf text := coalesce(nullif(btrim(p_confidence), ''), 'all');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 200));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'gross_minor');
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_total_gross bigint;
  v_rows jsonb;
BEGIN
  SELECT coalesce(sum(amount_minor), 0)
  INTO v_total_gross
  FROM public.admin_attribution_p323_payment_base(
    p_from, p_to, p_include_test, p_author_id, p_practice_id
  )
  WHERE CASE WHEN v_mode = 'first_touch' THEN ft_present ELSE st_present END
    AND public.admin_attribution_p323_row_matches(
      v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
      p_landing, p_search,
      ft_present, ft_confidence, ft_source_class, ft_utm_source, ft_utm_medium,
      ft_utm_campaign, ft_landing_path,
      st_present, st_confidence, st_source_class, st_utm_source, st_utm_medium,
      st_utm_campaign, st_landing_path
    );

  WITH filtered AS (
    SELECT *
    FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    ) b
    WHERE CASE WHEN v_mode = 'first_touch' THEN b.ft_present ELSE b.st_present END
      AND public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        b.ft_present, b.ft_confidence, b.ft_source_class, b.ft_utm_source, b.ft_utm_medium,
        b.ft_utm_campaign, b.ft_landing_path,
        b.st_present, b.st_confidence, b.st_source_class, b.st_utm_source, b.st_utm_medium,
        b.st_utm_campaign, b.st_landing_path
      )
  ),
  grouped AS (
    SELECT
      CASE WHEN v_mode = 'first_touch' THEN ft_source_class ELSE st_source_class END AS source_class,
      CASE WHEN v_mode = 'first_touch' THEN ft_utm_source ELSE st_utm_source END AS utm_source,
      CASE WHEN v_mode = 'first_touch' THEN ft_utm_medium ELSE st_utm_medium END AS utm_medium,
      count(*)::int AS payment_count,
      count(DISTINCT user_id)::int AS unique_buyers,
      coalesce(sum(amount_minor), 0)::bigint AS gross_minor,
      count(*) FILTER (WHERE is_first_purchase)::int AS first_time_buyers,
      count(*) FILTER (WHERE NOT is_first_purchase)::int AS repeat_buyers,
      count(*) FILTER (
        WHERE CASE WHEN v_mode = 'first_touch' THEN ft_confidence ELSE st_confidence END = 'exact'
      )::int AS exact_count,
      count(*) FILTER (
        WHERE CASE WHEN v_mode = 'first_touch' THEN ft_confidence ELSE st_confidence END = 'inferred'
      )::int AS inferred_count,
      count(*) FILTER (
        WHERE CASE WHEN v_mode = 'first_touch' THEN ft_confidence ELSE st_confidence END = 'unknown'
      )::int AS unknown_count
    FROM filtered
    GROUP BY 1, 2, 3
  ),
  ordered AS (
    SELECT *
    FROM grouped
    ORDER BY
      CASE WHEN v_dir = 'asc' AND v_sort = 'gross_minor' THEN gross_minor END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' AND v_sort = 'gross_minor' THEN gross_minor END DESC NULLS LAST,
      CASE WHEN v_dir = 'asc' AND v_sort = 'payment_count' THEN payment_count END ASC,
      CASE WHEN v_dir = 'desc' AND v_sort = 'payment_count' THEN payment_count END DESC,
      CASE WHEN v_dir = 'asc' AND v_sort = 'unique_buyers' THEN unique_buyers END ASC,
      CASE WHEN v_dir = 'desc' AND v_sort = 'unique_buyers' THEN unique_buyers END DESC,
      source_class NULLS LAST,
      utm_source NULLS LAST
    LIMIT v_limit
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'source_class', source_class,
    'utm_source', utm_source,
    'utm_medium', utm_medium,
    'payment_count', payment_count,
    'unique_buyers', unique_buyers,
    'gross_minor', gross_minor,
    'aov_minor', CASE WHEN unique_buyers > 0 THEN (gross_minor / unique_buyers) ELSE NULL END,
    'first_time_buyers', first_time_buyers,
    'repeat_buyers', repeat_buyers,
    'exact_count', exact_count,
    'inferred_count', inferred_count,
    'unknown_count', unknown_count,
    'coverage_share_pct', CASE
      WHEN v_total_gross > 0 THEN round((gross_minor::numeric / v_total_gross::numeric) * 100, 1)
      ELSE NULL
    END
  )), '[]'::jsonb)
  INTO v_rows
  FROM ordered;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'total', (SELECT count(*)::int FROM (
      SELECT 1 FROM public.admin_attribution_p323_payment_base(
        p_from, p_to, p_include_test, p_author_id, p_practice_id
      ) b
      WHERE CASE WHEN v_mode = 'first_touch' THEN b.ft_present ELSE b.st_present END
        AND public.admin_attribution_p323_row_matches(
          v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
          p_landing, p_search,
          b.ft_present, b.ft_confidence, b.ft_source_class, b.ft_utm_source, b.ft_utm_medium,
          b.ft_utm_campaign, b.ft_landing_path,
          b.st_present, b.st_confidence, b.st_source_class, b.st_utm_source, b.st_utm_medium,
          b.st_utm_campaign, b.st_landing_path
        )
      GROUP BY
        CASE WHEN v_mode = 'first_touch' THEN b.ft_source_class ELSE b.st_source_class END,
        CASE WHEN v_mode = 'first_touch' THEN b.ft_utm_source ELSE b.st_utm_source END,
        CASE WHEN v_mode = 'first_touch' THEN b.ft_utm_medium ELSE b.st_utm_medium END
    ) g),
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_sources(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, text, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_sources(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, text, text, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_sources(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, text, text, integer
) TO service_role;

-- Campaigns
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_campaigns(
  p_from timestamptz, p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_mode text DEFAULT 'session_touch',
  p_confidence text DEFAULT 'all',
  p_source_class text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_landing text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := CASE WHEN p_mode = 'first_touch' THEN 'first_touch' ELSE 'session_touch' END;
  v_conf text := coalesce(nullif(btrim(p_confidence), ''), 'all');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 200));
  v_rows jsonb;
BEGIN
  WITH filtered AS (
    SELECT * FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    ) b
    WHERE CASE WHEN v_mode = 'first_touch' THEN b.ft_present ELSE b.st_present END
      AND public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        b.ft_present, b.ft_confidence, b.ft_source_class, b.ft_utm_source, b.ft_utm_medium,
        b.ft_utm_campaign, b.ft_landing_path,
        b.st_present, b.st_confidence, b.st_source_class, b.st_utm_source, b.st_utm_medium,
        b.st_utm_campaign, b.st_landing_path
      )
  ),
  grouped AS (
    SELECT
      CASE WHEN v_mode='first_touch' THEN ft_source_class ELSE st_source_class END AS source_class,
      CASE WHEN v_mode='first_touch' THEN ft_utm_source ELSE st_utm_source END AS utm_source,
      CASE WHEN v_mode='first_touch' THEN ft_utm_medium ELSE st_utm_medium END AS utm_medium,
      CASE WHEN v_mode='first_touch' THEN ft_utm_campaign ELSE st_utm_campaign END AS utm_campaign,
      CASE WHEN v_mode='first_touch' THEN ft_utm_content ELSE st_utm_content END AS utm_content,
      CASE WHEN v_mode='first_touch' THEN ft_utm_term ELSE st_utm_term END AS utm_term,
      count(*)::int AS payment_count,
      count(DISTINCT user_id)::int AS unique_buyers,
      coalesce(sum(amount_minor),0)::bigint AS gross_minor,
      count(*) FILTER (WHERE CASE WHEN v_mode='first_touch' THEN ft_confidence ELSE st_confidence END='exact')::int AS exact_count,
      count(*) FILTER (WHERE CASE WHEN v_mode='first_touch' THEN ft_confidence ELSE st_confidence END='inferred')::int AS inferred_count,
      count(*) FILTER (WHERE CASE WHEN v_mode='first_touch' THEN ft_confidence ELSE st_confidence END='unknown')::int AS unknown_count,
      count(DISTINCT practice_id)::int AS products_sold,
      count(DISTINCT author_id)::int AS authors_count
    FROM filtered
    GROUP BY 1,2,3,4,5,6
    ORDER BY gross_minor DESC NULLS LAST
    LIMIT v_limit
  )
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO v_rows FROM grouped g;

  RETURN jsonb_build_object('mode', v_mode, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_campaigns(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_campaigns(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_campaigns(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, integer
) TO service_role;

-- Landings
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_landings(
  p_from timestamptz, p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_mode text DEFAULT 'session_touch',
  p_confidence text DEFAULT 'all',
  p_source_class text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_landing text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := CASE WHEN p_mode = 'first_touch' THEN 'first_touch' ELSE 'session_touch' END;
  v_conf text := coalesce(nullif(btrim(p_confidence), ''), 'all');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 200));
  v_rows jsonb;
BEGIN
  WITH filtered AS (
    SELECT * FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    ) b
    WHERE CASE WHEN v_mode = 'first_touch' THEN b.ft_present ELSE b.st_present END
      AND public.admin_attribution_p323_row_matches(
        v_mode, v_conf, p_source_class, p_utm_source, p_utm_medium, p_utm_campaign,
        p_landing, p_search,
        b.ft_present, b.ft_confidence, b.ft_source_class, b.ft_utm_source, b.ft_utm_medium,
        b.ft_utm_campaign, b.ft_landing_path,
        b.st_present, b.st_confidence, b.st_source_class, b.st_utm_source, b.st_utm_medium,
        b.st_utm_campaign, b.st_landing_path
      )
  ),
  ranked AS (
    SELECT
      CASE WHEN v_mode='first_touch' THEN ft_landing_path ELSE st_landing_path END AS landing_path,
      practice_title,
      author_name,
      count(*) OVER (PARTITION BY CASE WHEN v_mode='first_touch' THEN ft_landing_path ELSE st_landing_path END, practice_id) AS practice_hits,
      count(*) OVER (PARTITION BY CASE WHEN v_mode='first_touch' THEN ft_landing_path ELSE st_landing_path END, author_id) AS author_hits,
      payment_id, user_id, amount_minor, practice_id, author_id,
      CASE WHEN v_mode='first_touch' THEN ft_confidence ELSE st_confidence END AS confidence
    FROM filtered
  ),
  grouped AS (
    SELECT
      landing_path,
      count(DISTINCT payment_id)::int AS payment_count,
      count(DISTINCT user_id)::int AS unique_buyers,
      coalesce(sum(amount_minor),0)::bigint AS gross_minor,
      count(*) FILTER (WHERE confidence='exact')::int AS exact_count,
      count(*) FILTER (WHERE confidence='inferred')::int AS inferred_count,
      (ARRAY_AGG(practice_title ORDER BY practice_hits DESC, practice_title))[1] AS top_product,
      (ARRAY_AGG(author_name ORDER BY author_hits DESC, author_name))[1] AS top_author
    FROM ranked
    GROUP BY landing_path
    ORDER BY gross_minor DESC NULLS LAST
    LIMIT v_limit
  )
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO v_rows FROM grouped g;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'rows', v_rows,
    'conversion_note', 'Conversion omitted: no reliable same-model denominator for this release'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_landings(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_landings(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_landings(
  timestamptz, timestamptz, boolean, text, text, text, text, text, text, text, uuid, uuid, text, integer
) TO service_role;

-- Products (both modes coverage)
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_products(
  p_from timestamptz, p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_confidence text DEFAULT 'all',
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 200));
  v_q text := lower(coalesce(nullif(btrim(p_search), ''), ''));
  v_rows jsonb;
BEGIN
  WITH base AS (
    SELECT * FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    )
    WHERE v_q = '' OR position(v_q in lower(practice_title)) > 0
       OR position(v_q in lower(coalesce(practice_slug,''))) > 0
  ),
  grouped AS (
    SELECT
      practice_id,
      practice_title,
      practice_slug,
      author_id,
      author_name,
      count(*)::int AS payment_count,
      count(DISTINCT user_id)::int AS unique_buyers,
      coalesce(sum(amount_minor),0)::bigint AS gross_minor,
      count(*) FILTER (WHERE ft_present)::int AS ft_attributed,
      count(*) FILTER (WHERE st_present)::int AS st_attributed,
      count(*) FILTER (WHERE NOT ft_present AND NOT st_present)::int AS unattributed_both,
      count(*) FILTER (WHERE ft_present AND ft_confidence='exact')::int AS ft_exact,
      count(*) FILTER (WHERE ft_present AND ft_confidence='inferred')::int AS ft_inferred,
      count(*) FILTER (WHERE st_present AND st_confidence='exact')::int AS st_exact,
      mode() WITHIN GROUP (ORDER BY ft_source_class) FILTER (WHERE ft_present) AS top_ft_source,
      mode() WITHIN GROUP (ORDER BY st_source_class) FILTER (WHERE st_present) AS top_st_source
    FROM base
    GROUP BY 1,2,3,4,5
    ORDER BY gross_minor DESC
    LIMIT v_limit
  )
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO v_rows FROM grouped g;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_products(
  timestamptz, timestamptz, boolean, text, uuid, uuid, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_products(
  timestamptz, timestamptz, boolean, text, uuid, uuid, text, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_products(
  timestamptz, timestamptz, boolean, text, uuid, uuid, text, integer
) TO service_role;

-- Authors
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_authors(
  p_from timestamptz, p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_confidence text DEFAULT 'all',
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 200));
  v_q text := lower(coalesce(nullif(btrim(p_search), ''), ''));
  v_rows jsonb;
BEGIN
  WITH base AS (
    SELECT * FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    )
    WHERE v_q = '' OR position(v_q in lower(author_name)) > 0
  ),
  grouped AS (
    SELECT
      author_id,
      author_name,
      author_slug,
      count(*)::int AS payment_count,
      count(DISTINCT user_id)::int AS unique_buyers,
      coalesce(sum(amount_minor),0)::bigint AS gross_minor,
      coalesce(sum(amount_minor) FILTER (WHERE ft_present OR st_present),0)::bigint AS attributed_gross_minor,
      coalesce(sum(amount_minor) FILTER (WHERE NOT ft_present AND NOT st_present),0)::bigint AS unattributed_gross_minor,
      count(*) FILTER (WHERE ft_present AND ft_confidence='exact')::int AS ft_exact,
      count(*) FILTER (WHERE ft_present AND ft_confidence='inferred')::int AS ft_inferred,
      count(*) FILTER (WHERE st_present AND st_confidence='exact')::int AS st_exact,
      mode() WITHIN GROUP (ORDER BY ft_source_class) FILTER (WHERE ft_present) AS top_ft_source,
      mode() WITHIN GROUP (ORDER BY st_source_class) FILTER (WHERE st_present) AS top_st_source
    FROM base
    GROUP BY 1,2,3
    ORDER BY gross_minor DESC
    LIMIT v_limit
  )
  SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) INTO v_rows FROM grouped g;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'note', 'gross_minor is successful payments for author products, not author payout'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_authors(
  timestamptz, timestamptz, boolean, text, uuid, uuid, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_authors(
  timestamptz, timestamptz, boolean, text, uuid, uuid, text, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_authors(
  timestamptz, timestamptz, boolean, text, uuid, uuid, text, integer
) TO service_role;

-- Touch comparison + path examples
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_touch_comparison(
  p_from timestamptz, p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_groups jsonb;
  v_paths jsonb;
BEGIN
  WITH base AS (
    SELECT * FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    )
  ),
  classified AS (
    SELECT
      *,
      CASE
        WHEN ft_present AND st_present
             AND coalesce(ft_source_class,'') = coalesce(st_source_class,'')
          THEN 'same_source'
        WHEN ft_present AND st_present THEN 'changed_source'
        WHEN ft_present AND NOT st_present THEN 'first_touch_only'
        WHEN (NOT ft_present) AND st_present THEN 'session_touch_only'
        ELSE 'neither'
      END AS cmp_group,
      coalesce(ft_source_class, 'unknown') AS ft_class,
      coalesce(st_source_class, 'unknown') AS st_class
    FROM base
  ),
  groups AS (
    SELECT cmp_group,
      count(*)::int AS payment_count,
      count(DISTINCT user_id)::int AS unique_buyers,
      coalesce(sum(amount_minor),0)::bigint AS gross_minor
    FROM classified
    GROUP BY 1
  ),
  paths AS (
    SELECT ft_class AS first_touch_source_class,
      st_class AS session_touch_source_class,
      count(*)::int AS payment_count,
      count(DISTINCT user_id)::int AS unique_buyers,
      coalesce(sum(amount_minor),0)::bigint AS gross_minor,
      count(*) FILTER (WHERE ft_confidence='exact' OR st_confidence='exact')::int AS exact_pair_hint
    FROM classified
    WHERE ft_present OR st_present
    GROUP BY 1, 2
    ORDER BY payment_count DESC
    LIMIT 25
  )
  SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM groups g),
    (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM paths p)
  INTO v_groups, v_paths;

  RETURN jsonb_build_object(
    'groups', v_groups,
    'path_examples', v_paths,
    'note', 'Independent snapshot comparison; not multi-touch attribution; no user/session ids'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_touch_comparison(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_touch_comparison(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_touch_comparison(
  timestamptz, timestamptz, boolean, uuid, uuid
) TO service_role;

-- Time to purchase
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_time_to_purchase(
  p_from timestamptz, p_to timestamptz,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ft jsonb;
  v_sess jsonb;
  v_pay jsonb;
  v_neg_ft int;
  v_neg_sess int;
BEGIN
  WITH first_pays AS (
    SELECT *
    FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    )
    WHERE is_first_purchase
  ),
  ft_dur AS (
    SELECT
      CASE
        WHEN ft_present AND ft_first_seen_at IS NOT NULL AND confirmed_at >= ft_first_seen_at
          THEN extract(epoch FROM (confirmed_at - ft_first_seen_at))
        ELSE NULL
      END AS seconds,
      CASE
        WHEN ft_present AND ft_first_seen_at IS NOT NULL AND confirmed_at < ft_first_seen_at
          THEN true ELSE false
      END AS negative
    FROM first_pays
  ),
  ft_stats AS (
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) FILTER (WHERE seconds IS NOT NULL) AS median_sec,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY seconds) FILTER (WHERE seconds IS NOT NULL) AS p25_sec,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY seconds) FILTER (WHERE seconds IS NOT NULL) AS p75_sec,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds < 600)::int AS bucket_lt_10m,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 600 AND seconds < 3600)::int AS bucket_10m_60m,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 3600 AND seconds < 86400)::int AS bucket_1h_24h,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 86400 AND seconds < 604800)::int AS bucket_1d_7d,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 604800)::int AS bucket_gt_7d,
      count(*) FILTER (WHERE seconds IS NULL AND NOT negative)::int AS bucket_unknown,
      count(*) FILTER (WHERE negative)::int AS negative_count
    FROM ft_dur
  )
  SELECT to_jsonb(s) INTO v_ft FROM ft_stats s;

  WITH base AS (
    SELECT *
    FROM public.admin_attribution_p323_payment_base(
      p_from, p_to, p_include_test, p_author_id, p_practice_id
    )
    WHERE st_present AND st_confidence = 'exact'
  ),
  sess_dur AS (
    SELECT
      CASE
        WHEN session_started_at IS NOT NULL AND order_created_at >= session_started_at
          THEN extract(epoch FROM (order_created_at - session_started_at))
        ELSE NULL
      END AS seconds,
      CASE
        WHEN session_started_at IS NOT NULL AND order_created_at < session_started_at
          THEN true ELSE false
      END AS negative
    FROM base
  ),
  sess_stats AS (
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) FILTER (WHERE seconds IS NOT NULL) AS median_sec,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY seconds) FILTER (WHERE seconds IS NOT NULL) AS p25_sec,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY seconds) FILTER (WHERE seconds IS NOT NULL) AS p75_sec,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds < 600)::int AS bucket_lt_10m,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 600 AND seconds < 3600)::int AS bucket_10m_60m,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 3600 AND seconds < 86400)::int AS bucket_1h_24h,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 86400 AND seconds < 604800)::int AS bucket_1d_7d,
      count(*) FILTER (WHERE seconds IS NOT NULL AND seconds >= 604800)::int AS bucket_gt_7d,
      count(*) FILTER (WHERE seconds IS NULL AND NOT negative)::int AS bucket_unknown,
      count(*) FILTER (WHERE negative)::int AS negative_count
    FROM sess_dur
  )
  SELECT to_jsonb(s) INTO v_sess FROM sess_stats s;

  WITH base AS (
    SELECT p.confirmed_at, o.created_at
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.status='succeeded' AND p.confirmed_at IS NOT NULL
      AND (p_include_test OR p.is_test=false)
      AND (p_from IS NULL OR p.confirmed_at >= p_from)
      AND (p_to IS NULL OR p.confirmed_at < p_to)
  ),
  pay_dur AS (
    SELECT extract(epoch FROM (confirmed_at - created_at)) AS seconds
    FROM base
    WHERE confirmed_at >= created_at
  ),
  pay_stats AS (
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) AS median_sec,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY seconds) AS p25_sec,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY seconds) AS p75_sec,
      count(*)::int AS sample_size
    FROM pay_dur
  )
  SELECT to_jsonb(s) INTO v_pay FROM pay_stats s;

  v_neg_ft := coalesce((v_ft->>'negative_count')::int, 0);
  v_neg_sess := coalesce((v_sess->>'negative_count')::int, 0);

  RETURN jsonb_build_object(
    'first_touch_to_first_payment', v_ft,
    'session_start_to_order', v_sess,
    'order_to_payment', v_pay,
    'timezone_display', 'Europe/Moscow',
    'duration_basis', 'UTC timestamps',
    'negative_duration_warnings', v_neg_ft + v_neg_sess,
    'note', 'First-touch duration uses first purchase only; median preferred over mean'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_time_to_purchase(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_time_to_purchase(
  timestamptz, timestamptz, boolean, uuid, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_time_to_purchase(
  timestamptz, timestamptz, boolean, uuid, uuid
) TO service_role;

-- Read-only historical backfill preview (no apply)
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_backfill_preview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eligible_sessions AS (
    SELECT s.*
    FROM public.analytics_sessions s
    WHERE coalesce(s.is_bot, false) = false
      AND coalesce(s.is_test, false) = false
      AND coalesce(s.is_staff, false) = false
      AND s.traffic_class = 'human'
  ),
  anon_candidates AS (
    SELECT DISTINCT ON (s.anonymous_id) s.anonymous_id
    FROM eligible_sessions s
    ORDER BY s.anonymous_id, s.started_at ASC, s.created_at ASC, s.id ASC
  ),
  anon_missing AS (
    SELECT c.anonymous_id
    FROM anon_candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.analytics_first_touches t
      WHERE t.subject_type='anonymous' AND t.anonymous_id=c.anonymous_id
    )
  ),
  user_missing AS (
    SELECT u.id AS user_id
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.analytics_first_touches t
      WHERE t.subject_type='user' AND t.user_id=u.id
    )
  ),
  user_from_session AS (
    SELECT DISTINCT ON (s.user_id) s.user_id
    FROM eligible_sessions s
    WHERE s.user_id IS NOT NULL
    ORDER BY s.user_id, s.started_at ASC
  )
  SELECT jsonb_build_object(
    'mode', 'dry_run_preview',
    'apply_available_in_ui', false,
    'confidence_if_applied', 'inferred',
    'never_exact', true,
    'proposed_anonymous_inserts', (SELECT count(*)::int FROM anon_missing),
    'proposed_user_inserts_from_session', (
      SELECT count(*)::int FROM user_missing um
      JOIN user_from_session ufs ON ufs.user_id = um.user_id
    ),
    'unknown_users_no_history', (
      SELECT count(*)::int FROM user_missing um
      WHERE NOT EXISTS (SELECT 1 FROM user_from_session ufs WHERE ufs.user_id = um.user_id)
    ),
    'excluded_sessions', jsonb_build_object(
      'bot', (SELECT count(*)::int FROM analytics_sessions WHERE coalesce(is_bot,false)),
      'test', (SELECT count(*)::int FROM analytics_sessions WHERE coalesce(is_test,false)),
      'staff', (SELECT count(*)::int FROM analytics_sessions WHERE coalesce(is_staff,false))
    ),
    'existing_user_first_touches', (
      SELECT jsonb_build_object(
        'exact', count(*) FILTER (WHERE confidence='exact'),
        'inferred', count(*) FILTER (WHERE confidence='inferred'),
        'unknown', count(*) FILTER (WHERE confidence='unknown')
      )
      FROM analytics_first_touches WHERE subject_type='user'
    ),
    'note', 'Apply requires separate approved admin command; UI has no Apply button'
  );
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_backfill_preview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_backfill_preview() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_backfill_preview() TO service_role;

-- Integrity
CREATE OR REPLACE FUNCTION public.admin_attribution_p323_integrity_snapshot(
  p_since timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_critical int := 0;
  v_warning int := 0;
  v_coverage int := 0;
  v_total_gross bigint;
  v_attr_ft bigint;
  v_attr_st bigint;
BEGIN
  -- succeeded payment without order
  SELECT count(*)::int INTO v_critical
  FROM payments p
  WHERE p.status='succeeded'
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=p.order_id)
    AND (p_since IS NULL OR p.confirmed_at >= p_since);

  -- attributed gross cannot exceed total (first-touch mode, all-time non-test)
  SELECT coalesce(sum(amount_minor),0) INTO v_total_gross
  FROM public.admin_attribution_p323_payment_base(NULL, NULL, false, NULL, NULL);

  SELECT coalesce(sum(amount_minor),0) INTO v_attr_ft
  FROM public.admin_attribution_p323_payment_base(NULL, NULL, false, NULL, NULL)
  WHERE ft_present;

  SELECT coalesce(sum(amount_minor),0) INTO v_attr_st
  FROM public.admin_attribution_p323_payment_base(NULL, NULL, false, NULL, NULL)
  WHERE st_present;

  IF v_attr_ft > v_total_gross OR v_attr_st > v_total_gross THEN
    v_critical := v_critical + 1;
  END IF;

  -- inferred marked exact
  SELECT v_critical + count(*)::int INTO v_critical
  FROM analytics_first_touches
  WHERE confidence='exact' AND origin='historical_backfill';

  -- internal as ordinary acquisition in first-touch exact
  SELECT v_warning + count(*)::int INTO v_warning
  FROM analytics_first_touches
  WHERE subject_type='user' AND source_class='internal' AND confidence='exact';

  -- negative first-touch → payment
  SELECT v_warning + count(*)::int INTO v_warning
  FROM public.admin_attribution_p323_payment_base(NULL, NULL, false, NULL, NULL)
  WHERE is_first_purchase AND ft_present AND ft_first_seen_at IS NOT NULL
    AND confirmed_at < ft_first_seen_at;

  -- coverage limitation: historical unknown orders
  SELECT count(*)::int INTO v_coverage
  FROM orders
  WHERE coalesce(attribution_confidence,'unknown')='unknown';

  -- test payment leaking into default base
  IF EXISTS (
    SELECT 1 FROM public.admin_attribution_p323_payment_base(NULL, NULL, false, NULL, NULL)
    WHERE is_test
  ) THEN
    v_critical := v_critical + 1;
  END IF;

  RETURN jsonb_build_object(
    'critical', v_critical,
    'warning', v_warning,
    'coverage_limitation', v_coverage,
    'checks', jsonb_build_object(
      'attributed_gross_le_total', v_attr_ft <= v_total_gross AND v_attr_st <= v_total_gross,
      'no_inferred_as_exact', NOT EXISTS (
        SELECT 1 FROM analytics_first_touches
        WHERE confidence='exact' AND origin='historical_backfill'
      ),
      'default_excludes_test', NOT EXISTS (
        SELECT 1 FROM public.admin_attribution_p323_payment_base(NULL, NULL, false, NULL, NULL)
        WHERE is_test
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attribution_p323_integrity_snapshot(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attribution_p323_integrity_snapshot(timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attribution_p323_integrity_snapshot(timestamptz) TO service_role;

COMMENT ON FUNCTION public.admin_attribution_p323_integrity_snapshot(timestamptz) IS
  'audiolad:p323; attribution panel integrity; critical should stay 0';

DO $$
BEGIN
  IF to_regprocedure('public.admin_attribution_p323_summary(timestamptz,timestamptz,boolean,text,text,text,text,text,text,text,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: summary RPC missing';
  END IF;
END $$;

COMMIT;

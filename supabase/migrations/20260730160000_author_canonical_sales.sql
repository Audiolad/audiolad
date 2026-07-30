-- Canonical author sales (single Source of Truth for stats + finance sales).
--
-- A canonical sale exists when ALL of:
--   * order is paid or later refunded (paid_at set, non-test)
--   * payment succeeded with confirmed_at
--   * buyer access exists with access_source = 'purchase'
-- Accrual is a linked financial state, not the existence criterion.
--
-- Does NOT mutate production data. Does NOT backfill author_id_snapshot.
-- Applies only when this migration is run in an approved environment.

BEGIN;

-- ---------------------------------------------------------------------------
-- Reviewed historical exceptions
--
-- These are the three owner-operated historical orders approved by the product
-- owner. This is intentionally not a general "platform owner" exemption:
-- the order-id CHECK makes accidental expansion impossible without a reviewed
-- migration. The table has no FK so a clean test database can receive this
-- schema before its controlled fixtures are inserted.
CREATE TABLE IF NOT EXISTS public.author_historical_sale_exceptions (
  order_id uuid PRIMARY KEY,
  author_id uuid NOT NULL,
  exception_code text NOT NULL DEFAULT 'owner_historical_sale',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_historical_sale_exceptions_code_check
    CHECK (exception_code = 'owner_historical_sale'),
  CONSTRAINT author_historical_sale_exceptions_orders_check
    CHECK (order_id IN (
      '507af74c-e76c-4fe9-a68b-0d2754efc4a2'::uuid,
      '99df5660-b196-4bb3-8e08-7af04e39af60'::uuid,
      'b469fc53-aa0a-45bf-9d88-a84251a10f57'::uuid
    ))
);

ALTER TABLE public.author_historical_sale_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.author_historical_sale_exceptions FROM PUBLIC;
REVOKE ALL ON TABLE public.author_historical_sale_exceptions FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.author_historical_sale_exceptions TO service_role;

INSERT INTO public.author_historical_sale_exceptions (order_id, author_id)
VALUES
  ('507af74c-e76c-4fe9-a68b-0d2754efc4a2'::uuid, '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c'::uuid),
  ('99df5660-b196-4bb3-8e08-7af04e39af60'::uuid, '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c'::uuid),
  ('b469fc53-aa0a-45bf-9d88-a84251a10f57'::uuid, '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c'::uuid)
ON CONFLICT (order_id) DO NOTHING;

-- `practices.author_id` is current mutable state, not a historical ownership
-- record. Snapshot-less orders therefore remain unresolved, except for the
-- audited allowlist above.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.canonical_sale_resolve_author(
  p_author_id_snapshot uuid,
  p_practice_author_id uuid,
  p_exception_author_id uuid DEFAULT NULL
)
RETURNS TABLE (
  author_id uuid,
  attribution_source text
)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_author_id_snapshot IS NOT NULL THEN p_author_id_snapshot
      WHEN p_exception_author_id IS NOT NULL THEN p_exception_author_id
      ELSE NULL
    END,
    CASE
      WHEN p_author_id_snapshot IS NOT NULL THEN 'snapshot'
      WHEN p_exception_author_id IS NOT NULL THEN 'historical_exception'
      ELSE 'unresolved'
    END;
$$;

COMMENT ON FUNCTION public.canonical_sale_resolve_author(uuid, uuid, uuid) IS
  'audiolad:canonical-sales; resolve author only from the immutable order snapshot or the fixed reviewed historical exception allowlist.';

-- ---------------------------------------------------------------------------
-- Buyer display name (first/last only; never email)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.canonical_sale_buyer_name_parts(
  p_full_name text
)
RETURNS TABLE (
  first_name text,
  last_name text
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed text;
  v_space int;
BEGIN
  v_trimmed := nullif(btrim(coalesce(p_full_name, '')), '');
  IF v_trimmed IS NULL THEN
    first_name := NULL;
    last_name := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- A profile full_name is user-entered text. Do not accidentally turn an
  -- email typed into that field into buyer contact data for authors.
  IF v_trimmed ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' THEN
    first_name := NULL;
    last_name := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_space := position(' ' IN v_trimmed);
  IF v_space = 0 THEN
    first_name := v_trimmed;
    last_name := NULL;
  ELSE
    first_name := btrim(substr(v_trimmed, 1, v_space - 1));
    last_name := nullif(btrim(substr(v_trimmed, v_space + 1)), '');
  END IF;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- Accrual + payout status derivation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.canonical_sale_accrual_status(
  p_order_status text,
  p_has_refund boolean,
  p_has_sale_accrual boolean,
  p_has_refund_reversal boolean,
  p_obligation_status text,
  p_obligation_result_code text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_order_status = 'full' THEN
    RETURN 'refunded';
  END IF;

  IF p_has_refund THEN
    RETURN 'not_applicable';
  END IF;

  IF p_has_sale_accrual THEN
    RETURN 'accrued';
  END IF;

  IF p_obligation_status IN ('pending', 'processing') THEN
    RETURN 'pending';
  END IF;

  IF p_obligation_status = 'requires_review' THEN
    RETURN 'requires_review';
  END IF;

  IF p_obligation_status = 'failed' THEN
    RETURN 'failed';
  END IF;

  IF p_obligation_status = 'skipped' THEN
    IF p_obligation_result_code = 'zero_amount' THEN
      RETURN 'not_applicable';
    END IF;
    -- payout_eligible / terms / snapshot gaps are financial problems, not absence of sale
    RETURN 'requires_review';
  END IF;

  -- No obligation and no accrual: historical gap or silent enqueue failure
  RETURN 'requires_review';
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_sale_payout_status(
  p_accrual_status text,
  p_amount_state text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_accrual_status = 'refunded' THEN 'refunded'
    WHEN p_accrual_status <> 'accrued' THEN NULL
    WHEN p_amount_state IN ('held', 'available', 'reserved', 'paid') THEN p_amount_state
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- Core projection (service_role / SECURITY DEFINER consumers only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_canonical_sales_base(
  p_author_id uuid,
  p_include_test boolean DEFAULT false,
  p_exclude_author_members boolean DEFAULT false
)
RETURNS TABLE (
  sale_id uuid,
  paid_at timestamptz,
  practice_id uuid,
  product_title text,
  buyer_first_name text,
  buyer_last_name text,
  amount_minor integer,
  refunded_amount_minor integer,
  net_amount_minor integer,
  refund_status text,
  currency text,
  author_amount_minor integer,
  platform_fee_minor integer,
  author_share_bps integer,
  hold_days integer,
  available_at timestamptz,
  accrual_status text,
  payout_status text,
  attribution_source text,
  is_historical_exception boolean,
  is_test boolean,
  order_status text,
  has_purchase_access boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH members AS (
    SELECT am.user_id
    FROM public.author_members AS am
    WHERE am.author_id = p_author_id
  ),
  resolved AS (
    SELECT
      o.id AS sale_id,
      o.paid_at,
      o.practice_id,
      coalesce(o.practice_title_snapshot, pr.title, 'Продукт') AS product_title,
      o.amount_minor,
      o.currency,
      o.status AS order_status,
      coalesce(o.is_test, false) AS is_test,
      o.user_id,
      r.author_id AS resolved_author_id,
      r.attribution_source,
      hx.exception_code IS NOT NULL AS is_historical_exception,
      p.id AS payment_id,
      p.confirmed_at AS payment_confirmed_at,
      EXISTS (
        SELECT 1
        FROM public.user_practices AS up
        WHERE up.user_id = o.user_id
          AND up.practice_id = o.practice_id
          AND up.access_source = 'purchase'
      ) AS has_purchase_access,
      least(
        coalesce((rs.settlement ->> 'confirmed_refunded_minor')::bigint, 0),
        p.amount_minor
      ) AS refunded_amount_minor,
      CASE
        WHEN coalesce((rs.settlement ->> 'confirmed_refunded_minor')::bigint, 0) <= 0
          THEN 'none'
        WHEN coalesce((rs.settlement ->> 'confirmed_refunded_minor')::bigint, 0) >= p.amount_minor
          THEN 'full'
        ELSE 'partial'
      END AS refund_status,
      fo.status AS obligation_status,
      fo.result_code AS obligation_result_code,
      ale.id AS ledger_entry_id,
      CASE
        WHEN ale.id IS NULL THEN NULL
        -- Display current economic entitlement from the confirmed cumulative
        -- refund snapshot, even while the asynchronous reversal obligation is
        -- still being processed. This prevents a stale full author share.
        ELSE public.author_share_minor(
          greatest(
            ale.gross_basis_minor - least(
              coalesce((rs.settlement ->> 'confirmed_refunded_minor')::bigint, 0),
              p.amount_minor
            ),
            0
          ),
          ale.author_share_bps
        )::integer
      END AS author_amount_minor,
      ale.author_share_bps,
      ale.hold_days,
      ale.available_at,
      ale.gross_basis_minor,
      ale.net_basis_minor,
      coalesce(rev.total_reversed_minor, 0) AS reversed_author_amount_minor,
      CASE
        WHEN ale.id IS NULL THEN false
        ELSE coalesce(rev.total_reversed_minor, 0) < greatest(
          ale.amount_minor - public.author_share_minor(
            greatest(
              ale.gross_basis_minor - least(
                coalesce((rs.settlement ->> 'confirmed_refunded_minor')::bigint, 0),
                p.amount_minor
              ),
              0
            ),
            ale.author_share_bps
          ),
          0
        )
      END AS refund_reversal_pending,
      EXISTS (
        SELECT 1
        FROM public.author_ledger_entries AS rev
        WHERE rev.entry_type = 'refund_reversal'
          AND rev.payment_id = p.id
      ) AS has_refund_reversal
    FROM public.orders AS o
    INNER JOIN LATERAL (
      -- Canonical sale identity is the order. Keep one confirmed payment even
      -- if legacy/provider data contains more than one succeeded attempt.
      SELECT p.*
      FROM public.payments AS p
      WHERE p.order_id = o.id
        AND p.status = 'succeeded'
        AND p.confirmed_at IS NOT NULL
      ORDER BY p.confirmed_at ASC, p.id ASC
      LIMIT 1
    ) AS p ON true
    LEFT JOIN public.practices AS pr
      ON pr.id = o.practice_id
    LEFT JOIN public.author_historical_sale_exceptions AS hx
      ON hx.order_id = o.id
    CROSS JOIN LATERAL public.canonical_sale_resolve_author(
      o.author_id_snapshot,
      pr.author_id,
      hx.author_id
    ) AS r
    CROSS JOIN LATERAL (
      SELECT public.payment_refund_settlement_snapshot(p.id) AS settlement
    ) AS rs
    LEFT JOIN public.finance_obligations AS fo
      ON fo.obligation_type = 'payment_succeeded_accrual'
     AND fo.subject_id = p.id
    LEFT JOIN public.author_ledger_entries AS ale
      ON ale.payment_id = p.id
     AND ale.entry_type = 'sale_accrual'
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(abs(rev.amount_minor)), 0)::bigint AS total_reversed_minor
      FROM public.author_ledger_entries AS rev
      WHERE rev.entry_type = 'refund_reversal'
        AND rev.payment_id = p.id
    ) AS rev ON true
    WHERE o.paid_at IS NOT NULL
      AND o.status IN ('paid', 'refunded')
      AND (p_include_test OR coalesce(o.is_test, false) = false)
      AND (p_include_test OR coalesce(p.is_test, false) = false)
      AND r.author_id = p_author_id
      AND (
        NOT p_exclude_author_members
        OR o.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = o.user_id)
      )
  ),
  with_access AS (
    SELECT *
    FROM resolved
    WHERE has_purchase_access
  ),
  with_state AS (
    SELECT
      w.*,
      public.canonical_sale_accrual_status(
        w.refund_status,
        w.is_historical_exception,
        w.ledger_entry_id IS NOT NULL,
        w.has_refund_reversal,
        w.obligation_status,
        w.obligation_result_code
      ) AS accrual_status,
      CASE
        WHEN w.ledger_entry_id IS NULL THEN NULL
        WHEN w.refund_status = 'full' THEN 'refunded'
        -- Never expose a partially returned sale as available while its
        -- proportional reversal is pending or being reconciled.
        WHEN w.refund_status = 'partial' AND w.refund_reversal_pending THEN 'held'
        WHEN EXISTS (
          SELECT 1
          FROM public.author_payout_allocations AS apa
          JOIN public.author_payouts AS ap ON ap.id = apa.payout_id
          WHERE apa.ledger_entry_id = w.ledger_entry_id
            AND ap.status = 'paid'
        ) THEN 'paid'
        WHEN EXISTS (
          SELECT 1
          FROM public.author_payout_allocations AS apa
          JOIN public.author_payouts AS ap ON ap.id = apa.payout_id
          WHERE apa.ledger_entry_id = w.ledger_entry_id
            AND ap.status IN ('draft', 'approved', 'processing')
        ) THEN 'reserved'
        WHEN w.available_at IS NOT NULL AND w.available_at <= now() THEN 'available'
        WHEN w.available_at IS NOT NULL THEN 'held'
        ELSE 'held'
      END AS amount_state
    FROM with_access AS w
  )
  SELECT
    s.sale_id,
    s.paid_at,
    s.practice_id,
    s.product_title,
    bn.first_name AS buyer_first_name,
    bn.last_name AS buyer_last_name,
    s.amount_minor,
    s.refunded_amount_minor::integer,
    greatest(s.amount_minor - s.refunded_amount_minor, 0)::integer,
    s.refund_status,
    s.currency,
    s.author_amount_minor,
    CASE
      WHEN s.gross_basis_minor IS NOT NULL AND s.author_amount_minor IS NOT NULL
        THEN greatest(s.gross_basis_minor - s.author_amount_minor, 0)
      ELSE NULL
    END AS platform_fee_minor,
    s.author_share_bps,
    s.hold_days,
    s.available_at,
    s.accrual_status,
    public.canonical_sale_payout_status(s.accrual_status, s.amount_state) AS payout_status,
    s.attribution_source,
    s.is_historical_exception,
    s.is_test,
    s.order_status,
    s.has_purchase_access
  FROM with_state AS s
  LEFT JOIN public.profiles AS pf
    ON pf.id = s.user_id
  CROSS JOIN LATERAL public.canonical_sale_buyer_name_parts(pf.full_name) AS bn;
$$;

REVOKE ALL ON FUNCTION public.author_canonical_sales_base(uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_canonical_sales_base(uuid, boolean, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_canonical_sales_base(uuid, boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.author_canonical_sales_base(uuid, boolean, boolean) IS
  'audiolad:canonical-sales; author-scoped canonical sales projection. No buyer email/phone/ids.';

-- List RPC
-- Compatibility for controlled test databases that received the previous
-- UUID-based filter signature. Fresh deployments only create the slug variant.
DROP FUNCTION IF EXISTS public.author_canonical_sales_list(
  uuid, timestamptz, timestamptz, uuid, text, text, boolean, integer, integer
);
CREATE OR REPLACE FUNCTION public.author_canonical_sales_list(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_product_slug text DEFAULT NULL,
  p_accrual_status text DEFAULT NULL,
  p_payout_status text DEFAULT NULL,
  p_include_test boolean DEFAULT false,
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_rows jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int
  INTO v_total
  FROM public.author_canonical_sales_base(p_author_id, p_include_test, true) AS s
  WHERE (p_from IS NULL OR s.paid_at >= p_from)
    AND (p_to IS NULL OR s.paid_at < p_to)
    AND (
      p_product_slug IS NULL
      OR EXISTS (
        SELECT 1 FROM public.practices pr
        WHERE pr.id = s.practice_id AND pr.slug = p_product_slug
      )
    )
    AND (p_accrual_status IS NULL OR s.accrual_status = p_accrual_status)
    AND (p_payout_status IS NULL OR s.payout_status = p_payout_status);

  SELECT coalesce(jsonb_agg(row_data ORDER BY paid_at DESC, sale_id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'sale_id', s.sale_id,
        'paid_at', s.paid_at,
        'product_title', s.product_title,
        'buyer_first_name', s.buyer_first_name,
        'buyer_last_name', s.buyer_last_name,
        'amount_minor', s.amount_minor,
        'refunded_amount_minor', s.refunded_amount_minor,
        'net_amount_minor', s.net_amount_minor,
        'refund_status', s.refund_status,
        'currency', s.currency,
        'author_amount_minor', s.author_amount_minor,
        'accrual_status', s.accrual_status,
        'payout_status', s.payout_status
      ) AS row_data,
      s.paid_at,
      s.sale_id
    FROM public.author_canonical_sales_base(p_author_id, p_include_test, true) AS s
    WHERE (p_from IS NULL OR s.paid_at >= p_from)
      AND (p_to IS NULL OR s.paid_at < p_to)
    AND (
      p_product_slug IS NULL
      OR EXISTS (
        SELECT 1 FROM public.practices pr
        WHERE pr.id = s.practice_id AND pr.slug = p_product_slug
      )
    )
      AND (p_accrual_status IS NULL OR s.accrual_status = p_accrual_status)
      AND (p_payout_status IS NULL OR s.payout_status = p_payout_status)
    ORDER BY s.paid_at DESC, s.sale_id DESC
    LIMIT v_limit
    OFFSET v_offset
  ) AS q;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_canonical_sales_list(uuid, timestamptz, timestamptz, text, text, text, boolean, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_canonical_sales_list(uuid, timestamptz, timestamptz, text, text, text, boolean, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_canonical_sales_list(uuid, timestamptz, timestamptz, text, text, text, boolean, integer, integer) TO service_role;

-- Detail RPC (author-safe; no contacts / technical ids beyond sale_id)
CREATE OR REPLACE FUNCTION public.author_canonical_sales_detail(
  p_author_id uuid,
  p_sale_id uuid,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_author_id IS NULL OR p_sale_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_row
  FROM public.author_canonical_sales_base(p_author_id, p_include_test, true) AS s
  WHERE s.sale_id = p_sale_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_row.sale_id,
    'paid_at', v_row.paid_at,
    'product_title', v_row.product_title,
    'buyer_first_name', v_row.buyer_first_name,
    'buyer_last_name', v_row.buyer_last_name,
    'amount_minor', v_row.amount_minor,
    'refunded_amount_minor', v_row.refunded_amount_minor,
    'net_amount_minor', v_row.net_amount_minor,
    'refund_status', v_row.refund_status,
    'currency', v_row.currency,
    'author_amount_minor', v_row.author_amount_minor,
    'accrual_status', v_row.accrual_status,
    'payout_status', v_row.payout_status,
    'available_at', v_row.available_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_canonical_sales_detail(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_canonical_sales_detail(uuid, uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_canonical_sales_detail(uuid, uuid, boolean) TO service_role;

-- Counts for stats + empty-state
CREATE OR REPLACE FUNCTION public.author_canonical_sales_counts(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_exclude_author_members boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Metric contract: refund_sales counts affected sales, never refund
  -- operations. All *_minor fields are monetary amounts, never counts.
  WITH filtered AS (
    SELECT *
    FROM public.author_canonical_sales_base(
      p_author_id,
      p_include_test,
      p_exclude_author_members
    ) AS s
    WHERE (p_from IS NULL OR s.paid_at >= p_from)
      AND (p_to IS NULL OR s.paid_at < p_to)
  )
  SELECT jsonb_build_object(
    'gross_purchases', count(*)::int,
    'refund_sales', count(*) FILTER (WHERE refund_status <> 'none')::int,
    'full_refunds', count(*) FILTER (WHERE refund_status = 'full')::int,
    'partial_refunds', count(*) FILTER (WHERE refund_status = 'partial')::int,
    'net_sales', count(*) FILTER (WHERE refund_status <> 'full')::int,
    'gross_revenue_minor', coalesce(sum(amount_minor), 0)::bigint,
    'refunded_amount_minor', coalesce(sum(refunded_amount_minor), 0)::bigint,
    'net_revenue_minor', coalesce(sum(net_amount_minor), 0)::bigint,
    'accrued', count(*) FILTER (WHERE accrual_status = 'accrued')::int,
    'pending_accrual', count(*) FILTER (WHERE accrual_status IN ('pending', 'requires_review', 'failed'))::int
  )
  FROM filtered;
$$;

REVOKE ALL ON FUNCTION public.author_canonical_sales_counts(uuid, timestamptz, timestamptz, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_canonical_sales_counts(uuid, timestamptz, timestamptz, boolean, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_canonical_sales_counts(uuid, timestamptz, timestamptz, boolean, boolean) TO service_role;

-- Product filter options
CREATE OR REPLACE FUNCTION public.author_canonical_sales_products(
  p_author_id uuid,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_slug', pr.slug,
      'product_title', product_title
    )
    ORDER BY product_title
  ), '[]'::jsonb)
  FROM (
    SELECT DISTINCT s.practice_id, s.product_title
    FROM public.author_canonical_sales_base(p_author_id, p_include_test, true) s
  ) AS q
  INNER JOIN public.practices pr ON pr.id = q.practice_id
  ;
$$;

REVOKE ALL ON FUNCTION public.author_canonical_sales_products(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_canonical_sales_products(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_canonical_sales_products(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Checkout readiness: block paid sale start when accrual cannot succeed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_sale_accrual_ready(
  p_author_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_author public.authors%ROWTYPE;
  v_terms_count integer;
BEGIN
  IF p_author_id IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_missing');
  END IF;

  SELECT * INTO v_author FROM public.authors AS a WHERE a.id = p_author_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_missing');
  END IF;

  IF coalesce(v_author.payout_eligible, false) = false THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_not_payout_eligible');
  END IF;

  SELECT count(*)::int
  INTO v_terms_count
  FROM public.author_commercial_terms AS t
  WHERE t.author_id = p_author_id
    AND t.status = 'approved'
    AND t.valid_from <= p_at
    AND (t.valid_to IS NULL OR t.valid_to > p_at);

  IF v_terms_count = 0 THEN
    RETURN jsonb_build_object('ready', false, 'code', 'no_active_terms');
  END IF;

  IF v_terms_count > 1 THEN
    RETURN jsonb_build_object('ready', false, 'code', 'ambiguous_terms');
  END IF;

  RETURN jsonb_build_object('ready', true, 'code', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.author_sale_accrual_ready(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_sale_accrual_ready(uuid, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_sale_accrual_ready(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.order_sale_accrual_ready(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_practice_author uuid;
  v_author_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders AS o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready', false, 'code', 'order_not_found');
  END IF;

  IF coalesce(v_order.amount_minor, 0) <= 0 THEN
    RETURN jsonb_build_object('ready', true, 'code', 'zero_amount');
  END IF;

  SELECT pr.author_id INTO v_practice_author
  FROM public.practices AS pr
  WHERE pr.id = v_order.practice_id;

  v_author_id := coalesce(v_order.author_id_snapshot, v_practice_author);
  IF v_author_id IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_snapshot_missing');
  END IF;

  IF v_order.author_id_snapshot IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_snapshot_missing');
  END IF;

  RETURN public.author_sale_accrual_ready(v_author_id, now());
END;
$$;

REVOKE ALL ON FUNCTION public.order_sale_accrual_ready(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_sale_accrual_ready(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_sale_accrual_ready(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Enforce author_id_snapshot on new paid orders; keep immutable once set
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.orders_enforce_author_id_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_author uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.author_id_snapshot IS NOT NULL
     AND NEW.author_id_snapshot IS DISTINCT FROM OLD.author_id_snapshot THEN
    NEW.author_id_snapshot := OLD.author_id_snapshot;
  END IF;

  IF NEW.author_id_snapshot IS NULL THEN
    SELECT pr.author_id
    INTO v_practice_author
    FROM public.practices AS pr
    WHERE pr.id = NEW.practice_id;

    NEW.author_id_snapshot := v_practice_author;
  END IF;

  IF coalesce(NEW.amount_minor, 0) > 0 AND NEW.author_id_snapshot IS NULL THEN
    RAISE EXCEPTION 'author_snapshot_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_author_id_snapshot_trg ON public.orders;
CREATE TRIGGER orders_enforce_author_id_snapshot_trg
  BEFORE INSERT OR UPDATE OF author_id_snapshot, amount_minor, practice_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_enforce_author_id_snapshot();

-- ---------------------------------------------------------------------------
-- Admin diagnostic (service_role): full technical view for a sale
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_canonical_sale_diagnostic(
  p_sale_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_practice public.practices%ROWTYPE;
  v_resolved record;
  v_access boolean;
  v_obligation public.finance_obligations%ROWTYPE;
  v_ledger public.author_ledger_entries%ROWTYPE;
  v_exception_author_id uuid;
  v_refund_status text := 'none';
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = v_order.id AND status = 'succeeded'
  ORDER BY confirmed_at DESC NULLS LAST
  LIMIT 1;

  SELECT * INTO v_practice FROM public.practices WHERE id = v_order.practice_id;
  SELECT author_id INTO v_exception_author_id
  FROM public.author_historical_sale_exceptions
  WHERE order_id = v_order.id;

  SELECT * INTO v_resolved
  FROM public.canonical_sale_resolve_author(
    v_order.author_id_snapshot,
    v_practice.author_id,
    v_exception_author_id
  );

  SELECT EXISTS (
    SELECT 1 FROM public.user_practices up
    WHERE up.user_id = v_order.user_id
      AND up.practice_id = v_order.practice_id
      AND up.access_source = 'purchase'
  ) INTO v_access;

  IF v_payment.id IS NOT NULL THEN
    SELECT CASE
      WHEN coalesce((public.payment_refund_settlement_snapshot(v_payment.id)->>'confirmed_refunded_minor')::integer, 0)
           >= v_payment.amount_minor THEN 'full'
      WHEN coalesce((public.payment_refund_settlement_snapshot(v_payment.id)->>'confirmed_refunded_minor')::integer, 0)
           > 0 THEN 'partial'
      ELSE 'none'
    END INTO v_refund_status;

    SELECT * INTO v_obligation
    FROM public.finance_obligations
    WHERE obligation_type = 'payment_succeeded_accrual'
      AND subject_id = v_payment.id;

    SELECT * INTO v_ledger
    FROM public.author_ledger_entries
    WHERE payment_id = v_payment.id
      AND entry_type = 'sale_accrual'
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'paid_at', v_order.paid_at,
    'order_status', v_order.status,
    'payment_id', v_payment.id,
    'payment_status', v_payment.status,
    'has_purchase_access', v_access,
    'author_id_snapshot', v_order.author_id_snapshot,
    'resolved_author_id', v_resolved.author_id,
    'attribution_source', v_resolved.attribution_source,
    'obligation_id', v_obligation.id,
    'obligation_status', v_obligation.status,
    'obligation_result_code', v_obligation.result_code,
    'sale_accrual_id', v_ledger.id,
    'accrual_status', public.canonical_sale_accrual_status(
      v_refund_status,
      v_exception_author_id IS NOT NULL,
      v_ledger.id IS NOT NULL,
      EXISTS (
        SELECT 1 FROM public.author_ledger_entries rev
        WHERE rev.entry_type = 'refund_reversal' AND rev.payment_id = v_payment.id
      ),
      v_obligation.status,
      v_obligation.result_code
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_canonical_sale_diagnostic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_canonical_sale_diagnostic(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Author-sale email outbox. Webhook fulfillment enqueues only; a separate
-- runner claims and sends. Payload and recipient are server-only.
--
-- Delivery is durable at-least-once processing, not strict exactly-once SMTP:
-- if SMTP accepts a message and the worker dies before `sent_at` is persisted,
-- lease recovery may retry it. The stable RFC 5322 Message-ID reduces
-- downstream duplicates where the receiver supports deduplication. SMTP offers
-- no transaction/idempotency protocol that could remove this crash window.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.author_sale_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'failed', 'sent', 'permanent_failure')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  lease_token uuid,
  processing_started_at timestamptz,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_sale_email_outbox_sale_key UNIQUE (sale_id)
);
ALTER TABLE public.author_sale_email_outbox
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS author_sale_email_outbox_due_idx
  ON public.author_sale_email_outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.author_sale_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.author_sale_email_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.author_sale_email_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.author_sale_email_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_author_sale_email(p_sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale record;
  v_recipient_email text;
  v_author_id uuid;
  v_author_name text;
BEGIN
  SELECT o.author_id_snapshot INTO v_author_id
  FROM public.orders o
  WHERE o.id = p_sale_id;

  IF v_author_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_sale
  FROM public.author_canonical_sales_base(v_author_id, false, true) s
  WHERE s.sale_id = p_sale_id
    AND NOT s.is_historical_exception
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT
    coalesce(nullif(trim(p.contact_email), ''), nullif(trim(p.email), '')),
    p.full_name
  INTO v_recipient_email, v_author_name
  FROM public.author_members am
  INNER JOIN public.profiles p ON p.id = am.user_id
  WHERE am.author_id = v_author_id
    AND am.role = 'owner'
  LIMIT 1;

  IF v_recipient_email IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.author_sale_email_outbox (
    sale_id, idempotency_key, recipient_email, payload
  ) VALUES (
    v_sale.sale_id,
    'author_product_sold:' || v_sale.sale_id::text,
    lower(v_recipient_email),
    jsonb_build_object(
      'author_name', v_author_name,
      'product_title', v_sale.product_title,
      'buyer_first_name', v_sale.buyer_first_name,
      'buyer_last_name', v_sale.buyer_last_name,
      'paid_at', v_sale.paid_at,
      'amount_minor', v_sale.amount_minor,
      'author_amount_minor', v_sale.author_amount_minor,
      'author_amount_pending', v_sale.author_amount_minor IS NULL
    )
  )
  ON CONFLICT (sale_id) DO UPDATE
  SET recipient_email = EXCLUDED.recipient_email,
      payload = EXCLUDED.payload,
      updated_at = now()
  -- A replay refreshes a not-yet-terminal event after accrual settles, but it
  -- never silently resurrects a diagnosed permanent failure.
  WHERE public.author_sale_email_outbox.status IN ('pending', 'failed');

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_author_sale_email_outbox(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.author_sale_email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
BEGIN
  UPDATE public.author_sale_email_outbox
  SET status = 'pending', lease_token = NULL, processing_started_at = NULL,
      lease_expires_at = NULL, updated_at = now()
  WHERE status = 'processing' AND lease_expires_at <= now();

  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.author_sale_email_outbox
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.author_sale_email_outbox o
  SET status = 'processing',
      lease_token = gen_random_uuid(),
      processing_started_at = now(),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      attempt_count = o.attempt_count + 1,
      updated_at = now()
  FROM due
  WHERE o.id = due.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_author_sale_email_outbox(
  p_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH updated AS (
    UPDATE public.author_sale_email_outbox
    SET status = 'sent', sent_at = now(), last_error = NULL,
        lease_token = NULL, processing_started_at = NULL,
        lease_expires_at = NULL, updated_at = now()
    WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

CREATE OR REPLACE FUNCTION public.fail_author_sale_email_outbox(
  p_id uuid,
  p_lease_token uuid,
  p_error text,
  p_max_attempts integer DEFAULT 5
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH updated AS (
    UPDATE public.author_sale_email_outbox
    SET status = CASE WHEN attempt_count >= greatest(1, p_max_attempts)
                 THEN 'permanent_failure' ELSE 'failed' END,
        next_attempt_at = CASE WHEN attempt_count >= greatest(1, p_max_attempts)
                 THEN next_attempt_at
                 ELSE now() + make_interval(secs => least(21600, 60 * (2 ^ greatest(0, attempt_count - 1))::integer))
                 END,
        last_error = left(coalesce(nullif(trim(p_error), ''), 'send_failed'), 2000),
        lease_token = NULL, processing_started_at = NULL,
        lease_expires_at = NULL, updated_at = now()
    WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

REVOKE ALL ON FUNCTION public.enqueue_author_sale_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_author_sale_email_outbox(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_author_sale_email_outbox(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_author_sale_email_outbox(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_author_sale_email(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_author_sale_email_outbox(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_author_sale_email_outbox(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_author_sale_email_outbox(uuid, uuid, text, integer) TO service_role;


-- ---------------------------------------------------------------------------
-- Stats: wire paid_purchases to canonical sales (preserve engagement filters)
-- ---------------------------------------------------------------------------

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
  v_sales jsonb;
  v_purchases integer;
  v_refund_sales integer;
  v_net_sales integer;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_sales := public.author_canonical_sales_counts(
    p_author_id, p_from, p_to, false, true
  );
  v_purchases := coalesce((v_sales->>'gross_purchases')::int, 0);
  v_refund_sales := coalesce((v_sales->>'refund_sales')::int, 0);
  v_net_sales := coalesce((v_sales->>'net_sales')::int, 0);

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
      v_purchases AS gross_purchases,
      v_refund_sales AS refund_sales,
      v_net_sales AS net_sales
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
    'net_sales', c.net_sales,
    'gross_purchases', coalesce((v_sales->>'gross_purchases')::int, 0),
    'refund_sales', coalesce((v_sales->>'refund_sales')::int, 0),
    'full_refunds', coalesce((v_sales->>'full_refunds')::int, 0),
    'partial_refunds', coalesce((v_sales->>'partial_refunds')::int, 0),
    'gross_revenue_minor', coalesce((v_sales->>'gross_revenue_minor')::bigint, 0),
    'refunded_amount_minor', coalesce((v_sales->>'refunded_amount_minor')::bigint, 0),
    'net_revenue_minor', coalesce((v_sales->>'net_revenue_minor')::bigint, 0),
    'view_to_play_rate', public.author_stats_rate(c.plays, c.practice_views),
    'play_to_complete_rate', public.author_stats_rate(c.completions, c.plays),
    'view_to_save_rate', public.author_stats_rate(c.library_saves, c.practice_views),
    'view_to_purchase_rate', public.author_stats_rate(c.gross_purchases, c.practice_views)
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
        SELECT min(s.paid_at)
        FROM public.author_canonical_sales_base(p_author_id, false, true) AS s
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
      (s.paid_at AT TIME ZONE 'Europe/Moscow')::date AS day_local,
      count(*)::int AS gross_purchases,
      count(*) FILTER (WHERE s.refund_status <> 'none')::int AS refund_sales,
      count(*) FILTER (WHERE s.refund_status = 'full')::int AS full_refunds,
      count(*) FILTER (WHERE s.refund_status = 'partial')::int AS partial_refunds,
      count(*) FILTER (WHERE s.refund_status <> 'full')::int AS net_sales,
      coalesce(sum(s.amount_minor), 0)::bigint AS gross_revenue_minor,
      coalesce(sum(s.refunded_amount_minor), 0)::bigint AS refunded_amount_minor,
      coalesce(sum(s.net_amount_minor), 0)::bigint AS net_revenue_minor
    FROM public.author_canonical_sales_base(p_author_id, false, true) AS s
    WHERE s.paid_at >= v_from
      AND s.paid_at < v_to
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
      'gross_purchases', coalesce(pu.gross_purchases, 0),
      'refund_sales', coalesce(pu.refund_sales, 0),
      'full_refunds', coalesce(pu.full_refunds, 0),
      'partial_refunds', coalesce(pu.partial_refunds, 0),
      'net_sales', coalesce(pu.net_sales, 0),
      'gross_revenue_minor', coalesce(pu.gross_revenue_minor, 0),
      'refunded_amount_minor', coalesce(pu.refunded_amount_minor, 0),
      'net_revenue_minor', coalesce(pu.net_revenue_minor, 0),
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
      s.practice_id,
      count(*)::int AS gross_purchases,
      count(*) FILTER (WHERE s.refund_status <> 'none')::int AS refund_sales,
      count(*) FILTER (WHERE s.refund_status = 'full')::int AS full_refunds,
      count(*) FILTER (WHERE s.refund_status = 'partial')::int AS partial_refunds,
      count(*) FILTER (WHERE s.refund_status <> 'full')::int AS net_sales,
      coalesce(sum(s.amount_minor), 0)::bigint AS gross_revenue_minor,
      coalesce(sum(s.refunded_amount_minor), 0)::bigint AS refunded_amount_minor,
      coalesce(sum(s.net_amount_minor), 0)::bigint AS net_revenue_minor
    FROM public.author_canonical_sales_base(p_author_id, false, true) AS s
    WHERE (p_from IS NULL OR s.paid_at >= p_from)
      AND (p_to IS NULL OR s.paid_at < p_to)
    GROUP BY s.practice_id
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_slug', ap.slug,
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
      'gross_purchases', coalesce(pu.gross_purchases, 0),
      'refund_sales', coalesce(pu.refund_sales, 0),
      'net_sales', coalesce(pu.net_sales, 0),
      'full_refunds', coalesce(pu.full_refunds, 0),
      'partial_refunds', coalesce(pu.partial_refunds, 0),
      'gross_revenue_minor', coalesce(pu.gross_revenue_minor, 0),
      'refunded_amount_minor', coalesce(pu.refunded_amount_minor, 0),
      'net_revenue_minor', coalesce(pu.net_revenue_minor, 0),
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

COMMIT;

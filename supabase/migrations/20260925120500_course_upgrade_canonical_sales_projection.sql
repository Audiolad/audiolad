BEGIN;

-- Replace the canonical sales projection filter so paid course_upgrade
-- orders count as sales even when user_practices.access_source is not
-- purchase. product_purchase semantics stay on access_source='purchase'.
-- Does not rewrite entitlement origin. Signature unchanged.

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
      o.order_kind,
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
    WHERE public.canonical_sale_has_paid_access(
      order_kind,
      user_id,
      practice_id
    )
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
  'audiolad:canonical-sales; author-scoped canonical sales projection. course_upgrade counts from the paid transaction; product_purchase still requires access_source=purchase. No buyer email/phone/ids.';

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
    'order_kind', v_order.order_kind,
    'payment_id', v_payment.id,
    'payment_status', v_payment.status,
    'has_purchase_access', v_access,
    'canonical_sale', public.canonical_sale_qualifies(v_order.id),
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

COMMENT ON FUNCTION public.admin_canonical_sale_diagnostic(uuid) IS
  'audiolad:canonical-sales; admin diagnostic. has_purchase_access remains the raw purchase-row flag. canonical_sale uses order/payment semantics for course_upgrade.';

COMMIT;

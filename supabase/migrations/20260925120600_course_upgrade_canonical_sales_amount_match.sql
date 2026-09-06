BEGIN;

-- Tighten author_canonical_sales_base payment selection so it matches
-- canonical_sale_qualifies money/currency invariant. Copy of 20500 body
-- with the LATERAL payment predicate only. Does not rewrite access_source
-- or product_purchase semantics.

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
        AND p.amount_minor = o.amount_minor
        AND p.currency = o.currency
        AND p.currency = 'RUB'
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
  'audiolad:canonical-sales; author-scoped canonical sales projection. course_upgrade counts from the paid transaction; product_purchase still requires access_source=purchase. Succeeded payment must match order amount/currency and RUB, same as canonical_sale_qualifies. No buyer email/phone/ids.';

COMMIT;

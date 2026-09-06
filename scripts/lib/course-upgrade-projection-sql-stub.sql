-- Isolated helpers/tables so author_canonical_sales_base can compile.
-- Never apply to production.

CREATE TABLE IF NOT EXISTS public.author_historical_sale_exceptions (
  order_id uuid PRIMARY KEY,
  author_id uuid NOT NULL,
  exception_code text NOT NULL DEFAULT 'owner_historical_sale',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  full_name text NULL
);

CREATE TABLE IF NOT EXISTS public.author_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NULL,
  entry_type text NOT NULL,
  amount_minor bigint NOT NULL DEFAULT 0,
  author_share_bps integer NULL,
  hold_days integer NULL,
  available_at timestamptz NULL,
  gross_basis_minor bigint NULL,
  net_basis_minor bigint NULL
);

CREATE TABLE IF NOT EXISTS public.author_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS public.author_payout_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.author_payouts (id),
  ledger_entry_id uuid NOT NULL
);

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

CREATE OR REPLACE FUNCTION public.canonical_sale_buyer_name_parts(
  p_full_name text
)
RETURNS TABLE (
  first_name text,
  last_name text
)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULL::text, NULL::text;
$$;

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
    ELSE p_amount_state
  END;
$$;

CREATE OR REPLACE FUNCTION public.author_share_minor(
  p_gross_minor bigint,
  p_author_share_bps integer
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (coalesce(p_gross_minor, 0) * coalesce(p_author_share_bps, 0)) / 10000;
$$;

CREATE OR REPLACE FUNCTION public.payment_refund_settlement_snapshot(
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object('confirmed_refunded_minor', 0);
$$;

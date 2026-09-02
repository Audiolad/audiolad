-- Author appreciation Stage 3A: isolated GetCourse payment-intent records.
-- This migration intentionally does not touch orders, payments, entitlement,
-- finance ledger, obligations, commissions, or payouts.
-- DO NOT apply to production without explicit approval.

BEGIN;

CREATE TABLE IF NOT EXISTS public.author_appreciation_payment_intents (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE RESTRICT,
  practice_id uuid NULL REFERENCES public.practices(id) ON DELETE SET NULL,
  surface text NOT NULL CHECK (surface IN ('author', 'product')),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency = 'RUB'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'needs_review', 'failed')),
  provider text NOT NULL DEFAULT 'getcourse' CHECK (provider = 'getcourse'),
  provider_deal_id text NULL,
  provider_deal_number text NULL,
  local_deal_number text NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS author_appreciation_payment_intents_provider_deal_id_key
  ON public.author_appreciation_payment_intents(provider_deal_id)
  WHERE provider_deal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS author_appreciation_payment_intents_provider_deal_number_key
  ON public.author_appreciation_payment_intents(provider_deal_number)
  WHERE provider_deal_number IS NOT NULL;

COMMENT ON TABLE public.author_appreciation_payment_intents IS
  'Isolated Stage 3A GetCourse appreciation intents. A paid intent is a provider fact only: it creates no order, payment, entitlement, ledger, obligation, commission, or payout.';

ALTER TABLE public.author_appreciation_payment_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.author_appreciation_payment_intents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.author_appreciation_payment_intents TO service_role;

CREATE OR REPLACE FUNCTION public.apply_author_appreciation_getcourse_callback(
  p_provider_deal_id text,
  p_provider_deal_number text,
  p_offer_id text,
  p_amount_minor bigint,
  p_status text,
  p_payed_money_minor bigint,
  p_left_cost_money_minor bigint
)
RETURNS TABLE(outcome text, intent_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.author_appreciation_payment_intents%ROWTYPE;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.author_appreciation_payment_intents
  WHERE provider = 'getcourse'
    AND (
      (p_provider_deal_id IS NOT NULL AND provider_deal_id = p_provider_deal_id)
      OR (p_provider_deal_number IS NOT NULL AND (
        provider_deal_number = p_provider_deal_number OR local_deal_number = p_provider_deal_number
      ))
    );

  IF v_count = 0 THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_count <> 1 THEN
    UPDATE public.author_appreciation_payment_intents
    SET status = CASE WHEN status = 'pending' THEN 'needs_review' ELSE status END,
        updated_at = now()
    WHERE provider = 'getcourse'
      AND (
        (p_provider_deal_id IS NOT NULL AND provider_deal_id = p_provider_deal_id)
        OR (p_provider_deal_number IS NOT NULL AND (
          provider_deal_number = p_provider_deal_number OR local_deal_number = p_provider_deal_number
        ))
      );
    RETURN QUERY SELECT 'needs_review'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_intent
  FROM public.author_appreciation_payment_intents
  WHERE provider = 'getcourse'
    AND (
      (p_provider_deal_id IS NOT NULL AND provider_deal_id = p_provider_deal_id)
      OR (p_provider_deal_number IS NOT NULL AND (
        provider_deal_number = p_provider_deal_number OR local_deal_number = p_provider_deal_number
      ))
    )
  FOR UPDATE;

  IF v_intent.status = 'paid' THEN
    RETURN QUERY SELECT 'already_paid'::text, v_intent.id;
    RETURN;
  END IF;

  IF v_intent.status <> 'pending'
    OR p_status <> 'payed'
    OR p_offer_id IS NULL
    OR p_amount_minor IS NULL
    OR (p_payed_money_minor IS NOT NULL AND p_payed_money_minor < p_amount_minor)
    OR (p_left_cost_money_minor IS NOT NULL AND p_left_cost_money_minor > 0)
    OR v_intent.amount_minor <> p_amount_minor
    OR COALESCE(v_intent.provider_metadata->>'offer_id', '') <> p_offer_id
  THEN
    UPDATE public.author_appreciation_payment_intents
    SET status = CASE WHEN status = 'pending' THEN 'needs_review' ELSE status END,
        updated_at = now()
    WHERE id = v_intent.id;
    RETURN QUERY SELECT 'needs_review'::text, v_intent.id;
    RETURN;
  END IF;

  UPDATE public.author_appreciation_payment_intents
  SET status = 'paid', paid_at = now(), updated_at = now()
  WHERE id = v_intent.id AND status = 'pending';
  RETURN QUERY SELECT 'paid'::text, v_intent.id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_author_appreciation_getcourse_callback(text, text, text, bigint, text, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_author_appreciation_getcourse_callback(text, text, text, bigint, text, bigint, bigint)
  TO service_role;

COMMIT;

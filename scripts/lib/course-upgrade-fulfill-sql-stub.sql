-- Isolated extras so fulfill_tochka_payment_transactional can compile
-- and execute. Applied after the course-upgrade checkout stub.
-- Never apply to production.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_reason text NULL;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payment_id text NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  failed_at timestamptz NULL,
  refunded_at timestamptz NULL,
  is_test boolean NOT NULL DEFAULT false,
  test_reason text NULL,
  CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'succeeded', 'cancelled', 'failed', 'refunded')),
  CONSTRAINT payments_succeeded_confirmed_at_check
    CHECK (status <> 'succeeded' OR confirmed_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_unique_idx
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  dedup_key text NOT NULL,
  provider_event_id text NULL,
  provider_payment_id text NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_verified boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'received',
  processed_at timestamptz NULL,
  processing_attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  review_reason text NULL,
  payment_id uuid NULL REFERENCES public.payments (id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_provider_check
    CHECK (provider IN ('tochka')),
  CONSTRAINT payment_webhook_events_processing_status_check
    CHECK (processing_status IN (
      'received',
      'processed',
      'duplicate',
      'ignored',
      'requires_review',
      'failed'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_dedup_key_uidx
  ON public.payment_webhook_events (provider, dedup_key);

CREATE OR REPLACE FUNCTION public.payment_is_test_from_row(
  p_provider_payment_id text,
  p_provider_metadata jsonb,
  p_existing_is_test boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_existing_is_test, false)
    OR coalesce((p_provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
    OR (p_provider_payment_id IS NOT NULL AND p_provider_payment_id LIKE 'e2e-%');
$$;

CREATE TABLE IF NOT EXISTS public.finance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  author_id uuid NULL,
  status text NOT NULL DEFAULT 'pending',
  result_code text NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_type, subject_id)
);

CREATE OR REPLACE FUNCTION public.enqueue_finance_obligation(
  p_obligation_type text,
  p_subject_type text,
  p_subject_id uuid,
  p_author_id uuid,
  p_is_test boolean,
  p_correlation_id text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.finance_obligations (
    obligation_type,
    subject_type,
    subject_id,
    author_id,
    is_test
  )
  VALUES (
    p_obligation_type,
    p_subject_type,
    p_subject_id,
    p_author_id,
    coalesce(p_is_test, false)
  )
  ON CONFLICT (obligation_type, subject_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_obligation_on_payment_succeeded()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  SELECT o.author_id_snapshot
  INTO v_author_id
  FROM public.orders AS o
  WHERE o.id = NEW.order_id;

  PERFORM public.enqueue_finance_obligation(
    'payment_succeeded_accrual',
    'payment',
    NEW.id,
    v_author_id,
    NEW.is_test,
    NULL,
    jsonb_build_object('order_id', NEW.order_id)
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS finance_obligation_on_payment_succeeded_trg
  ON public.payments;
CREATE TRIGGER finance_obligation_on_payment_succeeded_trg
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'succeeded' AND NEW.confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.finance_obligation_on_payment_succeeded();

CREATE TABLE IF NOT EXISTS public.author_sale_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  recipient_email text NOT NULL DEFAULT 'author@example.test',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON TABLE public.payments TO service_role;
GRANT ALL ON TABLE public.payment_webhook_events TO service_role;
GRANT ALL ON TABLE public.finance_obligations TO service_role;
GRANT ALL ON TABLE public.author_sale_email_outbox TO service_role;

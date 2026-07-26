BEGIN;

-- ---------------------------------------------------------------------------
-- Payments P3.3.2: author entitlement ledger
--
-- Goals:
--   * versioned commercial terms per author (approved terms are immutable)
--   * append-only author ledger: every kopek an author earned or lost
--   * an outbox (finance_obligations) so a missing/ambiguous terms row can
--     never block a buyer's payment or access
--   * cumulative refund reversal that converges to the correct net entitlement
--     regardless of the order in which refunds are processed
--
-- Does NOT: payouts, payout batches, bank details, provider fees, taxes,
-- per-product overrides, historical backfill, author-facing UI.
--
-- Money model (important):
--   There is no mutable authors.balance. An author's position is always
--   derived from the ledger:
--     net entitlement = sum(author_ledger_entries.amount_minor)
--     held            = net of payment groups whose sale accrual is still
--                       inside its hold window (available_at > now())
--     payable         = net entitlement - held
--   Holds are evaluated per payment, not per entry, so a refund reversal
--   always lands in the same bucket as the sale it reverses.
--
-- Payout eligibility (important):
--   authors.payout_eligible defaults to false and stays false for every
--   existing author. access_status = 'commercial' alone does NOT make an
--   author payable: the current commercial catalog is platform-owned.
--   Enabling payouts is an explicit admin action plus approved terms.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Author payout eligibility flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS payout_eligible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.authors.payout_eligible IS
  'audiolad:payments-p332; explicit admin decision that this author is an external payee. NEVER inferred from access_status: the current access_status=commercial catalog is platform-owned. Accrual also requires exactly one approved author_commercial_terms row.';

CREATE INDEX IF NOT EXISTS authors_payout_eligible_idx
  ON public.authors (payout_eligible)
  WHERE payout_eligible = true;

-- ---------------------------------------------------------------------------
-- 2. Versioned commercial terms
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id)
    ON DELETE RESTRICT,

  currency text NOT NULL DEFAULT 'RUB',
  author_share_bps integer NOT NULL,
  platform_fee_bps integer NOT NULL,
  hold_days integer NOT NULL DEFAULT 14,

  provider_fee_policy text NOT NULL DEFAULT 'platform_absorbs',
  refund_policy text NOT NULL DEFAULT 'proportional_reversal',
  rounding_policy text NOT NULL DEFAULT 'floor_author_remainder_platform',
  calculation_version text NOT NULL DEFAULT 'p332.v1',

  status text NOT NULL DEFAULT 'draft',

  valid_from timestamptz NOT NULL,
  valid_to timestamptz NULL,

  notes text NULL,

  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  superseded_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  closed_reason text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_commercial_terms_share_bps_check
    CHECK (author_share_bps >= 0 AND author_share_bps <= 10000),

  CONSTRAINT author_commercial_terms_platform_fee_bps_check
    CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 10000),

  CONSTRAINT author_commercial_terms_bps_sum_check
    CHECK (author_share_bps + platform_fee_bps = 10000),

  CONSTRAINT author_commercial_terms_hold_days_check
    CHECK (hold_days >= 0 AND hold_days <= 365),

  CONSTRAINT author_commercial_terms_currency_check
    CHECK (currency = 'RUB'),

  CONSTRAINT author_commercial_terms_status_check
    CHECK (status IN ('draft', 'approved', 'superseded', 'cancelled')),

  CONSTRAINT author_commercial_terms_provider_fee_policy_check
    CHECK (provider_fee_policy IN ('platform_absorbs')),

  CONSTRAINT author_commercial_terms_refund_policy_check
    CHECK (refund_policy IN ('proportional_reversal')),

  CONSTRAINT author_commercial_terms_rounding_policy_check
    CHECK (rounding_policy IN ('floor_author_remainder_platform')),

  CONSTRAINT author_commercial_terms_validity_check
    CHECK (valid_to IS NULL OR valid_to > valid_from),

  CONSTRAINT author_commercial_terms_approved_fields_check
    CHECK (status <> 'approved' OR approved_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS author_commercial_terms_author_idx
  ON public.author_commercial_terms (author_id, valid_from DESC);

CREATE INDEX IF NOT EXISTS author_commercial_terms_active_idx
  ON public.author_commercial_terms (author_id, currency, valid_from, valid_to)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS author_commercial_terms_status_idx
  ON public.author_commercial_terms (status, created_at DESC);

COMMENT ON TABLE public.author_commercial_terms IS
  'audiolad:payments-p332; versioned author commission terms. Approved rows are immutable except a controlled valid_to close / status supersede through the P3.3.2 RPCs.';

COMMENT ON COLUMN public.author_commercial_terms.author_share_bps IS
  'Author share in basis points of payment.amount_minor. 10000 = 100%.';

COMMENT ON COLUMN public.author_commercial_terms.hold_days IS
  'Days after payment.confirmed_at before a sale accrual becomes payable.';

COMMENT ON COLUMN public.author_commercial_terms.refund_policy IS
  'proportional_reversal: author position recomputed from payment amount minus cumulative succeeded refunds using original sale bps.';

COMMENT ON COLUMN public.author_commercial_terms.rounding_policy IS
  'floor_author_remainder_platform: floor(base * author_share_bps / 10000); remainder stays with the platform.';

ALTER TABLE public.author_commercial_terms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_commercial_terms FROM PUBLIC;
REVOKE ALL ON TABLE public.author_commercial_terms FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.author_commercial_terms TO service_role;

-- Per-author overlap guard for approved periods. The advisory lock serializes
-- concurrent approvals of the same author so the check cannot be raced.
CREATE OR REPLACE FUNCTION public.author_commercial_terms_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conflicts integer;
BEGIN
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('audiolad.author_commercial_terms:' || NEW.author_id::text || ':' || NEW.currency)
  );

  SELECT count(*)::integer
  INTO v_conflicts
  FROM public.author_commercial_terms AS t
  WHERE t.author_id = NEW.author_id
    AND t.currency = NEW.currency
    AND t.status = 'approved'
    AND t.id <> NEW.id
    AND tstzrange(t.valid_from, t.valid_to, '[)')
        && tstzrange(NEW.valid_from, NEW.valid_to, '[)');

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'author_commercial_terms_overlap' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.author_commercial_terms_no_overlap IS
  'audiolad:payments-p332; rejects a second approved terms period overlapping the same author+currency window.';

DROP TRIGGER IF EXISTS author_commercial_terms_no_overlap_trg
  ON public.author_commercial_terms;

CREATE TRIGGER author_commercial_terms_no_overlap_trg
  BEFORE INSERT OR UPDATE ON public.author_commercial_terms
  FOR EACH ROW
  EXECUTE FUNCTION public.author_commercial_terms_no_overlap();

-- Approved terms are frozen. Only the P3.3.2 RPCs may close valid_to or move
-- an approved row to superseded/cancelled, and they announce themselves with a
-- transaction-local GUC that no client connection can forge through PostgREST.
CREATE OR REPLACE FUNCTION public.author_commercial_terms_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_via_rpc boolean :=
    coalesce(current_setting('audiolad.finance_terms_mutation', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION 'author_commercial_terms_approved_immutable'
        USING ERRCODE = '0A000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.author_share_bps IS DISTINCT FROM OLD.author_share_bps
     OR NEW.platform_fee_bps IS DISTINCT FROM OLD.platform_fee_bps
     OR NEW.hold_days IS DISTINCT FROM OLD.hold_days
     OR NEW.provider_fee_policy IS DISTINCT FROM OLD.provider_fee_policy
     OR NEW.refund_policy IS DISTINCT FROM OLD.refund_policy
     OR NEW.rounding_policy IS DISTINCT FROM OLD.rounding_policy
     OR NEW.calculation_version IS DISTINCT FROM OLD.calculation_version
     OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'author_commercial_terms_approved_immutable'
      USING ERRCODE = '0A000';
  END IF;

  IF (NEW.valid_to IS DISTINCT FROM OLD.valid_to
      OR NEW.status IS DISTINCT FROM OLD.status)
     AND NOT v_via_rpc THEN
    RAISE EXCEPTION 'author_commercial_terms_rpc_required'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('superseded', 'cancelled') THEN
    RAISE EXCEPTION 'author_commercial_terms_invalid_status_transition'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.author_commercial_terms_immutability IS
  'audiolad:payments-p332; freezes approved commercial terms; only the P3.3.2 RPCs may close valid_to or supersede/cancel.';

DROP TRIGGER IF EXISTS author_commercial_terms_immutability_trg
  ON public.author_commercial_terms;

CREATE TRIGGER author_commercial_terms_immutability_trg
  BEFORE UPDATE OR DELETE ON public.author_commercial_terms
  FOR EACH ROW
  EXECUTE FUNCTION public.author_commercial_terms_immutability();

-- ---------------------------------------------------------------------------
-- 3. Append-only author ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id)
    ON DELETE RESTRICT,

  entry_type text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',

  payment_id uuid NULL
    REFERENCES public.payments (id)
    ON DELETE RESTRICT,
  refund_id uuid NULL
    REFERENCES public.payment_refunds (id)
    ON DELETE RESTRICT,
  order_id uuid NULL
    REFERENCES public.orders (id)
    ON DELETE RESTRICT,
  practice_id uuid NULL,
  terms_id uuid NULL
    REFERENCES public.author_commercial_terms (id)
    ON DELETE RESTRICT,

  author_share_bps integer NULL,
  hold_days integer NULL,
  gross_basis_minor bigint NULL,
  net_basis_minor bigint NULL,

  effective_at timestamptz NOT NULL,
  available_at timestamptz NULL,

  calculation_version text NOT NULL DEFAULT 'p332.v1',
  idempotency_key text NOT NULL,
  correlation_id text NULL,

  reason_code text NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,

  is_test boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_ledger_entries_entry_type_check
    CHECK (entry_type IN (
      'sale_accrual',
      'refund_reversal',
      'manual_credit',
      'manual_debit',
      'correction',
      'chargeback_reversal',
      'payout',
      'payout_reversal'
    )),

  CONSTRAINT author_ledger_entries_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),

  CONSTRAINT author_ledger_entries_sign_check
    CHECK (
      (entry_type = 'sale_accrual' AND amount_minor > 0)
      OR (entry_type = 'refund_reversal' AND amount_minor < 0)
      OR (entry_type = 'manual_credit' AND amount_minor > 0)
      OR (entry_type = 'manual_debit' AND amount_minor < 0)
      OR (entry_type = 'correction' AND amount_minor <> 0)
      OR (entry_type = 'chargeback_reversal' AND amount_minor < 0)
      OR (entry_type = 'payout' AND amount_minor < 0)
      OR (entry_type = 'payout_reversal' AND amount_minor > 0)
    ),

  CONSTRAINT author_ledger_entries_sale_links_check
    CHECK (entry_type <> 'sale_accrual' OR (payment_id IS NOT NULL AND terms_id IS NOT NULL)),

  CONSTRAINT author_ledger_entries_reversal_links_check
    CHECK (entry_type <> 'refund_reversal' OR (refund_id IS NOT NULL AND payment_id IS NOT NULL)),

  CONSTRAINT author_ledger_entries_adjustment_links_check
    CHECK (entry_type NOT IN ('manual_credit', 'manual_debit', 'correction') OR reason_code IS NOT NULL),

  CONSTRAINT author_ledger_entries_idempotency_key_check
    CHECK (btrim(idempotency_key) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS author_ledger_entries_idempotency_key_uidx
  ON public.author_ledger_entries (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS author_ledger_entries_sale_accrual_uidx
  ON public.author_ledger_entries (payment_id)
  WHERE entry_type = 'sale_accrual';

CREATE UNIQUE INDEX IF NOT EXISTS author_ledger_entries_refund_reversal_uidx
  ON public.author_ledger_entries (refund_id)
  WHERE entry_type = 'refund_reversal';

CREATE INDEX IF NOT EXISTS author_ledger_entries_author_effective_idx
  ON public.author_ledger_entries (author_id, effective_at DESC);

CREATE INDEX IF NOT EXISTS author_ledger_entries_payment_idx
  ON public.author_ledger_entries (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS author_ledger_entries_refund_idx
  ON public.author_ledger_entries (refund_id)
  WHERE refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS author_ledger_entries_available_at_idx
  ON public.author_ledger_entries (available_at)
  WHERE available_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS author_ledger_entries_effective_at_idx
  ON public.author_ledger_entries (effective_at DESC);

CREATE INDEX IF NOT EXISTS author_ledger_entries_is_test_idx
  ON public.author_ledger_entries (is_test, entry_type);

COMMENT ON TABLE public.author_ledger_entries IS
  'audiolad:payments-p332; append-only author entitlement ledger. UPDATE/DELETE are blocked by trigger: corrections are new manual_credit/manual_debit/correction rows.';

COMMENT ON COLUMN public.author_ledger_entries.amount_minor IS
  'sale_accrual > 0, refund_reversal < 0, manual_credit > 0, manual_debit < 0, correction <> 0. Zero-value outcomes are never written; they are recorded as reconciled obligations instead.';

COMMENT ON COLUMN public.author_ledger_entries.available_at IS
  'Sale accruals only: payment.confirmed_at + terms.hold_days. Until then the payment group counts as held, not payable.';

COMMENT ON COLUMN public.author_ledger_entries.net_basis_minor IS
  'Payment amount minus cumulative succeeded refunds at calculation time; the basis the author position was recomputed from.';

ALTER TABLE public.author_ledger_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_ledger_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.author_ledger_entries FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.author_ledger_entries TO service_role;

CREATE OR REPLACE FUNCTION public.author_ledger_entries_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'author_ledger_entries_append_only' USING ERRCODE = '0A000';
END;
$$;

COMMENT ON FUNCTION public.author_ledger_entries_append_only IS
  'audiolad:payments-p332; rejects every UPDATE/DELETE on the author ledger.';

DROP TRIGGER IF EXISTS author_ledger_entries_append_only_trg
  ON public.author_ledger_entries;

CREATE TRIGGER author_ledger_entries_append_only_trg
  BEFORE UPDATE OR DELETE ON public.author_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.author_ledger_entries_append_only();

-- ---------------------------------------------------------------------------
-- 4. Outbox: finance obligations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  obligation_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,

  author_id uuid NULL
    REFERENCES public.authors (id)
    ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),

  result_code text NULL,
  last_error text NULL,
  ledger_entry_id uuid NULL
    REFERENCES public.author_ledger_entries (id)
    ON DELETE SET NULL,

  correlation_id text NULL,
  is_test boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_obligations_type_check
    CHECK (obligation_type IN (
      'payment_succeeded_accrual',
      'refund_succeeded_reversal'
    )),

  CONSTRAINT finance_obligations_subject_type_check
    CHECK (subject_type IN ('payment', 'payment_refund')),

  CONSTRAINT finance_obligations_status_check
    CHECK (status IN (
      'pending',
      'processed',
      'skipped',
      'requires_review',
      'failed'
    )),

  CONSTRAINT finance_obligations_attempts_check
    CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_obligations_subject_uidx
  ON public.finance_obligations (obligation_type, subject_id);

CREATE INDEX IF NOT EXISTS finance_obligations_due_idx
  ON public.finance_obligations (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS finance_obligations_subject_idx
  ON public.finance_obligations (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS finance_obligations_author_idx
  ON public.finance_obligations (author_id, created_at DESC)
  WHERE author_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_obligations_status_created_idx
  ON public.finance_obligations (status, created_at DESC);

COMMENT ON TABLE public.finance_obligations IS
  'audiolad:payments-p332; outbox enqueued in the same transaction as the commerce fact and drained separately, so terms/ledger problems never block payment or access.';

COMMENT ON COLUMN public.finance_obligations.status IS
  'pending = queued; processed = ledger written; skipped = deliberately no ledger row (platform-owned author, zero amount, test); requires_review = human decision needed (missing author snapshot, no/ambiguous terms); failed = transient error, retried.';

ALTER TABLE public.finance_obligations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.finance_obligations FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_obligations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_obligations TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Outbox enqueue (non-fatal by construction)
--
-- The enqueue runs inside the commerce transaction so an obligation can never
-- be lost, but its whole body sits in a PL/pgSQL subtransaction: any failure
-- rolls back only the obligation insert, never the payment, the refund or the
-- entitlement grant.
-- ---------------------------------------------------------------------------

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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.finance_obligations (
    obligation_type,
    subject_type,
    subject_id,
    author_id,
    is_test,
    correlation_id,
    payload
  )
  VALUES (
    p_obligation_type,
    p_subject_type,
    p_subject_id,
    p_author_id,
    coalesce(p_is_test, false),
    nullif(btrim(coalesce(p_correlation_id, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (obligation_type, subject_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Money and access win over bookkeeping: the repair path re-enqueues.
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_finance_obligation(
  text, text, uuid, uuid, boolean, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_finance_obligation(
  text, text, uuid, uuid, boolean, text, jsonb
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_finance_obligation(
  text, text, uuid, uuid, boolean, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.enqueue_finance_obligation IS
  'audiolad:payments-p332; idempotent outbox insert that swallows its own failures so it can never roll back a commerce transaction.';

CREATE OR REPLACE FUNCTION public.finance_obligation_on_payment_succeeded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    jsonb_build_object(
      'order_id', NEW.order_id,
      'amount_minor', NEW.amount_minor,
      'currency', NEW.currency,
      'confirmed_at', NEW.confirmed_at
    )
  );

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.finance_obligation_on_payment_succeeded IS
  'audiolad:payments-p332; enqueues a sale accrual obligation whenever a payment is (or stays) succeeded; never fails the fulfill transaction.';

DROP TRIGGER IF EXISTS finance_obligation_on_payment_succeeded_trg
  ON public.payments;

CREATE TRIGGER finance_obligation_on_payment_succeeded_trg
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'succeeded' AND NEW.confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.finance_obligation_on_payment_succeeded();

CREATE OR REPLACE FUNCTION public.finance_obligation_on_refund_succeeded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  SELECT o.author_id_snapshot
  INTO v_author_id
  FROM public.orders AS o
  WHERE o.id = NEW.order_id;

  PERFORM public.enqueue_finance_obligation(
    'refund_succeeded_reversal',
    'payment_refund',
    NEW.id,
    v_author_id,
    NEW.is_test,
    NULL,
    jsonb_build_object(
      'payment_id', NEW.payment_id,
      'order_id', NEW.order_id,
      'amount_minor', NEW.amount_minor,
      'currency', NEW.currency,
      'confirmed_at', NEW.confirmed_at
    )
  );

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.finance_obligation_on_refund_succeeded IS
  'audiolad:payments-p332; enqueues a reversal obligation on the first (and every replayed) succeeded refund; never fails the refund transaction.';

DROP TRIGGER IF EXISTS finance_obligation_on_refund_succeeded_trg
  ON public.payment_refunds;

CREATE TRIGGER finance_obligation_on_refund_succeeded_trg
  AFTER INSERT OR UPDATE ON public.payment_refunds
  FOR EACH ROW
  WHEN (NEW.status = 'succeeded' AND NEW.confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.finance_obligation_on_refund_succeeded();

-- ---------------------------------------------------------------------------
-- 6. Pure money helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_share_minor(
  p_basis_minor bigint,
  p_share_bps integer
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  -- floor() in integer kopeks: both operands are non-negative, so bigint
  -- division (truncation toward zero) is the floor. No float ever touches money.
  SELECT CASE
    WHEN p_basis_minor IS NULL OR p_share_bps IS NULL THEN 0::bigint
    WHEN p_basis_minor <= 0 OR p_share_bps <= 0 THEN 0::bigint
    ELSE (p_basis_minor * p_share_bps::bigint) / 10000::bigint
  END;
$$;

COMMENT ON FUNCTION public.author_share_minor IS
  'audiolad:payments-p332; floor(basis * bps / 10000) in integer kopeks. Remainder stays with the platform.';

CREATE OR REPLACE FUNCTION public.resolve_author_commercial_terms(
  p_author_id uuid,
  p_at_time timestamptz,
  p_currency text DEFAULT 'RUB'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_currency text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'RUB'));
  v_match_count integer := 0;
  v_terms public.author_commercial_terms%ROWTYPE;
BEGIN
  IF p_author_id IS NULL OR p_at_time IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'reason', 'invalid_arguments',
      'match_count', 0
    );
  END IF;

  SELECT count(*)::integer
  INTO v_match_count
  FROM public.author_commercial_terms AS t
  WHERE t.author_id = p_author_id
    AND t.currency = v_currency
    AND t.status = 'approved'
    AND t.valid_from <= p_at_time
    AND (t.valid_to IS NULL OR p_at_time < t.valid_to);

  IF v_match_count = 0 THEN
    RETURN jsonb_build_object(
      'found', false,
      'reason', 'no_active_terms',
      'match_count', 0,
      'currency', v_currency
    );
  END IF;

  IF v_match_count > 1 THEN
    RETURN jsonb_build_object(
      'found', false,
      'reason', 'ambiguous_terms',
      'match_count', v_match_count,
      'currency', v_currency
    );
  END IF;

  SELECT *
  INTO v_terms
  FROM public.author_commercial_terms AS t
  WHERE t.author_id = p_author_id
    AND t.currency = v_currency
    AND t.status = 'approved'
    AND t.valid_from <= p_at_time
    AND (t.valid_to IS NULL OR p_at_time < t.valid_to);

  RETURN jsonb_build_object(
    'found', true,
    'reason', 'ok',
    'match_count', 1,
    'terms_id', v_terms.id,
    'author_id', v_terms.author_id,
    'currency', v_terms.currency,
    'author_share_bps', v_terms.author_share_bps,
    'platform_fee_bps', v_terms.platform_fee_bps,
    'hold_days', v_terms.hold_days,
    'provider_fee_policy', v_terms.provider_fee_policy,
    'refund_policy', v_terms.refund_policy,
    'rounding_policy', v_terms.rounding_policy,
    'calculation_version', v_terms.calculation_version,
    'valid_from', v_terms.valid_from,
    'valid_to', v_terms.valid_to
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_author_commercial_terms(uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_author_commercial_terms(uuid, timestamptz, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_author_commercial_terms(uuid, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.resolve_author_commercial_terms IS
  'audiolad:payments-p332; exactly-one approved terms lookup at a point in time. Zero or many matches never guess a rate; service_role only.';

CREATE OR REPLACE FUNCTION public.author_ledger_entry_row_json(
  p_entry public.author_ledger_entries
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_entry.id,
    'author_id', p_entry.author_id,
    'entry_type', p_entry.entry_type,
    'amount_minor', p_entry.amount_minor,
    'currency', p_entry.currency,
    'payment_id', p_entry.payment_id,
    'refund_id', p_entry.refund_id,
    'order_id', p_entry.order_id,
    'practice_id', p_entry.practice_id,
    'terms_id', p_entry.terms_id,
    'author_share_bps', p_entry.author_share_bps,
    'hold_days', p_entry.hold_days,
    'gross_basis_minor', p_entry.gross_basis_minor,
    'net_basis_minor', p_entry.net_basis_minor,
    'effective_at', p_entry.effective_at,
    'available_at', p_entry.available_at,
    'calculation_version', p_entry.calculation_version,
    'idempotency_key', p_entry.idempotency_key,
    'reason_code', p_entry.reason_code,
    'is_test', p_entry.is_test,
    'created_at', p_entry.created_at
  );
$$;

COMMENT ON FUNCTION public.author_ledger_entry_row_json IS
  'audiolad:payments-p332; safe ledger projection (no buyer identity, no provider secrets).';

-- ---------------------------------------------------------------------------
-- 7. Accrual and reversal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_author_sale_accrual(
  p_payment_id uuid,
  p_correlation_id text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_author public.authors%ROWTYPE;
  v_existing public.author_ledger_entries%ROWTYPE;
  v_entry public.author_ledger_entries%ROWTYPE;
  v_terms jsonb;
  v_bps integer;
  v_hold_days integer;
  v_amount bigint;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'payment_not_found'
    );
  END IF;

  -- Replay: the ledger already carries this sale.
  SELECT *
  INTO v_existing
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id = p_payment_id
    AND e.entry_type = 'sale_accrual';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'result_code', 'accrual_exists',
      'author_id', v_existing.author_id,
      'entry', public.author_ledger_entry_row_json(v_existing)
    );
  END IF;

  IF v_payment.status IS DISTINCT FROM 'succeeded' OR v_payment.confirmed_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'payment_not_succeeded'
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = v_payment.order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'order_not_found'
    );
  END IF;

  -- Attribution is a write-time snapshot. A missing snapshot is a review item,
  -- never a guess from the current practice owner.
  IF v_order.author_id_snapshot IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'author_snapshot_missing',
      'order_id', v_order.id
    );
  END IF;

  SELECT *
  INTO v_author
  FROM public.authors AS a
  WHERE a.id = v_order.author_id_snapshot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'author_not_found',
      'author_id', v_order.author_id_snapshot
    );
  END IF;

  -- Platform-owned catalog: commercial access status alone is not a payout.
  IF NOT v_author.payout_eligible THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'author_not_payout_eligible',
      'author_id', v_author.id
    );
  END IF;

  v_terms := public.resolve_author_commercial_terms(
    v_author.id,
    v_payment.confirmed_at,
    v_payment.currency
  );

  IF (v_terms ->> 'found')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', coalesce(v_terms ->> 'reason', 'no_active_terms'),
      'author_id', v_author.id
    );
  END IF;

  v_bps := (v_terms ->> 'author_share_bps')::integer;
  v_hold_days := (v_terms ->> 'hold_days')::integer;
  v_amount := public.author_share_minor(v_payment.amount_minor, v_bps);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'zero_amount',
      'author_id', v_author.id
    );
  END IF;

  INSERT INTO public.author_ledger_entries (
    author_id,
    entry_type,
    amount_minor,
    currency,
    payment_id,
    order_id,
    practice_id,
    terms_id,
    author_share_bps,
    hold_days,
    gross_basis_minor,
    net_basis_minor,
    effective_at,
    available_at,
    calculation_version,
    idempotency_key,
    correlation_id,
    created_by,
    is_test,
    metadata
  )
  VALUES (
    v_author.id,
    'sale_accrual',
    v_amount,
    v_payment.currency,
    v_payment.id,
    v_order.id,
    v_order.practice_id,
    (v_terms ->> 'terms_id')::uuid,
    v_bps,
    v_hold_days,
    v_payment.amount_minor,
    v_payment.amount_minor,
    v_payment.confirmed_at,
    v_payment.confirmed_at + make_interval(days => v_hold_days),
    coalesce(v_terms ->> 'calculation_version', 'p332.v1'),
    'p332:sale:' || v_payment.id::text,
    nullif(btrim(coalesce(p_correlation_id, '')), ''),
    p_actor_user_id,
    v_payment.is_test,
    jsonb_build_object(
      'terms_valid_from', v_terms -> 'valid_from',
      'terms_valid_to', v_terms -> 'valid_to'
    )
  )
  RETURNING * INTO v_entry;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_sale_accrual_created',
    'author_ledger_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'author_id', v_entry.author_id,
      'payment_id', v_entry.payment_id,
      'amount_minor', v_entry.amount_minor,
      'author_share_bps', v_entry.author_share_bps,
      'gross_basis_minor', v_entry.gross_basis_minor,
      'available_at', v_entry.available_at,
      'is_test', v_entry.is_test
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'created',
    'result_code', 'accrual_created',
    'author_id', v_entry.author_id,
    'entry', public.author_ledger_entry_row_json(v_entry)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_author_sale_accrual(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_author_sale_accrual(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_author_sale_accrual(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_author_sale_accrual IS
  'audiolad:payments-p332; idempotently writes the author sale accrual for a succeeded payment. Requires order.author_id_snapshot, payout_eligible author and exactly one approved terms row; service_role only.';

CREATE OR REPLACE FUNCTION public.ensure_author_refund_reversal(
  p_refund_id uuid,
  p_correlation_id text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_sale public.author_ledger_entries%ROWTYPE;
  v_existing public.author_ledger_entries%ROWTYPE;
  v_entry public.author_ledger_entries%ROWTYPE;
  v_cumulative_refunds bigint;
  v_existing_reversals bigint;
  v_net_basis bigint;
  v_target bigint;
  v_new_reversal bigint;
BEGIN
  IF p_refund_id IS NULL THEN
    RAISE EXCEPTION 'refund_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.payment_refunds AS r
  WHERE r.id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'refund_not_found'
    );
  END IF;

  SELECT *
  INTO v_existing
  FROM public.author_ledger_entries AS e
  WHERE e.refund_id = p_refund_id
    AND e.entry_type = 'refund_reversal';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'result_code', 'reversal_exists',
      'author_id', v_existing.author_id,
      'entry', public.author_ledger_entry_row_json(v_existing)
    );
  END IF;

  IF v_refund.status IS DISTINCT FROM 'succeeded' OR v_refund.confirmed_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'refund_not_succeeded'
    );
  END IF;

  -- Serialize with any concurrent accrual/reversal for the same payment.
  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.id = v_refund.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'payment_not_found'
    );
  END IF;

  SELECT *
  INTO v_sale
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id = v_refund.payment_id
    AND e.entry_type = 'sale_accrual';

  -- No accrual means the platform kept the whole payment: nothing to reverse.
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'no_sale_accrual',
      'payment_id', v_refund.payment_id
    );
  END IF;

  SELECT coalesce(sum(r.amount_minor), 0)::bigint
  INTO v_cumulative_refunds
  FROM public.payment_refunds AS r
  WHERE r.payment_id = v_refund.payment_id
    AND r.status = 'succeeded';

  SELECT coalesce(sum(abs(e.amount_minor)), 0)::bigint
  INTO v_existing_reversals
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id = v_refund.payment_id
    AND e.entry_type = 'refund_reversal';

  -- Cumulative target, not per-refund arithmetic: the author position is
  -- recomputed from what the buyer actually kept paying, so out-of-order or
  -- repeated partial refunds still converge on the same total.
  v_net_basis := greatest(0::bigint, v_sale.gross_basis_minor - v_cumulative_refunds);
  v_target := public.author_share_minor(v_net_basis, v_sale.author_share_bps);
  v_new_reversal := -(v_sale.amount_minor - v_target - v_existing_reversals);

  IF v_new_reversal >= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'already_reconciled',
      'author_id', v_sale.author_id,
      'target_minor', v_target,
      'net_basis_minor', v_net_basis
    );
  END IF;

  INSERT INTO public.author_ledger_entries (
    author_id,
    entry_type,
    amount_minor,
    currency,
    payment_id,
    refund_id,
    order_id,
    practice_id,
    terms_id,
    author_share_bps,
    hold_days,
    gross_basis_minor,
    net_basis_minor,
    effective_at,
    available_at,
    calculation_version,
    idempotency_key,
    correlation_id,
    created_by,
    is_test,
    metadata
  )
  VALUES (
    v_sale.author_id,
    'refund_reversal',
    v_new_reversal,
    v_refund.currency,
    v_refund.payment_id,
    v_refund.id,
    v_refund.order_id,
    v_sale.practice_id,
    v_sale.terms_id,
    v_sale.author_share_bps,
    v_sale.hold_days,
    v_sale.gross_basis_minor,
    v_net_basis,
    v_refund.confirmed_at,
    NULL,
    v_sale.calculation_version,
    'p332:reversal:' || v_refund.id::text,
    nullif(btrim(coalesce(p_correlation_id, '')), ''),
    p_actor_user_id,
    v_refund.is_test,
    jsonb_build_object(
      'cumulative_refunded_minor', v_cumulative_refunds,
      'existing_reversals_minor', v_existing_reversals,
      'target_entitlement_minor', v_target
    )
  )
  RETURNING * INTO v_entry;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_refund_reversal_created',
    'author_ledger_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'author_id', v_entry.author_id,
      'payment_id', v_entry.payment_id,
      'refund_id', v_entry.refund_id,
      'amount_minor', v_entry.amount_minor,
      'target_entitlement_minor', v_target,
      'cumulative_refunded_minor', v_cumulative_refunds,
      'is_test', v_entry.is_test
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'created',
    'result_code', 'reversal_created',
    'author_id', v_entry.author_id,
    'target_minor', v_target,
    'entry', public.author_ledger_entry_row_json(v_entry)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_author_refund_reversal(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_author_refund_reversal(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_author_refund_reversal(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_author_refund_reversal IS
  'audiolad:payments-p332; idempotently reverses an author accrual down to floor((payment - cumulative refunds) * bps / 10000). Zero-delta refunds write no ledger row; service_role only.';

-- ---------------------------------------------------------------------------
-- 8. Outbox processor
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_finance_obligation(
  p_obligation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_obligation public.finance_obligations%ROWTYPE;
  v_result jsonb;
  v_outcome text;
  v_result_code text;
  v_status text;
  v_error text := NULL;
  v_entry_id uuid := NULL;
  v_author_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_obligation_id IS NULL THEN
    RAISE EXCEPTION 'obligation_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_obligation
  FROM public.finance_obligations AS o
  WHERE o.id = p_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'not_found',
      'obligation_id', p_obligation_id
    );
  END IF;

  IF v_obligation.status IN ('processed', 'skipped') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'already_terminal',
      'status', v_obligation.status,
      'result_code', v_obligation.result_code,
      'obligation_id', v_obligation.id
    );
  END IF;

  BEGIN
    IF v_obligation.obligation_type = 'payment_succeeded_accrual' THEN
      v_result := public.ensure_author_sale_accrual(
        v_obligation.subject_id,
        v_obligation.correlation_id,
        NULL
      );
    ELSIF v_obligation.obligation_type = 'refund_succeeded_reversal' THEN
      v_result := public.ensure_author_refund_reversal(
        v_obligation.subject_id,
        v_obligation.correlation_id,
        NULL
      );
    ELSE
      v_result := jsonb_build_object(
        'ok', false,
        'outcome', 'requires_review',
        'result_code', 'unsupported_obligation_type'
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Transient failures stay retryable; the commerce fact is long committed.
      v_result := NULL;
      v_error := left(SQLERRM, 500);
  END;

  IF v_result IS NULL THEN
    UPDATE public.finance_obligations AS o
    SET
      status = 'failed',
      attempts = o.attempts + 1,
      next_retry_at = v_now + make_interval(mins => least(60, power(2, least(o.attempts, 6))::integer)),
      last_error = v_error,
      result_code = 'processor_exception',
      updated_at = v_now
    WHERE o.id = v_obligation.id
    RETURNING * INTO v_obligation;

    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'failed',
      'status', 'failed',
      'result_code', 'processor_exception',
      'attempts', v_obligation.attempts,
      'obligation_id', v_obligation.id
    );
  END IF;

  v_outcome := coalesce(v_result ->> 'outcome', 'requires_review');
  v_result_code := coalesce(v_result ->> 'result_code', v_outcome);
  v_author_id := nullif(v_result ->> 'author_id', '')::uuid;
  v_entry_id := nullif(v_result #>> '{entry,id}', '')::uuid;

  v_status := CASE
    WHEN v_outcome IN ('created', 'idempotent_replay') THEN 'processed'
    WHEN v_outcome = 'skipped' THEN 'skipped'
    ELSE 'requires_review'
  END;

  UPDATE public.finance_obligations AS o
  SET
    status = v_status,
    attempts = o.attempts + 1,
    author_id = coalesce(v_author_id, o.author_id),
    ledger_entry_id = coalesce(v_entry_id, o.ledger_entry_id),
    result_code = v_result_code,
    last_error = NULL,
    processed_at = CASE
      WHEN v_status IN ('processed', 'skipped') THEN coalesce(o.processed_at, v_now)
      ELSE o.processed_at
    END,
    next_retry_at = CASE
      WHEN v_status = 'requires_review' THEN v_now + interval '1 hour'
      ELSE o.next_retry_at
    END,
    updated_at = v_now
  WHERE o.id = v_obligation.id
  RETURNING * INTO v_obligation;

  RETURN jsonb_build_object(
    'ok', v_status <> 'requires_review',
    'outcome', v_outcome,
    'status', v_status,
    'result_code', v_result_code,
    'attempts', v_obligation.attempts,
    'obligation_id', v_obligation.id,
    'ledger_entry_id', v_entry_id,
    'author_id', v_obligation.author_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_finance_obligation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_finance_obligation(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_finance_obligation(uuid) TO service_role;

COMMENT ON FUNCTION public.process_finance_obligation IS
  'audiolad:payments-p332; drains one outbox row into the ledger. processed/skipped are terminal, requires_review parks for a human, failures back off; service_role only.';

CREATE OR REPLACE FUNCTION public.process_due_finance_obligations(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 500));
  v_id uuid;
  v_result jsonb;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_review integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
BEGIN
  FOR v_id IN
    SELECT o.id
    FROM public.finance_obligations AS o
    WHERE o.status IN ('pending', 'failed')
      AND o.next_retry_at <= now()
    ORDER BY o.next_retry_at, o.created_at
    LIMIT v_limit
  LOOP
    v_result := public.process_finance_obligation(v_id);
    v_total := v_total + 1;

    CASE coalesce(v_result ->> 'status', 'failed')
      WHEN 'processed' THEN v_processed := v_processed + 1;
      WHEN 'skipped' THEN v_skipped := v_skipped + 1;
      WHEN 'requires_review' THEN v_review := v_review + 1;
      ELSE v_failed := v_failed + 1;
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'attempted', v_total,
    'processed', v_processed,
    'skipped', v_skipped,
    'requires_review', v_review,
    'failed', v_failed,
    'limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_finance_obligations(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_due_finance_obligations(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_finance_obligations(integer) TO service_role;

COMMENT ON FUNCTION public.process_due_finance_obligations IS
  'audiolad:payments-p332; batch drain of due outbox rows for the repair hook and ops; service_role only.';

-- ---------------------------------------------------------------------------
-- 9. Terms administration RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_author_commercial_terms_draft(
  p_author_id uuid,
  p_author_share_bps integer,
  p_valid_from timestamptz,
  p_valid_to timestamptz DEFAULT NULL,
  p_hold_days integer DEFAULT 14,
  p_currency text DEFAULT 'RUB',
  p_notes text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_approve_immediately boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terms public.author_commercial_terms%ROWTYPE;
  v_currency text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'RUB'));
  v_valid_from timestamptz := coalesce(p_valid_from, now());
  v_approve boolean := coalesce(p_approve_immediately, false);
  v_now timestamptz := now();
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF p_author_share_bps IS NULL OR p_author_share_bps < 0 OR p_author_share_bps > 10000 THEN
    RAISE EXCEPTION 'invalid_author_share_bps' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_hold_days, 14) < 0 OR coalesce(p_hold_days, 14) > 365 THEN
    RAISE EXCEPTION 'invalid_hold_days' USING ERRCODE = '22023';
  END IF;

  IF p_valid_to IS NOT NULL AND p_valid_to <= v_valid_from THEN
    RAISE EXCEPTION 'invalid_validity_window' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.authors AS a WHERE a.id = p_author_id) THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.author_commercial_terms (
    author_id,
    currency,
    author_share_bps,
    platform_fee_bps,
    hold_days,
    provider_fee_policy,
    refund_policy,
    rounding_policy,
    status,
    valid_from,
    valid_to,
    notes,
    created_by,
    approved_by,
    approved_at
  )
  VALUES (
    p_author_id,
    v_currency,
    p_author_share_bps,
    10000 - p_author_share_bps,
    coalesce(p_hold_days, 14),
    'platform_absorbs',
    'proportional_reversal',
    'floor_author_remainder_platform',
    CASE WHEN v_approve THEN 'approved' ELSE 'draft' END,
    v_valid_from,
    p_valid_to,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_actor_user_id,
    CASE WHEN v_approve THEN p_actor_user_id ELSE NULL END,
    CASE WHEN v_approve THEN v_now ELSE NULL END
  )
  RETURNING * INTO v_terms;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    CASE WHEN v_approve THEN 'author_terms_created_approved' ELSE 'author_terms_draft_created' END,
    'author_commercial_terms',
    v_terms.id,
    v_terms.notes,
    jsonb_build_object(
      'author_id', v_terms.author_id,
      'author_share_bps', v_terms.author_share_bps,
      'hold_days', v_terms.hold_days,
      'currency', v_terms.currency,
      'valid_from', v_terms.valid_from,
      'valid_to', v_terms.valid_to,
      'status', v_terms.status
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_terms.status,
    'terms_id', v_terms.id,
    'status', v_terms.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_author_commercial_terms_draft(
  uuid, integer, timestamptz, timestamptz, integer, text, text, uuid, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_author_commercial_terms_draft(
  uuid, integer, timestamptz, timestamptz, integer, text, text, uuid, text, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_author_commercial_terms_draft(
  uuid, integer, timestamptz, timestamptz, integer, text, text, uuid, text, boolean
) TO service_role;

COMMENT ON FUNCTION public.create_author_commercial_terms_draft IS
  'audiolad:payments-p332; creates draft terms, or approved terms directly when owner/finance opts in; overlap-checked; service_role only.';

CREATE OR REPLACE FUNCTION public.approve_author_commercial_terms(
  p_terms_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terms public.author_commercial_terms%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_terms_id IS NULL THEN
    RAISE EXCEPTION 'terms_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_terms
  FROM public.author_commercial_terms AS t
  WHERE t.id = p_terms_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'terms_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_terms.status = 'approved' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'approved',
      'idempotent_replay', true,
      'terms_id', v_terms.id,
      'status', v_terms.status
    );
  END IF;

  IF v_terms.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'invalid_status',
      'error', 'terms_not_draft',
      'terms_id', v_terms.id,
      'status', v_terms.status
    );
  END IF;

  UPDATE public.author_commercial_terms AS t
  SET
    status = 'approved',
    approved_by = p_actor_user_id,
    approved_at = v_now,
    updated_at = v_now
  WHERE t.id = v_terms.id
  RETURNING * INTO v_terms;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_terms_approved',
    'author_commercial_terms',
    v_terms.id,
    NULL,
    jsonb_build_object(
      'author_id', v_terms.author_id,
      'author_share_bps', v_terms.author_share_bps,
      'hold_days', v_terms.hold_days,
      'valid_from', v_terms.valid_from,
      'valid_to', v_terms.valid_to
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'approved',
    'idempotent_replay', false,
    'terms_id', v_terms.id,
    'status', v_terms.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_author_commercial_terms(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_author_commercial_terms(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_author_commercial_terms(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.approve_author_commercial_terms IS
  'audiolad:payments-p332; draft → approved. After this the rate is frozen; service_role only.';

CREATE OR REPLACE FUNCTION public.close_author_commercial_terms(
  p_terms_id uuid,
  p_valid_to timestamptz,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_new_status text DEFAULT 'superseded'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terms public.author_commercial_terms%ROWTYPE;
  v_valid_to timestamptz := coalesce(p_valid_to, now());
  v_new_status text := coalesce(nullif(btrim(coalesce(p_new_status, '')), ''), 'superseded');
  v_now timestamptz := now();
BEGIN
  IF p_terms_id IS NULL THEN
    RAISE EXCEPTION 'terms_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_new_status NOT IN ('superseded', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_close_status' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_terms
  FROM public.author_commercial_terms AS t
  WHERE t.id = p_terms_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'terms_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_terms.status NOT IN ('draft', 'approved') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'already_closed',
      'terms_id', v_terms.id,
      'status', v_terms.status,
      'valid_to', v_terms.valid_to
    );
  END IF;

  IF v_valid_to <= v_terms.valid_from THEN
    RAISE EXCEPTION 'invalid_validity_window' USING ERRCODE = '22023';
  END IF;

  -- Approved rows are frozen; the trigger only lets the RPC through.
  PERFORM set_config('audiolad.finance_terms_mutation', 'on', true);

  UPDATE public.author_commercial_terms AS t
  SET
    valid_to = v_valid_to,
    status = v_new_status,
    superseded_at = CASE WHEN v_new_status = 'superseded' THEN v_now ELSE t.superseded_at END,
    cancelled_at = CASE WHEN v_new_status = 'cancelled' THEN v_now ELSE t.cancelled_at END,
    closed_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    updated_at = v_now
  WHERE t.id = v_terms.id
  RETURNING * INTO v_terms;

  PERFORM set_config('audiolad.finance_terms_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_terms_' || v_new_status,
    'author_commercial_terms',
    v_terms.id,
    v_terms.closed_reason,
    jsonb_build_object(
      'author_id', v_terms.author_id,
      'author_share_bps', v_terms.author_share_bps,
      'valid_from', v_terms.valid_from,
      'valid_to', v_terms.valid_to,
      'status', v_terms.status
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_new_status,
    'terms_id', v_terms.id,
    'status', v_terms.status,
    'valid_to', v_terms.valid_to
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_author_commercial_terms(
  uuid, timestamptz, text, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_author_commercial_terms(
  uuid, timestamptz, text, uuid, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_author_commercial_terms(
  uuid, timestamptz, text, uuid, text, text
) TO service_role;

COMMENT ON FUNCTION public.close_author_commercial_terms IS
  'audiolad:payments-p332; the only way to close valid_to and supersede/cancel approved terms. Already-written ledger entries keep their historic rate; service_role only.';

CREATE OR REPLACE FUNCTION public.create_author_ledger_manual_adjustment(
  p_author_id uuid,
  p_amount_minor bigint,
  p_reason_code text,
  p_idempotency_key text,
  p_notes text DEFAULT NULL,
  p_currency text DEFAULT 'RUB',
  p_effective_at timestamptz DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry public.author_ledger_entries%ROWTYPE;
  v_existing public.author_ledger_entries%ROWTYPE;
  v_currency text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'RUB'));
  v_reason_code text := nullif(btrim(coalesce(p_reason_code, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_reason_code IS NULL THEN
    RAISE EXCEPTION 'reason_code_required' USING ERRCODE = '22023';
  END IF;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor = 0 THEN
    RAISE EXCEPTION 'amount_must_be_nonzero' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.author_ledger_entries AS e
  WHERE e.idempotency_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'entry', public.author_ledger_entry_row_json(v_existing)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.authors AS a WHERE a.id = p_author_id) THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.author_ledger_entries (
    author_id,
    entry_type,
    amount_minor,
    currency,
    effective_at,
    available_at,
    idempotency_key,
    correlation_id,
    reason_code,
    notes,
    created_by
  )
  VALUES (
    p_author_id,
    CASE
      WHEN v_reason_code LIKE 'correction%' THEN 'correction'
      WHEN p_amount_minor > 0 THEN 'manual_credit'
      ELSE 'manual_debit'
    END,
    p_amount_minor,
    v_currency,
    coalesce(p_effective_at, now()),
    coalesce(p_effective_at, now()),
    v_key,
    nullif(btrim(coalesce(p_correlation_id, '')), ''),
    v_reason_code,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_actor_user_id
  )
  RETURNING * INTO v_entry;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_manual_adjustment_created',
    'author_ledger_entry',
    v_entry.id,
    v_reason_code,
    jsonb_build_object(
      'author_id', v_entry.author_id,
      'entry_type', v_entry.entry_type,
      'amount_minor', v_entry.amount_minor,
      'currency', v_entry.currency,
      'effective_at', v_entry.effective_at
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'created',
    'entry', public.author_ledger_entry_row_json(v_entry)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_author_ledger_manual_adjustment(
  uuid, bigint, text, text, text, text, timestamptz, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_author_ledger_manual_adjustment(
  uuid, bigint, text, text, text, text, timestamptz, uuid, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_author_ledger_manual_adjustment(
  uuid, bigint, text, text, text, text, timestamptz, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.create_author_ledger_manual_adjustment IS
  'audiolad:payments-p332; the only correction mechanism for an append-only ledger. Requires a reason code and an idempotency key; service_role only.';

-- ---------------------------------------------------------------------------
-- 10. Balances: held vs payable, computed per payment group
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_ledger_payment_positions(
  p_include_test boolean DEFAULT false
)
RETURNS TABLE (
  author_id uuid,
  payment_id uuid,
  currency text,
  net_minor bigint,
  accrued_minor bigint,
  reversed_minor bigint,
  available_at timestamptz,
  is_held boolean,
  is_test boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.author_id,
    e.payment_id,
    max(e.currency) AS currency,
    sum(e.amount_minor)::bigint AS net_minor,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type = 'sale_accrual'), 0)::bigint
      AS accrued_minor,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type = 'refund_reversal'), 0)::bigint
      AS reversed_minor,
    max(e.available_at) FILTER (WHERE e.entry_type = 'sale_accrual') AS available_at,
    coalesce(
      max(e.available_at) FILTER (WHERE e.entry_type = 'sale_accrual') > now(),
      false
    ) AS is_held,
    bool_or(e.is_test) AS is_test
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id IS NOT NULL
    AND (coalesce(p_include_test, false) OR e.is_test = false)
  GROUP BY e.author_id, e.payment_id;
$$;

REVOKE ALL ON FUNCTION public.author_ledger_payment_positions(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_ledger_payment_positions(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_ledger_payment_positions(boolean) TO service_role;

COMMENT ON FUNCTION public.author_ledger_payment_positions IS
  'audiolad:payments-p332; per-payment author position. Holds are evaluated per payment so a reversal always lands in the same bucket as its sale; service_role only.';

CREATE OR REPLACE FUNCTION public.author_finance_balance(
  p_author_id uuid,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH positions AS (
    SELECT *
    FROM public.author_ledger_payment_positions(p_include_test) AS p
    WHERE p.author_id = p_author_id
  ),
  adjustments AS (
    SELECT coalesce(sum(e.amount_minor), 0)::bigint AS net_minor
    FROM public.author_ledger_entries AS e
    WHERE e.author_id = p_author_id
      AND e.payment_id IS NULL
      AND (coalesce(p_include_test, false) OR e.is_test = false)
  )
  SELECT jsonb_build_object(
    'author_id', p_author_id,
    'currency', 'RUB',
    'include_test', coalesce(p_include_test, false),
    'accrued_minor', (SELECT coalesce(sum(accrued_minor), 0)::bigint FROM positions),
    'reversed_minor', (SELECT coalesce(sum(reversed_minor), 0)::bigint FROM positions),
    'adjustments_minor', (SELECT net_minor FROM adjustments),
    'net_entitlement_minor',
      (SELECT coalesce(sum(net_minor), 0)::bigint FROM positions)
      + (SELECT net_minor FROM adjustments),
    'held_minor',
      (SELECT coalesce(sum(net_minor) FILTER (WHERE is_held), 0)::bigint FROM positions),
    'payable_minor',
      (SELECT coalesce(sum(net_minor) FILTER (WHERE NOT is_held), 0)::bigint FROM positions)
      + (SELECT net_minor FROM adjustments),
    'payment_count', (SELECT count(*)::integer FROM positions),
    'held_payment_count', (SELECT count(*) FILTER (WHERE is_held)::integer FROM positions),
    'paid_out_minor', 0,
    'notes', jsonb_build_object(
      'balance_source', 'derived_from_append_only_ledger',
      'hold_scope', 'per_payment_group',
      'payouts', 'not_connected',
      'provider_fees', 'not_connected',
      'taxes', 'not_connected'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.author_finance_balance(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_balance(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_balance(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.author_finance_balance IS
  'audiolad:payments-p332; derived author balance (net / held / payable). There is no stored balance column by design; service_role only.';

-- ---------------------------------------------------------------------------
-- 11. Admin read models
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_author_finance_p332_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gross_minor bigint;
  v_payment_count integer;
  v_accrued bigint := 0;
  v_reversed bigint := 0;
  v_adjustments bigint := 0;
  v_accrual_count integer := 0;
  v_reversal_count integer := 0;
  v_adjustment_count integer := 0;
  v_eligible_authors integer := 0;
  v_authors_with_terms integer := 0;
  v_authors_with_ledger integer := 0;
  v_held bigint := 0;
  v_payable bigint := 0;
  v_pending_obligations integer := 0;
  v_review_obligations integer := 0;
  v_failed_obligations integer := 0;
  v_skipped_platform integer := 0;
BEGIN
  SELECT count(*)::integer, coalesce(sum(b.amount_minor), 0)::bigint
  INTO v_payment_count, v_gross_minor
  FROM public.admin_payments_p31_payment_base(
    p_from, p_to, coalesce(p_include_test, false), NULL, NULL
  ) AS b;

  SELECT
    coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type = 'sale_accrual'), 0)::bigint,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type = 'refund_reversal'), 0)::bigint,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type IN ('manual_credit', 'manual_debit', 'correction')), 0)::bigint,
    count(*) FILTER (WHERE e.entry_type = 'sale_accrual')::integer,
    count(*) FILTER (WHERE e.entry_type = 'refund_reversal')::integer,
    count(*) FILTER (WHERE e.entry_type IN ('manual_credit', 'manual_debit', 'correction'))::integer,
    count(DISTINCT e.author_id)::integer
  INTO
    v_accrued, v_reversed, v_adjustments,
    v_accrual_count, v_reversal_count, v_adjustment_count,
    v_authors_with_ledger
  FROM public.author_ledger_entries AS e
  WHERE (coalesce(p_include_test, false) OR e.is_test = false)
    AND (p_from IS NULL OR e.effective_at >= p_from)
    AND (p_to IS NULL OR e.effective_at < p_to);

  -- Balances are a position, not a period aggregate: always "as of now".
  SELECT
    coalesce(sum(p.net_minor) FILTER (WHERE p.is_held), 0)::bigint,
    coalesce(sum(p.net_minor) FILTER (WHERE NOT p.is_held), 0)::bigint
  INTO v_held, v_payable
  FROM public.author_ledger_payment_positions(coalesce(p_include_test, false)) AS p;

  v_payable := v_payable + coalesce((
    SELECT sum(e.amount_minor)::bigint
    FROM public.author_ledger_entries AS e
    WHERE e.payment_id IS NULL
      AND (coalesce(p_include_test, false) OR e.is_test = false)
  ), 0);

  SELECT count(*)::integer
  INTO v_eligible_authors
  FROM public.authors AS a
  WHERE a.payout_eligible = true;

  SELECT count(DISTINCT t.author_id)::integer
  INTO v_authors_with_terms
  FROM public.author_commercial_terms AS t
  WHERE t.status = 'approved';

  SELECT
    count(*) FILTER (WHERE o.status = 'pending')::integer,
    count(*) FILTER (WHERE o.status = 'requires_review')::integer,
    count(*) FILTER (WHERE o.status = 'failed')::integer,
    count(*) FILTER (
      WHERE o.status = 'skipped' AND o.result_code = 'author_not_payout_eligible'
    )::integer
  INTO
    v_pending_obligations, v_review_obligations,
    v_failed_obligations, v_skipped_platform
  FROM public.finance_obligations AS o
  WHERE coalesce(p_include_test, false) OR o.is_test = false;

  RETURN jsonb_build_object(
    'currency', 'RUB',
    'include_test', coalesce(p_include_test, false),
    'calculation_version', 'p332.v1',
    'payment_count', v_payment_count,
    'gross_minor', v_gross_minor,
    'accrued_minor', v_accrued,
    'reversed_minor', v_reversed,
    'adjustments_minor', v_adjustments,
    'net_entitlement_minor', v_accrued + v_reversed + v_adjustments,
    'platform_share_minor', v_gross_minor - (v_accrued + v_reversed),
    'accrual_count', v_accrual_count,
    'reversal_count', v_reversal_count,
    'adjustment_count', v_adjustment_count,
    'held_minor', v_held,
    'payable_minor', v_payable,
    'authors_with_ledger', v_authors_with_ledger,
    'payout_eligible_authors', v_eligible_authors,
    'authors_with_approved_terms', v_authors_with_terms,
    'obligations_pending', v_pending_obligations,
    'obligations_requires_review', v_review_obligations,
    'obligations_failed', v_failed_obligations,
    'obligations_skipped_platform_owned', v_skipped_platform,
    'notes', jsonb_build_object(
      'methodology', 'ledger_effective_at_in_period',
      'gross', 'p31_succeeded_confirmed_at_in_period',
      'balances', 'as_of_now_not_period_bound',
      'platform_share', 'gross_minus_author_entitlement_before_fees',
      'provider_fees', 'not_connected',
      'taxes', 'not_connected',
      'payouts', 'not_connected',
      'product_overrides', 'not_implemented'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_finance_p332_summary(
  timestamptz, timestamptz, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_finance_p332_summary(
  timestamptz, timestamptz, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_finance_p332_summary(
  timestamptz, timestamptz, boolean
) TO service_role;

COMMENT ON FUNCTION public.admin_author_finance_p332_summary IS
  'audiolad:payments-analytics:p332; author economy KPIs. Reads P3.1 gross through admin_payments_p31_payment_base and never redefines it; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_author_finance_p332_authors(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_search text DEFAULT NULL,
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
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
BEGIN
  SELECT count(*)::integer
  INTO v_total
  FROM public.authors AS a
  WHERE v_q IS NULL
     OR a.name ILIKE '%' || v_q || '%'
     OR a.slug ILIKE '%' || v_q || '%';

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.net_entitlement_minor DESC, x.name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.id AS author_id,
      a.name,
      a.slug,
      a.access_status,
      a.payout_eligible,
      -- The catalog heuristic: commercial access without an explicit payout
      -- decision is a platform-owned product, not an external payee.
      CASE
        WHEN a.payout_eligible THEN 'payout_eligible'
        WHEN a.access_status = 'commercial' THEN 'platform_owned_heuristic'
        WHEN a.access_status = 'commercial_pending' THEN 'commercial_pending'
        WHEN a.access_status IN ('suspended', 'terminated') THEN a.access_status
        ELSE 'free'
      END AS payout_class,
      (
        SELECT count(*)::integer
        FROM public.author_commercial_terms AS t
        WHERE t.author_id = a.id AND t.status = 'approved'
      ) AS approved_terms_count,
      (
        SELECT t.author_share_bps
        FROM public.author_commercial_terms AS t
        WHERE t.author_id = a.id
          AND t.status = 'approved'
          AND t.valid_from <= now()
          AND (t.valid_to IS NULL OR now() < t.valid_to)
        ORDER BY t.valid_from DESC
        LIMIT 1
      ) AS current_share_bps,
      coalesce(period.accrued_minor, 0)::bigint AS accrued_minor,
      coalesce(period.reversed_minor, 0)::bigint AS reversed_minor,
      coalesce(period.adjustments_minor, 0)::bigint AS adjustments_minor,
      coalesce(period.entry_count, 0)::integer AS entry_count,
      coalesce(balance.net_entitlement_minor, 0)::bigint AS net_entitlement_minor,
      coalesce(balance.held_minor, 0)::bigint AS held_minor,
      coalesce(balance.payable_minor, 0)::bigint AS payable_minor
    FROM public.authors AS a
    LEFT JOIN LATERAL (
      SELECT
        coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type = 'sale_accrual'), 0)::bigint
          AS accrued_minor,
        coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type = 'refund_reversal'), 0)::bigint
          AS reversed_minor,
        coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type IN ('manual_credit', 'manual_debit', 'correction')), 0)::bigint
          AS adjustments_minor,
        count(*)::integer AS entry_count
      FROM public.author_ledger_entries AS e
      WHERE e.author_id = a.id
        AND (coalesce(p_include_test, false) OR e.is_test = false)
        AND (p_from IS NULL OR e.effective_at >= p_from)
        AND (p_to IS NULL OR e.effective_at < p_to)
    ) AS period ON true
    LEFT JOIN LATERAL (
      SELECT
        (payload ->> 'net_entitlement_minor')::bigint AS net_entitlement_minor,
        (payload ->> 'held_minor')::bigint AS held_minor,
        (payload ->> 'payable_minor')::bigint AS payable_minor
      FROM public.author_finance_balance(a.id, coalesce(p_include_test, false)) AS payload
    ) AS balance ON true
    WHERE v_q IS NULL
       OR a.name ILIKE '%' || v_q || '%'
       OR a.slug ILIKE '%' || v_q || '%'
    ORDER BY net_entitlement_minor DESC, a.name
    LIMIT v_limit
    OFFSET v_offset
  ) AS x;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'include_test', coalesce(p_include_test, false),
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_finance_p332_authors(
  timestamptz, timestamptz, boolean, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_finance_p332_authors(
  timestamptz, timestamptz, boolean, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_finance_p332_authors(
  timestamptz, timestamptz, boolean, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_author_finance_p332_authors IS
  'audiolad:payments-analytics:p332; per-author economy rows with payout classification; no buyer PII; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_author_finance_p332_ledger(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_entry_type text DEFAULT NULL,
  p_search text DEFAULT NULL,
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
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_type text := nullif(btrim(coalesce(p_entry_type, '')), '');
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_type IS NOT NULL
     AND v_type NOT IN ('sale_accrual', 'refund_reversal', 'manual_credit', 'manual_debit', 'correction') THEN
    v_type := NULL;
  END IF;

  SELECT count(*)::integer
  INTO v_total
  FROM public.author_ledger_entries AS e
  LEFT JOIN public.orders AS o ON o.id = e.order_id
  JOIN public.authors AS a ON a.id = e.author_id
  WHERE (coalesce(p_include_test, false) OR e.is_test = false)
    AND (p_author_id IS NULL OR e.author_id = p_author_id)
    AND (v_type IS NULL OR e.entry_type = v_type)
    AND (p_from IS NULL OR e.effective_at >= p_from)
    AND (p_to IS NULL OR e.effective_at < p_to)
    AND (
      v_q IS NULL
      OR a.name ILIKE '%' || v_q || '%'
      OR a.slug ILIKE '%' || v_q || '%'
      OR o.practice_title_snapshot ILIKE '%' || v_q || '%'
      OR o.practice_slug_snapshot ILIKE '%' || v_q || '%'
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.effective_at DESC, x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      e.id AS entry_id,
      e.author_id,
      a.name AS author_name,
      a.slug AS author_slug,
      e.entry_type,
      e.amount_minor,
      e.currency,
      e.payment_id,
      e.refund_id,
      e.order_id,
      e.terms_id,
      e.author_share_bps,
      e.hold_days,
      e.gross_basis_minor,
      e.net_basis_minor,
      e.effective_at,
      e.available_at,
      coalesce(e.available_at > now(), false) AS is_held,
      e.calculation_version,
      e.reason_code,
      e.is_test,
      e.created_at,
      o.practice_title_snapshot AS practice_title,
      o.practice_slug_snapshot AS practice_slug
    FROM public.author_ledger_entries AS e
    JOIN public.authors AS a ON a.id = e.author_id
    LEFT JOIN public.orders AS o ON o.id = e.order_id
    WHERE (coalesce(p_include_test, false) OR e.is_test = false)
      AND (p_author_id IS NULL OR e.author_id = p_author_id)
      AND (v_type IS NULL OR e.entry_type = v_type)
      AND (p_from IS NULL OR e.effective_at >= p_from)
      AND (p_to IS NULL OR e.effective_at < p_to)
      AND (
        v_q IS NULL
        OR a.name ILIKE '%' || v_q || '%'
        OR a.slug ILIKE '%' || v_q || '%'
        OR o.practice_title_snapshot ILIKE '%' || v_q || '%'
        OR o.practice_slug_snapshot ILIKE '%' || v_q || '%'
      )
    ORDER BY e.effective_at DESC, e.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) AS x;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'include_test', coalesce(p_include_test, false),
    'entry_type', v_type,
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_finance_p332_ledger(
  timestamptz, timestamptz, boolean, uuid, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_finance_p332_ledger(
  timestamptz, timestamptz, boolean, uuid, text, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_finance_p332_ledger(
  timestamptz, timestamptz, boolean, uuid, text, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_author_finance_p332_ledger IS
  'audiolad:payments-analytics:p332; paginated ledger list without buyer identity; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_author_finance_p332_payment_detail(
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_sale public.author_ledger_entries%ROWTYPE;
  v_settlement jsonb;
  v_entries jsonb;
  v_obligations jsonb;
  v_cumulative_refunds bigint := 0;
  v_reversed bigint := 0;
  v_target bigint := 0;
BEGIN
  SELECT * INTO v_payment FROM public.payments AS p WHERE p.id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'payment_id', p_payment_id);
  END IF;

  SELECT * INTO v_order FROM public.orders AS o WHERE o.id = v_payment.order_id;

  SELECT *
  INTO v_sale
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id = p_payment_id AND e.entry_type = 'sale_accrual';

  v_settlement := public.payment_refund_settlement_snapshot(p_payment_id);

  SELECT coalesce(sum(r.amount_minor), 0)::bigint
  INTO v_cumulative_refunds
  FROM public.payment_refunds AS r
  WHERE r.payment_id = p_payment_id AND r.status = 'succeeded';

  SELECT coalesce(sum(abs(e.amount_minor)), 0)::bigint
  INTO v_reversed
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id = p_payment_id AND e.entry_type = 'refund_reversal';

  IF v_sale.id IS NOT NULL THEN
    v_target := public.author_share_minor(
      greatest(0::bigint, v_sale.gross_basis_minor - v_cumulative_refunds),
      v_sale.author_share_bps
    );
  END IF;

  SELECT coalesce(jsonb_agg(public.author_ledger_entry_row_json(e) ORDER BY e.created_at), '[]'::jsonb)
  INTO v_entries
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id = p_payment_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'obligation_type', o.obligation_type,
    'subject_id', o.subject_id,
    'status', o.status,
    'result_code', o.result_code,
    'attempts', o.attempts,
    'processed_at', o.processed_at,
    'created_at', o.created_at
  ) ORDER BY o.created_at), '[]'::jsonb)
  INTO v_obligations
  FROM public.finance_obligations AS o
  WHERE o.subject_id = p_payment_id
     OR o.subject_id IN (
       SELECT r.id FROM public.payment_refunds AS r WHERE r.payment_id = p_payment_id
     );

  RETURN jsonb_build_object(
    'found', true,
    'payment_id', v_payment.id,
    'order_id', v_payment.order_id,
    'payment_status', v_payment.status,
    'amount_minor', v_payment.amount_minor,
    'currency', v_payment.currency,
    'confirmed_at', v_payment.confirmed_at,
    'is_test', v_payment.is_test,
    'practice_title', v_order.practice_title_snapshot,
    'practice_slug', v_order.practice_slug_snapshot,
    'author_id_snapshot', v_order.author_id_snapshot,
    'attribution_source', CASE
      WHEN v_order.author_id_snapshot IS NOT NULL THEN 'snapshot'
      ELSE 'missing'
    END,
    'settlement', v_settlement,
    'cumulative_refunded_minor', v_cumulative_refunds,
    'sale_accrual_minor', coalesce(v_sale.amount_minor, 0),
    'reversed_minor', v_reversed,
    'target_entitlement_minor', v_target,
    'author_net_minor', coalesce(v_sale.amount_minor, 0) - v_reversed,
    'author_share_bps', v_sale.author_share_bps,
    'available_at', v_sale.available_at,
    'is_held', coalesce(v_sale.available_at > now(), false),
    'reconciled', coalesce(v_sale.amount_minor, 0) - v_reversed = v_target,
    'entries', v_entries,
    'obligations', v_obligations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_finance_p332_payment_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_finance_p332_payment_detail(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_finance_p332_payment_detail(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_author_finance_p332_payment_detail IS
  'audiolad:payments-analytics:p332; one payment end to end: refund settlement, accrual, reversals, obligations; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_author_finance_p332_integrity_snapshot(
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH scoped AS (
    SELECT e.*
    FROM public.author_ledger_entries AS e
    WHERE coalesce(p_include_test, false) OR e.is_test = false
  ),
  per_payment AS (
    SELECT
      s.payment_id,
      max(s.author_share_bps) AS author_share_bps,
      max(s.gross_basis_minor) AS gross_basis_minor,
      coalesce(sum(s.amount_minor) FILTER (WHERE s.entry_type = 'sale_accrual'), 0)::bigint
        AS accrued_minor,
      coalesce(sum(abs(s.amount_minor)) FILTER (WHERE s.entry_type = 'refund_reversal'), 0)::bigint
        AS reversed_minor
    FROM scoped AS s
    WHERE s.payment_id IS NOT NULL
    GROUP BY s.payment_id
  )
  SELECT jsonb_build_object(
    'include_test', coalesce(p_include_test, false),
    'calculation_version', 'p332.v1',
    'entries_total', (SELECT count(*)::integer FROM scoped),
    'entries_by_type', (
      SELECT coalesce(jsonb_object_agg(entry_type, cnt), '{}'::jsonb)
      FROM (
        SELECT entry_type, count(*)::integer AS cnt FROM scoped GROUP BY entry_type
      ) AS t
    ),
    'accrued_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM scoped WHERE entry_type = 'sale_accrual'
    ),
    'reversed_minor', (
      SELECT coalesce(sum(amount_minor), 0)::bigint
      FROM scoped WHERE entry_type = 'refund_reversal'
    ),
    'net_entitlement_minor', (SELECT coalesce(sum(amount_minor), 0)::bigint FROM scoped),
    -- 1. sign and amount invariants
    'wrong_sign_entries', (
      SELECT count(*)::integer
      FROM scoped
      WHERE (entry_type = 'sale_accrual' AND amount_minor <= 0)
         OR (entry_type = 'refund_reversal' AND amount_minor >= 0)
         OR (entry_type IN ('manual_credit','manual_debit','correction') AND amount_minor = 0)
    ),
    'over_reversed_payments', (
      SELECT count(*)::integer FROM per_payment WHERE reversed_minor > accrued_minor
    ),
    'accrual_exceeds_payment', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE s.entry_type = 'sale_accrual' AND s.amount_minor > p.amount_minor
    ),
    'accrual_formula_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE s.entry_type = 'sale_accrual'
        AND s.amount_minor
            IS DISTINCT FROM public.author_share_minor(p.amount_minor, s.author_share_bps)
    ),
    'unreconciled_payments', (
      SELECT count(*)::integer
      FROM per_payment AS pp
      WHERE pp.accrued_minor - pp.reversed_minor IS DISTINCT FROM
        public.author_share_minor(
          greatest(0::bigint, pp.gross_basis_minor - coalesce((
            SELECT sum(r.amount_minor)::bigint
            FROM public.payment_refunds AS r
            WHERE r.payment_id = pp.payment_id AND r.status = 'succeeded'
          ), 0::bigint)),
          pp.author_share_bps
        )
    ),
    -- 2. identity and linkage invariants
    'duplicate_sale_accruals', (
      SELECT count(*)::integer
      FROM (
        SELECT payment_id
        FROM public.author_ledger_entries
        WHERE entry_type = 'sale_accrual'
        GROUP BY payment_id
        HAVING count(*) > 1
      ) AS d
    ),
    'duplicate_refund_reversals', (
      SELECT count(*)::integer
      FROM (
        SELECT refund_id
        FROM public.author_ledger_entries
        WHERE entry_type = 'refund_reversal'
        GROUP BY refund_id
        HAVING count(*) > 1
      ) AS d
    ),
    'entries_missing_idempotency_key', (
      SELECT count(*)::integer
      FROM scoped WHERE idempotency_key IS NULL OR btrim(idempotency_key) = ''
    ),
    'accruals_without_terms', (
      SELECT count(*)::integer
      FROM scoped WHERE entry_type = 'sale_accrual' AND terms_id IS NULL
    ),
    'reversals_without_sale', (
      SELECT count(*)::integer
      FROM scoped AS s
      WHERE s.entry_type = 'refund_reversal'
        AND NOT EXISTS (
          SELECT 1
          FROM public.author_ledger_entries AS a
          WHERE a.payment_id = s.payment_id AND a.entry_type = 'sale_accrual'
        )
    ),
    -- 3. eligibility invariants: platform-owned authors must never accrue
    'accruals_for_non_eligible_authors', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.authors AS a ON a.id = s.author_id
      WHERE s.entry_type = 'sale_accrual' AND a.payout_eligible = false
    ),
    'accruals_without_succeeded_payment', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.payments AS p ON p.id = s.payment_id
      WHERE s.entry_type = 'sale_accrual' AND p.status IS DISTINCT FROM 'succeeded'
    ),
    'accrual_author_snapshot_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS s
      JOIN public.orders AS o ON o.id = s.order_id
      WHERE s.entry_type = 'sale_accrual'
        AND o.author_id_snapshot IS DISTINCT FROM s.author_id
    ),
    -- 4. terms invariants
    'approved_terms_total', (
      SELECT count(*)::integer
      FROM public.author_commercial_terms WHERE status = 'approved'
    ),
    'overlapping_approved_terms', (
      SELECT count(*)::integer
      FROM public.author_commercial_terms AS a
      JOIN public.author_commercial_terms AS b
        ON b.author_id = a.author_id
       AND b.currency = a.currency
       AND b.id <> a.id
       AND b.status = 'approved'
      WHERE a.status = 'approved'
        AND tstzrange(a.valid_from, a.valid_to, '[)')
            && tstzrange(b.valid_from, b.valid_to, '[)')
    ),
    'payout_eligible_authors', (
      SELECT count(*)::integer FROM public.authors WHERE payout_eligible = true
    ),
    -- 5. outbox invariants
    'obligations_total', (SELECT count(*)::integer FROM public.finance_obligations),
    'obligations_by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, count(*)::integer AS cnt
        FROM public.finance_obligations GROUP BY status
      ) AS t
    ),
    'obligations_stuck_over_24h', (
      SELECT count(*)::integer
      FROM public.finance_obligations
      WHERE status IN ('pending', 'failed')
        AND created_at < now() - interval '24 hours'
    ),
    'succeeded_payments_without_obligation', (
      SELECT count(*)::integer
      FROM public.payments AS p
      WHERE p.status = 'succeeded'
        AND p.confirmed_at IS NOT NULL
        AND (coalesce(p_include_test, false) OR p.is_test = false)
        AND NOT EXISTS (
          SELECT 1
          FROM public.finance_obligations AS o
          WHERE o.obligation_type = 'payment_succeeded_accrual'
            AND o.subject_id = p.id
        )
    ),
    'succeeded_refunds_without_obligation', (
      SELECT count(*)::integer
      FROM public.payment_refunds AS r
      WHERE r.status = 'succeeded'
        AND (coalesce(p_include_test, false) OR r.is_test = false)
        AND NOT EXISTS (
          SELECT 1
          FROM public.finance_obligations AS o
          WHERE o.obligation_type = 'refund_succeeded_reversal'
            AND o.subject_id = r.id
        )
    ),
    -- 6. audit invariants
    'entries_without_audit_entry', (
      SELECT count(*)::integer
      FROM scoped AS s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.finance_audit_log AS a
        WHERE a.entity_type = 'author_ledger_entry' AND a.entity_id = s.id
      )
    ),
    'notes', jsonb_build_object(
      'balance_source', 'derived_from_append_only_ledger',
      'zero_amount_rows', 'never_written_recorded_as_reconciled_obligations',
      'product_overrides', 'not_implemented',
      'payouts', 'not_connected'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_author_finance_p332_integrity_snapshot(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_finance_p332_integrity_snapshot(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_finance_p332_integrity_snapshot(boolean) TO service_role;

COMMENT ON FUNCTION public.admin_author_finance_p332_integrity_snapshot IS
  'audiolad:payments-analytics:p332; read-only author ledger integrity counters for ops/scripts; service_role only.';

-- ---------------------------------------------------------------------------
-- 12. Historical dry run (read-only; writes nothing, ever)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_author_finance_p332_historical_dry_run(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 200), 1000));
  v_rows jsonb;
  v_totals jsonb;
BEGIN
  WITH scoped AS (
    SELECT
      p.id AS payment_id,
      p.order_id,
      p.amount_minor,
      p.currency,
      p.confirmed_at,
      p.is_test,
      o.practice_id,
      o.practice_title_snapshot,
      o.practice_slug_snapshot,
      o.author_id_snapshot,
      -- Historical orders predate P3.2.0 and have no snapshot. The current
      -- practice owner is a *label*, never a basis for money.
      coalesce(o.author_id_snapshot, pr.author_id) AS resolved_author_id,
      CASE
        WHEN o.author_id_snapshot IS NOT NULL THEN 'snapshot'
        WHEN pr.author_id IS NOT NULL THEN 'historical_fallback'
        ELSE 'unresolved'
      END AS attribution_source
    FROM public.payments AS p
    JOIN public.orders AS o ON o.id = p.order_id
    LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
    WHERE p.status = 'succeeded'
      AND p.confirmed_at IS NOT NULL
      AND (coalesce(p_include_test, false) OR p.is_test = false)
      AND (p_from IS NULL OR p.confirmed_at >= p_from)
      AND (p_to IS NULL OR p.confirmed_at < p_to)
  ),
  classified AS (
    SELECT
      s.*,
      a.name AS author_name,
      a.slug AS author_slug,
      a.access_status,
      coalesce(a.payout_eligible, false) AS payout_eligible,
      CASE
        WHEN a.id IS NULL THEN 'unresolved_author'
        WHEN a.payout_eligible THEN 'payout_eligible'
        WHEN a.access_status = 'commercial' THEN 'platform_owned_heuristic'
        WHEN a.access_status = 'commercial_pending' THEN 'commercial_pending'
        WHEN a.access_status IN ('suspended', 'terminated') THEN a.access_status
        ELSE 'free'
      END AS payout_class,
      public.resolve_author_commercial_terms(s.resolved_author_id, s.confirmed_at, s.currency)
        AS terms
    FROM scoped AS s
    LEFT JOIN public.authors AS a ON a.id = s.resolved_author_id
  ),
  proposed AS (
    SELECT
      c.*,
      (c.terms ->> 'found')::boolean AS terms_found,
      coalesce(c.terms ->> 'reason', 'no_active_terms') AS terms_reason,
      CASE
        WHEN c.payout_eligible
         AND c.attribution_source = 'snapshot'
         AND (c.terms ->> 'found')::boolean
          THEN public.author_share_minor(
            c.amount_minor, (c.terms ->> 'author_share_bps')::integer
          )
        ELSE 0::bigint
      END AS proposed_accrual_minor,
      CASE
        WHEN NOT c.payout_eligible AND c.payout_class = 'platform_owned_heuristic'
          THEN 'platform_owned_no_payout'
        WHEN NOT c.payout_eligible AND c.payout_class = 'commercial_pending'
          THEN 'commercial_application_not_approved'
        WHEN NOT c.payout_eligible
          THEN 'author_not_payout_eligible'
        WHEN c.attribution_source <> 'snapshot'
          THEN 'author_snapshot_missing'
        WHEN NOT (c.terms ->> 'found')::boolean
          THEN coalesce(c.terms ->> 'reason', 'no_active_terms')
        ELSE NULL
      END AS blocker
    FROM classified AS c
  )
  SELECT
    coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.confirmed_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      payment_id,
      order_id,
      amount_minor,
      currency,
      confirmed_at,
      is_test,
      practice_title_snapshot AS practice_title,
      practice_slug_snapshot AS practice_slug,
      resolved_author_id AS author_id,
      author_name,
      author_slug,
      access_status,
      payout_eligible,
      payout_class,
      attribution_source,
      terms_found,
      terms_reason,
      proposed_accrual_minor,
      blocker
    FROM proposed
    ORDER BY confirmed_at DESC
    LIMIT v_limit
  ) AS x;

  WITH scoped AS (
    SELECT
      p.id AS payment_id,
      p.amount_minor,
      p.currency,
      p.confirmed_at,
      o.author_id_snapshot,
      coalesce(o.author_id_snapshot, pr.author_id) AS resolved_author_id,
      CASE
        WHEN o.author_id_snapshot IS NOT NULL THEN 'snapshot'
        WHEN pr.author_id IS NOT NULL THEN 'historical_fallback'
        ELSE 'unresolved'
      END AS attribution_source
    FROM public.payments AS p
    JOIN public.orders AS o ON o.id = p.order_id
    LEFT JOIN public.practices AS pr ON pr.id = o.practice_id
    WHERE p.status = 'succeeded'
      AND p.confirmed_at IS NOT NULL
      AND (coalesce(p_include_test, false) OR p.is_test = false)
      AND (p_from IS NULL OR p.confirmed_at >= p_from)
      AND (p_to IS NULL OR p.confirmed_at < p_to)
  ),
  classified AS (
    SELECT
      s.*,
      coalesce(a.payout_eligible, false) AS payout_eligible,
      CASE
        WHEN a.id IS NULL THEN 'unresolved_author'
        WHEN a.payout_eligible THEN 'payout_eligible'
        WHEN a.access_status = 'commercial' THEN 'platform_owned_heuristic'
        WHEN a.access_status = 'commercial_pending' THEN 'commercial_pending'
        WHEN a.access_status IN ('suspended', 'terminated') THEN a.access_status
        ELSE 'free'
      END AS payout_class,
      public.resolve_author_commercial_terms(s.resolved_author_id, s.confirmed_at, s.currency)
        AS terms
    FROM scoped AS s
    LEFT JOIN public.authors AS a ON a.id = s.resolved_author_id
  )
  SELECT jsonb_build_object(
    'payment_count', count(*)::integer,
    'gross_minor', coalesce(sum(amount_minor), 0)::bigint,
    'snapshot_count', count(*) FILTER (WHERE attribution_source = 'snapshot')::integer,
    'historical_fallback_count',
      count(*) FILTER (WHERE attribution_source = 'historical_fallback')::integer,
    'unresolved_count', count(*) FILTER (WHERE attribution_source = 'unresolved')::integer,
    'platform_owned_count',
      count(*) FILTER (WHERE payout_class = 'platform_owned_heuristic')::integer,
    'commercial_pending_count',
      count(*) FILTER (WHERE payout_class = 'commercial_pending')::integer,
    'free_author_count', count(*) FILTER (WHERE payout_class = 'free')::integer,
    'payout_eligible_count', count(*) FILTER (WHERE payout_eligible)::integer,
    'eligible_with_terms_count', count(*) FILTER (
      WHERE payout_eligible
        AND attribution_source = 'snapshot'
        AND (terms ->> 'found')::boolean
    )::integer,
    'proposed_accrual_minor', coalesce(sum(
      CASE
        WHEN payout_eligible
         AND attribution_source = 'snapshot'
         AND (terms ->> 'found')::boolean
          THEN public.author_share_minor(
            amount_minor, (terms ->> 'author_share_bps')::integer
          )
        ELSE 0::bigint
      END
    ), 0)::bigint,
    'by_class', coalesce((
      SELECT jsonb_object_agg(payout_class, cnt)
      FROM (
        SELECT payout_class, count(*)::integer AS cnt
        FROM classified GROUP BY payout_class
      ) AS t
    ), '{}'::jsonb)
  )
  INTO v_totals
  FROM classified;

  RETURN jsonb_build_object(
    'read_only', true,
    'writes_performed', 0,
    'calculation_version', 'p332.v1',
    'include_test', coalesce(p_include_test, false),
    'limit', v_limit,
    'totals', v_totals,
    'rows', v_rows,
    'heuristics', jsonb_build_object(
      'platform_owned',
      'access_status = commercial AND payout_eligible = false: the current commercial catalog is platform-owned, so these payments are platform revenue and produce no author obligation.',
      'commercial_pending',
      'A submitted commercial application does not create payout eligibility.',
      'attribution',
      'snapshot = orders.author_id_snapshot written at checkout (the only basis money may use). historical_fallback = current practice owner, shown as a label only.',
      'accrual_rule',
      'A proposed accrual appears only for a payout_eligible author with a snapshot and exactly one approved terms row at confirmed_at.'
    ),
    'notes', jsonb_build_object(
      'backfill', 'not_performed_p332_creates_no_historical_ledger',
      'payout_blocker', 'payouts_are_manual_and_out_of_scope_in_p332',
      'product_overrides', 'not_implemented'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_finance_p332_historical_dry_run(
  timestamptz, timestamptz, boolean, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_finance_p332_historical_dry_run(
  timestamptz, timestamptz, boolean, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_finance_p332_historical_dry_run(
  timestamptz, timestamptz, boolean, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_author_finance_p332_historical_dry_run IS
  'audiolad:payments-analytics:p332; read-only what-if over historical succeeded payments. Writes nothing and proposes an accrual only where a payout-eligible author, a write-time snapshot and exactly one approved terms row all exist; service_role only.';

-- ---------------------------------------------------------------------------
-- 13. RBAC: finance terms / ledger / adjustments (owner + finance)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.platform_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.platform_permissions (code, description) VALUES
    ('finance.terms.manage', 'Create, approve and close author commercial terms'),
    ('finance.ledger.manage', 'Reprocess author finance obligations and ledger jobs'),
    ('finance.adjustments.manage', 'Create manual author ledger adjustments')
  ON CONFLICT (code) DO NOTHING;

  IF to_regclass('public.platform_role_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.platform_role_permissions (role_code, permission_code) VALUES
    ('owner', 'finance.terms.manage'),
    ('owner', 'finance.ledger.manage'),
    ('owner', 'finance.adjustments.manage'),
    ('finance', 'finance.terms.manage'),
    ('finance', 'finance.ledger.manage'),
    ('finance', 'finance.adjustments.manage')
  ON CONFLICT DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Post-checks
--
-- No terms and no ledger rows are seeded here. P3.3.2 ships an empty ledger:
-- historical accruals are deliberately not created, and no author is switched
-- to payout_eligible by this migration.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_eligible integer;
BEGIN
  IF to_regclass('public.author_commercial_terms') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: author_commercial_terms missing';
  END IF;

  IF to_regclass('public.author_ledger_entries') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: author_ledger_entries missing';
  END IF;

  IF to_regclass('public.finance_obligations') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: finance_obligations missing';
  END IF;

  IF to_regprocedure('public.ensure_author_sale_accrual(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: ensure_author_sale_accrual missing';
  END IF;

  IF to_regprocedure('public.ensure_author_refund_reversal(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: ensure_author_refund_reversal missing';
  END IF;

  IF to_regprocedure('public.process_finance_obligation(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: process_finance_obligation missing';
  END IF;

  IF to_regprocedure(
    'public.admin_author_finance_p332_historical_dry_run(timestamptz,timestamptz,boolean,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: historical dry run missing';
  END IF;

  IF public.author_share_minor(139400::bigint, 7000) <> 97580::bigint
     OR public.author_share_minor(29900::bigint, 3333) <> 9965::bigint
     OR public.author_share_minor(1::bigint, 5000) <> 0::bigint THEN
    RAISE EXCEPTION 'Post-check failed: author share math is wrong';
  END IF;

  SELECT count(*)::integer INTO v_eligible
  FROM public.authors WHERE payout_eligible = true;

  IF v_eligible > 0 THEN
    RAISE WARNING 'P3.3.2: % author(s) already payout_eligible; verify this was an explicit admin decision', v_eligible;
  END IF;
END;
$$;

COMMIT;

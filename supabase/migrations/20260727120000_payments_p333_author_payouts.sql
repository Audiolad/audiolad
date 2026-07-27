BEGIN;

-- ---------------------------------------------------------------------------
-- Payments P3.3.3: author payouts
--
-- Goals:
--   * turn the derived P3.3.2 entitlement into an explicit, auditable payout
--     document with a lifecycle (draft -> approved -> processing -> paid)
--   * reserve the money a draft intends to pay through allocations, so two
--     drafts for the same author can never promise the same kopek twice
--   * write exactly one negative ledger row, and only after a human confirms
--     the transfer actually happened (external_reference + paid_at + actor)
--
-- Does NOT: talk to a bank, store bank details, create any payout row at
-- migration time, backfill history, or change P3.1 gross / P3.3.1 refund /
-- P3.3.2 accrual sources of truth.
--
-- Money model (important):
--   The ledger stays the only source of truth and stays append-only. A payout
--   is a *claim* on ledger money until it is paid:
--
--     available balance = sum(ledger entries effective_at <= cutoff that are
--                             not inside a hold window at that cutoff)
--     active reserved   = sum(reserved allocations on payouts that are still
--                             alive: draft | approved | processing |
--                             requires_review)
--     payable capacity  = max(0, available balance - active reserved)
--
--   Because refund reversals, manual debits and prior payouts are negative
--   rows, a negative position automatically shrinks capacity: negatives are
--   applied as a single global holdback instead of being netted against one
--   arbitrary source row. FIFO allocation then consumes the oldest positive
--   rows until the reserved amount is covered.
--
-- Reversal scope (important):
--   Only a FULL reversal of a paid payout is implemented. Partial reversal is
--   deliberately out of scope: it would need per-allocation unwinding rules
--   that we cannot validate without a real bank flow. Partial money back is
--   recorded as a P3.3.2 manual adjustment instead.
--
-- Bank details (important):
--   Nothing here stores a bank account, card, INN or any other payee identity.
--   The only externally visible field is external_reference: the operator's own
--   reference to the transfer they made outside this system.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Vocabulary and pure helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_payout_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'draft',
    'approved',
    'processing',
    'paid',
    'failed',
    'cancelled',
    'requires_review',
    'reversed'
  ]::text[];
$$;

COMMENT ON FUNCTION public.author_payout_statuses IS
  'audiolad:payments-p333; every payout status.';

/**
 * Statuses where a payout still holds a claim on ledger money. A reservation
 * survives requires_review on purpose: an unknown provider state must not
 * release money that may already be in flight.
 */
CREATE OR REPLACE FUNCTION public.author_payout_active_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['draft', 'approved', 'processing', 'requires_review']::text[];
$$;

COMMENT ON FUNCTION public.author_payout_active_statuses IS
  'audiolad:payments-p333; payout statuses whose reserved allocations still hold money.';

CREATE OR REPLACE FUNCTION public.author_payout_allocation_reserved_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['reserved', 'requires_review']::text[];
$$;

COMMENT ON FUNCTION public.author_payout_allocation_reserved_statuses IS
  'audiolad:payments-p333; allocation statuses that still hold a claim (not yet paid, not released).';

CREATE OR REPLACE FUNCTION public.author_payout_allocation_consuming_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['reserved', 'requires_review', 'paid']::text[];
$$;

COMMENT ON FUNCTION public.author_payout_allocation_consuming_statuses IS
  'audiolad:payments-p333; allocation statuses that consume a source ledger entry (reserved or already paid).';

CREATE OR REPLACE FUNCTION public.author_payout_transition_allowed(
  p_from text,
  p_to text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IS NULL OR p_to IS NULL THEN false
    WHEN p_from = p_to THEN true
    WHEN p_from = 'draft'
      THEN p_to IN ('approved', 'cancelled', 'requires_review', 'failed')
    WHEN p_from = 'approved'
      THEN p_to IN ('processing', 'paid', 'cancelled', 'requires_review', 'failed')
    WHEN p_from = 'processing'
      THEN p_to IN ('paid', 'failed', 'requires_review')
    WHEN p_from = 'requires_review'
      THEN p_to IN ('approved', 'processing', 'cancelled', 'failed')
    WHEN p_from = 'paid'
      THEN p_to = 'reversed'
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.author_payout_transition_allowed IS
  'audiolad:payments-p333; payout status machine. paid is terminal except for a full reversal; failed/cancelled/reversed are final.';

/**
 * Minimum payout in kopeks. Below this an author is simply not paid this
 * cycle and the balance rolls over; an override is an explicit, audited
 * decision, not a config toggle.
 */
CREATE OR REPLACE FUNCTION public.author_payout_minimum_minor()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 100000::bigint;
$$;

COMMENT ON FUNCTION public.author_payout_minimum_minor IS
  'audiolad:payments-p333; minimum payout is 1000 RUB (100000 kopeks).';

/**
 * Monthly cadence label in Europe/Moscow.
 *
 * The label names the calendar month the cycle *closes*, so a cutoff that
 * lands exactly on a month boundary belongs to the month that just ended.
 * The amount is never period-bounded: a payout always settles the whole
 * available balance at the cutoff, including money accrued in earlier months
 * that never reached the minimum.
 */
CREATE OR REPLACE FUNCTION public.author_payout_period(
  p_cutoff timestamptz
)
RETURNS TABLE (
  period_label text,
  period_start timestamptz,
  period_end timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT
      date_trunc(
        'month',
        (coalesce(p_cutoff, now()) AT TIME ZONE 'Europe/Moscow') - interval '1 microsecond'
      ) AS local_start
  )
  SELECT
    to_char(b.local_start, 'YYYY-MM') AS period_label,
    (b.local_start AT TIME ZONE 'Europe/Moscow') AS period_start,
    ((b.local_start + interval '1 month') AT TIME ZONE 'Europe/Moscow') AS period_end
  FROM bounds AS b;
$$;

COMMENT ON FUNCTION public.author_payout_period IS
  'audiolad:payments-p333; monthly cadence label and bounds in Europe/Moscow. A boundary cutoff labels the month that just closed.';

-- ---------------------------------------------------------------------------
-- 2. Payout documents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id)
    ON DELETE RESTRICT,

  currency text NOT NULL DEFAULT 'RUB',
  amount_minor bigint NOT NULL,

  status text NOT NULL DEFAULT 'draft',

  period_label text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  cutoff_at timestamptz NOT NULL,

  minimum_minor bigint NOT NULL DEFAULT 100000,
  minimum_override boolean NOT NULL DEFAULT false,
  minimum_override_reason text NULL,

  calculation_version text NOT NULL DEFAULT 'p333.v1',
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  idempotency_key text NOT NULL,
  correlation_id text NULL,

  -- The operator's own reference to the transfer they performed outside this
  -- system. Never a bank account, never a payee identity.
  external_reference text NULL,

  failure_code text NULL,
  failure_reason text NULL,
  review_reason text NULL,
  cancel_reason text NULL,
  reversal_reason text NULL,
  notes text NULL,

  ledger_entry_id uuid NULL
    REFERENCES public.author_ledger_entries (id)
    ON DELETE RESTRICT,
  reversal_ledger_entry_id uuid NULL
    REFERENCES public.author_ledger_entries (id)
    ON DELETE RESTRICT,

  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  paid_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  reversed_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,

  approved_at timestamptz NULL,
  processing_at timestamptz NULL,
  paid_at timestamptz NULL,
  failed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  review_at timestamptz NULL,
  reversed_at timestamptz NULL,

  is_test boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_payouts_amount_check
    CHECK (amount_minor > 0),

  CONSTRAINT author_payouts_minimum_check
    CHECK (minimum_minor >= 0),

  CONSTRAINT author_payouts_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),

  CONSTRAINT author_payouts_status_check
    CHECK (status IN (
      'draft', 'approved', 'processing', 'paid',
      'failed', 'cancelled', 'requires_review', 'reversed'
    )),

  CONSTRAINT author_payouts_period_check
    CHECK (period_end > period_start),

  CONSTRAINT author_payouts_idempotency_key_check
    CHECK (btrim(idempotency_key) <> ''),

  -- Below the minimum only with an explicit, written reason.
  CONSTRAINT author_payouts_override_reason_check
    CHECK (
      minimum_override = false
      OR (minimum_override_reason IS NOT NULL AND btrim(minimum_override_reason) <> '')
    ),

  CONSTRAINT author_payouts_below_minimum_check
    CHECK (amount_minor >= minimum_minor OR minimum_override = true),

  -- Paid is a fact about the outside world: it needs a reference, a time, a
  -- person and the ledger row that recorded the money leaving.
  CONSTRAINT author_payouts_paid_fields_check
    CHECK (
      status NOT IN ('paid', 'reversed')
      OR (
        paid_at IS NOT NULL
        AND external_reference IS NOT NULL
        AND btrim(external_reference) <> ''
        AND paid_by IS NOT NULL
        AND ledger_entry_id IS NOT NULL
      )
    ),

  CONSTRAINT author_payouts_reversed_fields_check
    CHECK (
      status <> 'reversed'
      OR (reversed_at IS NOT NULL AND reversal_ledger_entry_id IS NOT NULL)
    ),

  CONSTRAINT author_payouts_failed_fields_check
    CHECK (status <> 'failed' OR failed_at IS NOT NULL),

  CONSTRAINT author_payouts_cancelled_fields_check
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS author_payouts_idempotency_key_uidx
  ON public.author_payouts (idempotency_key);

CREATE INDEX IF NOT EXISTS author_payouts_author_idx
  ON public.author_payouts (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS author_payouts_status_idx
  ON public.author_payouts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS author_payouts_active_idx
  ON public.author_payouts (author_id, currency)
  WHERE status IN ('draft', 'approved', 'processing', 'requires_review');

CREATE INDEX IF NOT EXISTS author_payouts_period_idx
  ON public.author_payouts (period_label, author_id);

CREATE INDEX IF NOT EXISTS author_payouts_cutoff_idx
  ON public.author_payouts (cutoff_at DESC);

CREATE INDEX IF NOT EXISTS author_payouts_paid_at_idx
  ON public.author_payouts (paid_at DESC)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS author_payouts_is_test_idx
  ON public.author_payouts (is_test, status);

COMMENT ON TABLE public.author_payouts IS
  'audiolad:payments-p333; author payout documents. A payout only becomes money when mark_author_payout_paid writes its single negative ledger row. No bank details are stored here, ever.';

COMMENT ON COLUMN public.author_payouts.amount_minor IS
  'Server-computed at draft time from the payable capacity. A client may request less (partial payout) but never more, and never sets this directly.';

COMMENT ON COLUMN public.author_payouts.external_reference IS
  'Operator reference for the transfer performed outside this system (payment order number). Never a bank account or payee identity.';

COMMENT ON COLUMN public.author_payouts.calculation_snapshot IS
  'Frozen explanation of how amount_minor was derived: available balance, hold, active reservations and the global negative holdback at cutoff.';

COMMENT ON COLUMN public.author_payouts.cutoff_at IS
  'Money accrued after this instant is not part of this payout. Holds are evaluated against this instant, not against now().';

ALTER TABLE public.author_payouts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_payouts FROM PUBLIC;
REVOKE ALL ON TABLE public.author_payouts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.author_payouts TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Allocations: which ledger money a payout claims
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_payout_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  payout_id uuid NOT NULL
    REFERENCES public.author_payouts (id)
    ON DELETE RESTRICT,

  ledger_entry_id uuid NOT NULL
    REFERENCES public.author_ledger_entries (id)
    ON DELETE RESTRICT,

  author_id uuid NOT NULL
    REFERENCES public.authors (id)
    ON DELETE RESTRICT,

  currency text NOT NULL DEFAULT 'RUB',
  amount_minor bigint NOT NULL,

  status text NOT NULL DEFAULT 'reserved',

  released_at timestamptz NULL,
  released_reason text NULL,
  paid_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_payout_allocations_amount_check
    CHECK (amount_minor > 0),

  CONSTRAINT author_payout_allocations_status_check
    CHECK (status IN ('reserved', 'paid', 'released', 'requires_review')),

  CONSTRAINT author_payout_allocations_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),

  CONSTRAINT author_payout_allocations_released_check
    CHECK (status <> 'released' OR released_at IS NOT NULL),

  CONSTRAINT author_payout_allocations_paid_check
    CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS author_payout_allocations_pair_uidx
  ON public.author_payout_allocations (payout_id, ledger_entry_id);

CREATE INDEX IF NOT EXISTS author_payout_allocations_payout_idx
  ON public.author_payout_allocations (payout_id, status);

CREATE INDEX IF NOT EXISTS author_payout_allocations_entry_idx
  ON public.author_payout_allocations (ledger_entry_id, status);

CREATE INDEX IF NOT EXISTS author_payout_allocations_author_idx
  ON public.author_payout_allocations (author_id, status);

COMMENT ON TABLE public.author_payout_allocations IS
  'audiolad:payments-p333; FIFO claims of a payout on positive ledger entries. Reservation lives here, never in the append-only ledger, so cancelling a draft costs nothing.';

COMMENT ON COLUMN public.author_payout_allocations.status IS
  'reserved: money is claimed but not paid. paid: the payout settled and the negative ledger row exists. released: the claim was given back. requires_review: claim held while an unknown state is investigated.';

ALTER TABLE public.author_payout_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_payout_allocations FROM PUBLIC;
REVOKE ALL ON TABLE public.author_payout_allocations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.author_payout_allocations TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Ledger link: payout_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_ledger_entries
  ADD COLUMN IF NOT EXISTS payout_id uuid NULL
    REFERENCES public.author_payouts (id)
    ON DELETE RESTRICT;

COMMENT ON COLUMN public.author_ledger_entries.payout_id IS
  'audiolad:payments-p333; set only on payout / payout_reversal rows. One payout row and at most one reversal row per payout.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'author_ledger_entries_payout_links_check'
      AND conrelid = 'public.author_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.author_ledger_entries
      ADD CONSTRAINT author_ledger_entries_payout_links_check
      CHECK (
        entry_type NOT IN ('payout', 'payout_reversal')
        OR payout_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'author_ledger_entries_payout_scope_check'
      AND conrelid = 'public.author_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.author_ledger_entries
      ADD CONSTRAINT author_ledger_entries_payout_scope_check
      CHECK (
        payout_id IS NULL
        OR entry_type IN ('payout', 'payout_reversal')
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS author_ledger_entries_payout_uidx
  ON public.author_ledger_entries (payout_id)
  WHERE entry_type = 'payout';

CREATE UNIQUE INDEX IF NOT EXISTS author_ledger_entries_payout_reversal_uidx
  ON public.author_ledger_entries (payout_id)
  WHERE entry_type = 'payout_reversal';

CREATE INDEX IF NOT EXISTS author_ledger_entries_payout_id_idx
  ON public.author_ledger_entries (payout_id)
  WHERE payout_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Immutability
--
-- A paid payout is an economic fact. Drafts are editable only through the
-- RPCs, which announce themselves with a transaction-local GUC that no client
-- connection can forge through PostgREST.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_payouts_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_via_rpc boolean :=
    coalesce(current_setting('audiolad.finance_payout_mutation', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'author_payouts_delete_forbidden' USING ERRCODE = '0A000';
  END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.cutoff_at IS DISTINCT FROM OLD.cutoff_at
     OR NEW.period_label IS DISTINCT FROM OLD.period_label
     OR NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end
     OR NEW.minimum_minor IS DISTINCT FROM OLD.minimum_minor
     OR NEW.minimum_override IS DISTINCT FROM OLD.minimum_override
     OR NEW.calculation_version IS DISTINCT FROM OLD.calculation_version
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.is_test IS DISTINCT FROM OLD.is_test THEN
    RAISE EXCEPTION 'author_payouts_economics_immutable' USING ERRCODE = '0A000';
  END IF;

  IF NOT v_via_rpc THEN
    RAISE EXCEPTION 'author_payouts_rpc_required' USING ERRCODE = '0A000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.author_payout_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'author_payout_invalid_transition' USING ERRCODE = '22023';
  END IF;

  -- What the transfer was cannot be rewritten after it happened.
  IF OLD.status IN ('paid', 'reversed')
     AND (
       NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
       OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
       OR NEW.ledger_entry_id IS DISTINCT FROM OLD.ledger_entry_id
     ) THEN
    RAISE EXCEPTION 'author_payouts_paid_immutable' USING ERRCODE = '0A000';
  END IF;

  IF OLD.status = 'reversed'
     AND (
       NEW.reversal_ledger_entry_id IS DISTINCT FROM OLD.reversal_ledger_entry_id
       OR NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
     ) THEN
    RAISE EXCEPTION 'author_payouts_reversal_immutable' USING ERRCODE = '0A000';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.author_payouts_immutability IS
  'audiolad:payments-p333; freezes payout economics, blocks deletes and forces every status change through the P3.3.3 RPCs.';

DROP TRIGGER IF EXISTS author_payouts_immutability_trg ON public.author_payouts;

CREATE TRIGGER author_payouts_immutability_trg
  BEFORE UPDATE OR DELETE ON public.author_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.author_payouts_immutability();

CREATE OR REPLACE FUNCTION public.author_payout_allocations_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_via_rpc boolean :=
    coalesce(current_setting('audiolad.finance_payout_mutation', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'author_payout_allocations_delete_forbidden' USING ERRCODE = '0A000';
  END IF;

  IF NEW.payout_id IS DISTINCT FROM OLD.payout_id
     OR NEW.ledger_entry_id IS DISTINCT FROM OLD.ledger_entry_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor THEN
    RAISE EXCEPTION 'author_payout_allocations_immutable' USING ERRCODE = '0A000';
  END IF;

  IF OLD.status = 'paid' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'author_payout_allocations_paid_immutable' USING ERRCODE = '0A000';
  END IF;

  IF NOT v_via_rpc THEN
    RAISE EXCEPTION 'author_payout_allocations_rpc_required' USING ERRCODE = '0A000';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.author_payout_allocations_immutability IS
  'audiolad:payments-p333; allocation amounts and links never change; paid allocations never change at all.';

DROP TRIGGER IF EXISTS author_payout_allocations_immutability_trg
  ON public.author_payout_allocations;

CREATE TRIGGER author_payout_allocations_immutability_trg
  BEFORE UPDATE OR DELETE ON public.author_payout_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.author_payout_allocations_immutability();

-- ---------------------------------------------------------------------------
-- 6. Availability and capacity at a cutoff
-- ---------------------------------------------------------------------------

/**
 * Every ledger entry of an author as of a cutoff, with its hold state and how
 * much of it is still unclaimed.
 *
 * Holds are evaluated per payment group (P3.3.2 rule) so a refund reversal
 * always lands in the same bucket as the sale it reverses. Entries with no
 * payment (adjustments, payouts) use their own available_at.
 *
 * p_exclude_payout_id ignores one payout's own claims, which is what a
 * re-validation of that payout needs: it must see the money it already holds
 * as still available to itself.
 */
DROP FUNCTION IF EXISTS public.author_payout_available_entries(uuid, timestamptz, boolean);

CREATE OR REPLACE FUNCTION public.author_payout_available_entries(
  p_author_id uuid,
  p_cutoff timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_exclude_payout_id uuid DEFAULT NULL
)
RETURNS TABLE (
  entry_id uuid,
  entry_type text,
  currency text,
  amount_minor bigint,
  effective_at timestamptz,
  group_available_at timestamptz,
  is_available boolean,
  allocated_minor bigint,
  remaining_minor bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH params AS (
    SELECT coalesce(p_cutoff, now()) AS cutoff
  ),
  scoped AS (
    SELECT e.*
    FROM public.author_ledger_entries AS e, params AS pr
    WHERE e.author_id = p_author_id
      AND (coalesce(p_include_test, false) OR e.is_test = false)
      AND e.effective_at <= pr.cutoff
  ),
  groups AS (
    SELECT
      s.payment_id,
      max(s.available_at) FILTER (WHERE s.entry_type = 'sale_accrual') AS available_at
    FROM scoped AS s
    WHERE s.payment_id IS NOT NULL
    GROUP BY s.payment_id
  )
  SELECT
    s.id AS entry_id,
    s.entry_type,
    s.currency,
    s.amount_minor,
    s.effective_at,
    coalesce(g.available_at, s.available_at) AS group_available_at,
    (
      coalesce(g.available_at, s.available_at) IS NULL
      OR coalesce(g.available_at, s.available_at) <= pr.cutoff
    ) AS is_available,
    coalesce(a.allocated_minor, 0)::bigint AS allocated_minor,
    greatest(0, s.amount_minor - coalesce(a.allocated_minor, 0))::bigint AS remaining_minor
  FROM scoped AS s
  CROSS JOIN params AS pr
  LEFT JOIN groups AS g ON g.payment_id = s.payment_id
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(al.amount_minor), 0)::bigint AS allocated_minor
    FROM public.author_payout_allocations AS al
    WHERE al.ledger_entry_id = s.id
      AND al.status = ANY (public.author_payout_allocation_consuming_statuses())
      AND (p_exclude_payout_id IS NULL OR al.payout_id <> p_exclude_payout_id)
  ) AS a ON true;
$$;

REVOKE ALL ON FUNCTION public.author_payout_available_entries(uuid, timestamptz, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_payout_available_entries(uuid, timestamptz, boolean, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_payout_available_entries(uuid, timestamptz, boolean, uuid) TO service_role;

COMMENT ON FUNCTION public.author_payout_available_entries IS
  'audiolad:payments-p333; per-entry availability and remaining unclaimed amount at a cutoff; service_role only.';

/**
 * What an author can actually be paid right now.
 *
 * capacity = max(0, available balance - active reservations), additionally
 * capped by the unclaimed positive rows so a bookkeeping drift can only ever
 * make us pay less, never more. Negative positions (refund reversals, manual
 * debits, prior payouts) are a single global holdback rather than a netting
 * against one arbitrary source row: that keeps FIFO honest and keeps the
 * explanation readable in a dispute.
 */
CREATE OR REPLACE FUNCTION public.author_payout_payable_snapshot(
  p_author_id uuid,
  p_cutoff timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_exclude_payout_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz := coalesce(p_cutoff, now());
  v_positive bigint := 0;
  v_negative bigint := 0;
  v_payout_paid bigint := 0;
  v_payout_reversed bigint := 0;
  v_available bigint := 0;
  v_held bigint := 0;
  v_allocatable bigint := 0;
  v_source_count integer := 0;
  v_entry_count integer := 0;
  v_reserved bigint := 0;
  v_reserved_payouts integer := 0;
  v_capacity bigint := 0;
  v_raw_capacity bigint := 0;
  v_eligible boolean := false;
  v_access_status text := NULL;
  v_terms integer := 0;
  v_period record;
  v_blocker text := NULL;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT
    coalesce(sum(e.amount_minor) FILTER (WHERE e.is_available AND e.amount_minor > 0), 0)::bigint,
    coalesce(sum(-e.amount_minor) FILTER (
      WHERE e.is_available AND e.amount_minor < 0 AND e.entry_type <> 'payout'
    ), 0)::bigint,
    coalesce(sum(-e.amount_minor) FILTER (WHERE e.is_available AND e.entry_type = 'payout'), 0)::bigint,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.is_available AND e.entry_type = 'payout_reversal'), 0)::bigint,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.is_available), 0)::bigint,
    coalesce(sum(e.amount_minor) FILTER (WHERE NOT e.is_available), 0)::bigint,
    coalesce(sum(e.remaining_minor) FILTER (WHERE e.is_available AND e.amount_minor > 0), 0)::bigint,
    count(*) FILTER (WHERE e.is_available AND e.amount_minor > 0 AND e.remaining_minor > 0)::integer,
    count(*)::integer
  INTO
    v_positive, v_negative, v_payout_paid, v_payout_reversed,
    v_available, v_held, v_allocatable, v_source_count, v_entry_count
  FROM public.author_payout_available_entries(
    p_author_id, v_cutoff, coalesce(p_include_test, false), p_exclude_payout_id
  ) AS e;

  SELECT
    coalesce(sum(al.amount_minor), 0)::bigint,
    count(DISTINCT al.payout_id)::integer
  INTO v_reserved, v_reserved_payouts
  FROM public.author_payout_allocations AS al
  JOIN public.author_payouts AS p ON p.id = al.payout_id
  WHERE al.author_id = p_author_id
    AND al.status = ANY (public.author_payout_allocation_reserved_statuses())
    AND p.status = ANY (public.author_payout_active_statuses())
    AND (p_exclude_payout_id IS NULL OR al.payout_id <> p_exclude_payout_id);

  v_raw_capacity := v_available - v_reserved;
  v_capacity := greatest(0::bigint, least(v_raw_capacity, v_allocatable));

  SELECT a.payout_eligible, a.access_status
  INTO v_eligible, v_access_status
  FROM public.authors AS a
  WHERE a.id = p_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer
  INTO v_terms
  FROM public.author_commercial_terms AS t
  WHERE t.author_id = p_author_id AND t.status = 'approved';

  SELECT * INTO v_period FROM public.author_payout_period(v_cutoff);

  IF NOT coalesce(v_eligible, false) THEN
    v_blocker := 'author_not_payout_eligible';
  ELSIF v_available < 0 THEN
    v_blocker := 'negative_balance';
  ELSIF v_capacity <= 0 THEN
    v_blocker := 'no_payable_balance';
  ELSIF v_capacity < public.author_payout_minimum_minor() THEN
    v_blocker := 'below_minimum';
  END IF;

  RETURN jsonb_build_object(
    'author_id', p_author_id,
    'currency', 'RUB',
    'cutoff_at', v_cutoff,
    'include_test', coalesce(p_include_test, false),
    'calculation_version', 'p333.v1',
    'period_label', v_period.period_label,
    'period_start', v_period.period_start,
    'period_end', v_period.period_end,
    'payout_eligible', coalesce(v_eligible, false),
    'access_status', v_access_status,
    'approved_terms_count', v_terms,
    'entry_count', v_entry_count,
    'source_entry_count', v_source_count,
    'positive_available_minor', v_positive,
    'negative_available_minor', v_negative,
    'payout_paid_minor', v_payout_paid,
    'payout_reversed_minor', v_payout_reversed,
    'available_balance_minor', v_available,
    'held_minor', v_held,
    'active_reserved_minor', v_reserved,
    'active_reserved_payouts', v_reserved_payouts,
    'allocatable_positive_minor', v_allocatable,
    'raw_capacity_minor', v_raw_capacity,
    'capacity_minor', v_capacity,
    'capacity_capped_by_sources', v_raw_capacity > v_allocatable,
    'minimum_minor', public.author_payout_minimum_minor(),
    'meets_minimum', v_capacity >= public.author_payout_minimum_minor(),
    'blocker', v_blocker,
    'notes', jsonb_build_object(
      'capacity', 'available_balance_minus_active_reservations_floored_at_zero',
      'negatives', 'applied_as_global_holdback_not_netted_per_source_row',
      'holds', 'evaluated_per_payment_group_against_cutoff',
      'allocation', 'fifo_over_oldest_positive_available_entries',
      'bank_details', 'not_stored'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_payout_payable_snapshot(uuid, timestamptz, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_payout_payable_snapshot(uuid, timestamptz, boolean, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_payout_payable_snapshot(uuid, timestamptz, boolean, uuid) TO service_role;

COMMENT ON FUNCTION public.author_payout_payable_snapshot IS
  'audiolad:payments-p333; payable capacity of one author at a cutoff, with the full derivation. p_exclude_payout_id re-validates a payout without counting its own reservation; service_role only.';

/** Safe projection of a payout row for API responses and audit snapshots. */
CREATE OR REPLACE FUNCTION public.author_payout_row_json(
  p_row public.author_payouts
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'author_id', p_row.author_id,
    'currency', p_row.currency,
    'amount_minor', p_row.amount_minor,
    'status', p_row.status,
    'period_label', p_row.period_label,
    'period_start', p_row.period_start,
    'period_end', p_row.period_end,
    'cutoff_at', p_row.cutoff_at,
    'minimum_minor', p_row.minimum_minor,
    'minimum_override', p_row.minimum_override,
    'minimum_override_reason', p_row.minimum_override_reason,
    'calculation_version', p_row.calculation_version,
    'calculation_snapshot', p_row.calculation_snapshot,
    'idempotency_key', p_row.idempotency_key,
    'external_reference', p_row.external_reference,
    'failure_code', p_row.failure_code,
    'failure_reason', p_row.failure_reason,
    'review_reason', p_row.review_reason,
    'cancel_reason', p_row.cancel_reason,
    'reversal_reason', p_row.reversal_reason,
    'notes', p_row.notes,
    'ledger_entry_id', p_row.ledger_entry_id,
    'reversal_ledger_entry_id', p_row.reversal_ledger_entry_id,
    'approved_at', p_row.approved_at,
    'processing_at', p_row.processing_at,
    'paid_at', p_row.paid_at,
    'failed_at', p_row.failed_at,
    'cancelled_at', p_row.cancelled_at,
    'review_at', p_row.review_at,
    'reversed_at', p_row.reversed_at,
    'is_test', p_row.is_test,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

COMMENT ON FUNCTION public.author_payout_row_json IS
  'audiolad:payments-p333; payout projection. Contains no payee identity and no bank data because none is stored.';

/** Reserved + paid allocations must always add up to the payout amount. */
CREATE OR REPLACE FUNCTION public.author_payout_allocated_minor(
  p_payout_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(sum(al.amount_minor), 0)::bigint
  FROM public.author_payout_allocations AS al
  WHERE al.payout_id = p_payout_id
    AND al.status = ANY (public.author_payout_allocation_consuming_statuses());
$$;

REVOKE ALL ON FUNCTION public.author_payout_allocated_minor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_payout_allocated_minor(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_payout_allocated_minor(uuid) TO service_role;

COMMENT ON FUNCTION public.author_payout_allocated_minor IS
  'audiolad:payments-p333; sum of the still-standing (reserved or paid) allocations of a payout.';

-- ---------------------------------------------------------------------------
-- 7. Lifecycle RPCs
-- ---------------------------------------------------------------------------

/**
 * Creates a payout draft and reserves the money it intends to pay.
 *
 * The client never sets the amount: it may only ask for *less* than the
 * server-computed capacity (partial payout). The default is the full capacity.
 */
CREATE OR REPLACE FUNCTION public.create_author_payout_draft(
  p_author_id uuid,
  p_idempotency_key text,
  p_cutoff timestamptz DEFAULT NULL,
  p_desired_amount_minor bigint DEFAULT NULL,
  p_allow_below_minimum boolean DEFAULT false,
  p_override_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_cutoff timestamptz := coalesce(p_cutoff, now());
  v_include_test boolean := coalesce(p_include_test, false);
  v_override_reason text := nullif(btrim(coalesce(p_override_reason, '')), '');
  v_existing public.author_payouts%ROWTYPE;
  v_payout public.author_payouts%ROWTYPE;
  v_snapshot jsonb;
  v_capacity bigint;
  v_amount bigint;
  v_left bigint;
  v_take bigint;
  v_row record;
  v_period record;
  v_allocated bigint;
  v_allocation_count integer := 0;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.author_payouts WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_existing)
    );
  END IF;

  -- Serialize concurrent drafts for the same author so two of them can never
  -- reserve the same kopek.
  PERFORM pg_advisory_xact_lock(
    hashtext('audiolad.author_payout:' || p_author_id::text || ':RUB')
  );

  SELECT * INTO v_existing FROM public.author_payouts WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_existing)
    );
  END IF;

  v_snapshot := public.author_payout_payable_snapshot(
    p_author_id, v_cutoff, v_include_test, NULL
  );

  IF (v_snapshot ->> 'payout_eligible')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'author_not_payout_eligible' USING ERRCODE = '22023';
  END IF;

  v_capacity := (v_snapshot ->> 'capacity_minor')::bigint;

  IF v_capacity <= 0 THEN
    RAISE EXCEPTION 'no_payable_balance' USING ERRCODE = '22023';
  END IF;

  IF p_desired_amount_minor IS NULL THEN
    v_amount := v_capacity;
  ELSE
    IF p_desired_amount_minor <= 0 THEN
      RAISE EXCEPTION 'invalid_payout_amount' USING ERRCODE = '22023';
    END IF;
    IF p_desired_amount_minor > v_capacity THEN
      RAISE EXCEPTION 'desired_amount_exceeds_capacity' USING ERRCODE = '22023';
    END IF;
    v_amount := p_desired_amount_minor;
  END IF;

  IF v_amount < public.author_payout_minimum_minor() THEN
    IF NOT coalesce(p_allow_below_minimum, false) THEN
      RAISE EXCEPTION 'below_minimum_payout' USING ERRCODE = '22023';
    END IF;
    IF v_override_reason IS NULL THEN
      RAISE EXCEPTION 'override_reason_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_period FROM public.author_payout_period(v_cutoff);

  INSERT INTO public.author_payouts (
    author_id,
    currency,
    amount_minor,
    status,
    period_label,
    period_start,
    period_end,
    cutoff_at,
    minimum_minor,
    minimum_override,
    minimum_override_reason,
    calculation_snapshot,
    idempotency_key,
    correlation_id,
    notes,
    created_by,
    is_test
  )
  VALUES (
    p_author_id,
    'RUB',
    v_amount,
    'draft',
    v_period.period_label,
    v_period.period_start,
    v_period.period_end,
    v_cutoff,
    public.author_payout_minimum_minor(),
    v_amount < public.author_payout_minimum_minor(),
    CASE WHEN v_amount < public.author_payout_minimum_minor() THEN v_override_reason ELSE NULL END,
    jsonb_build_object(
      'snapshot', v_snapshot,
      'requested_amount_minor', p_desired_amount_minor,
      'granted_amount_minor', v_amount,
      'partial', p_desired_amount_minor IS NOT NULL AND p_desired_amount_minor < v_capacity,
      'negative_offset_minor', (v_snapshot ->> 'negative_available_minor')::bigint,
      'negative_offset_explanation',
        'negative available entries (refund reversals, manual debits, prior payouts) reduce capacity globally before FIFO allocation'
    ),
    v_key,
    nullif(btrim(coalesce(p_correlation_id, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_actor_user_id,
    v_include_test
  )
  RETURNING * INTO v_payout;

  -- FIFO: oldest available positive money first.
  v_left := v_amount;

  FOR v_row IN
    SELECT e.entry_id, e.amount_minor, e.remaining_minor, e.effective_at, e.currency
    FROM public.author_payout_available_entries(
      p_author_id, v_cutoff, v_include_test
    ) AS e
    WHERE e.is_available AND e.amount_minor > 0 AND e.remaining_minor > 0
    ORDER BY e.effective_at, e.entry_id
  LOOP
    EXIT WHEN v_left <= 0;

    v_take := least(v_row.remaining_minor, v_left);

    INSERT INTO public.author_payout_allocations (
      payout_id, ledger_entry_id, author_id, currency, amount_minor, status
    )
    VALUES (
      v_payout.id, v_row.entry_id, p_author_id, 'RUB', v_take, 'reserved'
    );

    v_left := v_left - v_take;
    v_allocation_count := v_allocation_count + 1;
  END LOOP;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'payout_allocation_underfunded' USING ERRCODE = '22023';
  END IF;

  v_allocated := public.author_payout_allocated_minor(v_payout.id);
  IF v_allocated <> v_amount THEN
    RAISE EXCEPTION 'payout_allocation_mismatch' USING ERRCODE = '22023';
  END IF;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_payout_draft_created',
    'author_payout',
    v_payout.id,
    v_override_reason,
    jsonb_build_object(
      'author_id', v_payout.author_id,
      'amount_minor', v_payout.amount_minor,
      'currency', v_payout.currency,
      'cutoff_at', v_payout.cutoff_at,
      'period_label', v_payout.period_label,
      'capacity_minor', v_capacity,
      'allocation_count', v_allocation_count,
      'minimum_override', v_payout.minimum_override,
      'is_test', v_payout.is_test
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'created',
    'payout', public.author_payout_row_json(v_payout),
    'allocation_count', v_allocation_count,
    'allocated_minor', v_allocated,
    'capacity_minor', v_capacity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_author_payout_draft(
  uuid, text, timestamptz, bigint, boolean, text, text, boolean, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_author_payout_draft(
  uuid, text, timestamptz, bigint, boolean, text, text, boolean, uuid, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_author_payout_draft(
  uuid, text, timestamptz, bigint, boolean, text, text, boolean, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.create_author_payout_draft IS
  'audiolad:payments-p333; computes the payable amount server-side, creates a draft and reserves the money through FIFO allocations. Writes nothing to the ledger; service_role only.';

/**
 * Approving re-checks funding, because a refund can land between draft and
 * approval. An underfunded payout is not silently shrunk: it goes to review.
 */
CREATE OR REPLACE FUNCTION public.approve_author_payout(
  p_payout_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
  v_snapshot jsonb;
  v_capacity bigint;
  v_reserved bigint;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status = 'approved' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  IF v_payout.status NOT IN ('draft', 'requires_review') THEN
    RAISE EXCEPTION 'payout_not_approvable' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('audiolad.author_payout:' || v_payout.author_id::text || ':' || v_payout.currency)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.authors AS a
    WHERE a.id = v_payout.author_id AND a.payout_eligible = true
  ) THEN
    RAISE EXCEPTION 'author_not_payout_eligible' USING ERRCODE = '22023';
  END IF;

  v_reserved := public.author_payout_allocated_minor(v_payout.id);
  IF v_reserved <> v_payout.amount_minor THEN
    RAISE EXCEPTION 'payout_allocation_mismatch' USING ERRCODE = '22023';
  END IF;

  -- Capacity without this payout's own claims, evaluated as late as possible:
  -- a refund that landed after the cutoff still has to block the approval,
  -- otherwise we would approve money the author no longer has.
  v_snapshot := public.author_payout_payable_snapshot(
    v_payout.author_id,
    greatest(v_payout.cutoff_at, now()),
    v_payout.is_test,
    v_payout.id
  );
  v_capacity := (v_snapshot ->> 'capacity_minor')::bigint;

  IF v_capacity < v_payout.amount_minor THEN
    PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

    UPDATE public.author_payouts AS p
    SET status = 'requires_review',
        review_reason = 'underfunded_after_recheck',
        review_at = now(),
        updated_at = now()
    WHERE p.id = v_payout.id
    RETURNING * INTO v_payout;

    PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

    PERFORM public.write_finance_audit_log(
      p_actor_user_id,
      'author_payout_approval_blocked',
      'author_payout',
      v_payout.id,
      'underfunded_after_recheck',
      jsonb_build_object(
        'amount_minor', v_payout.amount_minor,
        'capacity_minor', v_capacity,
        'snapshot', v_snapshot
      ),
      p_correlation_id
    );

    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'underfunded',
      'capacity_minor', v_capacity,
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

  UPDATE public.author_payouts AS p
  SET status = 'approved',
      approved_at = now(),
      approved_by = p_actor_user_id,
      review_reason = NULL,
      updated_at = now()
  WHERE p.id = v_payout.id
  RETURNING * INTO v_payout;

  PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_payout_approved',
    'author_payout',
    v_payout.id,
    NULL,
    jsonb_build_object(
      'author_id', v_payout.author_id,
      'amount_minor', v_payout.amount_minor,
      'capacity_minor', v_capacity
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'approved',
    'payout', public.author_payout_row_json(v_payout)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_author_payout(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_author_payout(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_author_payout(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.approve_author_payout IS
  'audiolad:payments-p333; re-validates funding and eligibility before approval. An underfunded payout goes to requires_review instead of being silently reduced; service_role only.';

CREATE OR REPLACE FUNCTION public.mark_author_payout_processing(
  p_payout_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status = 'processing' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  IF v_payout.status NOT IN ('approved', 'requires_review') THEN
    RAISE EXCEPTION 'payout_not_processable' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

  UPDATE public.author_payouts AS p
  SET status = 'processing',
      processing_at = now(),
      updated_at = now()
  WHERE p.id = v_payout.id
  RETURNING * INTO v_payout;

  PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_payout_processing',
    'author_payout',
    v_payout.id,
    NULL,
    jsonb_build_object('amount_minor', v_payout.amount_minor),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'processing',
    'payout', public.author_payout_row_json(v_payout)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_author_payout_processing(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_author_payout_processing(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_author_payout_processing(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.mark_author_payout_processing IS
  'audiolad:payments-p333; marks that a transfer was handed to the bank outside this system. Writes no ledger row; service_role only.';

/**
 * The only place a payout becomes money.
 *
 * Requires an external reference, a paid_at and an actor, and writes exactly
 * one negative ledger row (unique per payout). Funding is *not* re-checked
 * here: the transfer already happened in the outside world, and refusing to
 * record it would make the ledger lie. A funding drift discovered at this
 * point is recorded in the snapshot and surfaced by the integrity check.
 */
CREATE OR REPLACE FUNCTION public.mark_author_payout_paid(
  p_payout_id uuid,
  p_external_reference text,
  p_paid_at timestamptz DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
  v_reference text := nullif(btrim(coalesce(p_external_reference, '')), '');
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_reserved bigint;
  v_entry public.author_ledger_entries%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_reference IS NULL THEN
    RAISE EXCEPTION 'external_reference_required' USING ERRCODE = '22023';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status IN ('paid', 'reversed') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  IF v_payout.status NOT IN ('approved', 'processing') THEN
    RAISE EXCEPTION 'payout_not_payable' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('audiolad.author_payout:' || v_payout.author_id::text || ':' || v_payout.currency)
  );

  v_reserved := public.author_payout_allocated_minor(v_payout.id);
  IF v_reserved <> v_payout.amount_minor THEN
    RAISE EXCEPTION 'payout_allocation_mismatch' USING ERRCODE = '22023';
  END IF;

  v_snapshot := public.author_payout_payable_snapshot(
    v_payout.author_id, v_paid_at, v_payout.is_test, v_payout.id
  );

  INSERT INTO public.author_ledger_entries (
    author_id,
    entry_type,
    amount_minor,
    currency,
    payout_id,
    effective_at,
    available_at,
    calculation_version,
    idempotency_key,
    correlation_id,
    reason_code,
    notes,
    created_by,
    is_test,
    metadata
  )
  VALUES (
    v_payout.author_id,
    'payout',
    -v_payout.amount_minor,
    v_payout.currency,
    v_payout.id,
    v_paid_at,
    v_paid_at,
    'p333.v1',
    'payout:' || v_payout.id::text,
    coalesce(nullif(btrim(coalesce(p_correlation_id, '')), ''), v_payout.correlation_id),
    'author_payout',
    'Payout ' || v_payout.period_label,
    p_actor_user_id,
    v_payout.is_test,
    jsonb_build_object(
      'payout_id', v_payout.id,
      'period_label', v_payout.period_label,
      'external_reference', v_reference
    )
  )
  RETURNING * INTO v_entry;

  PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

  UPDATE public.author_payout_allocations AS al
  SET status = 'paid',
      paid_at = v_paid_at,
      updated_at = now()
  WHERE al.payout_id = v_payout.id
    AND al.status = ANY (public.author_payout_allocation_reserved_statuses());

  UPDATE public.author_payouts AS p
  SET status = 'paid',
      paid_at = v_paid_at,
      paid_by = p_actor_user_id,
      external_reference = v_reference,
      ledger_entry_id = v_entry.id,
      review_reason = NULL,
      calculation_snapshot = p.calculation_snapshot
        || jsonb_build_object('paid_snapshot', v_snapshot),
      updated_at = now()
  WHERE p.id = v_payout.id
  RETURNING * INTO v_payout;

  PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_payout_marked_paid',
    'author_payout',
    v_payout.id,
    v_reference,
    jsonb_build_object(
      'author_id', v_payout.author_id,
      'amount_minor', v_payout.amount_minor,
      'currency', v_payout.currency,
      'paid_at', v_paid_at,
      'ledger_entry_id', v_entry.id,
      'external_reference', v_reference
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'paid',
    'payout', public.author_payout_row_json(v_payout),
    'ledger_entry_id', v_entry.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_author_payout_paid(uuid, text, timestamptz, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_author_payout_paid(uuid, text, timestamptz, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_author_payout_paid(uuid, text, timestamptz, uuid, text) TO service_role;

COMMENT ON FUNCTION public.mark_author_payout_paid IS
  'audiolad:payments-p333; records a transfer that already happened. Requires external_reference + paid_at + actor and writes the single negative payout ledger row; service_role only.';

/**
 * Two very different failures:
 *   release — the bank explicitly refused; the money was never sent, so the
 *             reservation is given back immediately.
 *   review  — we do not know what happened; the reservation is kept so the
 *             same money cannot be promised twice while we find out.
 */
CREATE OR REPLACE FUNCTION public.mark_author_payout_failed(
  p_payout_id uuid,
  p_failure_code text,
  p_failure_reason text DEFAULT NULL,
  p_mode text DEFAULT 'release',
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
  v_mode text := lower(nullif(btrim(coalesce(p_mode, '')), ''));
  v_code text := nullif(btrim(coalesce(p_failure_code, '')), '');
  v_released integer := 0;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'failure_code_required' USING ERRCODE = '22023';
  END IF;

  IF v_mode IS NULL OR v_mode NOT IN ('release', 'review') THEN
    RAISE EXCEPTION 'invalid_failure_mode' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status IN ('paid', 'reversed') THEN
    RAISE EXCEPTION 'payout_already_paid' USING ERRCODE = '22023';
  END IF;

  IF v_payout.status IN ('failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

  IF v_mode = 'release' THEN
    WITH released AS (
      UPDATE public.author_payout_allocations AS al
      SET status = 'released',
          released_at = now(),
          released_reason = v_code,
          updated_at = now()
      WHERE al.payout_id = v_payout.id
        AND al.status = ANY (public.author_payout_allocation_reserved_statuses())
      RETURNING 1
    )
    SELECT count(*)::integer INTO v_released FROM released;

    UPDATE public.author_payouts AS p
    SET status = 'failed',
        failed_at = now(),
        failure_code = v_code,
        failure_reason = nullif(btrim(coalesce(p_failure_reason, '')), ''),
        updated_at = now()
    WHERE p.id = v_payout.id
    RETURNING * INTO v_payout;
  ELSE
    UPDATE public.author_payouts AS p
    SET status = 'requires_review',
        review_at = now(),
        review_reason = v_code,
        failure_code = v_code,
        failure_reason = nullif(btrim(coalesce(p_failure_reason, '')), ''),
        updated_at = now()
    WHERE p.id = v_payout.id
    RETURNING * INTO v_payout;
  END IF;

  PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    CASE WHEN v_mode = 'release'
      THEN 'author_payout_failed_released'
      ELSE 'author_payout_failed_requires_review'
    END,
    'author_payout',
    v_payout.id,
    v_code,
    jsonb_build_object(
      'amount_minor', v_payout.amount_minor,
      'mode', v_mode,
      'released_allocations', v_released
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', CASE WHEN v_mode = 'release' THEN 'failed' ELSE 'requires_review' END,
    'released_allocations', v_released,
    'reservation_kept', v_mode = 'review',
    'payout', public.author_payout_row_json(v_payout)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_author_payout_failed(uuid, text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_author_payout_failed(uuid, text, text, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_author_payout_failed(uuid, text, text, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.mark_author_payout_failed IS
  'audiolad:payments-p333; explicit refusal releases the reservation, unknown state keeps it and parks the payout for review; service_role only.';

CREATE OR REPLACE FUNCTION public.cancel_author_payout(
  p_payout_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_released integer := 0;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  -- Processing means a transfer may already be in flight: cancelling it here
  -- would release money the bank might still send.
  IF v_payout.status NOT IN ('draft', 'approved', 'requires_review') THEN
    RAISE EXCEPTION 'payout_not_cancellable' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

  WITH released AS (
    UPDATE public.author_payout_allocations AS al
    SET status = 'released',
        released_at = now(),
        released_reason = coalesce(v_reason, 'cancelled'),
        updated_at = now()
    WHERE al.payout_id = v_payout.id
      AND al.status = ANY (public.author_payout_allocation_reserved_statuses())
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_released FROM released;

  UPDATE public.author_payouts AS p
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = v_reason,
      updated_at = now()
  WHERE p.id = v_payout.id
  RETURNING * INTO v_payout;

  PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_payout_cancelled',
    'author_payout',
    v_payout.id,
    v_reason,
    jsonb_build_object(
      'amount_minor', v_payout.amount_minor,
      'released_allocations', v_released
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'cancelled',
    'released_allocations', v_released,
    'payout', public.author_payout_row_json(v_payout)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_author_payout(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_author_payout(uuid, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_author_payout(uuid, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.cancel_author_payout IS
  'audiolad:payments-p333; cancels a pre-transfer payout and gives the reserved money back. Never available once a transfer is processing or paid; service_role only.';

CREATE OR REPLACE FUNCTION public.mark_author_payout_requires_review(
  p_payout_id uuid,
  p_reason text,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'review_reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status = 'requires_review' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  IF v_payout.status NOT IN ('draft', 'approved', 'processing') THEN
    RAISE EXCEPTION 'payout_not_reviewable' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

  UPDATE public.author_payouts AS p
  SET status = 'requires_review',
      review_at = now(),
      review_reason = v_reason,
      updated_at = now()
  WHERE p.id = v_payout.id
  RETURNING * INTO v_payout;

  PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_payout_requires_review',
    'author_payout',
    v_payout.id,
    v_reason,
    jsonb_build_object('amount_minor', v_payout.amount_minor),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'requires_review',
    'reservation_kept', true,
    'payout', public.author_payout_row_json(v_payout)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_author_payout_requires_review(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_author_payout_requires_review(uuid, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_author_payout_requires_review(uuid, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.mark_author_payout_requires_review IS
  'audiolad:payments-p333; parks a payout for a human decision and keeps its reservation; service_role only.';

/**
 * Full reversal only (MVP).
 *
 * The original payout row stays in the ledger and its allocations stay paid:
 * rewriting them would edit history. Instead a positive payout_reversal row
 * gives the money back as fresh allocatable capacity, so the pair nets to zero
 * and the author can be paid again from the reversal row itself.
 *
 * Partial reversal is deliberately not implemented: record partial money back
 * as a P3.3.2 manual adjustment.
 */
CREATE OR REPLACE FUNCTION public.reverse_author_payout(
  p_payout_id uuid,
  p_reason text,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_effective_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_at timestamptz := coalesce(p_effective_at, now());
  v_entry public.author_ledger_entries%ROWTYPE;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reversal_reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payout.status = 'reversed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'payout', public.author_payout_row_json(v_payout)
    );
  END IF;

  IF v_payout.status <> 'paid' THEN
    RAISE EXCEPTION 'payout_not_reversible' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.author_ledger_entries (
    author_id,
    entry_type,
    amount_minor,
    currency,
    payout_id,
    effective_at,
    available_at,
    calculation_version,
    idempotency_key,
    correlation_id,
    reason_code,
    notes,
    created_by,
    is_test,
    metadata
  )
  VALUES (
    v_payout.author_id,
    'payout_reversal',
    v_payout.amount_minor,
    v_payout.currency,
    v_payout.id,
    v_at,
    v_at,
    'p333.v1',
    'payout_reversal:' || v_payout.id::text,
    coalesce(nullif(btrim(coalesce(p_correlation_id, '')), ''), v_payout.correlation_id),
    'author_payout_reversal',
    v_reason,
    p_actor_user_id,
    v_payout.is_test,
    jsonb_build_object(
      'payout_id', v_payout.id,
      'period_label', v_payout.period_label,
      'scope', 'full'
    )
  )
  RETURNING * INTO v_entry;

  PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

  UPDATE public.author_payouts AS p
  SET status = 'reversed',
      reversed_at = v_at,
      reversed_by = p_actor_user_id,
      reversal_reason = v_reason,
      reversal_ledger_entry_id = v_entry.id,
      updated_at = now()
  WHERE p.id = v_payout.id
  RETURNING * INTO v_payout;

  PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_payout_reversed',
    'author_payout',
    v_payout.id,
    v_reason,
    jsonb_build_object(
      'author_id', v_payout.author_id,
      'amount_minor', v_payout.amount_minor,
      'scope', 'full',
      'reversal_ledger_entry_id', v_entry.id
    ),
    p_correlation_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'reversed',
    'scope', 'full',
    'reversal_ledger_entry_id', v_entry.id,
    'payout', public.author_payout_row_json(v_payout)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_author_payout(uuid, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_author_payout(uuid, text, uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_author_payout(uuid, text, uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.reverse_author_payout IS
  'audiolad:payments-p333; FULL reversal of a paid payout. Partial reversal is out of scope for the MVP: use a P3.3.2 manual adjustment instead; service_role only.';

-- ---------------------------------------------------------------------------
-- 8. Admin read models
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_author_payout_p333_candidates(
  p_cutoff timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_include_below_minimum boolean DEFAULT true,
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
  v_cutoff timestamptz := coalesce(p_cutoff, now());
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_period record;
  v_rows jsonb;
  v_total integer := 0;
  v_eligible integer := 0;
BEGIN
  SELECT * INTO v_period FROM public.author_payout_period(v_cutoff);

  SELECT count(*)::integer INTO v_eligible
  FROM public.authors AS a
  WHERE a.payout_eligible = true;

  SELECT
    coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.capacity_minor DESC, x.name), '[]'::jsonb),
    count(*)::integer
  INTO v_rows, v_total
  FROM (
    SELECT
      a.id AS author_id,
      a.name,
      a.slug,
      a.access_status,
      s.currency,
      (s.payload ->> 'available_balance_minor')::bigint AS available_balance_minor,
      (s.payload ->> 'held_minor')::bigint AS held_minor,
      (s.payload ->> 'active_reserved_minor')::bigint AS active_reserved_minor,
      (s.payload ->> 'negative_available_minor')::bigint AS negative_offset_minor,
      (s.payload ->> 'allocatable_positive_minor')::bigint AS allocatable_positive_minor,
      (s.payload ->> 'capacity_minor')::bigint AS capacity_minor,
      (s.payload ->> 'minimum_minor')::bigint AS minimum_minor,
      (s.payload ->> 'meets_minimum')::boolean AS meets_minimum,
      (s.payload ->> 'approved_terms_count')::integer AS approved_terms_count,
      (s.payload ->> 'source_entry_count')::integer AS source_entry_count,
      s.payload ->> 'blocker' AS blocker,
      (
        SELECT max(p.paid_at)
        FROM public.author_payouts AS p
        WHERE p.author_id = a.id AND p.status IN ('paid', 'reversed')
      ) AS last_paid_at,
      (
        SELECT count(*)::integer
        FROM public.author_payouts AS p
        WHERE p.author_id = a.id
          AND p.status = ANY (public.author_payout_active_statuses())
      ) AS open_payout_count
    FROM public.authors AS a
    CROSS JOIN LATERAL (
      SELECT
        'RUB'::text AS currency,
        public.author_payout_payable_snapshot(
          a.id, v_cutoff, coalesce(p_include_test, false), NULL
        ) AS payload
    ) AS s
    WHERE a.payout_eligible = true
      AND (v_q IS NULL OR a.name ILIKE '%' || v_q || '%' OR a.slug ILIKE '%' || v_q || '%')
      AND (s.payload ->> 'capacity_minor')::bigint > 0
      AND (
        coalesce(p_include_below_minimum, true)
        OR (s.payload ->> 'meets_minimum')::boolean
      )
    ORDER BY capacity_minor DESC, a.name
    LIMIT v_limit
    OFFSET v_offset
  ) AS x;

  RETURN jsonb_build_object(
    'cutoff_at', v_cutoff,
    'period_label', v_period.period_label,
    'period_start', v_period.period_start,
    'period_end', v_period.period_end,
    'include_test', coalesce(p_include_test, false),
    'minimum_minor', public.author_payout_minimum_minor(),
    'calculation_version', 'p333.v1',
    'payout_eligible_authors', v_eligible,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows,
    'notes', jsonb_build_object(
      'scope', 'payout_eligible_authors_only',
      'platform_owned', 'excluded_because_payout_eligible_is_an_explicit_decision',
      'held', 'excluded_until_available_at_reaches_the_cutoff',
      'bank_details', 'not_stored'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_payout_p333_candidates(
  timestamptz, boolean, boolean, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_payout_p333_candidates(
  timestamptz, boolean, boolean, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_payout_p333_candidates(
  timestamptz, boolean, boolean, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_author_payout_p333_candidates IS
  'audiolad:payments-analytics:p333; authors with payable capacity at a cutoff. Empty while every commercial product is platform-owned, which is the correct answer; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_author_payout_p333_list(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_status text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
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
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer := 0;
  v_rows jsonb;
BEGIN
  IF v_status IS NOT NULL AND NOT (v_status = ANY (public.author_payout_statuses())) THEN
    v_status := NULL;
  END IF;

  SELECT count(*)::integer
  INTO v_total
  FROM public.author_payouts AS p
  JOIN public.authors AS a ON a.id = p.author_id
  WHERE (coalesce(p_include_test, false) OR p.is_test = false)
    AND (v_status IS NULL OR p.status = v_status)
    AND (p_author_id IS NULL OR p.author_id = p_author_id)
    AND (p_from IS NULL OR p.created_at >= p_from)
    AND (p_to IS NULL OR p.created_at < p_to)
    AND (
      v_q IS NULL
      OR a.name ILIKE '%' || v_q || '%'
      OR a.slug ILIKE '%' || v_q || '%'
      OR p.period_label ILIKE '%' || v_q || '%'
      OR p.external_reference ILIKE '%' || v_q || '%'
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.id AS payout_id,
      p.author_id,
      a.name AS author_name,
      a.slug AS author_slug,
      p.status,
      p.currency,
      p.amount_minor,
      p.period_label,
      p.cutoff_at,
      p.minimum_minor,
      p.minimum_override,
      p.minimum_override_reason,
      p.external_reference,
      p.failure_code,
      p.review_reason,
      p.cancel_reason,
      p.reversal_reason,
      p.ledger_entry_id,
      p.reversal_ledger_entry_id,
      p.approved_at,
      p.processing_at,
      p.paid_at,
      p.failed_at,
      p.cancelled_at,
      p.reversed_at,
      p.is_test,
      p.created_at,
      (
        SELECT count(*)::integer
        FROM public.author_payout_allocations AS al
        WHERE al.payout_id = p.id
      ) AS allocation_count,
      public.author_payout_allocated_minor(p.id) AS allocated_minor
    FROM public.author_payouts AS p
    JOIN public.authors AS a ON a.id = p.author_id
    WHERE (coalesce(p_include_test, false) OR p.is_test = false)
      AND (v_status IS NULL OR p.status = v_status)
      AND (p_author_id IS NULL OR p.author_id = p_author_id)
      AND (p_from IS NULL OR p.created_at >= p_from)
      AND (p_to IS NULL OR p.created_at < p_to)
      AND (
        v_q IS NULL
        OR a.name ILIKE '%' || v_q || '%'
        OR a.slug ILIKE '%' || v_q || '%'
        OR p.period_label ILIKE '%' || v_q || '%'
        OR p.external_reference ILIKE '%' || v_q || '%'
      )
    ORDER BY p.created_at DESC
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

REVOKE ALL ON FUNCTION public.admin_author_payout_p333_list(
  timestamptz, timestamptz, boolean, text, uuid, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_payout_p333_list(
  timestamptz, timestamptz, boolean, text, uuid, text, integer, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_payout_p333_list(
  timestamptz, timestamptz, boolean, text, uuid, text, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admin_author_payout_p333_list IS
  'audiolad:payments-analytics:p333; payout register. No payee identity, no bank data; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_author_payout_p333_detail(
  p_payout_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.author_payouts%ROWTYPE;
  v_author record;
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'payout_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'payout', NULL);
  END IF;

  SELECT a.name, a.slug, a.access_status, a.payout_eligible
  INTO v_author
  FROM public.authors AS a
  WHERE a.id = v_payout.author_id;

  RETURN jsonb_build_object(
    'found', true,
    'payout', public.author_payout_row_json(v_payout)
      || jsonb_build_object(
        'author_name', v_author.name,
        'author_slug', v_author.slug,
        'author_access_status', v_author.access_status,
        'author_payout_eligible', v_author.payout_eligible,
        'allocated_minor', public.author_payout_allocated_minor(v_payout.id)
      ),
    'allocations', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.entry_effective_at, x.allocation_id), '[]'::jsonb)
      FROM (
        SELECT
          al.id AS allocation_id,
          al.ledger_entry_id,
          al.amount_minor,
          al.status,
          al.released_at,
          al.released_reason,
          al.paid_at,
          al.created_at,
          e.entry_type AS entry_type,
          e.amount_minor AS entry_amount_minor,
          e.effective_at AS entry_effective_at,
          e.available_at AS entry_available_at,
          e.payment_id AS entry_payment_id
        FROM public.author_payout_allocations AS al
        JOIN public.author_ledger_entries AS e ON e.id = al.ledger_entry_id
        WHERE al.payout_id = v_payout.id
      ) AS x
    ),
    'ledger_entries', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.effective_at), '[]'::jsonb)
      FROM (
        SELECT
          e.id AS entry_id,
          e.entry_type,
          e.amount_minor,
          e.currency,
          e.effective_at,
          e.available_at,
          e.calculation_version
        FROM public.author_ledger_entries AS e
        WHERE e.payout_id = v_payout.id
      ) AS x
    ),
    'audit', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          l.id AS audit_id,
          l.action,
          l.reason,
          l.safe_snapshot,
          l.created_at
        FROM public.finance_audit_log AS l
        WHERE l.entity_type = 'author_payout' AND l.entity_id = v_payout.id
        ORDER BY l.created_at DESC
        LIMIT 100
      ) AS x
    ),
    'current_snapshot', public.author_payout_payable_snapshot(
      v_payout.author_id,
      greatest(v_payout.cutoff_at, now()),
      v_payout.is_test,
      v_payout.id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_payout_p333_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_payout_p333_detail(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_payout_p333_detail(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_author_payout_p333_detail IS
  'audiolad:payments-analytics:p333; one payout with its allocations, ledger rows and audit trail; service_role only.';

/**
 * Payout KPIs.
 *
 * Deliberately a separate function from admin_author_finance_p332_summary:
 * the P3.3.2 shape stays untouched, and reserved/paid are surfaced here so the
 * UI can show them next to the P3.3.2 payable number without either summary
 * having to know about the other.
 */
CREATE OR REPLACE FUNCTION public.admin_author_payout_p333_summary(
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
  v_include_test boolean := coalesce(p_include_test, false);
  v_period record;
  v_reserved bigint := 0;
  v_paid_all_time bigint := 0;
  v_reversed_all_time bigint := 0;
  v_capacity bigint := 0;
  v_available bigint := 0;
  v_held bigint := 0;
  v_candidates integer := 0;
  v_candidates_above_minimum integer := 0;
BEGIN
  SELECT * INTO v_period FROM public.author_payout_period(now());

  SELECT coalesce(sum(al.amount_minor), 0)::bigint
  INTO v_reserved
  FROM public.author_payout_allocations AS al
  JOIN public.author_payouts AS p ON p.id = al.payout_id
  WHERE al.status = ANY (public.author_payout_allocation_reserved_statuses())
    AND p.status = ANY (public.author_payout_active_statuses())
    AND (v_include_test OR p.is_test = false);

  SELECT
    coalesce(sum(-e.amount_minor) FILTER (WHERE e.entry_type = 'payout'), 0)::bigint,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.entry_type = 'payout_reversal'), 0)::bigint
  INTO v_paid_all_time, v_reversed_all_time
  FROM public.author_ledger_entries AS e
  WHERE e.entry_type IN ('payout', 'payout_reversal')
    AND (v_include_test OR e.is_test = false);

  SELECT
    coalesce(sum((s.payload ->> 'capacity_minor')::bigint), 0)::bigint,
    coalesce(sum((s.payload ->> 'available_balance_minor')::bigint), 0)::bigint,
    coalesce(sum((s.payload ->> 'held_minor')::bigint), 0)::bigint,
    count(*) FILTER (WHERE (s.payload ->> 'capacity_minor')::bigint > 0)::integer,
    count(*) FILTER (WHERE (s.payload ->> 'meets_minimum')::boolean)::integer
  INTO v_capacity, v_available, v_held, v_candidates, v_candidates_above_minimum
  FROM public.authors AS a
  CROSS JOIN LATERAL (
    SELECT public.author_payout_payable_snapshot(a.id, now(), v_include_test, NULL) AS payload
  ) AS s
  WHERE a.payout_eligible = true;

  RETURN jsonb_build_object(
    'currency', 'RUB',
    'include_test', v_include_test,
    'calculation_version', 'p333.v1',
    'period_label', v_period.period_label,
    'minimum_minor', public.author_payout_minimum_minor(),
    'timezone', 'Europe/Moscow',
    'cadence', 'monthly',
    'payout_count', (
      SELECT count(*)::integer FROM public.author_payouts AS p
      WHERE (v_include_test OR p.is_test = false)
        AND (p_from IS NULL OR p.created_at >= p_from)
        AND (p_to IS NULL OR p.created_at < p_to)
    ),
    'payouts_by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT p.status, count(*)::integer AS cnt
        FROM public.author_payouts AS p
        WHERE (v_include_test OR p.is_test = false)
          AND (p_from IS NULL OR p.created_at >= p_from)
          AND (p_to IS NULL OR p.created_at < p_to)
        GROUP BY p.status
      ) AS t
    ),
    'amount_by_status', (
      SELECT coalesce(jsonb_object_agg(status, amount), '{}'::jsonb)
      FROM (
        SELECT p.status, sum(p.amount_minor)::bigint AS amount
        FROM public.author_payouts AS p
        WHERE (v_include_test OR p.is_test = false)
          AND (p_from IS NULL OR p.created_at >= p_from)
          AND (p_to IS NULL OR p.created_at < p_to)
        GROUP BY p.status
      ) AS t
    ),
    'paid_in_period_minor', (
      SELECT coalesce(sum(p.amount_minor), 0)::bigint
      FROM public.author_payouts AS p
      WHERE p.status IN ('paid', 'reversed')
        AND (v_include_test OR p.is_test = false)
        AND (p_from IS NULL OR p.paid_at >= p_from)
        AND (p_to IS NULL OR p.paid_at < p_to)
    ),
    'reserved_minor', v_reserved,
    'paid_minor', v_paid_all_time,
    'reversed_minor', v_reversed_all_time,
    'net_paid_minor', v_paid_all_time - v_reversed_all_time,
    'available_balance_minor', v_available,
    'held_minor', v_held,
    'capacity_minor', v_capacity,
    'candidate_authors', v_candidates,
    'candidate_authors_above_minimum', v_candidates_above_minimum,
    'requires_review_count', (
      SELECT count(*)::integer FROM public.author_payouts AS p
      WHERE p.status = 'requires_review' AND (v_include_test OR p.is_test = false)
    ),
    'notes', jsonb_build_object(
      'counts', 'payout_created_at_in_period',
      'paid_in_period', 'paid_at_in_period',
      'balances', 'as_of_now_not_period_bound',
      'reserved', 'reserved_allocations_on_draft_approved_processing_requires_review',
      'p332_relation', 'p332_payable_minus_reserved_minus_paid_equals_p333_capacity',
      'bank_details', 'not_stored'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_payout_p333_summary(
  timestamptz, timestamptz, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_payout_p333_summary(
  timestamptz, timestamptz, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_payout_p333_summary(
  timestamptz, timestamptz, boolean
) TO service_role;

COMMENT ON FUNCTION public.admin_author_payout_p333_summary IS
  'audiolad:payments-analytics:p333; payout KPIs including reserved and paid. Does not modify the P3.3.2 summary shape; service_role only.';

CREATE OR REPLACE FUNCTION public.admin_author_payout_p333_integrity_snapshot(
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH scoped AS (
    SELECT p.*
    FROM public.author_payouts AS p
    WHERE coalesce(p_include_test, false) OR p.is_test = false
  )
  SELECT jsonb_build_object(
    'include_test', coalesce(p_include_test, false),
    'calculation_version', 'p333.v1',
    'payouts_total', (SELECT count(*)::integer FROM scoped),
    'payouts_by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (SELECT status, count(*)::integer AS cnt FROM scoped GROUP BY status) AS t
    ),
    'allocations_total', (SELECT count(*)::integer FROM public.author_payout_allocations),
    -- 1. document invariants
    'paid_without_ledger_entry', (
      SELECT count(*)::integer FROM scoped
      WHERE status IN ('paid', 'reversed') AND ledger_entry_id IS NULL
    ),
    'paid_without_external_reference', (
      SELECT count(*)::integer FROM scoped
      WHERE status IN ('paid', 'reversed')
        AND (external_reference IS NULL OR btrim(external_reference) = '')
    ),
    'reversed_without_reversal_entry', (
      SELECT count(*)::integer FROM scoped
      WHERE status = 'reversed' AND reversal_ledger_entry_id IS NULL
    ),
    'below_minimum_without_override', (
      SELECT count(*)::integer FROM scoped
      WHERE amount_minor < minimum_minor AND minimum_override = false
    ),
    'payouts_for_non_eligible_authors', (
      SELECT count(*)::integer
      FROM scoped AS p
      JOIN public.authors AS a ON a.id = p.author_id
      WHERE a.payout_eligible = false
        AND p.status NOT IN ('cancelled', 'failed')
    ),
    -- 2. allocation invariants
    'allocation_sum_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS p
      WHERE p.status IN ('draft', 'approved', 'processing', 'requires_review', 'paid', 'reversed')
        AND public.author_payout_allocated_minor(p.id) <> p.amount_minor
    ),
    'over_allocated_entries', (
      SELECT count(*)::integer
      FROM (
        SELECT al.ledger_entry_id, sum(al.amount_minor) AS allocated, max(e.amount_minor) AS entry_amount
        FROM public.author_payout_allocations AS al
        JOIN public.author_ledger_entries AS e ON e.id = al.ledger_entry_id
        WHERE al.status = ANY (public.author_payout_allocation_consuming_statuses())
        GROUP BY al.ledger_entry_id
        HAVING sum(al.amount_minor) > max(e.amount_minor)
      ) AS d
    ),
    'allocations_on_negative_entries', (
      SELECT count(*)::integer
      FROM public.author_payout_allocations AS al
      JOIN public.author_ledger_entries AS e ON e.id = al.ledger_entry_id
      WHERE e.amount_minor <= 0
    ),
    'allocations_author_mismatch', (
      SELECT count(*)::integer
      FROM public.author_payout_allocations AS al
      JOIN public.author_ledger_entries AS e ON e.id = al.ledger_entry_id
      WHERE e.author_id <> al.author_id
    ),
    'reserved_allocations_on_closed_payouts', (
      SELECT count(*)::integer
      FROM public.author_payout_allocations AS al
      JOIN public.author_payouts AS p ON p.id = al.payout_id
      WHERE al.status = ANY (public.author_payout_allocation_reserved_statuses())
        AND p.status IN ('paid', 'failed', 'cancelled', 'reversed')
    ),
    -- 3. ledger invariants
    'payout_entries_total', (
      SELECT count(*)::integer FROM public.author_ledger_entries
      WHERE entry_type IN ('payout', 'payout_reversal')
    ),
    'payout_entries_without_payout', (
      SELECT count(*)::integer FROM public.author_ledger_entries
      WHERE entry_type IN ('payout', 'payout_reversal') AND payout_id IS NULL
    ),
    'duplicate_payout_entries', (
      SELECT count(*)::integer
      FROM (
        SELECT payout_id FROM public.author_ledger_entries
        WHERE entry_type = 'payout'
        GROUP BY payout_id HAVING count(*) > 1
      ) AS d
    ),
    'payout_entry_amount_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS p
      JOIN public.author_ledger_entries AS e ON e.id = p.ledger_entry_id
      WHERE e.amount_minor <> -p.amount_minor OR e.entry_type <> 'payout'
    ),
    'reversal_entry_amount_mismatch', (
      SELECT count(*)::integer
      FROM scoped AS p
      JOIN public.author_ledger_entries AS e ON e.id = p.reversal_ledger_entry_id
      WHERE e.amount_minor <> p.amount_minor OR e.entry_type <> 'payout_reversal'
    ),
    'payout_entries_wrong_sign', (
      SELECT count(*)::integer FROM public.author_ledger_entries
      WHERE (entry_type = 'payout' AND amount_minor >= 0)
         OR (entry_type = 'payout_reversal' AND amount_minor <= 0)
    ),
    -- 4. position invariants
    'authors_with_negative_available_balance', (
      SELECT count(*)::integer
      FROM public.authors AS a
      CROSS JOIN LATERAL (
        SELECT public.author_payout_payable_snapshot(
          a.id, now(), coalesce(p_include_test, false), NULL
        ) AS payload
      ) AS s
      WHERE a.payout_eligible = true
        AND (s.payload ->> 'available_balance_minor')::bigint < 0
    ),
    'over_reserved_authors', (
      SELECT count(*)::integer
      FROM public.authors AS a
      CROSS JOIN LATERAL (
        SELECT public.author_payout_payable_snapshot(
          a.id, now(), coalesce(p_include_test, false), NULL
        ) AS payload
      ) AS s
      WHERE a.payout_eligible = true
        AND (s.payload ->> 'active_reserved_minor')::bigint
            > (s.payload ->> 'available_balance_minor')::bigint
    ),
    'underfunded_active_payouts', (
      SELECT count(*)::integer
      FROM scoped AS p
      CROSS JOIN LATERAL (
        SELECT public.author_payout_payable_snapshot(
          p.author_id, greatest(p.cutoff_at, now()), p.is_test, p.id
        ) AS payload
      ) AS s
      WHERE p.status = ANY (public.author_payout_active_statuses())
        AND (s.payload ->> 'capacity_minor')::bigint < p.amount_minor
    ),
    -- 5. audit invariants
    'payouts_without_audit_entry', (
      SELECT count(*)::integer
      FROM scoped AS p
      WHERE NOT EXISTS (
        SELECT 1 FROM public.finance_audit_log AS l
        WHERE l.entity_type = 'author_payout' AND l.entity_id = p.id
      )
    ),
    'paid_without_paid_audit_entry', (
      SELECT count(*)::integer
      FROM scoped AS p
      WHERE p.status IN ('paid', 'reversed')
        AND NOT EXISTS (
          SELECT 1 FROM public.finance_audit_log AS l
          WHERE l.entity_type = 'author_payout'
            AND l.entity_id = p.id
            AND l.action = 'author_payout_marked_paid'
        )
    ),
    'notes', jsonb_build_object(
      'reversal_scope', 'full_only_partial_out_of_scope',
      'bank_details', 'not_stored',
      'reservation', 'allocations_not_ledger_rows'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_author_payout_p333_integrity_snapshot(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_payout_p333_integrity_snapshot(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_payout_p333_integrity_snapshot(boolean) TO service_role;

COMMENT ON FUNCTION public.admin_author_payout_p333_integrity_snapshot IS
  'audiolad:payments-analytics:p333; read-only payout integrity counters for ops and tests; service_role only.';

/**
 * Finds active payouts that stopped being funded (typically a refund landed
 * after the draft was created) and, when asked, parks them for review.
 *
 * It never touches the ledger, never changes an amount and never releases a
 * reservation: the only write it can make is a status change to
 * requires_review, which a human then resolves.
 */
CREATE OR REPLACE FUNCTION public.admin_author_payout_p333_reconcile(
  p_include_test boolean DEFAULT false,
  p_apply boolean DEFAULT false,
  p_actor_user_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apply boolean := coalesce(p_apply, false);
  v_rows jsonb := '[]'::jsonb;
  v_flagged integer := 0;
  v_row record;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.payout_id), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.id AS payout_id,
      p.author_id,
      p.amount_minor,
      (s.payload ->> 'capacity_minor')::bigint AS capacity_minor,
      p.status,
      CASE
        WHEN public.author_payout_allocated_minor(p.id) <> p.amount_minor
          THEN 'allocation_sum_mismatch'
        ELSE 'underfunded'
      END AS issue
    FROM public.author_payouts AS p
    CROSS JOIN LATERAL (
      SELECT public.author_payout_payable_snapshot(
        p.author_id, greatest(p.cutoff_at, now()), p.is_test, p.id
      ) AS payload
    ) AS s
    WHERE (coalesce(p_include_test, false) OR p.is_test = false)
      AND p.status IN ('draft', 'approved')
      AND (
        (s.payload ->> 'capacity_minor')::bigint < p.amount_minor
        OR public.author_payout_allocated_minor(p.id) <> p.amount_minor
      )
  ) AS d;

  IF v_apply THEN
    FOR v_row IN
      SELECT
        (item ->> 'payout_id')::uuid AS payout_id,
        (item ->> 'amount_minor')::bigint AS amount_minor,
        (item ->> 'capacity_minor')::bigint AS capacity_minor,
        item ->> 'issue' AS issue
      FROM jsonb_array_elements(v_rows) AS item
    LOOP
      PERFORM set_config('audiolad.finance_payout_mutation', 'on', true);

      UPDATE public.author_payouts AS p
      SET status = 'requires_review',
          review_at = now(),
          review_reason = v_row.issue,
          updated_at = now()
      WHERE p.id = v_row.payout_id
        AND p.status IN ('draft', 'approved');

      PERFORM set_config('audiolad.finance_payout_mutation', 'off', true);

      PERFORM public.write_finance_audit_log(
        p_actor_user_id,
        'author_payout_reconcile_flagged',
        'author_payout',
        v_row.payout_id,
        v_row.issue,
        jsonb_build_object(
          'amount_minor', v_row.amount_minor,
          'capacity_minor', v_row.capacity_minor
        ),
        p_correlation_id
      );

      v_flagged := v_flagged + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'applied', v_apply,
    'include_test', coalesce(p_include_test, false),
    'found', jsonb_array_length(v_rows),
    'flagged_for_review', v_flagged,
    'rows', v_rows,
    'integrity', public.admin_author_payout_p333_integrity_snapshot(
      coalesce(p_include_test, false)
    ),
    'notes', jsonb_build_object(
      'writes', 'status_only_never_ledger_never_amounts',
      'scope', 'draft_and_approved_payouts_only'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_payout_p333_reconcile(boolean, boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_payout_p333_reconcile(boolean, boolean, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_payout_p333_reconcile(boolean, boolean, uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_author_payout_p333_reconcile IS
  'audiolad:payments-analytics:p333; detects payouts that lost their funding (refund after draft). With p_apply it only moves them to requires_review; service_role only.';

-- ---------------------------------------------------------------------------
-- 9. RBAC: payout permissions (owner + finance)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.platform_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.platform_permissions (code, description) VALUES
    ('finance.payouts.view', 'View author payouts, candidates and allocations'),
    ('finance.payouts.create', 'Create author payout drafts'),
    ('finance.payouts.approve', 'Approve author payouts and move them to processing'),
    ('finance.payouts.mark_paid', 'Confirm that an author payout was actually transferred'),
    ('finance.payouts.reverse', 'Reverse a paid author payout in full'),
    ('finance.payouts.manage', 'Cancel, fail and reconcile author payouts')
  ON CONFLICT (code) DO NOTHING;

  IF to_regclass('public.platform_role_permissions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.platform_role_permissions (role_code, permission_code) VALUES
    ('owner', 'finance.payouts.view'),
    ('owner', 'finance.payouts.create'),
    ('owner', 'finance.payouts.approve'),
    ('owner', 'finance.payouts.mark_paid'),
    ('owner', 'finance.payouts.reverse'),
    ('owner', 'finance.payouts.manage'),
    ('finance', 'finance.payouts.view'),
    ('finance', 'finance.payouts.create'),
    ('finance', 'finance.payouts.approve'),
    ('finance', 'finance.payouts.mark_paid'),
    ('finance', 'finance.payouts.reverse'),
    ('finance', 'finance.payouts.manage')
  ON CONFLICT DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Post-checks
--
-- This migration creates zero payout rows, zero allocations, zero ledger rows
-- and changes no author's payout_eligible flag. On production it is expected
-- that the candidate list stays empty: every commercial product is currently
-- platform-owned.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_payouts integer;
  v_allocations integer;
  v_payout_entries integer;
  v_period record;
BEGIN
  IF to_regclass('public.author_payouts') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: author_payouts missing';
  END IF;

  IF to_regclass('public.author_payout_allocations') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: author_payout_allocations missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'author_ledger_entries'
      AND column_name = 'payout_id'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: author_ledger_entries.payout_id missing';
  END IF;

  IF to_regprocedure(
    'public.create_author_payout_draft(uuid,text,timestamptz,bigint,boolean,text,text,boolean,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_author_payout_draft missing';
  END IF;

  IF to_regprocedure(
    'public.mark_author_payout_paid(uuid,text,timestamptz,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: mark_author_payout_paid missing';
  END IF;

  IF public.author_payout_minimum_minor() <> 100000::bigint THEN
    RAISE EXCEPTION 'Post-check failed: minimum payout is not 1000 RUB';
  END IF;

  IF public.author_payout_transition_allowed('paid', 'cancelled')
     OR public.author_payout_transition_allowed('cancelled', 'draft')
     OR NOT public.author_payout_transition_allowed('paid', 'reversed')
     OR NOT public.author_payout_transition_allowed('draft', 'approved') THEN
    RAISE EXCEPTION 'Post-check failed: payout status machine is wrong';
  END IF;

  -- A cutoff exactly on a Moscow month boundary labels the month that closed.
  SELECT * INTO v_period
  FROM public.author_payout_period('2026-08-01T00:00:00+03:00'::timestamptz);

  IF v_period.period_label <> '2026-07' THEN
    RAISE EXCEPTION 'Post-check failed: monthly period label is wrong (got %)', v_period.period_label;
  END IF;

  SELECT count(*)::integer INTO v_payouts FROM public.author_payouts;
  SELECT count(*)::integer INTO v_allocations FROM public.author_payout_allocations;
  SELECT count(*)::integer INTO v_payout_entries
  FROM public.author_ledger_entries WHERE entry_type IN ('payout', 'payout_reversal');

  IF v_payouts > 0 OR v_allocations > 0 OR v_payout_entries > 0 THEN
    RAISE WARNING 'P3.3.3: % payout(s), % allocation(s), % payout ledger row(s) already exist; the migration created none of them',
      v_payouts, v_allocations, v_payout_entries;
  END IF;
END;
$$;

COMMIT;

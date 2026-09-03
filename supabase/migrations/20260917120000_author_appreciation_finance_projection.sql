-- Author appreciation Stage 3B: project paid GetCourse intents into the
-- existing author ledger as ordinary sale_accrual rows.
--
-- Reuses P3.3.2 commercial terms, author_share_minor, hold_days / available_at,
-- and the existing payout / P3.3.4 projections. Does not create orders,
-- payments, entitlements, or a separate appreciation balance.
--
-- Correlation object: author_appreciation_payment_intents.id
-- (nullable unique FK author_appreciation_intent_id). No fake payment_id.
--
-- Atomicity: apply_author_appreciation_getcourse_callback marks paid and
-- calls ensure_author_appreciation_sale_accrual in the same transaction.
-- Durable reconciliation: reconcile_author_appreciation_paid_intents
-- (also used to backfill already-paid production intents).
--
-- Refunds: GetCourse Process currently notifies only successful payment
-- (status=payed). Automatic refund_reversal is NOT wired.
-- REFUND_AUTOMATION=MANUAL_OR_REQUIRES_GETCOURSE_PROCESS_EXTENSION
--
-- Rollback (operator): stop rollout env; paid intents remain provider facts.
-- DROP ensure/reconcile RPCs; restore apply_callback from
-- 20260916120000; delete appreciation-sourced sale_accrual rows if desired;
-- DROP unique index + column author_appreciation_intent_id; restore
-- author_ledger_entries_sale_links_check to payment_id IS NOT NULL.
-- Do not DROP author_appreciation_payment_intents or historical paid/failed
-- audit rows. No destructive statements are executed by this migration.
--
-- DO NOT apply to production without explicit approval.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Additive ledger correlation
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_ledger_entries
  ADD COLUMN IF NOT EXISTS author_appreciation_intent_id uuid NULL
    REFERENCES public.author_appreciation_payment_intents (id)
    ON DELETE RESTRICT;

COMMENT ON COLUMN public.author_ledger_entries.author_appreciation_intent_id IS
  'Set only for appreciation-sourced sale_accrual rows. Ordinary sales keep payment_id and leave this NULL. Never a fake payment/order id.';

ALTER TABLE public.author_ledger_entries
  DROP CONSTRAINT IF EXISTS author_ledger_entries_sale_links_check;

ALTER TABLE public.author_ledger_entries
  ADD CONSTRAINT author_ledger_entries_sale_links_check
  CHECK (
    entry_type <> 'sale_accrual'
    OR (
      terms_id IS NOT NULL
      AND (
        (payment_id IS NOT NULL AND author_appreciation_intent_id IS NULL)
        OR (payment_id IS NULL AND author_appreciation_intent_id IS NOT NULL)
      )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS author_ledger_entries_appreciation_sale_uidx
  ON public.author_ledger_entries (author_appreciation_intent_id)
  WHERE entry_type = 'sale_accrual'
    AND author_appreciation_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS author_ledger_entries_appreciation_intent_idx
  ON public.author_ledger_entries (author_appreciation_intent_id)
  WHERE author_appreciation_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Safe row projection includes the new FK
-- ---------------------------------------------------------------------------

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
    'author_appreciation_intent_id', p_entry.author_appreciation_intent_id,
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

-- ---------------------------------------------------------------------------
-- 3. Positions + balance: appreciation sale_accrual is a hold group, not an
--    adjustment. GROUP BY intent so each paid appreciation has its own hold.
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
  WHERE (e.payment_id IS NOT NULL OR e.author_appreciation_intent_id IS NOT NULL)
    AND (coalesce(p_include_test, false) OR e.is_test = false)
  GROUP BY e.author_id, e.payment_id, e.author_appreciation_intent_id;
$$;

REVOKE ALL ON FUNCTION public.author_ledger_payment_positions(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_ledger_payment_positions(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_ledger_payment_positions(boolean) TO service_role;

COMMENT ON FUNCTION public.author_ledger_payment_positions IS
  'audiolad:payments-p332; per-payment or per-appreciation-intent author position. Holds stay per source group; service_role only.';

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
      AND e.author_appreciation_intent_id IS NULL
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
      'hold_scope', 'per_payment_or_appreciation_intent_group',
      'payouts', 'not_connected',
      'provider_fees', 'not_connected',
      'taxes', 'not_connected'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.author_finance_balance(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_balance(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_balance(uuid, boolean) TO service_role;

-- Admin payable must not treat appreciation sale_accrual as an adjustment.
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

  SELECT
    coalesce(sum(p.net_minor) FILTER (WHERE p.is_held), 0)::bigint,
    coalesce(sum(p.net_minor) FILTER (WHERE NOT p.is_held), 0)::bigint
  INTO v_held, v_payable
  FROM public.author_ledger_payment_positions(coalesce(p_include_test, false)) AS p;

  v_payable := v_payable + coalesce((
    SELECT sum(e.amount_minor)::bigint
    FROM public.author_ledger_entries AS e
    WHERE e.payment_id IS NULL
      AND e.author_appreciation_intent_id IS NULL
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
    'calculation_version', 'p332.author_rounding_up_v1',
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

-- Author cabinet: show snapshot source_title when there is no order.
CREATE OR REPLACE FUNCTION public.author_finance_p334_entries(
  p_author_id uuid,
  p_include_test boolean DEFAULT false
)
RETURNS TABLE (
  entry_id uuid,
  type_key text,
  amount_minor bigint,
  currency text,
  effective_at timestamptz,
  available_at timestamptz,
  is_held boolean,
  amount_state text,
  product_title text,
  payout_safe_ref text,
  is_test boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id AS entry_id,
    public.author_finance_p334_type_key(e.entry_type) AS type_key,
    e.amount_minor,
    e.currency,
    e.effective_at,
    av.group_available_at AS available_at,
    NOT av.is_available AS is_held,
    CASE
      WHEN e.entry_type = 'payout' THEN 'paid'
      WHEN e.entry_type IN (
        'manual_credit', 'manual_debit', 'correction',
        'chargeback_reversal', 'payout_reversal'
      ) THEN 'adjustment'
      WHEN NOT av.is_available THEN 'held'
      WHEN coalesce(alloc.paid_minor, 0) > 0 THEN 'paid'
      WHEN coalesce(alloc.reserved_minor, 0) > 0 THEN 'reserved'
      ELSE 'available'
    END AS amount_state,
    coalesce(o.practice_title_snapshot, e.metadata ->> 'source_title') AS product_title,
    coalesce(own_payout.period_label, alloc.period_label) AS payout_safe_ref,
    e.is_test
  FROM public.author_ledger_entries AS e
  JOIN public.author_payout_available_entries(
    p_author_id, now(), coalesce(p_include_test, false), NULL
  ) AS av ON av.entry_id = e.id
  LEFT JOIN public.orders AS o ON o.id = e.order_id
  LEFT JOIN public.author_payouts AS own_payout ON own_payout.id = e.payout_id
  LEFT JOIN LATERAL (
    SELECT
      coalesce(sum(al.amount_minor) FILTER (WHERE al.status = 'paid'), 0)::bigint
        AS paid_minor,
      coalesce(sum(al.amount_minor) FILTER (
        WHERE al.status = ANY (public.author_payout_allocation_reserved_statuses())
      ), 0)::bigint AS reserved_minor,
      max(p2.period_label) AS period_label
    FROM public.author_payout_allocations AS al
    JOIN public.author_payouts AS p2 ON p2.id = al.payout_id
    WHERE al.ledger_entry_id = e.id
      AND al.status = ANY (public.author_payout_allocation_consuming_statuses())
  ) AS alloc ON true
  WHERE e.author_id = p_author_id;
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_entries(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_entries(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_entries(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Canonical appreciation → sale_accrual (same math as ordinary sales)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_author_appreciation_sale_accrual(
  p_intent_id uuid,
  p_correlation_id text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.author_appreciation_payment_intents%ROWTYPE;
  v_author public.authors%ROWTYPE;
  v_existing public.author_ledger_entries%ROWTYPE;
  v_entry public.author_ledger_entries%ROWTYPE;
  v_terms jsonb;
  v_bps integer;
  v_hold_days integer;
  v_amount bigint;
  v_effective timestamptz;
BEGIN
  IF p_intent_id IS NULL THEN
    RAISE EXCEPTION 'appreciation_intent_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_intent
  FROM public.author_appreciation_payment_intents AS i
  WHERE i.id = p_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'intent_not_found'
    );
  END IF;

  SELECT *
  INTO v_existing
  FROM public.author_ledger_entries AS e
  WHERE e.author_appreciation_intent_id = p_intent_id
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

  IF v_intent.status IS DISTINCT FROM 'paid' OR v_intent.paid_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', CASE
        WHEN v_intent.status = 'failed' THEN 'intent_failed'
        WHEN v_intent.status = 'needs_review' THEN 'intent_needs_review'
        WHEN v_intent.status = 'pending' THEN 'intent_pending'
        ELSE 'intent_not_paid'
      END
    );
  END IF;

  SELECT *
  INTO v_author
  FROM public.authors AS a
  WHERE a.id = v_intent.author_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'author_not_found',
      'author_id', v_intent.author_id
    );
  END IF;

  IF NOT v_author.payout_eligible THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'author_not_payout_eligible',
      'author_id', v_author.id
    );
  END IF;

  v_effective := v_intent.paid_at;
  v_terms := public.resolve_author_commercial_terms(
    v_author.id,
    v_effective,
    v_intent.currency
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
  -- Gross is the local validated intent amount, never the callback amount.
  v_amount := public.author_share_minor(v_intent.amount_minor, v_bps);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'zero_amount',
      'author_id', v_author.id
    );
  END IF;

  BEGIN
    INSERT INTO public.author_ledger_entries (
      author_id,
      entry_type,
      amount_minor,
      currency,
      payment_id,
      order_id,
      practice_id,
      terms_id,
      author_appreciation_intent_id,
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
      v_intent.currency,
      NULL,
      NULL,
      v_intent.practice_id,
      (v_terms ->> 'terms_id')::uuid,
      v_intent.id,
      v_bps,
      v_hold_days,
      v_intent.amount_minor,
      v_intent.amount_minor,
      v_effective,
      v_effective + make_interval(days => v_hold_days),
      coalesce(v_terms ->> 'calculation_version', 'p332.author_rounding_up_v1'),
      'p332:appreciation:' || v_intent.id::text,
      nullif(btrim(coalesce(p_correlation_id, '')), ''),
      p_actor_user_id,
      false,
      jsonb_build_object(
        'terms_valid_from', v_terms -> 'valid_from',
        'terms_valid_to', v_terms -> 'valid_to',
        'appreciation_intent_id', v_intent.id,
        'surface', v_intent.surface,
        'source_title', v_intent.source_title,
        'source_path', v_intent.source_path,
        'provider', v_intent.provider,
        'provider_deal_id', v_intent.provider_deal_id,
        'provider_deal_number', v_intent.provider_deal_number
      )
    )
    RETURNING * INTO v_entry;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_existing
      FROM public.author_ledger_entries AS e
      WHERE e.author_appreciation_intent_id = p_intent_id
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
      RAISE;
  END;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_appreciation_sale_accrual_created',
    'author_ledger_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'author_id', v_entry.author_id,
      'author_appreciation_intent_id', v_entry.author_appreciation_intent_id,
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

REVOKE ALL ON FUNCTION public.ensure_author_appreciation_sale_accrual(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_author_appreciation_sale_accrual(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_author_appreciation_sale_accrual(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_author_appreciation_sale_accrual IS
  'audiolad:author-appreciation; idempotently writes one sale_accrual for a paid appreciation intent using canonical commercial-terms math. UNIQUE(author_appreciation_intent_id). service_role only.';

CREATE OR REPLACE FUNCTION public.reconcile_author_appreciation_paid_intents(
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 10000));
  v_intent record;
  v_result jsonb;
  v_created integer := 0;
  v_replayed integer := 0;
  v_skipped integer := 0;
  v_review integer := 0;
BEGIN
  FOR v_intent IN
    SELECT i.id
    FROM public.author_appreciation_payment_intents AS i
    WHERE i.status = 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.author_ledger_entries AS e
        WHERE e.author_appreciation_intent_id = i.id
          AND e.entry_type = 'sale_accrual'
      )
    ORDER BY i.paid_at NULLS LAST, i.created_at
    LIMIT v_limit
    FOR UPDATE OF i
  LOOP
    v_result := public.ensure_author_appreciation_sale_accrual(v_intent.id);
    IF (v_result ->> 'outcome') = 'created' THEN
      v_created := v_created + 1;
    ELSIF (v_result ->> 'outcome') = 'idempotent_replay' THEN
      v_replayed := v_replayed + 1;
    ELSIF (v_result ->> 'outcome') = 'requires_review' THEN
      v_review := v_review + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'replayed', v_replayed,
    'skipped', v_skipped,
    'requires_review', v_review
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_author_appreciation_paid_intents(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_author_appreciation_paid_intents(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_author_appreciation_paid_intents(integer) TO service_role;

COMMENT ON FUNCTION public.reconcile_author_appreciation_paid_intents IS
  'audiolad:author-appreciation; durable backfill. Paid without accrual → one accrual via ensure_author_appreciation_sale_accrual. Paid with accrual → no-op. Failed/pending/needs_review are never selected.';

-- ---------------------------------------------------------------------------
-- 5. Paid callback + finance projection in one transaction
-- ---------------------------------------------------------------------------

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
    PERFORM public.ensure_author_appreciation_sale_accrual(v_intent.id);
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

  PERFORM public.ensure_author_appreciation_sale_accrual(v_intent.id);
  RETURN QUERY SELECT 'paid'::text, v_intent.id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_author_appreciation_getcourse_callback(text, text, text, bigint, text, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_author_appreciation_getcourse_callback(text, text, text, bigint, text, bigint, bigint)
  TO service_role;

COMMENT ON FUNCTION public.apply_author_appreciation_getcourse_callback IS
  'audiolad:author-appreciation; paid GetCourse callback updates the intent and projects one sale_accrual in the same transaction. Duplicate paid is already_paid + idempotent ensure.';

COMMENT ON TABLE public.author_appreciation_payment_intents IS
  'GetCourse appreciation intents. A paid intent is the financial source/correlation for exactly one author_ledger_entries.sale_accrual. It still creates no order, payment, or entitlement.';

-- Historical production paid intents (after #310) become one accrual each.
DO $$
BEGIN
  PERFORM public.reconcile_author_appreciation_paid_intents(10000);
END
$$;

COMMIT;

-- Author appreciation finance: never leave provider-paid as silent
-- paid-without-accrual. Provider paid fact stays on status/paid_at.
-- Finance outcome is an explicit projection state on the same intent.
--
-- Additive / backward-safe. Defaults historical paid rows to pending so
-- reconcile/backfill can project them. Does not drop columns or rewrite
-- paid → failed. Does not create orders, payments, or entitlements.
--
-- Rollback (operator): restore apply/ensure/reconcile from
-- 20260917120000; drop finance_projection_* columns. Do not delete
-- paid/failed provider audit rows.
--
-- DO NOT apply to production without explicit approval.

BEGIN;

ALTER TABLE public.author_appreciation_payment_intents
  ADD COLUMN IF NOT EXISTS finance_projection_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS finance_projected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS finance_projection_result_code text NULL;

ALTER TABLE public.author_appreciation_payment_intents
  DROP CONSTRAINT IF EXISTS author_appreciation_finance_projection_status_check;

ALTER TABLE public.author_appreciation_payment_intents
  ADD CONSTRAINT author_appreciation_finance_projection_status_check
  CHECK (finance_projection_status IN ('pending', 'projected', 'needs_review'));

COMMENT ON COLUMN public.author_appreciation_payment_intents.finance_projection_status IS
  'pending = not yet projected; projected = exactly one sale_accrual exists; needs_review = provider paid but canonical accrual could not be created. Never implied by status=paid alone.';

CREATE INDEX IF NOT EXISTS author_appreciation_intents_unprojected_paid_idx
  ON public.author_appreciation_payment_intents (paid_at, created_at)
  WHERE status = 'paid' AND finance_projection_status IS DISTINCT FROM 'projected';

-- Mark already-projected historical rows before changing RPCs.
UPDATE public.author_appreciation_payment_intents AS i
SET
  finance_projection_status = 'projected',
  finance_projected_at = coalesce(i.finance_projected_at, e.created_at, i.paid_at, now()),
  finance_projection_result_code = coalesce(i.finance_projection_result_code, 'accrual_exists')
FROM public.author_ledger_entries AS e
WHERE e.author_appreciation_intent_id = i.id
  AND e.entry_type = 'sale_accrual'
  AND i.finance_projection_status IS DISTINCT FROM 'projected';

CREATE OR REPLACE FUNCTION public.record_author_appreciation_finance_projection(
  p_intent_id uuid,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outcome text := coalesce(p_result ->> 'outcome', '');
  v_code text := coalesce(p_result ->> 'result_code', '');
BEGIN
  IF p_intent_id IS NULL THEN
    RETURN p_result;
  END IF;

  IF v_outcome IN ('created', 'idempotent_replay') THEN
    UPDATE public.author_appreciation_payment_intents
    SET
      finance_projection_status = 'projected',
      finance_projected_at = coalesce(finance_projected_at, now()),
      finance_projection_result_code = v_code,
      updated_at = now()
    WHERE id = p_intent_id
      AND status = 'paid';
  ELSIF v_outcome IN ('requires_review', 'skipped')
    AND v_code NOT IN (
      'intent_not_paid',
      'intent_pending',
      'intent_failed',
      'intent_needs_review'
    )
  THEN
    UPDATE public.author_appreciation_payment_intents
    SET
      finance_projection_status = 'needs_review',
      finance_projection_result_code = v_code,
      updated_at = now()
    WHERE id = p_intent_id
      AND status = 'paid'
      AND finance_projection_status IS DISTINCT FROM 'projected';
  END IF;

  RETURN p_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_author_appreciation_finance_projection(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_author_appreciation_finance_projection(uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_author_appreciation_finance_projection(uuid, jsonb) TO service_role;

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
  v_result jsonb;
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
    v_result := jsonb_build_object(
      'ok', true,
      'outcome', 'idempotent_replay',
      'result_code', 'accrual_exists',
      'author_id', v_existing.author_id,
      'entry', public.author_ledger_entry_row_json(v_existing)
    );
    RETURN public.record_author_appreciation_finance_projection(p_intent_id, v_result);
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
    v_result := jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'author_not_found',
      'author_id', v_intent.author_id
    );
    RETURN public.record_author_appreciation_finance_projection(p_intent_id, v_result);
  END IF;

  IF NOT v_author.payout_eligible THEN
    v_result := jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'author_not_payout_eligible',
      'author_id', v_author.id
    );
    RETURN public.record_author_appreciation_finance_projection(p_intent_id, v_result);
  END IF;

  v_effective := v_intent.paid_at;
  v_terms := public.resolve_author_commercial_terms(
    v_author.id,
    v_effective,
    v_intent.currency
  );

  IF (v_terms ->> 'found')::boolean IS DISTINCT FROM true THEN
    v_result := jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', coalesce(v_terms ->> 'reason', 'no_active_terms'),
      'author_id', v_author.id
    );
    RETURN public.record_author_appreciation_finance_projection(p_intent_id, v_result);
  END IF;

  v_bps := (v_terms ->> 'author_share_bps')::integer;
  v_hold_days := (v_terms ->> 'hold_days')::integer;
  v_amount := public.author_share_minor(v_intent.amount_minor, v_bps);

  IF v_amount <= 0 THEN
    v_result := jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'zero_amount',
      'author_id', v_author.id
    );
    RETURN public.record_author_appreciation_finance_projection(p_intent_id, v_result);
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
        v_result := jsonb_build_object(
          'ok', true,
          'outcome', 'idempotent_replay',
          'result_code', 'accrual_exists',
          'author_id', v_existing.author_id,
          'entry', public.author_ledger_entry_row_json(v_existing)
        );
        RETURN public.record_author_appreciation_finance_projection(p_intent_id, v_result);
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

  v_result := jsonb_build_object(
    'ok', true,
    'outcome', 'created',
    'result_code', 'accrual_created',
    'author_id', v_entry.author_id,
    'entry', public.author_ledger_entry_row_json(v_entry)
  );
  RETURN public.record_author_appreciation_finance_projection(p_intent_id, v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_author_appreciation_sale_accrual(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_author_appreciation_sale_accrual(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_author_appreciation_sale_accrual(uuid, text, uuid) TO service_role;

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
      AND (
        i.finance_projection_status IS DISTINCT FROM 'projected'
        OR NOT EXISTS (
          SELECT 1
          FROM public.author_ledger_entries AS e
          WHERE e.author_appreciation_intent_id = i.id
            AND e.entry_type = 'sale_accrual'
        )
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
  'audiolad:author-appreciation; selects provider-paid intents that are not successfully projected (pending/needs_review or missing sale_accrual) and retries the canonical ensure RPC.';

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
  v_projection jsonb;
  v_projection_outcome text;
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
    v_projection := public.ensure_author_appreciation_sale_accrual(v_intent.id);
    v_projection_outcome := coalesce(v_projection ->> 'outcome', '');
    IF v_projection_outcome IN ('created', 'idempotent_replay') THEN
      RETURN QUERY SELECT 'already_paid'::text, v_intent.id;
    ELSE
      RETURN QUERY SELECT 'already_paid_needs_review'::text, v_intent.id;
    END IF;
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

  v_projection := public.ensure_author_appreciation_sale_accrual(v_intent.id);
  v_projection_outcome := coalesce(v_projection ->> 'outcome', '');
  IF v_projection_outcome IN ('created', 'idempotent_replay') THEN
    RETURN QUERY SELECT 'paid'::text, v_intent.id;
  ELSE
    RETURN QUERY SELECT 'paid_needs_review'::text, v_intent.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_author_appreciation_getcourse_callback(text, text, text, bigint, text, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_author_appreciation_getcourse_callback(text, text, text, bigint, text, bigint, bigint)
  TO service_role;

COMMENT ON FUNCTION public.apply_author_appreciation_getcourse_callback IS
  'audiolad:author-appreciation; records provider paid, then projects finance. Failed accrual marks finance_projection_status=needs_review without rewriting paid.';

COMMENT ON TABLE public.author_appreciation_payment_intents IS
  'GetCourse appreciation intents. status/paid_at is the provider fact. finance_projection_status is the author-ledger projection. No order, payment, or entitlement is created.';

-- Historical / unprojected paid intents, including production paid-after-#310.
PERFORM 1;
DO $$
BEGIN
  PERFORM public.reconcile_author_appreciation_paid_intents(10000);
END
$$;

COMMIT;

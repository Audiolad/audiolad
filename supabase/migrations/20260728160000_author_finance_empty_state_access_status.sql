-- audiolad:payments-p334
-- Align finance empty-state selection with modern author access_status values.
-- Display-only: does not change ledger, shares, payout calculations, or eligibility rules.

CREATE OR REPLACE FUNCTION public.author_finance_p334_empty_state_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'not_payout_eligible_free',
    'not_payout_eligible_pending',
    'not_payout_eligible_commercial',
    'commercial_onboarding_incomplete',
    'access_suspended',
    'access_terminated',
    'terms_missing',
    'no_sales',
    'held_only',
    'below_threshold',
    'reserved_in_progress',
    'has_paid_history',
    'active_ok'
  ]::text[];
$$;

COMMENT ON FUNCTION public.author_finance_p334_empty_state_codes IS
  'audiolad:payments-p334; the closed set of primary cabinet states. Exactly one is chosen per author.';

CREATE OR REPLACE FUNCTION public.author_finance_p334_select_empty_state(
  p_payout_eligible boolean,
  p_access_status text,
  p_approved_terms integer,
  p_entry_count integer,
  p_payable bigint,
  p_reserved bigint,
  p_held bigint,
  p_paid_count integer,
  p_threshold bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_access_status IN ('suspended', 'commercial_suspended') THEN 'access_suspended'
    WHEN p_access_status = 'terminated' THEN 'access_terminated'
    WHEN p_access_status = 'commercial_onboarding' THEN 'commercial_onboarding_incomplete'
    -- commercial_active falls through even when payout_eligible is false.
    WHEN NOT coalesce(p_payout_eligible, false)
         AND coalesce(p_access_status, '') IS DISTINCT FROM 'commercial_active'
    THEN
      CASE p_access_status
        WHEN 'commercial' THEN 'not_payout_eligible_commercial'
        WHEN 'commercial_pending' THEN 'not_payout_eligible_pending'
        ELSE 'not_payout_eligible_free'
      END
    WHEN coalesce(p_approved_terms, 0) = 0 THEN 'terms_missing'
    WHEN coalesce(p_entry_count, 0) = 0 THEN 'no_sales'
    WHEN coalesce(p_payable, 0) >= coalesce(p_threshold, 100000) THEN 'active_ok'
    WHEN coalesce(p_payable, 0) > 0 THEN 'below_threshold'
    WHEN coalesce(p_reserved, 0) > 0 THEN 'reserved_in_progress'
    WHEN coalesce(p_held, 0) > 0 THEN 'held_only'
    WHEN coalesce(p_paid_count, 0) > 0 THEN 'has_paid_history'
    ELSE 'no_sales'
  END;
$$;

COMMENT ON FUNCTION public.author_finance_p334_select_empty_state IS
  'audiolad:payments-p334; chooses exactly one author-facing empty-state code from access and balance signals. commercial_active never maps to free.';

REVOKE ALL ON FUNCTION public.author_finance_p334_empty_state_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_empty_state_codes() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_empty_state_codes() TO service_role;

REVOKE ALL ON FUNCTION public.author_finance_p334_select_empty_state(
  boolean, text, integer, integer, bigint, bigint, bigint, integer, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_select_empty_state(
  boolean, text, integer, integer, bigint, bigint, bigint, integer, bigint
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_select_empty_state(
  boolean, text, integer, integer, bigint, bigint, bigint, integer, bigint
) TO service_role;

CREATE OR REPLACE FUNCTION public.author_finance_p334_summary(
  p_author_id uuid,
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
  v_balance jsonb;
  v_snapshot jsonb;
  v_author record;
  v_terms record;
  v_terms_status text := 'missing';
  v_terms_summary jsonb := NULL;
  v_approved_terms integer := 0;
  v_accrued bigint;
  v_reversed bigint;
  v_adjustments bigint;
  v_held bigint;
  v_available bigint;
  v_reserved bigint;
  v_payable bigint;
  v_paid bigint := 0;
  v_paid_count integer := 0;
  v_entry_count integer := 0;
  v_threshold bigint := public.author_payout_minimum_minor();
  v_oldest_payable_at timestamptz;
  v_next_hold_release_at timestamptz;
  v_review_count integer := 0;
  v_code text;
  v_message text;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT a.id, a.access_status, a.payout_eligible
  INTO v_author
  FROM public.authors AS a
  WHERE a.id = p_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_balance := public.author_finance_balance(p_author_id, v_include_test);
  v_snapshot := public.author_payout_payable_snapshot(
    p_author_id, now(), v_include_test, NULL
  );

  v_accrued := (v_balance ->> 'accrued_minor')::bigint;
  v_reversed := (v_balance ->> 'reversed_minor')::bigint;
  v_adjustments := (v_balance ->> 'adjustments_minor')::bigint;
  v_held := (v_balance ->> 'held_minor')::bigint;

  v_available := (v_snapshot ->> 'available_balance_minor')::bigint;
  v_reserved := (v_snapshot ->> 'active_reserved_minor')::bigint;
  v_payable := (v_snapshot ->> 'capacity_minor')::bigint;
  v_entry_count := (v_snapshot ->> 'entry_count')::integer;

  SELECT
    coalesce(sum(p.amount_minor), 0)::bigint,
    count(*)::integer
  INTO v_paid, v_paid_count
  FROM public.author_payouts AS p
  WHERE p.author_id = p_author_id
    AND p.status = 'paid'
    AND (v_include_test OR p.is_test = false);

  SELECT count(*)::integer
  INTO v_approved_terms
  FROM public.author_commercial_terms AS t
  WHERE t.author_id = p_author_id AND t.status = 'approved';

  SELECT
    t.author_share_bps, t.platform_fee_bps, t.hold_days,
    t.currency, t.valid_from, t.valid_to
  INTO v_terms
  FROM public.author_commercial_terms AS t
  WHERE t.author_id = p_author_id
    AND t.status = 'approved'
    AND t.valid_from <= now()
    AND (t.valid_to IS NULL OR t.valid_to > now())
  ORDER BY t.valid_from DESC
  LIMIT 1;

  IF FOUND THEN
    v_terms_status := 'active';
    v_terms_summary := jsonb_build_object(
      'author_share_bps', v_terms.author_share_bps,
      'platform_share_bps', v_terms.platform_fee_bps,
      'hold_days', v_terms.hold_days,
      'currency', v_terms.currency,
      'valid_from', v_terms.valid_from,
      'valid_to', v_terms.valid_to
    );
  ELSIF v_approved_terms > 0 THEN
    v_terms_status := 'ended';
  END IF;

  -- The oldest money that is already released and not yet claimed by a payout:
  -- this is what the author is actually waiting to be paid.
  SELECT min(e.effective_at)
  INTO v_oldest_payable_at
  FROM public.author_payout_available_entries(
    p_author_id, now(), v_include_test, NULL
  ) AS e
  WHERE e.is_available AND e.amount_minor > 0 AND e.remaining_minor > 0;

  SELECT min(e.group_available_at)
  INTO v_next_hold_release_at
  FROM public.author_payout_available_entries(
    p_author_id, now(), v_include_test, NULL
  ) AS e
  WHERE NOT e.is_available AND e.group_available_at > now();

  SELECT
    (
      SELECT count(*)::integer
      FROM public.author_payouts AS p
      WHERE p.author_id = p_author_id
        AND p.status = 'requires_review'
        AND (v_include_test OR p.is_test = false)
    )
    + (
      SELECT count(*)::integer
      FROM public.finance_obligations AS fo
      WHERE fo.author_id = p_author_id
        AND fo.status IN ('requires_review', 'failed')
        AND (v_include_test OR fo.is_test = false)
    )
  INTO v_review_count;

  -- Exactly one primary state. Access status is resolved first so a
  -- commercial_active author is never labelled as a free account merely
  -- because payout_eligible is still false.
  v_code := public.author_finance_p334_select_empty_state(
    coalesce(v_author.payout_eligible, false),
    v_author.access_status,
    v_approved_terms,
    v_entry_count,
    v_payable,
    v_reserved,
    v_held,
    v_paid_count,
    v_threshold
  );

  -- A message *key*, not a sentence: the Russian copy lives in the app layer.
  v_message := CASE
    WHEN v_available < 0 THEN 'negative_balance'
    ELSE v_code
  END;

  RETURN jsonb_build_object(
    'author_id', p_author_id,
    'currency', 'RUB',
    'include_test', v_include_test,
    'calculation_version', 'p334.v1',
    'as_of', now(),

    'accrued_minor', v_accrued,
    'refunds_reversed_minor', v_reversed,
    'adjustments_minor', v_adjustments,
    'held_minor', v_held,
    'available_minor', v_available,
    'reserved_minor', v_reserved,
    'payable_minor', v_payable,
    'paid_minor', v_paid,
    'paid_payout_count', v_paid_count,
    'entry_count', v_entry_count,

    'negative', v_available < 0,
    'negative_minor', least(0::bigint, v_available),

    'threshold_minor', v_threshold,
    'threshold_reached', v_payable >= v_threshold,

    'payout_eligible', coalesce(v_author.payout_eligible, false),
    'access_status', v_author.access_status,
    'terms_status', v_terms_status,
    'approved_terms_count', v_approved_terms,
    'active_terms_summary', v_terms_summary,

    'oldest_payable_at', v_oldest_payable_at,
    'next_hold_release_at', v_next_hold_release_at,
    'unresolved_review_count', v_review_count,

    'empty_state_code', v_code,
    'eligibility_message', v_message,

    'reconciliation', jsonb_build_object(
      'p332_held_minor', v_held,
      'p332_payable_minor', (v_balance ->> 'payable_minor')::bigint,
      'p333_available_minor', v_available,
      'p333_capacity_minor', v_payable,
      'sources', 'author_finance_balance+author_payout_payable_snapshot'
    ),

    'methodology', jsonb_build_object(
      'balances', 'as_of_now_not_period_bound',
      'holds', 'evaluated_per_payment_group',
      'reserved', 'active_payout_allocations_only',
      'paid', 'payouts_with_status_paid_only',
      'bank_details', 'not_stored'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_summary(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_summary(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_summary(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.author_finance_p334_summary IS
  'audiolad:payments-p334; author finance summary. Empty-state selection uses author_finance_p334_select_empty_state so commercial_active is never labelled as free.';

REVOKE ALL ON FUNCTION public.author_finance_p334_summary(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_summary(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_summary(uuid, boolean) TO service_role;

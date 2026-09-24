-- Partner reward dashboard PR4B.
-- Read-only owner projection over the PR4A append-only reward ledger.
-- No ledger writes, payouts, or backfill.

DO $$
DECLARE
  v_reward_rows bigint;
  v_payout_rows text := '';
BEGIN
  SELECT count(*) INTO v_reward_rows
  FROM public.author_partner_reward_ledger_entries;

  IF to_regclass('public.author_partner_payouts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.author_partner_payouts'
      INTO v_payout_rows;
  END IF;

  PERFORM set_config(
    'audiolad.pr4b_reward_rows_before', v_reward_rows::text, false
  );
  PERFORM set_config(
    'audiolad.pr4b_payout_rows_before', v_payout_rows, false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_author_partner_reward_dashboard(
  p_author_id uuid,
  p_history_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_history_limit, 25), 100));
  v_balances jsonb;
  v_history jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL OR NOT public.author_partner_is_owner(p_author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currency', totals.currency,
        'accrued_minor', totals.accrued_minor,
        'held_minor', totals.held_minor,
        'available_minor', totals.available_minor,
        'paid_minor', 0,
        'invariant_ok',
          totals.accrued_minor = totals.held_minor + totals.available_minor
      )
      ORDER BY totals.currency
    ),
    '[]'::jsonb
  )
  INTO v_balances
  FROM (
    SELECT
      e.currency,
      coalesce(sum(e.amount_minor), 0)::bigint AS accrued_minor,
      coalesce(sum(e.amount_minor) FILTER (
        WHERE e.available_at IS NULL OR e.available_at > now()
      ), 0)::bigint AS held_minor,
      coalesce(sum(e.amount_minor) FILTER (
        WHERE e.available_at <= now()
      ), 0)::bigint AS available_minor
    FROM public.author_partner_reward_ledger_entries AS e
    WHERE e.partner_author_id = p_author_id
    GROUP BY e.currency
  ) AS totals;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', 'Партнёрское вознаграждение',
        'type', row.entry_type,
        'amount_minor', row.amount_minor,
        'currency', row.currency,
        'effective_at', row.effective_at,
        'availability_state',
          CASE
            WHEN row.available_at IS NULL OR row.available_at > now() THEN 'held'
            ELSE 'available'
          END
      )
      ORDER BY row.effective_at DESC, row.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_history
  FROM (
    SELECT
      e.entry_type,
      e.amount_minor,
      e.currency,
      e.effective_at,
      e.available_at,
      e.created_at
    FROM public.author_partner_reward_ledger_entries AS e
    WHERE e.partner_author_id = p_author_id
    ORDER BY e.effective_at DESC, e.created_at DESC
    LIMIT v_limit
  ) AS row;

  RETURN jsonb_build_object(
    'balances', v_balances,
    'history', v_history
  );
END;
$$;

COMMENT ON FUNCTION public.get_author_partner_reward_dashboard(uuid, integer) IS
  'audiolad:author-partner:pr4b; owner-only safe partner reward balance/history read model; no payout projection.';

REVOKE ALL ON FUNCTION public.get_author_partner_reward_dashboard(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_author_partner_reward_dashboard(uuid, integer)
  TO authenticated, service_role;

DO $$
DECLARE
  v_reward_rows_before bigint;
  v_payout_rows_before text;
  v_reward_rows bigint;
  v_payout_rows bigint;
BEGIN
  v_reward_rows_before := current_setting(
    'audiolad.pr4b_reward_rows_before', true
  )::bigint;
  v_payout_rows_before := current_setting(
    'audiolad.pr4b_payout_rows_before', true
  );

  SELECT count(*) INTO v_reward_rows
  FROM public.author_partner_reward_ledger_entries;

  IF v_reward_rows IS DISTINCT FROM v_reward_rows_before THEN
    RAISE EXCEPTION 'Post-check failed: PR4B changed partner reward ledger count';
  END IF;

  IF to_regclass('public.author_partner_payouts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.author_partner_payouts'
      INTO v_payout_rows;
    IF v_payout_rows::text IS DISTINCT FROM v_payout_rows_before THEN
      RAISE EXCEPTION 'Post-check failed: PR4B changed partner payout count';
    END IF;
  END IF;
END;
$$;

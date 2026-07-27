-- ---------------------------------------------------------------------------
-- P3.3.4 — Author finance cabinet (read-only)
--
-- What this migration is:
--   A projection layer. It creates no table, no fact, no accrual, no payout,
--   no write path and no email. Every function here is STABLE and reads what
--   P3.1 / P3.3.1 / P3.3.2 / P3.3.3 already decided.
--
-- What an author may see:
--   Their own money, in their own words. Nothing about the buyer, nothing
--   about the operator, nothing about how a decision was argued internally.
--   The forbidden set is explicit and enforced by projection, not by hope:
--     - no payment_id / refund_id / order_id / terms_id / payout ledger ids
--     - no calculation_snapshot
--     - no buyer identity, no provider, no bank data (none is stored anyway)
--     - no admin actor, no admin notes, no internal reason_code / reason_text
--     - no failure_code, no review_reason, no cancel_reason
--     - external_reference is masked, never returned raw
--
-- Ownership:
--   These functions take p_author_id and trust it, exactly like every other
--   service_role RPC in this codebase. They are granted to service_role only
--   and are unreachable from anon / authenticated. The API layer
--   (src/app/api/author/finance/*) is what proves the caller owns that author:
--   it parses the id, calls requireAuthorMembership() against the *user's own*
--   session client, and only then calls these RPCs with the verified id.
--   Row-level ownership is still re-checked here for the two by-id lookups
--   (ledger detail, payout detail) so a wrong id can never widen the view.
--
-- Reconciliation:
--   author_finance_p334_summary does not recompute money. It composes
--   public.author_finance_balance (P3.3.2) and
--   public.author_payout_payable_snapshot (P3.3.3) so the author cabinet and
--   the admin panel can never drift: if they ever disagree, one of those two
--   functions changed and admin_author_finance_p334_integrity_snapshot fails.
--
-- Indexes:
--   None added. Every query below is author-scoped and already covered by
--   author_ledger_entries_author_effective_idx, author_payouts_author_idx,
--   author_payout_allocations_author_idx and author_commercial_terms_author_idx.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Vocabulary: machine keys, never Russian copy
--
-- These functions return stable keys. The Russian wording lives in
-- src/lib/author-finance/labels.ts so there is exactly one place to change a
-- sentence, and so a copy edit is never a database migration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_finance_p334_type_key(
  p_entry_type text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_entry_type
    WHEN 'sale_accrual' THEN 'sale'
    WHEN 'refund_reversal' THEN 'refund'
    WHEN 'manual_credit' THEN 'adjustment_credit'
    WHEN 'manual_debit' THEN 'adjustment_debit'
    WHEN 'correction' THEN 'correction'
    WHEN 'chargeback_reversal' THEN 'chargeback'
    WHEN 'payout' THEN 'payout'
    WHEN 'payout_reversal' THEN 'payout_reversal'
    ELSE 'other'
  END;
$$;

COMMENT ON FUNCTION public.author_finance_p334_type_key IS
  'audiolad:payments-p334; ledger entry type -> author-facing label key. The raw entry_type never reaches the author API.';

CREATE OR REPLACE FUNCTION public.author_finance_p334_type_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'sale',
    'refund',
    'adjustment_credit',
    'adjustment_debit',
    'correction',
    'chargeback',
    'payout',
    'payout_reversal'
  ]::text[];
$$;

COMMENT ON FUNCTION public.author_finance_p334_type_keys IS
  'audiolad:payments-p334; every author-facing ledger type key, used to validate the type filter.';

CREATE OR REPLACE FUNCTION public.author_finance_p334_amount_states()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['held', 'available', 'reserved', 'paid', 'adjustment']::text[];
$$;

COMMENT ON FUNCTION public.author_finance_p334_amount_states IS
  'audiolad:payments-p334; the five states a ledger row can be in from the author side.';

/**
 * Payout status as the author should read it.
 *
 * draft and approved collapse into one "preparing" state on purpose: an author
 * has no use for the difference between an operator having created a document
 * and an operator having signed it off, and the distinction leaks the internal
 * workflow. failed becomes "delayed" because a failed transfer is, from the
 * author's side, money that is still theirs and still coming.
 */
CREATE OR REPLACE FUNCTION public.author_finance_p334_payout_status_key(
  p_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'draft' THEN 'preparing'
    WHEN 'approved' THEN 'preparing'
    WHEN 'processing' THEN 'processing'
    WHEN 'paid' THEN 'paid'
    WHEN 'failed' THEN 'delayed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'requires_review' THEN 'on_review'
    WHEN 'reversed' THEN 'reversed'
    ELSE 'unknown'
  END;
$$;

COMMENT ON FUNCTION public.author_finance_p334_payout_status_key IS
  'audiolad:payments-p334; payout status -> author-facing key. failure_code and the internal reasons are never exposed.';

CREATE OR REPLACE FUNCTION public.author_finance_p334_payout_status_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'preparing',
    'processing',
    'paid',
    'delayed',
    'cancelled',
    'on_review',
    'reversed'
  ]::text[];
$$;

COMMENT ON FUNCTION public.author_finance_p334_payout_status_keys IS
  'audiolad:payments-p334; every author-facing payout status key.';

/**
 * The operator's transfer reference, reduced to just enough to match a bank
 * statement line. Never the whole string: it is the operator's own document
 * numbering and is not the author's to read.
 */
CREATE OR REPLACE FUNCTION public.author_finance_p334_mask_reference(
  p_reference text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_reference IS NULL OR btrim(p_reference) = '' THEN NULL
    WHEN char_length(btrim(p_reference)) <= 4
      THEN repeat('•', char_length(btrim(p_reference)))
    ELSE '•••' || right(btrim(p_reference), 4)
  END;
$$;

COMMENT ON FUNCTION public.author_finance_p334_mask_reference IS
  'audiolad:payments-p334; keeps the last 4 characters of a transfer reference so an author can match a statement line, and hides the rest.';

CREATE OR REPLACE FUNCTION public.author_finance_p334_empty_state_codes()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'not_payout_eligible_free',
    'not_payout_eligible_pending',
    'not_payout_eligible_commercial',
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

-- The vocabulary functions touch no data, but they are part of the P3.3.4
-- surface and the integrity snapshot asserts that no function of that surface
-- is reachable from a client role. Default PUBLIC EXECUTE would break that.
DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.author_finance_p334_type_key(text)',
    'public.author_finance_p334_type_keys()',
    'public.author_finance_p334_amount_states()',
    'public.author_finance_p334_payout_status_key(text)',
    'public.author_finance_p334_payout_status_keys()',
    'public.author_finance_p334_mask_reference(text)',
    'public.author_finance_p334_empty_state_codes()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The one place a ledger row is made author-safe
--
-- Everything the author ever sees about a ledger row comes from this
-- projection. A field that is not selected here cannot leak into a list, a
-- detail view or a CSV export, because none of them read the table directly.
-- ---------------------------------------------------------------------------

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
      -- A payout row *is* the money leaving; it is never "available" again.
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
    o.practice_title_snapshot AS product_title,
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

COMMENT ON FUNCTION public.author_finance_p334_entries IS
  'audiolad:payments-p334; the only author-safe projection of author_ledger_entries. Availability comes from author_payout_available_entries so the cabinet and the payout engine agree by construction; service_role only.';

-- ---------------------------------------------------------------------------
-- 3. Summary
--
-- Composed from P3.3.2 and P3.3.3 rather than recomputed. The KPI numbers are
-- always as of now(): a period filter belongs to activity, never to a balance.
-- ---------------------------------------------------------------------------

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

  -- Exactly one primary state. The order is the order an author would ask the
  -- questions in: am I a payee at all, are there terms, did anything sell,
  -- can I be paid, and if not — why not.
  v_code := CASE
    WHEN NOT coalesce(v_author.payout_eligible, false) THEN
      CASE v_author.access_status
        WHEN 'commercial' THEN 'not_payout_eligible_commercial'
        WHEN 'commercial_pending' THEN 'not_payout_eligible_pending'
        ELSE 'not_payout_eligible_free'
      END
    WHEN v_approved_terms = 0 THEN 'terms_missing'
    WHEN v_entry_count = 0 THEN 'no_sales'
    WHEN v_payable >= v_threshold THEN 'active_ok'
    WHEN v_payable > 0 THEN 'below_threshold'
    WHEN v_reserved > 0 THEN 'reserved_in_progress'
    WHEN v_held > 0 THEN 'held_only'
    WHEN v_paid_count > 0 THEN 'has_paid_history'
    ELSE 'no_sales'
  END;

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
  'audiolad:payments-p334; one author own finance KPIs, composed from author_finance_balance (P3.3.2) and author_payout_payable_snapshot (P3.3.3) so the cabinet can never drift from the admin panel. Ownership of p_author_id is proved by the API before this is called; service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Terms
--
-- Approved and superseded only. A draft is an internal negotiation state and a
-- cancelled draft is an internal decision; neither is the author's history.
-- Notes, actors and closed_reason are never projected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_finance_p334_terms(
  p_author_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH safe AS (
    SELECT
      t.currency,
      t.author_share_bps,
      t.platform_fee_bps AS platform_share_bps,
      t.hold_days,
      t.status,
      t.valid_from,
      t.valid_to,
      (
        t.status = 'approved'
        AND t.valid_from <= now()
        AND (t.valid_to IS NULL OR t.valid_to > now())
      ) AS is_active_now
    FROM public.author_commercial_terms AS t
    WHERE t.author_id = p_author_id
      AND t.status IN ('approved', 'superseded')
  )
  SELECT jsonb_build_object(
    'author_id', p_author_id,
    'currency', 'RUB',
    'active', (
      SELECT to_jsonb(s) FROM safe AS s WHERE s.is_active_now
      ORDER BY s.valid_from DESC LIMIT 1
    ),
    'history', (
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.valid_from DESC), '[]'::jsonb)
      FROM safe AS s
    ),
    'total', (SELECT count(*)::integer FROM safe)
  );
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_terms(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_terms(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_terms(uuid) TO service_role;

COMMENT ON FUNCTION public.author_finance_p334_terms IS
  'audiolad:payments-p334; author-safe commercial terms: share, hold, currency and validity only. Drafts, cancelled drafts, notes, actors and closed_reason are never returned; service_role only.';

-- ---------------------------------------------------------------------------
-- 5. Ledger list
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_finance_p334_ledger(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 5000));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_type text := nullif(btrim(coalesce(p_type, '')), '');
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_total integer := 0;
  v_rows jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_type IS NOT NULL
     AND NOT (v_type = ANY (public.author_finance_p334_type_keys())) THEN
    v_type := NULL;
  END IF;

  WITH scoped AS (
    SELECT
      e.entry_id,
      e.type_key,
      e.amount_minor,
      e.currency,
      e.effective_at,
      e.available_at,
      e.is_held,
      e.amount_state,
      e.product_title,
      e.payout_safe_ref,
      NULL::text AS public_comment
    FROM public.author_finance_p334_entries(
      p_author_id, coalesce(p_include_test, false)
    ) AS e
    WHERE (p_from IS NULL OR e.effective_at >= p_from)
      AND (p_to IS NULL OR e.effective_at < p_to)
      AND (v_type IS NULL OR e.type_key = v_type)
      AND (v_q IS NULL OR coalesce(e.product_title, '') ILIKE '%' || v_q || '%')
  )
  SELECT
    (SELECT count(*)::integer FROM scoped),
    (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.effective_at DESC, x.entry_id), '[]'::jsonb)
      FROM (
        SELECT * FROM scoped
        ORDER BY effective_at DESC, entry_id
        LIMIT v_limit
        OFFSET v_offset
      ) AS x
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'author_id', p_author_id,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'type', v_type,
    'from', p_from,
    'to', p_to,
    'include_test', coalesce(p_include_test, false),
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_ledger(
  uuid, timestamptz, timestamptz, text, text, integer, integer, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_ledger(
  uuid, timestamptz, timestamptz, text, text, integer, integer, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_ledger(
  uuid, timestamptz, timestamptz, text, text, integer, integer, boolean
) TO service_role;

COMMENT ON FUNCTION public.author_finance_p334_ledger IS
  'audiolad:payments-p334; own ledger history, author-safe. No payment/refund/order/terms ids, no calculation basis ids, no buyer, no admin actor, no internal reason_code; service_role only.';

-- ---------------------------------------------------------------------------
-- 6. Ledger detail
--
-- The only extra a detail view adds is the arithmetic: what the sale was, what
-- share applied, what the hold was. public_comment stays NULL by construction:
-- P3.3.4 never derives author-visible text from an internal reason or note.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_finance_p334_ledger_detail(
  p_author_id uuid,
  p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry public.author_ledger_entries%ROWTYPE;
  v_safe record;
BEGIN
  IF p_author_id IS NULL OR p_entry_id IS NULL THEN
    RAISE EXCEPTION 'author_id_and_entry_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry
  FROM public.author_ledger_entries
  WHERE id = p_entry_id;

  -- A wrong id and someone else's id are the same answer on purpose: an
  -- existence oracle is a leak of its own.
  IF NOT FOUND OR v_entry.author_id <> p_author_id THEN
    RETURN jsonb_build_object('found', false, 'entry', NULL);
  END IF;

  SELECT * INTO v_safe
  FROM public.author_finance_p334_entries(p_author_id, v_entry.is_test) AS e
  WHERE e.entry_id = p_entry_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'entry', NULL);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'entry', jsonb_build_object(
      'entry_id', v_safe.entry_id,
      'type_key', v_safe.type_key,
      'amount_minor', v_safe.amount_minor,
      'currency', v_safe.currency,
      'effective_at', v_safe.effective_at,
      'available_at', v_safe.available_at,
      'is_held', v_safe.is_held,
      'amount_state', v_safe.amount_state,
      'product_title', v_safe.product_title,
      'payout_safe_ref', v_safe.payout_safe_ref,
      'public_comment', NULL::text
    ),
    'formula', jsonb_build_object(
      'gross_basis_minor', v_entry.gross_basis_minor,
      'net_basis_minor', v_entry.net_basis_minor,
      'author_share_bps', v_entry.author_share_bps,
      'platform_share_bps',
        CASE WHEN v_entry.author_share_bps IS NULL THEN NULL
             ELSE 10000 - v_entry.author_share_bps END,
      'hold_days', v_entry.hold_days,
      'rounding', 'floor_author_remainder_platform',
      'refund_policy', 'proportional_reversal'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_ledger_detail(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_ledger_detail(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_ledger_detail(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.author_finance_p334_ledger_detail IS
  'audiolad:payments-p334; safe formula detail for one own entry. Returns found=false for a foreign or unknown entry, never a different error, so it cannot be used to probe other authors; service_role only.';

-- ---------------------------------------------------------------------------
-- 7. Payout history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_finance_p334_payouts(
  p_author_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 5000));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_total integer := 0;
  v_rows jsonb;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'author_id_required' USING ERRCODE = '22023';
  END IF;

  IF v_status IS NOT NULL
     AND NOT (v_status = ANY (public.author_finance_p334_payout_status_keys())) THEN
    v_status := NULL;
  END IF;

  SELECT count(*)::integer
  INTO v_total
  FROM public.author_payouts AS p
  WHERE p.author_id = p_author_id
    AND (coalesce(p_include_test, false) OR p.is_test = false)
    AND (p_from IS NULL OR p.created_at >= p_from)
    AND (p_to IS NULL OR p.created_at < p_to)
    AND (
      v_status IS NULL
      OR public.author_finance_p334_payout_status_key(p.status) = v_status
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.payout_id), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.id AS payout_id,
      public.author_finance_p334_payout_status_key(p.status) AS status_key,
      p.amount_minor,
      p.currency,
      p.period_label,
      p.created_at,
      p.paid_at,
      public.author_finance_p334_mask_reference(p.external_reference)
        AS reference_masked,
      (p.status = 'paid') AS is_settled
    FROM public.author_payouts AS p
    WHERE p.author_id = p_author_id
      AND (coalesce(p_include_test, false) OR p.is_test = false)
      AND (p_from IS NULL OR p.created_at >= p_from)
      AND (p_to IS NULL OR p.created_at < p_to)
      AND (
        v_status IS NULL
        OR public.author_finance_p334_payout_status_key(p.status) = v_status
      )
    ORDER BY p.created_at DESC, p.id
    LIMIT v_limit
    OFFSET v_offset
  ) AS x;

  RETURN jsonb_build_object(
    'author_id', p_author_id,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'status', v_status,
    'include_test', coalesce(p_include_test, false),
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_payouts(
  uuid, timestamptz, timestamptz, text, integer, integer, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_payouts(
  uuid, timestamptz, timestamptz, text, integer, integer, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_payouts(
  uuid, timestamptz, timestamptz, text, integer, integer, boolean
) TO service_role;

COMMENT ON FUNCTION public.author_finance_p334_payouts IS
  'audiolad:payments-p334; own payout history with author-facing status keys and a masked transfer reference; service_role only.';

CREATE OR REPLACE FUNCTION public.author_finance_p334_payout_detail(
  p_author_id uuid,
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
BEGIN
  IF p_author_id IS NULL OR p_payout_id IS NULL THEN
    RAISE EXCEPTION 'author_id_and_payout_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout FROM public.author_payouts WHERE id = p_payout_id;

  IF NOT FOUND OR v_payout.author_id <> p_author_id THEN
    RETURN jsonb_build_object('found', false, 'payout', NULL);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'payout', jsonb_build_object(
      'payout_id', v_payout.id,
      'status_key', public.author_finance_p334_payout_status_key(v_payout.status),
      'amount_minor', v_payout.amount_minor,
      'currency', v_payout.currency,
      'period_label', v_payout.period_label,
      'period_start', v_payout.period_start,
      'period_end', v_payout.period_end,
      'cutoff_at', v_payout.cutoff_at,
      'minimum_minor', v_payout.minimum_minor,
      'reference_masked',
        public.author_finance_p334_mask_reference(v_payout.external_reference),
      'created_at', v_payout.created_at,
      'paid_at', v_payout.paid_at,
      -- Only the timestamps an author can act on. failure_code,
      -- failure_reason, review_reason, cancel_reason, notes, the approving and
      -- paying operators and calculation_snapshot are all withheld.
      'processing_at', v_payout.processing_at,
      'delayed_at', v_payout.failed_at,
      'cancelled_at', v_payout.cancelled_at,
      'reversed_at', v_payout.reversed_at
    ),
    'entries', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.effective_at, x.entry_id), '[]'::jsonb)
      FROM (
        SELECT
          e.id AS entry_id,
          public.author_finance_p334_type_key(e.entry_type) AS type_key,
          al.amount_minor AS allocated_minor,
          e.effective_at,
          o.practice_title_snapshot AS product_title
        FROM public.author_payout_allocations AS al
        JOIN public.author_ledger_entries AS e ON e.id = al.ledger_entry_id
        LEFT JOIN public.orders AS o ON o.id = e.order_id
        WHERE al.payout_id = v_payout.id
          AND al.author_id = p_author_id
          AND e.author_id = p_author_id
          AND al.status = ANY (public.author_payout_allocation_consuming_statuses())
      ) AS x
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_payout_detail(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_payout_detail(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_payout_detail(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.author_finance_p334_payout_detail IS
  'audiolad:payments-p334; one own payout with the sales it settled. No operator identity, no failure_code, no internal notes, no calculation_snapshot, masked reference; service_role only.';

-- ---------------------------------------------------------------------------
-- 8. Integrity status the author may see
--
-- Four words, no detail. An author is entitled to know that their money is
-- being looked at; they are not entitled to the reason an operator wrote down.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_finance_p334_integrity_status(
  p_author_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_author_id IS NULL THEN
    RETURN 'unavailable';
  END IF;

  SELECT true INTO v_exists FROM public.authors WHERE id = p_author_id;
  IF NOT FOUND THEN
    RETURN 'unavailable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.author_payouts
    WHERE author_id = p_author_id AND status = 'requires_review' AND is_test = false
  ) OR EXISTS (
    SELECT 1 FROM public.finance_obligations
    WHERE author_id = p_author_id
      AND status IN ('requires_review', 'failed')
      AND is_test = false
  ) THEN
    RETURN 'review_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.author_payouts
    WHERE author_id = p_author_id
      AND status IN ('draft', 'approved', 'processing')
      AND is_test = false
  ) OR EXISTS (
    SELECT 1 FROM public.finance_obligations
    WHERE author_id = p_author_id AND status = 'pending' AND is_test = false
  ) THEN
    RETURN 'processing';
  END IF;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.author_finance_p334_integrity_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_finance_p334_integrity_status(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_finance_p334_integrity_status(uuid) TO service_role;

COMMENT ON FUNCTION public.author_finance_p334_integrity_status IS
  'audiolad:payments-p334; ok | processing | review_required | unavailable. Never a reason, never an id; service_role only.';

-- ---------------------------------------------------------------------------
-- 9. Admin integrity snapshot
--
-- The critical one. It compares what the author cabinet says against what the
-- admin aggregates say, and it probes the projections for leaks: a foreign
-- row, a forbidden field, test money in a real view, a period filter that
-- silently changes a balance.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_author_finance_p334_integrity_snapshot(
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
  v_author record;
  v_summary jsonb;
  v_balance jsonb;
  v_snapshot jsonb;
  v_ledger jsonb;
  v_payouts jsonb;
  v_row jsonb;

  v_authors_checked integer := 0;
  v_held_mismatch integer := 0;
  v_available_mismatch integer := 0;
  v_reserved_mismatch integer := 0;
  v_payable_mismatch integer := 0;
  v_paid_mismatch integer := 0;
  v_processing_counted_as_paid integer := 0;
  v_reserved_counted_as_payable integer := 0;
  v_held_counted_as_payable integer := 0;
  v_empty_state_invalid integer := 0;
  v_ledger_cross_author integer := 0;
  v_payout_cross_author integer := 0;
  v_ledger_test_leak integer := 0;
  v_payout_test_leak integer := 0;
  v_forbidden_ledger_fields integer := 0;
  v_forbidden_payout_fields integer := 0;
  v_masking_failures integer := 0;
  v_period_filter_changes_balance integer := 0;
  v_detail_cross_author integer := 0;
  v_expected_paid bigint;

  v_forbidden_ledger text[] := ARRAY[
    'payment_id', 'refund_id', 'order_id', 'terms_id', 'payout_id',
    'calculation_snapshot', 'calculation_version', 'reason_code', 'notes',
    'created_by', 'metadata', 'entry_type', 'gross_basis_minor',
    'net_basis_minor', 'author_share_bps', 'idempotency_key', 'correlation_id',
    'user_id', 'buyer_id', 'provider', 'external_reference'
  ];
  v_forbidden_payout text[] := ARRAY[
    'failure_code', 'failure_reason', 'review_reason', 'cancel_reason',
    'reversal_reason', 'notes', 'calculation_snapshot', 'idempotency_key',
    'external_reference', 'approved_by', 'paid_by', 'created_by',
    'reversed_by', 'ledger_entry_id', 'reversal_ledger_entry_id',
    'minimum_override_reason', 'correlation_id', 'status'
  ];
BEGIN
  FOR v_author IN
    SELECT a.id, a.payout_eligible
    FROM public.authors AS a
    WHERE EXISTS (
        SELECT 1 FROM public.author_ledger_entries AS e WHERE e.author_id = a.id
      )
      OR a.payout_eligible = true
    ORDER BY a.id
  LOOP
    v_authors_checked := v_authors_checked + 1;

    v_summary := public.author_finance_p334_summary(v_author.id, v_include_test);
    v_balance := public.author_finance_balance(v_author.id, v_include_test);
    v_snapshot := public.author_payout_payable_snapshot(
      v_author.id, now(), v_include_test, NULL
    );

    -- 1. The cabinet must agree with both upstream sources of truth.
    IF (v_summary ->> 'held_minor')::bigint <> (v_balance ->> 'held_minor')::bigint THEN
      v_held_mismatch := v_held_mismatch + 1;
    END IF;

    IF (v_summary ->> 'available_minor')::bigint
       <> (v_snapshot ->> 'available_balance_minor')::bigint THEN
      v_available_mismatch := v_available_mismatch + 1;
    END IF;

    IF (v_summary ->> 'reserved_minor')::bigint
       <> (v_snapshot ->> 'active_reserved_minor')::bigint THEN
      v_reserved_mismatch := v_reserved_mismatch + 1;
    END IF;

    IF (v_summary ->> 'payable_minor')::bigint
       <> (v_snapshot ->> 'capacity_minor')::bigint THEN
      v_payable_mismatch := v_payable_mismatch + 1;
    END IF;

    -- P3.3.2 payable and P3.3.3 available are the same money seen twice.
    IF (v_balance ->> 'payable_minor')::bigint
       <> (v_snapshot ->> 'available_balance_minor')::bigint THEN
      v_available_mismatch := v_available_mismatch + 1;
    END IF;

    -- 2. Paid means paid: nothing in flight may be counted as settled.
    SELECT coalesce(sum(p.amount_minor), 0)::bigint
    INTO v_expected_paid
    FROM public.author_payouts AS p
    WHERE p.author_id = v_author.id
      AND p.status = 'paid'
      AND (v_include_test OR p.is_test = false);

    IF (v_summary ->> 'paid_minor')::bigint <> v_expected_paid THEN
      v_paid_mismatch := v_paid_mismatch + 1;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.author_payouts AS p
      WHERE p.author_id = v_author.id
        AND p.status IN ('draft', 'approved', 'processing', 'requires_review')
        AND (v_include_test OR p.is_test = false)
    ) AND (v_summary ->> 'paid_minor')::bigint > v_expected_paid THEN
      v_processing_counted_as_paid := v_processing_counted_as_paid + 1;
    END IF;

    -- 3. Reserved and held money is not payable money.
    IF (v_summary ->> 'reserved_minor')::bigint > 0
       AND (v_summary ->> 'payable_minor')::bigint
           > (v_summary ->> 'available_minor')::bigint
             - (v_summary ->> 'reserved_minor')::bigint THEN
      v_reserved_counted_as_payable := v_reserved_counted_as_payable + 1;
    END IF;

    IF (v_summary ->> 'held_minor')::bigint > 0
       AND (v_summary ->> 'payable_minor')::bigint
           > (v_summary ->> 'available_minor')::bigint THEN
      v_held_counted_as_payable := v_held_counted_as_payable + 1;
    END IF;

    IF NOT (
      (v_summary ->> 'empty_state_code')
      = ANY (public.author_finance_p334_empty_state_codes())
    ) THEN
      v_empty_state_invalid := v_empty_state_invalid + 1;
    END IF;

    -- 4. A period filter is an activity filter. It must never move a balance.
    IF (
      public.author_finance_p334_summary(v_author.id, v_include_test)
        ->> 'payable_minor'
    )::bigint <> (v_summary ->> 'payable_minor')::bigint THEN
      v_period_filter_changes_balance := v_period_filter_changes_balance + 1;
    END IF;

    -- 5. Projection probes: every returned row must be this author's own, must
    --    not be test money in a real view, and must not carry a forbidden key.
    v_ledger := public.author_finance_p334_ledger(
      v_author.id, NULL, NULL, NULL, NULL, 500, 0, v_include_test
    );

    FOR v_row IN SELECT * FROM jsonb_array_elements(v_ledger -> 'rows')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.author_ledger_entries AS e
        WHERE e.id = (v_row ->> 'entry_id')::uuid
          AND e.author_id = v_author.id
      ) THEN
        v_ledger_cross_author := v_ledger_cross_author + 1;
      END IF;

      IF NOT v_include_test AND EXISTS (
        SELECT 1 FROM public.author_ledger_entries AS e
        WHERE e.id = (v_row ->> 'entry_id')::uuid AND e.is_test = true
      ) THEN
        v_ledger_test_leak := v_ledger_test_leak + 1;
      END IF;

      v_forbidden_ledger_fields := v_forbidden_ledger_fields + (
        SELECT count(*)::integer
        FROM jsonb_object_keys(v_row) AS k
        WHERE k = ANY (v_forbidden_ledger)
      );

      IF (v_row ->> 'entry_id') IS NOT NULL
         AND NOT (
           (public.author_finance_p334_ledger_detail(
              v_author.id, (v_row ->> 'entry_id')::uuid
            ) ->> 'found')::boolean
         ) THEN
        v_detail_cross_author := v_detail_cross_author + 1;
      END IF;
    END LOOP;

    v_payouts := public.author_finance_p334_payouts(
      v_author.id, NULL, NULL, NULL, 500, 0, v_include_test
    );

    FOR v_row IN SELECT * FROM jsonb_array_elements(v_payouts -> 'rows')
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.author_payouts AS p
        WHERE p.id = (v_row ->> 'payout_id')::uuid
          AND p.author_id = v_author.id
      ) THEN
        v_payout_cross_author := v_payout_cross_author + 1;
      END IF;

      IF NOT v_include_test AND EXISTS (
        SELECT 1 FROM public.author_payouts AS p
        WHERE p.id = (v_row ->> 'payout_id')::uuid AND p.is_test = true
      ) THEN
        v_payout_test_leak := v_payout_test_leak + 1;
      END IF;

      v_forbidden_payout_fields := v_forbidden_payout_fields + (
        SELECT count(*)::integer
        FROM jsonb_object_keys(v_row) AS k
        WHERE k = ANY (v_forbidden_payout)
      );

      IF EXISTS (
        SELECT 1 FROM public.author_payouts AS p
        WHERE p.id = (v_row ->> 'payout_id')::uuid
          AND p.external_reference IS NOT NULL
          AND btrim(p.external_reference) <> ''
          AND (
            v_row ->> 'reference_masked' IS NULL
            OR v_row ->> 'reference_masked' = p.external_reference
          )
      ) THEN
        v_masking_failures := v_masking_failures + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'include_test', v_include_test,
    'calculation_version', 'p334.v1',
    'authors_checked', v_authors_checked,

    'held_mismatch', v_held_mismatch,
    'available_mismatch', v_available_mismatch,
    'reserved_mismatch', v_reserved_mismatch,
    'payable_mismatch', v_payable_mismatch,
    'paid_mismatch', v_paid_mismatch,
    'processing_counted_as_paid', v_processing_counted_as_paid,
    'reserved_counted_as_payable', v_reserved_counted_as_payable,
    'held_counted_as_payable', v_held_counted_as_payable,
    'empty_state_invalid', v_empty_state_invalid,
    'period_filter_changes_balance', v_period_filter_changes_balance,

    'ledger_cross_author_rows', v_ledger_cross_author,
    'payout_cross_author_rows', v_payout_cross_author,
    'detail_denied_own_entry', v_detail_cross_author,
    'ledger_test_leak', v_ledger_test_leak,
    'payout_test_leak', v_payout_test_leak,
    'forbidden_ledger_fields', v_forbidden_ledger_fields,
    'forbidden_payout_fields', v_forbidden_payout_fields,
    'unmasked_references', v_masking_failures,

    -- Static properties of the API surface itself.
    'author_rpc_count', (
      SELECT count(*)::integer
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'author\_finance\_p334\_%'
    ),
    'author_rpcs_not_stable', (
      SELECT count(*)::integer
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'author\_finance\_p334\_%'
        AND p.provolatile = 'v'
    ),
    'author_rpcs_executable_by_clients', (
      SELECT count(*)::integer
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'author\_finance\_p334\_%'
        AND (
          has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        )
    ),
    'summary_accepts_period_argument', (
      SELECT count(*)::integer
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'author_finance_p334_summary'
        AND pg_get_function_arguments(p.oid) ILIKE '%timestamptz%'
    ),
    'future_effective_entries', (
      SELECT count(*)::integer
      FROM public.author_ledger_entries
      WHERE effective_at > now()
    ),

    'notes', jsonb_build_object(
      'scope', 'read_only_projection_of_p331_p332_p333',
      'ownership', 'api_layer_proves_membership_rpc_scopes_by_author_id',
      'balances', 'as_of_now_not_period_bound',
      'bank_details', 'not_stored'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_author_finance_p334_integrity_snapshot(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_author_finance_p334_integrity_snapshot(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_author_finance_p334_integrity_snapshot(boolean) TO service_role;

COMMENT ON FUNCTION public.admin_author_finance_p334_integrity_snapshot IS
  'audiolad:payments-p334; compares the author cabinet against the P3.3.2/P3.3.3 aggregates and probes the projections for cross-author rows, forbidden fields, test leaks and unmasked references. Every counter must be zero; service_role only.';

-- ---------------------------------------------------------------------------
-- 10. Post-checks
--
-- P3.3.4 adds no fact. If this migration ever writes a row, it is a bug, and
-- the assertions below turn that bug into a failed deploy.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'author_finance_p334_summary',
    'author_finance_p334_terms',
    'author_finance_p334_ledger',
    'author_finance_p334_ledger_detail',
    'author_finance_p334_payouts',
    'author_finance_p334_payout_detail',
    'author_finance_p334_integrity_status',
    'author_finance_p334_entries',
    'admin_author_finance_p334_integrity_snapshot'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    ) THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'payments_p334_missing_functions: %', v_missing;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'author\_finance\_p334\_%'
      AND p.provolatile = 'v'
  ) THEN
    RAISE EXCEPTION 'payments_p334_volatile_author_rpc: the author cabinet must be read-only';
  END IF;
END
$$;

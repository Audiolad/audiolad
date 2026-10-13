-- Business royalty ledger, final concept approved by Сергей Петров 2026-10-12 10:20 MSK (task 0e05333f).
-- Per point (location) and calendar month:
--   base            = payments attributable to the point - approved allowable deductions (clamped at 0)
--   author fund     = floor(base x author_fund_bps / 10000)   (approved version: 5000 = 50%)
--   AudioLad income = base - author fund
--   royalty(holder) = author fund x holder confirmed minutes / all confirmed minutes of admitted music on the point,
--                     largest-remainder rounding so that the distributed sum equals the fund exactly.
-- One mechanism for ALL rightsholders. Ledger keyed by music_rightsholders, never by the operator.
-- Online = offline; plays deduplicated by dedup_key. Composition / recording holders separate; shares valid on
-- the play date over both layers sum to exactly 100% (no fixed 50/50, no double minute).
-- Inputs and history are append-only (TRUNCATE blocked). After an accrual is approved, recalculation only
-- produces audited adjustment deltas. Schema + functions only; this migration writes no data.
BEGIN;

-- ---------------------------------------------------------------- registries
CREATE TABLE public.business_service_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 300),
  legal_form text NOT NULL CHECK (legal_form IN ('sole_trader', 'llc', 'other')),
  tax_id text NULL CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{10,12}$'),
  same_subject_rightsholder_id uuid NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  active_from date NOT NULL,
  active_until date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_service_operators_range_check CHECK (active_until IS NULL OR active_until > active_from)
);
COMMENT ON TABLE public.business_service_operators IS
  'Operator role history (sole trader -> LLC/buyer). Not a rightsholder. Append-only; only active_until may be set once.';

CREATE TABLE public.business_royalty_formula_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE CHECK (version ~ '^[a-z0-9_.-]{2,32}$'),
  author_fund_bps integer NOT NULL CHECK (author_fund_bps BETWEEN 0 AND 10000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'retired')),
  approved_by text NULL,
  approved_at timestamptz NULL,
  approval_document text NULL CHECK (approval_document IS NULL OR length(approval_document) <= 500),
  supersedes_id uuid NULL REFERENCES public.business_royalty_formula_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_formula_approval_check CHECK (
    status = 'proposed' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_document IS NOT NULL))
);

CREATE TABLE public.business_royalty_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL UNIQUE CHECK (extract(day FROM period_month) = 1),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reconciliation', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.business_royalty_periods IS
  'Calendar month. Status forward-only open -> reconciliation -> closed; closed never reopens and accepts no inputs.';

-- Refunds are recorded in the period of the refund (preliminary rule).
CREATE TABLE public.business_royalty_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  organization_id uuid NULL,
  payment_reference text NOT NULL CHECK (length(btrim(payment_reference)) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('payment', 'refund')),
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency = 'RUB'),
  allocation_rule text NOT NULL CHECK (allocation_rule IN ('single_point', 'equal', 'weighted', 'fixed_amounts')),
  allocation_rule_note text NULL CHECK (allocation_rule_note IS NULL OR length(allocation_rule_note) <= 500),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_payments_sign_check CHECK (
    (kind = 'payment' AND amount_minor > 0) OR (kind = 'refund' AND amount_minor < 0)),
  CONSTRAINT business_royalty_payments_ref_unique UNIQUE (payment_reference, kind)
);

CREATE TABLE public.business_royalty_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.business_royalty_payments(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  weight numeric(12,4) NULL CHECK (weight IS NULL OR weight > 0),
  fixed_amount_minor bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_payment_allocations_unique UNIQUE (payment_id, location_id)
);

-- Allowable categories only; marketing, development, salaries, catalog upkeep and ordinary infrastructure
-- are not categories. sales_tax methodology is preliminary (accountant TBD).
CREATE TABLE public.business_royalty_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('sales_tax', 'acquiring_fee', 'direct_point_service_cost')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  location_id uuid NULL,
  payment_id uuid NULL REFERENCES public.business_royalty_payments(id) ON DELETE RESTRICT,
  document_reference text NOT NULL CHECK (length(btrim(document_reference)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  approved_by text NULL,
  approved_at timestamptz NULL,
  supersedes_id uuid NULL REFERENCES public.business_royalty_deductions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_deductions_target_check CHECK ((location_id IS NULL) <> (payment_id IS NULL)),
  CONSTRAINT business_royalty_deductions_approval_check CHECK (
    status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE public.business_royalty_deduction_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deduction_id uuid NOT NULL REFERENCES public.business_royalty_deductions(id) ON DELETE RESTRICT,
  from_status text NULL,
  to_status text NOT NULL,
  actor text NOT NULL DEFAULT current_user,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.business_royalty_track_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_item_id uuid NOT NULL,
  rightsholder_id uuid NOT NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  rights_layer text NOT NULL CHECK (rights_layer IN ('composition', 'recording')),
  share_bps integer NOT NULL CHECK (share_bps BETWEEN 1 AND 10000),
  source_grant_id uuid NULL REFERENCES public.music_rights_grants(id) ON DELETE RESTRICT,
  valid_from date NOT NULL,
  valid_until date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_track_shares_range_check CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX business_royalty_track_shares_track_idx ON public.business_royalty_track_shares(audio_item_id);
COMMENT ON TABLE public.business_royalty_track_shares IS
  'Per-layer holder shares with validity [valid_from, valid_until). Matched to each play by play date (mid-month changes handled). No overlapping intervals per track/holder/layer. Append-only; valid_until may be set once.';

CREATE TABLE public.business_royalty_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  audio_item_id uuid NOT NULL,
  played_on date NOT NULL,
  played_ms bigint NOT NULL CHECK (played_ms > 0),
  offline boolean NOT NULL DEFAULT false,
  dedup_key text NOT NULL UNIQUE CHECK (length(dedup_key) BETWEEN 1 AND 200),
  source_log_id uuid NULL,
  confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_royalty_plays_period_location_idx ON public.business_royalty_plays(period_id, location_id);

-- ---------------------------------------------------------------- results
CREATE TABLE public.business_royalty_calc_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  formula_version_id uuid NOT NULL REFERENCES public.business_royalty_formula_versions(id) ON DELETE RESTRICT,
  run_no integer NOT NULL CHECK (run_no >= 1),
  mode text NOT NULL CHECK (mode IN ('full', 'adjustment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_calc_runs_unique UNIQUE (period_id, run_no)
);

CREATE TABLE public.business_royalty_point_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.business_royalty_calc_runs(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  payments_minor bigint NOT NULL,
  deductions_minor bigint NOT NULL CHECK (deductions_minor >= 0),
  raw_base_minor bigint NOT NULL,
  base_minor bigint NOT NULL CHECK (base_minor >= 0),
  author_fund_minor bigint NOT NULL CHECK (author_fund_minor >= 0),
  audiolad_income_minor bigint NOT NULL CHECK (audiolad_income_minor >= 0),
  confirmed_ms bigint NOT NULL CHECK (confirmed_ms >= 0),
  distributed_minor bigint NOT NULL CHECK (distributed_minor >= 0),
  status text NOT NULL CHECK (status IN ('distributed', 'held_no_plays')),
  CONSTRAINT business_royalty_point_results_unique UNIQUE (run_id, location_id),
  CONSTRAINT business_royalty_point_results_split_check CHECK (author_fund_minor + audiolad_income_minor = base_minor),
  CONSTRAINT business_royalty_point_results_dist_check CHECK (
    (status = 'distributed' AND distributed_minor = author_fund_minor)
    OR (status = 'held_no_plays' AND distributed_minor = 0))
);

-- entry_kind: calculation (first full result) | adjustment (delta after approval, or explicit reversal).
-- calculation_state forward-only: preliminary -> approved | superseded | void; approved/superseded/void terminal.
-- payout_state forward-only: none -> in_payout -> paid; only approved + payable.
CREATE TABLE public.business_royalty_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NULL REFERENCES public.business_royalty_calc_runs(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  rightsholder_id uuid NOT NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  rights_layer text NOT NULL CHECK (rights_layer IN ('composition', 'recording')),
  entry_kind text NOT NULL DEFAULT 'calculation' CHECK (entry_kind IN ('calculation', 'adjustment')),
  holder_ms numeric(20,4) NOT NULL CHECK (holder_ms >= 0),
  point_confirmed_ms bigint NOT NULL CHECK (point_confirmed_ms >= 0),
  author_fund_minor bigint NOT NULL CHECK (author_fund_minor >= 0),
  amount_minor bigint NOT NULL,
  calculation_basis jsonb NOT NULL CHECK (jsonb_typeof(calculation_basis) = 'object'),
  settlement_mode text NOT NULL CHECK (settlement_mode IN ('payable', 'management')),
  calculation_state text NOT NULL DEFAULT 'preliminary'
    CHECK (calculation_state IN ('preliminary', 'approved', 'superseded', 'void')),
  payout_state text NOT NULL DEFAULT 'none' CHECK (payout_state IN ('none', 'in_payout', 'paid')),
  reverses_id uuid NULL REFERENCES public.business_royalty_accruals(id) ON DELETE RESTRICT,
  reason text NULL CHECK (reason IS NULL OR length(reason) <= 500),
  actor text NOT NULL DEFAULT current_user,
  operator_id_snapshot uuid NULL REFERENCES public.business_service_operators(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_accruals_amount_check CHECK (entry_kind = 'adjustment' OR amount_minor >= 0),
  CONSTRAINT business_royalty_accruals_reversal_check CHECK (
    reverses_id IS NULL OR (entry_kind = 'adjustment' AND reason IS NOT NULL)),
  CONSTRAINT business_royalty_accruals_run_check CHECK (run_id IS NOT NULL OR reverses_id IS NOT NULL),
  CONSTRAINT business_royalty_accruals_payout_check CHECK (
    payout_state = 'none' OR (calculation_state = 'approved' AND settlement_mode = 'payable'))
);
CREATE UNIQUE INDEX business_royalty_accruals_run_key_uidx
  ON public.business_royalty_accruals(run_id, location_id, rightsholder_id, rights_layer) WHERE run_id IS NOT NULL;
-- At most one live (preliminary/approved) reversal per entry; a voided reversal frees the slot so it can be redone.
CREATE UNIQUE INDEX business_royalty_accruals_reverses_uidx
  ON public.business_royalty_accruals(reverses_id)
  WHERE reverses_id IS NOT NULL AND calculation_state IN ('preliminary', 'approved');
CREATE INDEX business_royalty_accruals_holder_idx ON public.business_royalty_accruals(rightsholder_id, period_id);

-- ---------------------------------------------------------------- validation
CREATE FUNCTION public.business_royalty_allocation_issues(p_period_id uuid)
RETURNS TABLE (payment_id uuid, issue text)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT p.id,
    CASE
      WHEN count(a.id) = 0 THEN 'unallocated'
      WHEN p.allocation_rule = 'single_point' AND count(a.id) <> 1 THEN 'single_point_requires_one_point'
      WHEN p.allocation_rule = 'fixed_amounts' AND (count(a.fixed_amount_minor) <> count(a.id)
        OR sum(a.fixed_amount_minor) <> p.amount_minor) THEN 'fixed_amounts_sum_mismatch'
      WHEN p.allocation_rule = 'weighted' AND count(a.weight) <> count(a.id) THEN 'weight_missing'
    END
  FROM public.business_royalty_payments p
  LEFT JOIN public.business_royalty_payment_allocations a ON a.payment_id = p.id
  WHERE p.period_id = p_period_id
  GROUP BY p.id, p.allocation_rule, p.amount_minor
  HAVING CASE
      WHEN count(a.id) = 0 THEN true
      WHEN p.allocation_rule = 'single_point' AND count(a.id) <> 1 THEN true
      WHEN p.allocation_rule = 'fixed_amounts' AND (count(a.fixed_amount_minor) <> count(a.id)
        OR sum(a.fixed_amount_minor) <> p.amount_minor) THEN true
      WHEN p.allocation_rule = 'weighted' AND count(a.weight) <> count(a.id) THEN true
      ELSE false END
  UNION ALL
  SELECT d.payment_id, 'deduction_payment_other_period'
  FROM public.business_royalty_deductions d
  JOIN public.business_royalty_payments p ON p.id = d.payment_id
  WHERE d.period_id = p_period_id AND p.period_id <> d.period_id AND d.status IN ('proposed', 'approved')
$$;
COMMENT ON FUNCTION public.business_royalty_allocation_issues(uuid) IS
  'Visible list of payments that cannot be attributed (unallocated / wrong single_point / fixed sum mismatch / missing weight / deduction linked to a payment of another period). A run is rejected while any exist.';

-- ---------------------------------------------------------------- computation (pure)
CREATE FUNCTION public.business_royalty_compute(p_period_id uuid, p_formula_version_id uuid)
RETURNS TABLE (
  location_id uuid, payments_minor bigint, deductions_minor bigint, raw_base_minor bigint, base_minor bigint,
  author_fund_minor bigint, audiolad_income_minor bigint, confirmed_ms bigint,
  rightsholder_id uuid, rights_layer text, holder_ms numeric, amount_minor bigint, point_status text)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH f AS (SELECT author_fund_bps FROM public.business_royalty_formula_versions WHERE id = p_formula_version_id),
  alloc_raw AS (
    SELECT a.payment_id, a.location_id, p.amount_minor AS pay_amount,
      CASE p.allocation_rule
        WHEN 'fixed_amounts' THEN a.fixed_amount_minor::numeric
        WHEN 'weighted' THEN p.amount_minor * a.weight / sum(a.weight) OVER (PARTITION BY a.payment_id)
        ELSE p.amount_minor::numeric / count(*) OVER (PARTITION BY a.payment_id)
      END AS share
    FROM public.business_royalty_payment_allocations a
    JOIN public.business_royalty_payments p ON p.id = a.payment_id AND p.period_id = p_period_id),
  alloc_f AS (SELECT *, floor(share)::bigint AS fl, share - floor(share) AS frac FROM alloc_raw),
  -- Largest remainder: allocations of a payment sum to the payment exactly.
  alloc AS (
    SELECT payment_id, alloc_f.location_id, pay_amount,
      fl + CASE WHEN row_number() OVER (PARTITION BY payment_id ORDER BY frac DESC, alloc_f.location_id)
                     <= pay_amount - sum(fl) OVER (PARTITION BY payment_id) THEN 1 ELSE 0 END AS amt
    FROM alloc_f),
  ded_ok AS (SELECT d.* FROM public.business_royalty_deductions d WHERE d.period_id = p_period_id AND d.status = 'approved'),
  ded_pay_f AS (
    SELECT d.id AS did, d.amount_minor AS total, a.location_id,
      floor(d.amount_minor::numeric * a.amt / a.pay_amount)::bigint AS fl,
      d.amount_minor::numeric * a.amt / a.pay_amount - floor(d.amount_minor::numeric * a.amt / a.pay_amount) AS frac
    FROM ded_ok d JOIN alloc a ON a.payment_id = d.payment_id),
  -- Payment-linked deduction split by the payment allocation, largest remainder: sums to the document amount.
  ded AS (
    SELECT d.location_id, d.amount_minor AS amt FROM ded_ok d WHERE d.location_id IS NOT NULL
    UNION ALL
    SELECT ded_pay_f.location_id, fl + CASE WHEN row_number() OVER (PARTITION BY did ORDER BY frac DESC, ded_pay_f.location_id)
                     <= total - sum(fl) OVER (PARTITION BY did) THEN 1 ELSE 0 END
    FROM ded_pay_f),
  plays AS (
    SELECT pl.* FROM public.business_royalty_plays pl WHERE pl.period_id = p_period_id AND pl.confirmed),
  play_shares AS (
    SELECT pl.id AS play_id, pl.location_id, pl.played_ms, s.rightsholder_id, s.rights_layer, s.share_bps
    FROM plays pl JOIN public.business_royalty_track_shares s ON s.audio_item_id = pl.audio_item_id
      AND s.valid_from <= pl.played_on AND (s.valid_until IS NULL OR s.valid_until > pl.played_on)),
  admitted AS (SELECT play_id FROM play_shares GROUP BY play_id HAVING sum(share_bps) = 10000),
  points AS (
    SELECT alloc.location_id FROM alloc UNION SELECT ded.location_id FROM ded UNION SELECT plays.location_id FROM plays),
  money AS (
    SELECT pt.location_id,
      coalesce((SELECT sum(amt) FROM alloc WHERE alloc.location_id = pt.location_id), 0)::bigint AS payments_minor,
      coalesce((SELECT sum(amt) FROM ded WHERE ded.location_id = pt.location_id), 0)::bigint AS deductions_minor
    FROM points pt),
  base AS (
    SELECT m.*, m.payments_minor - m.deductions_minor AS raw_base,
      greatest(m.payments_minor - m.deductions_minor, 0) AS base,
      floor(greatest(m.payments_minor - m.deductions_minor, 0) * (SELECT author_fund_bps FROM f) / 10000.0)::bigint AS fund
    FROM money m),
  totals AS (
    SELECT pl.location_id, sum(pl.played_ms)::bigint AS total_ms
    FROM plays pl JOIN admitted ad ON ad.play_id = pl.id GROUP BY 1),
  holders AS (
    SELECT ps.location_id, ps.rightsholder_id, ps.rights_layer, sum(ps.played_ms * ps.share_bps / 10000.0) AS hms
    FROM play_shares ps JOIN admitted ad ON ad.play_id = ps.play_id GROUP BY 1, 2, 3),
  dist_f AS (
    SELECT b.location_id, b.fund, t.total_ms, h.rightsholder_id, h.rights_layer, h.hms,
      floor(b.fund * h.hms / t.total_ms)::bigint AS fl,
      b.fund * h.hms / t.total_ms - floor(b.fund * h.hms / t.total_ms) AS frac
    FROM base b JOIN totals t ON t.location_id = b.location_id
    JOIN holders h ON h.location_id = b.location_id),
  -- Largest remainder: holders of a point receive exactly the whole fund.
  dist AS (
    SELECT dist_f.location_id, rightsholder_id, rights_layer, hms,
      fl + CASE WHEN row_number() OVER (PARTITION BY dist_f.location_id ORDER BY frac DESC, rightsholder_id, rights_layer)
                     <= fund - sum(fl) OVER (PARTITION BY dist_f.location_id) THEN 1 ELSE 0 END AS amt
    FROM dist_f)
  SELECT b.location_id, b.payments_minor, b.deductions_minor, b.raw_base, b.base, b.fund, b.base - b.fund,
    coalesce(t.total_ms, 0), d.rightsholder_id, d.rights_layer, d.hms, coalesce(d.amt, 0),
    CASE WHEN coalesce(t.total_ms, 0) = 0 THEN 'held_no_plays' ELSE 'distributed' END
  FROM base b
  LEFT JOIN totals t ON t.location_id = b.location_id
  LEFT JOIN dist d ON d.location_id = b.location_id
$$;
COMMENT ON FUNCTION public.business_royalty_compute(uuid, uuid) IS
  'Pure calculation. Base clamped at 0. Largest-remainder rounding (allocations, deductions, royalties). Shares matched per play date. Points without confirmed plays are held_no_plays.';

-- ---------------------------------------------------------------- recording a run
-- Before any approval in the period: full preliminary calculation. After an approval: adjustment deltas only
-- (new result - sum of approved entries per point/holder/layer). Previous preliminary calculation entries are
-- superseded; reversal entries are kept. A key with a PRELIMINARY (undecided) reversal is frozen until the reversal
-- is approved or voided. An APPROVED reversal is part of the approved net, so a later run accrues exactly
-- new result - approved net (corrected inputs -> correct amount once; repeat run -> no rows).
CREATE FUNCTION public.business_royalty_run_preliminary(p_period_id uuid, p_formula_version_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_run uuid; v_no integer; v_month date; v_status text; v_op record; v_mode text; v_bad integer;
BEGIN
  -- Row lock serialises concurrent runs of one period (run numbering, supersede, delta base).
  SELECT period_month, status INTO v_month, v_status FROM public.business_royalty_periods WHERE id = p_period_id FOR UPDATE;
  IF v_month IS NULL THEN RAISE EXCEPTION 'business_royalty_period_not_found'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'business_royalty_period_closed'; END IF;
  SELECT count(*) INTO v_bad FROM public.business_royalty_allocation_issues(p_period_id);
  IF v_bad > 0 THEN RAISE EXCEPTION 'business_royalty_payment_allocation_invalid'; END IF;
  v_mode := CASE WHEN EXISTS (SELECT 1 FROM public.business_royalty_accruals
    WHERE period_id = p_period_id AND calculation_state = 'approved') THEN 'adjustment' ELSE 'full' END;
  SELECT coalesce(max(run_no), 0) + 1 INTO v_no FROM public.business_royalty_calc_runs WHERE period_id = p_period_id;
  INSERT INTO public.business_royalty_calc_runs (period_id, formula_version_id, run_no, mode)
    VALUES (p_period_id, p_formula_version_id, v_no, v_mode) RETURNING id INTO v_run;
  -- Explicit reversals are not calculation output: they survive recalculation (approve or void them explicitly).
  UPDATE public.business_royalty_accruals SET calculation_state = 'superseded'
    WHERE period_id = p_period_id AND calculation_state = 'preliminary' AND reverses_id IS NULL;
  SELECT * INTO v_op FROM public.business_service_operators o
    WHERE o.active_from <= v_month AND (o.active_until IS NULL OR o.active_until > v_month)
    ORDER BY o.active_from DESC LIMIT 1;
  CREATE TEMP TABLE IF NOT EXISTS _roy_calc ON COMMIT DROP AS
    SELECT * FROM public.business_royalty_compute(p_period_id, p_formula_version_id) LIMIT 0;
  DELETE FROM _roy_calc;
  INSERT INTO _roy_calc SELECT * FROM public.business_royalty_compute(p_period_id, p_formula_version_id);
  INSERT INTO public.business_royalty_point_results (run_id, location_id, payments_minor, deductions_minor, raw_base_minor,
      base_minor, author_fund_minor, audiolad_income_minor, confirmed_ms, distributed_minor, status)
    SELECT v_run, c.location_id, max(c.payments_minor), max(c.deductions_minor), max(c.raw_base_minor), max(c.base_minor),
      max(c.author_fund_minor), max(c.audiolad_income_minor), max(c.confirmed_ms), sum(c.amount_minor), max(c.point_status)
    FROM _roy_calc c GROUP BY c.location_id;
  INSERT INTO public.business_royalty_accruals (run_id, period_id, location_id, rightsholder_id, rights_layer, entry_kind,
      holder_ms, point_confirmed_ms, author_fund_minor, amount_minor, calculation_basis, settlement_mode, operator_id_snapshot)
    SELECT v_run, p_period_id, k.location_id, k.rightsholder_id, k.rights_layer,
      CASE v_mode WHEN 'full' THEN 'calculation' ELSE 'adjustment' END,
      coalesce(c.holder_ms, 0), coalesce(c.confirmed_ms, 0), coalesce(c.author_fund_minor, 0),
      coalesce(c.amount_minor, 0) - coalesce(ap.amt, 0),
      jsonb_build_object('payments_minor', c.payments_minor, 'deductions_minor', c.deductions_minor,
        'base_minor', c.base_minor, 'raw_base_minor', c.raw_base_minor, 'new_amount_minor', coalesce(c.amount_minor, 0),
        'approved_before_minor', coalesce(ap.amt, 0), 'formula_version_id', p_formula_version_id, 'mode', v_mode),
      CASE WHEN k.rightsholder_id = v_op.same_subject_rightsholder_id THEN 'management' ELSE 'payable' END, v_op.id
    FROM (SELECT c0.location_id, c0.rightsholder_id, c0.rights_layer FROM _roy_calc c0 WHERE c0.rightsholder_id IS NOT NULL
          UNION
          SELECT a0.location_id, a0.rightsholder_id, a0.rights_layer FROM public.business_royalty_accruals a0
          WHERE a0.period_id = p_period_id AND a0.calculation_state = 'approved') k
    LEFT JOIN _roy_calc c ON c.location_id = k.location_id AND c.rightsholder_id = k.rightsholder_id AND c.rights_layer = k.rights_layer
    LEFT JOIN (SELECT a1.location_id, a1.rightsholder_id, a1.rights_layer, sum(a1.amount_minor) AS amt
               FROM public.business_royalty_accruals a1 WHERE a1.period_id = p_period_id AND a1.calculation_state = 'approved'
               GROUP BY 1, 2, 3) ap
      ON ap.location_id = k.location_id AND ap.rightsholder_id = k.rightsholder_id AND ap.rights_layer = k.rights_layer
    WHERE (v_mode = 'full' OR coalesce(c.amount_minor, 0) - coalesce(ap.amt, 0) <> 0)
      -- Pending reversal freezes the key: no delta against a base that is still being decided.
      AND NOT EXISTS (SELECT 1 FROM public.business_royalty_accruals rv
        WHERE rv.period_id = p_period_id AND rv.reverses_id IS NOT NULL AND rv.calculation_state = 'preliminary'
          AND rv.location_id = k.location_id AND rv.rightsholder_id = k.rightsholder_id AND rv.rights_layer = k.rights_layer);
  RETURN v_run;
END $$;

-- Explicit audited reversal of an approved entry: a new adjustment with the opposite amount and a reason.
CREATE FUNCTION public.business_royalty_reverse_accrual(p_accrual_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE o public.business_royalty_accruals; v_id uuid; v_status text; v_period uuid;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'business_royalty_reason_required'; END IF;
  SELECT period_id INTO v_period FROM public.business_royalty_accruals WHERE id = p_accrual_id;
  IF v_period IS NULL THEN RAISE EXCEPTION 'business_royalty_reverse_requires_approved'; END IF;
  -- Same period lock as run_preliminary (taken first): reversal and recalculation of one period are serialised.
  SELECT status INTO v_status FROM public.business_royalty_periods WHERE id = v_period FOR UPDATE;
  SELECT * INTO o FROM public.business_royalty_accruals WHERE id = p_accrual_id FOR UPDATE;
  IF o.id IS NULL OR o.calculation_state <> 'approved' THEN RAISE EXCEPTION 'business_royalty_reverse_requires_approved'; END IF;
  IF o.reverses_id IS NOT NULL THEN RAISE EXCEPTION 'business_royalty_cannot_reverse_reversal'; END IF;
  IF EXISTS (SELECT 1 FROM public.business_royalty_accruals WHERE reverses_id = o.id AND calculation_state IN ('preliminary', 'approved')) THEN
    RAISE EXCEPTION 'business_royalty_already_reversed';
  END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'business_royalty_period_closed'; END IF;
  -- Pending calculation deltas of this key were computed against the pre-reversal base: supersede them.
  UPDATE public.business_royalty_accruals SET calculation_state = 'superseded'
    WHERE period_id = o.period_id AND location_id = o.location_id AND rightsholder_id = o.rightsholder_id
      AND rights_layer = o.rights_layer AND calculation_state = 'preliminary' AND reverses_id IS NULL;
  INSERT INTO public.business_royalty_accruals (run_id, period_id, location_id, rightsholder_id, rights_layer, entry_kind,
      holder_ms, point_confirmed_ms, author_fund_minor, amount_minor, calculation_basis, settlement_mode,
      reverses_id, reason, operator_id_snapshot)
    VALUES (NULL, o.period_id, o.location_id, o.rightsholder_id, o.rights_layer, 'adjustment', 0, 0, 0, -o.amount_minor,
      jsonb_build_object('reversal_of', o.id), o.settlement_mode, o.id, p_reason, o.operator_id_snapshot)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------- guards
-- Locked month for rights changes: closed, or has approved accruals. A month with only preliminary runs stays
-- changeable (the change is picked up by the next recalculation).
CREATE FUNCTION public.business_royalty_period_locked(p_period_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_royalty_periods p WHERE p.id = p_period_id AND p.status = 'closed')
      OR EXISTS (SELECT 1 FROM public.business_royalty_accruals a WHERE a.period_id = p_period_id AND a.calculation_state = 'approved')
$$;

CREATE FUNCTION public.business_royalty_accrual_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'business_royalty_append_only'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.calculation_state <> 'preliminary' OR NEW.payout_state <> 'none' THEN
      RAISE EXCEPTION 'business_royalty_accrual_must_start_preliminary';
    END IF;
    SELECT status INTO v_status FROM public.business_royalty_periods WHERE id = NEW.period_id;
    IF v_status = 'closed' THEN RAISE EXCEPTION 'business_royalty_period_closed'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.run_id, NEW.period_id, NEW.location_id, NEW.rightsholder_id, NEW.rights_layer, NEW.entry_kind, NEW.holder_ms,
      NEW.amount_minor, NEW.author_fund_minor, NEW.calculation_basis, NEW.settlement_mode, NEW.reverses_id, NEW.reason,
      NEW.actor, NEW.operator_id_snapshot, NEW.created_at)
    IS DISTINCT FROM (OLD.run_id, OLD.period_id, OLD.location_id, OLD.rightsholder_id, OLD.rights_layer, OLD.entry_kind, OLD.holder_ms,
      OLD.amount_minor, OLD.author_fund_minor, OLD.calculation_basis, OLD.settlement_mode, OLD.reverses_id, OLD.reason,
      OLD.actor, OLD.operator_id_snapshot, OLD.created_at) THEN
    RAISE EXCEPTION 'business_royalty_accrual_immutable';
  END IF;
  IF NEW.calculation_state IS DISTINCT FROM OLD.calculation_state THEN
    IF NOT (OLD.calculation_state = 'preliminary' AND NEW.calculation_state IN ('approved', 'superseded', 'void')) THEN
      RAISE EXCEPTION 'business_royalty_accrual_state_transition';
    END IF;
    -- Closed period freezes calculation states (approve/supersede/void); payout progress stays allowed.
    SELECT status INTO v_status FROM public.business_royalty_periods WHERE id = NEW.period_id;
    IF v_status = 'closed' THEN RAISE EXCEPTION 'business_royalty_period_closed'; END IF;
    IF NEW.calculation_state = 'approved' THEN
      -- Reversal rows carry no run: check the formula of the reversed entry's run.
      SELECT f.status INTO v_status FROM public.business_royalty_calc_runs r
        JOIN public.business_royalty_formula_versions f ON f.id = r.formula_version_id
        WHERE r.id = coalesce(NEW.run_id, (SELECT o.run_id FROM public.business_royalty_accruals o WHERE o.id = NEW.reverses_id));
      IF v_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'business_royalty_formula_not_approved'; END IF;
    END IF;
  END IF;
  IF NEW.payout_state IS DISTINCT FROM OLD.payout_state THEN
    IF NOT ((OLD.payout_state = 'none' AND NEW.payout_state = 'in_payout')
         OR (OLD.payout_state = 'in_payout' AND NEW.payout_state = 'paid')) THEN
      RAISE EXCEPTION 'business_royalty_payout_state_transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_royalty_accruals_guard BEFORE INSERT OR UPDATE OR DELETE ON public.business_royalty_accruals
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_accrual_guard();

-- Append-only registries with narrowly allowed forward transitions.
CREATE FUNCTION public.business_royalty_registry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o jsonb; n jsonb; v_status text; v_period uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'business_royalty_append_only'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'business_royalty_payment_allocations' THEN
      SELECT period_id INTO v_period FROM public.business_royalty_payments WHERE id = NEW.payment_id;
    ELSIF TG_TABLE_NAME IN ('business_royalty_payments', 'business_royalty_deductions', 'business_royalty_plays') THEN
      v_period := NEW.period_id;
    END IF;
    IF v_period IS NOT NULL THEN
      SELECT status INTO v_status FROM public.business_royalty_periods WHERE id = v_period;
      IF v_status = 'closed' THEN RAISE EXCEPTION 'business_royalty_period_closed'; END IF;
    END IF;
    IF TG_TABLE_NAME = 'business_royalty_plays' THEN
      IF NOT EXISTS (SELECT 1 FROM public.business_royalty_periods p
          WHERE p.id = NEW.period_id AND NEW.played_on >= p.period_month AND NEW.played_on < (p.period_month + interval '1 month')::date) THEN
        RAISE EXCEPTION 'business_royalty_play_outside_period';
      END IF;
    ELSIF TG_TABLE_NAME = 'business_royalty_deductions' THEN
      IF NEW.payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.business_royalty_payments p
          WHERE p.id = NEW.payment_id AND p.period_id = NEW.period_id) THEN
        RAISE EXCEPTION 'business_royalty_deduction_payment_other_period';
      END IF;
    ELSIF TG_TABLE_NAME = 'business_royalty_track_shares' THEN
      IF EXISTS (SELECT 1 FROM public.business_royalty_track_shares s
          WHERE s.audio_item_id = NEW.audio_item_id AND s.rightsholder_id = NEW.rightsholder_id AND s.rights_layer = NEW.rights_layer
            AND s.valid_from < coalesce(NEW.valid_until, 'infinity'::date) AND NEW.valid_from < coalesce(s.valid_until, 'infinity'::date)) THEN
        RAISE EXCEPTION 'business_royalty_share_overlap';
      END IF;
      -- No retroactive start inside a locked month (closed, or with approved accruals); preliminary-only month is open.
      IF EXISTS (SELECT 1 FROM public.business_royalty_periods p
          WHERE (p.period_month + interval '1 month')::date > NEW.valid_from
            AND p.period_month < coalesce(NEW.valid_until, 'infinity'::date)
            AND public.business_royalty_period_locked(p.id)) THEN
        RAISE EXCEPTION 'business_royalty_share_retroactive_start';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'business_royalty_track_shares' THEN
    IF OLD.valid_until IS NULL AND NEW.valid_until IS NOT NULL AND (o - 'valid_until') = (n - 'valid_until') THEN
      -- No retroactive end date inside locked months (closed, or with approved accruals).
      IF EXISTS (SELECT 1 FROM public.business_royalty_periods p
          WHERE (p.period_month + interval '1 month')::date > NEW.valid_until
            AND public.business_royalty_period_locked(p.id)) THEN
        RAISE EXCEPTION 'business_royalty_share_retroactive_end';
      END IF;
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'business_service_operators' THEN
    IF OLD.active_until IS NULL AND NEW.active_until IS NOT NULL AND (o - 'active_until') = (n - 'active_until') THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'business_royalty_periods' THEN
    IF (o - 'status') = (n - 'status') AND (
        (OLD.status = 'open' AND NEW.status IN ('reconciliation', 'closed'))
        OR (OLD.status = 'reconciliation' AND NEW.status = 'closed')) THEN
      -- Closing freezes calculation states: undecided (preliminary) entries, incl. reversals, must be approved or voided first.
      IF NEW.status = 'closed' AND EXISTS (SELECT 1 FROM public.business_royalty_accruals a
          WHERE a.period_id = NEW.id AND a.calculation_state = 'preliminary') THEN
        RAISE EXCEPTION 'business_royalty_period_has_preliminary'
          USING DETAIL = 'Approve or void all preliminary accruals (including reversals) of the period before closing it.';
      END IF;
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'business_royalty_formula_versions' THEN
    IF (o - ARRAY['status', 'approved_by', 'approved_at', 'approval_document']) = (n - ARRAY['status', 'approved_by', 'approved_at', 'approval_document'])
       AND ((OLD.status = 'proposed' AND NEW.status IN ('approved', 'retired'))
         OR (OLD.status = 'approved' AND NEW.status = 'retired'
             AND (o - 'status') = (n - 'status'))) THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'business_royalty_deductions' THEN
    IF (o - ARRAY['status', 'approved_by', 'approved_at']) = (n - ARRAY['status', 'approved_by', 'approved_at'])
       AND ((OLD.status = 'proposed' AND NEW.status IN ('approved', 'rejected'))
         OR (OLD.status = 'approved' AND NEW.status = 'superseded'
             AND (o - 'status') = (n - 'status'))) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'business_royalty_append_only';
END $$;

CREATE FUNCTION public.business_royalty_deduction_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.business_royalty_deduction_status_events (deduction_id, from_status, to_status)
      VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER business_royalty_deductions_audit AFTER INSERT OR UPDATE ON public.business_royalty_deductions
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_deduction_audit();

CREATE FUNCTION public.business_royalty_no_truncate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'business_royalty_append_only'; END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_service_operators', 'business_royalty_formula_versions', 'business_royalty_periods',
    'business_royalty_payments', 'business_royalty_payment_allocations', 'business_royalty_deductions',
    'business_royalty_deduction_status_events', 'business_royalty_track_shares', 'business_royalty_plays',
    'business_royalty_calc_runs', 'business_royalty_point_results'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.business_royalty_registry_guard()', t || '_guard', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['business_service_operators', 'business_royalty_formula_versions', 'business_royalty_periods',
    'business_royalty_payments', 'business_royalty_payment_allocations', 'business_royalty_deductions',
    'business_royalty_deduction_status_events', 'business_royalty_track_shares', 'business_royalty_plays',
    'business_royalty_calc_runs', 'business_royalty_point_results', 'business_royalty_accruals'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.business_royalty_no_truncate()', t || '_no_truncate', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.business_royalty_allocation_issues(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_compute(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_run_preliminary(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_reverse_accrual(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_period_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_accrual_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_registry_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_deduction_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_no_truncate() FROM PUBLIC, anon, authenticated;

COMMIT;

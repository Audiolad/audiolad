-- Business royalty ledger, final concept approved by Сергей Петров 2026-10-12 10:20 MSK (task 0e05333f).
-- Per point (location) and calendar month:
--   base           = payments attributable to the point - approved allowable deductions (clamped at 0)
--   author fund    = base x author_fund_bps (approved version: 5000 = 50%)
--   AudioLad income= base - author fund
--   royalty(holder)= author fund x holder confirmed minutes / all confirmed minutes of admitted music on the point
-- One mechanism for ALL rightsholders (no artist-specific rules). Ledger keyed by music_rightsholders,
-- never by the operator. Online and offline plays count equally; plays are deduplicated by event key.
-- Musical work (composition) and phonogram (recording) holders are accounted separately; shares of one
-- track over both layers sum to exactly 100% (no fixed 50/50, no double accrual of a minute).
-- Schema + functions only; this migration writes no data. Payouts reuse author payout profiles.
BEGIN;

CREATE TABLE public.business_service_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 300),
  legal_form text NOT NULL CHECK (legal_form IN ('sole_trader', 'llc', 'other')),
  tax_id text NULL CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{10,12}$'),
  -- Same legal subject as a rightsholder: that holder's accruals are management accounting (no real debt).
  same_subject_rightsholder_id uuid NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  active_from date NOT NULL,
  active_until date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_service_operators_range_check CHECK (active_until IS NULL OR active_until > active_from)
);
COMMENT ON TABLE public.business_service_operators IS
  'Service operator role history (sole trader -> LLC/buyer). Not a rightsholder; rights and accrual history stay with music_rightsholders.';

-- Versioned formula (history of formulas/rates).
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
COMMENT ON TABLE public.business_royalty_periods IS 'Calendar month reporting period (period_month = first day).';

-- Payments (and refunds as negative amounts) attributable to points.
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

-- Transparent recorded allocation of one payment to one or more points.
CREATE TABLE public.business_royalty_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.business_royalty_payments(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  weight numeric(12,4) NULL CHECK (weight IS NULL OR weight > 0),
  fixed_amount_minor bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_payment_allocations_unique UNIQUE (payment_id, location_id)
);

-- Deductions registry. Only allowable categories exist; marketing, development, salaries,
-- catalog upkeep and ordinary server infrastructure are NOT categories and cannot be deducted.
-- Tax methodology is preliminary (to be finalised with the accountant).
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
COMMENT ON TABLE public.business_royalty_deductions IS
  'Allowable deductions only: sales_tax (preliminary, accountant TBD), acquiring_fee, direct_point_service_cost. Linked to a point or a payment (then split by that payment''s allocation). Marketing/development/salaries/catalog/infra are not deductible.';

-- Who holds which share of each track, separately per layer. Sum over both layers = 10000 for admitted music.
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

-- Confirmed plays; online and offline equal. dedup_key (e.g. player_id:client_event_id) is unique,
-- so a re-synced offline event or duplicate delivery is counted once.
CREATE TABLE public.business_royalty_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  audio_item_id uuid NOT NULL,
  played_ms bigint NOT NULL CHECK (played_ms > 0),
  offline boolean NOT NULL DEFAULT false,
  dedup_key text NOT NULL UNIQUE CHECK (length(dedup_key) BETWEEN 1 AND 200),
  source_log_id uuid NULL,
  confirmed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_royalty_plays_period_location_idx ON public.business_royalty_plays(period_id, location_id);

-- Calculation runs (versioned history) and per-point results.
CREATE TABLE public.business_royalty_calc_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  formula_version_id uuid NOT NULL REFERENCES public.business_royalty_formula_versions(id) ON DELETE RESTRICT,
  run_no integer NOT NULL CHECK (run_no >= 1),
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
  CONSTRAINT business_royalty_point_results_dist_check CHECK (distributed_minor <= author_fund_minor),
  CONSTRAINT business_royalty_point_results_hold_check CHECK (status <> 'held_no_plays' OR distributed_minor = 0)
);

-- Accrual = per point x rightsholder x layer. States are separate:
-- calculation_state: preliminary -> approved (approved accrual) | superseded | void;
-- payout_state: none -> in_payout -> paid (actual payout), only for approved + payable.
CREATE TABLE public.business_royalty_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.business_royalty_calc_runs(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  rightsholder_id uuid NOT NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  rights_layer text NOT NULL CHECK (rights_layer IN ('composition', 'recording')),
  holder_ms numeric(20,4) NOT NULL CHECK (holder_ms >= 0),
  point_confirmed_ms bigint NOT NULL CHECK (point_confirmed_ms > 0),
  author_fund_minor bigint NOT NULL CHECK (author_fund_minor >= 0),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  calculation_basis jsonb NOT NULL CHECK (jsonb_typeof(calculation_basis) = 'object'),
  settlement_mode text NOT NULL CHECK (settlement_mode IN ('payable', 'management')),
  calculation_state text NOT NULL DEFAULT 'preliminary'
    CHECK (calculation_state IN ('preliminary', 'approved', 'superseded', 'void')),
  payout_state text NOT NULL DEFAULT 'none' CHECK (payout_state IN ('none', 'in_payout', 'paid')),
  operator_id_snapshot uuid NULL REFERENCES public.business_service_operators(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_accruals_unique UNIQUE (run_id, location_id, rightsholder_id, rights_layer),
  CONSTRAINT business_royalty_accruals_payout_check CHECK (
    payout_state = 'none' OR (calculation_state = 'approved' AND settlement_mode = 'payable'))
);
CREATE INDEX business_royalty_accruals_holder_idx ON public.business_royalty_accruals(rightsholder_id, period_id);

-- Pure computation (no writes). Returns one row per point x rightsholder x layer,
-- or one row with NULL rightsholder for a point that is held (no confirmed plays).
CREATE FUNCTION public.business_royalty_compute(p_period_id uuid, p_formula_version_id uuid)
RETURNS TABLE (
  location_id uuid, payments_minor bigint, deductions_minor bigint, raw_base_minor bigint, base_minor bigint,
  author_fund_minor bigint, audiolad_income_minor bigint, confirmed_ms bigint,
  rightsholder_id uuid, rights_layer text, holder_ms numeric, amount_minor bigint, point_status text)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH per AS (SELECT period_month AS m FROM public.business_royalty_periods WHERE id = p_period_id),
  f AS (SELECT author_fund_bps FROM public.business_royalty_formula_versions WHERE id = p_formula_version_id),
  pay AS (SELECT p.* FROM public.business_royalty_payments p WHERE p.period_id = p_period_id),
  alloc_raw AS (
    SELECT a.payment_id, a.location_id, p.amount_minor AS pay_amount, p.allocation_rule,
      CASE p.allocation_rule
        WHEN 'fixed_amounts' THEN a.fixed_amount_minor::numeric
        WHEN 'weighted' THEN p.amount_minor * a.weight / sum(a.weight) OVER (PARTITION BY a.payment_id)
        ELSE p.amount_minor::numeric / count(*) OVER (PARTITION BY a.payment_id)
      END AS share_amt,
      row_number() OVER (PARTITION BY a.payment_id ORDER BY a.location_id) AS rn,
      count(*) OVER (PARTITION BY a.payment_id) AS n
    FROM public.business_royalty_payment_allocations a JOIN pay p ON p.id = a.payment_id),
  -- Truncate toward zero; the last point of a payment takes the remainder so allocations sum exactly.
  alloc AS (
    SELECT payment_id, alloc_raw.location_id, pay_amount,
      CASE WHEN rn = n THEN pay_amount - coalesce(sum(trunc(share_amt)::bigint) OVER (PARTITION BY payment_id ORDER BY rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
           ELSE trunc(share_amt)::bigint END AS amt
    FROM alloc_raw),
  ded_approved AS (
    SELECT d.* FROM public.business_royalty_deductions d WHERE d.period_id = p_period_id AND d.status = 'approved'),
  ded AS (
    SELECT d.location_id, d.amount_minor::numeric AS amt FROM ded_approved d WHERE d.location_id IS NOT NULL
    UNION ALL
    SELECT a.location_id, d.amount_minor::numeric * a.amt / a.pay_amount
    FROM ded_approved d JOIN alloc a ON a.payment_id = d.payment_id),
  points AS (
    SELECT l AS location_id FROM (SELECT alloc.location_id AS l FROM alloc UNION SELECT ded.location_id FROM ded
      UNION SELECT pl.location_id FROM public.business_royalty_plays pl WHERE pl.period_id = p_period_id) x),
  money AS (
    SELECT pt.location_id,
      coalesce((SELECT sum(amt) FROM alloc WHERE alloc.location_id = pt.location_id), 0)::bigint AS payments_minor,
      coalesce((SELECT round(sum(amt)) FROM ded WHERE ded.location_id = pt.location_id), 0)::bigint AS deductions_minor
    FROM points pt),
  base AS (
    SELECT m.*, (m.payments_minor - m.deductions_minor) AS raw_base,
      greatest(m.payments_minor - m.deductions_minor, 0) AS base,
      floor(greatest(m.payments_minor - m.deductions_minor, 0) * (SELECT author_fund_bps FROM f) / 10000.0)::bigint AS fund
    FROM money m),
  admitted AS (
    SELECT s.audio_item_id FROM public.business_royalty_track_shares s, per
    WHERE s.valid_from <= per.m AND (s.valid_until IS NULL OR s.valid_until > per.m)
    GROUP BY s.audio_item_id HAVING sum(s.share_bps) = 10000),
  plays AS (
    SELECT pl.location_id, pl.audio_item_id, sum(pl.played_ms) AS ms
    FROM public.business_royalty_plays pl JOIN admitted ad ON ad.audio_item_id = pl.audio_item_id
    WHERE pl.period_id = p_period_id AND pl.confirmed GROUP BY 1, 2),
  totals AS (SELECT plays.location_id, sum(ms)::bigint AS total_ms FROM plays GROUP BY 1),
  holders AS (
    SELECT pl.location_id, s.rightsholder_id, s.rights_layer, sum(pl.ms * s.share_bps / 10000.0) AS hms
    FROM plays pl JOIN public.business_royalty_track_shares s ON s.audio_item_id = pl.audio_item_id, per
    WHERE s.valid_from <= per.m AND (s.valid_until IS NULL OR s.valid_until > per.m)
    GROUP BY 1, 2, 3)
  SELECT b.location_id, b.payments_minor, b.deductions_minor, b.raw_base, b.base, b.fund, b.base - b.fund,
    coalesce(t.total_ms, 0), h.rightsholder_id, h.rights_layer, h.hms,
    CASE WHEN h.rightsholder_id IS NULL THEN 0 ELSE floor(b.fund * h.hms / t.total_ms)::bigint END,
    CASE WHEN coalesce(t.total_ms, 0) = 0 THEN 'held_no_plays' ELSE 'distributed' END
  FROM base b
  LEFT JOIN totals t ON t.location_id = b.location_id
  LEFT JOIN holders h ON h.location_id = b.location_id AND coalesce(t.total_ms, 0) > 0
$$;
COMMENT ON FUNCTION public.business_royalty_compute(uuid, uuid) IS
  'Pure calculation. Base clamped at 0 (fund never negative). Points without confirmed plays are held_no_plays: fund not distributed until reconciliation.';

-- Records a new preliminary run (history); previous preliminary accruals of the period become superseded.
CREATE FUNCTION public.business_royalty_run_preliminary(p_period_id uuid, p_formula_version_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_run uuid; v_no integer; v_month date; v_op record;
BEGIN
  SELECT period_month INTO v_month FROM public.business_royalty_periods WHERE id = p_period_id AND status <> 'closed';
  IF v_month IS NULL THEN RAISE EXCEPTION 'business_royalty_period_not_open'; END IF;
  SELECT coalesce(max(run_no), 0) + 1 INTO v_no FROM public.business_royalty_calc_runs WHERE period_id = p_period_id;
  INSERT INTO public.business_royalty_calc_runs (period_id, formula_version_id, run_no)
    VALUES (p_period_id, p_formula_version_id, v_no) RETURNING id INTO v_run;
  UPDATE public.business_royalty_accruals SET calculation_state = 'superseded'
    WHERE period_id = p_period_id AND calculation_state = 'preliminary' AND run_id <> v_run;
  SELECT * INTO v_op FROM public.business_service_operators o
    WHERE o.active_from <= v_month AND (o.active_until IS NULL OR o.active_until > v_month)
    ORDER BY o.active_from DESC LIMIT 1;
  CREATE TEMP TABLE IF NOT EXISTS _roy_calc ON COMMIT DROP AS SELECT * FROM public.business_royalty_compute(p_period_id, p_formula_version_id) LIMIT 0;
  DELETE FROM _roy_calc;
  INSERT INTO _roy_calc SELECT * FROM public.business_royalty_compute(p_period_id, p_formula_version_id);
  INSERT INTO public.business_royalty_point_results (run_id, location_id, payments_minor, deductions_minor, raw_base_minor,
      base_minor, author_fund_minor, audiolad_income_minor, confirmed_ms, distributed_minor, status)
    SELECT v_run, c.location_id, max(c.payments_minor), max(c.deductions_minor), max(c.raw_base_minor), max(c.base_minor),
      max(c.author_fund_minor), max(c.audiolad_income_minor), max(c.confirmed_ms), sum(c.amount_minor), max(c.point_status)
    FROM _roy_calc c GROUP BY c.location_id;
  INSERT INTO public.business_royalty_accruals (run_id, period_id, location_id, rightsholder_id, rights_layer, holder_ms,
      point_confirmed_ms, author_fund_minor, amount_minor, calculation_basis, settlement_mode, operator_id_snapshot)
    SELECT v_run, p_period_id, c.location_id, c.rightsholder_id, c.rights_layer, c.holder_ms, c.confirmed_ms,
      c.author_fund_minor, c.amount_minor,
      jsonb_build_object('payments_minor', c.payments_minor, 'deductions_minor', c.deductions_minor,
        'base_minor', c.base_minor, 'raw_base_minor', c.raw_base_minor, 'formula_version_id', p_formula_version_id),
      CASE WHEN c.rightsholder_id = v_op.same_subject_rightsholder_id THEN 'management' ELSE 'payable' END, v_op.id
    FROM _roy_calc c WHERE c.rightsholder_id IS NOT NULL;
  RETURN v_run;
END $$;

-- Guards: accruals append-only, money immutable; approval needs an approved formula.
CREATE FUNCTION public.business_royalty_accrual_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'business_royalty_append_only'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.run_id, NEW.location_id, NEW.rightsholder_id, NEW.rights_layer, NEW.holder_ms, NEW.amount_minor,
      NEW.author_fund_minor, NEW.calculation_basis, NEW.settlement_mode)
    IS DISTINCT FROM (OLD.run_id, OLD.location_id, OLD.rightsholder_id, OLD.rights_layer, OLD.holder_ms, OLD.amount_minor,
      OLD.author_fund_minor, OLD.calculation_basis, OLD.settlement_mode) THEN
    RAISE EXCEPTION 'business_royalty_accrual_immutable';
  END IF;
  IF NEW.calculation_state = 'approved' AND (TG_OP = 'INSERT' OR OLD.calculation_state <> 'approved') THEN
    SELECT f.status INTO v_status FROM public.business_royalty_calc_runs r
      JOIN public.business_royalty_formula_versions f ON f.id = r.formula_version_id WHERE r.id = NEW.run_id;
    IF v_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'business_royalty_formula_not_approved'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_royalty_accruals_guard BEFORE INSERT OR UPDATE OR DELETE ON public.business_royalty_accruals
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_accrual_guard();

CREATE FUNCTION public.business_royalty_history_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'business_royalty_append_only'; END IF;
  IF TG_TABLE_NAME = 'business_royalty_deductions' THEN
    IF (NEW.amount_minor, NEW.category, NEW.location_id, NEW.payment_id, NEW.document_reference)
        IS DISTINCT FROM (OLD.amount_minor, OLD.category, OLD.location_id, OLD.payment_id, OLD.document_reference) THEN
      RAISE EXCEPTION 'business_royalty_deduction_immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'business_royalty_formula_versions' THEN
    IF NEW.author_fund_bps IS DISTINCT FROM OLD.author_fund_bps THEN
      RAISE EXCEPTION 'business_royalty_formula_immutable';
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('business_royalty_point_results', 'business_royalty_calc_runs', 'business_royalty_plays', 'business_royalty_payments') THEN
    RAISE EXCEPTION 'business_royalty_append_only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_royalty_deductions_guard BEFORE UPDATE OR DELETE ON public.business_royalty_deductions
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_history_guard();
CREATE TRIGGER business_royalty_formula_guard BEFORE UPDATE OR DELETE ON public.business_royalty_formula_versions
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_history_guard();
CREATE TRIGGER business_royalty_point_results_guard BEFORE UPDATE OR DELETE ON public.business_royalty_point_results
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_history_guard();
CREATE TRIGGER business_royalty_calc_runs_guard BEFORE UPDATE OR DELETE ON public.business_royalty_calc_runs
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_history_guard();
CREATE TRIGGER business_royalty_plays_guard BEFORE UPDATE OR DELETE ON public.business_royalty_plays
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_history_guard();
CREATE TRIGGER business_royalty_payments_guard BEFORE UPDATE OR DELETE ON public.business_royalty_payments
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_history_guard();

ALTER TABLE public.business_service_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_formula_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_track_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_calc_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_point_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_accruals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_service_operators, public.business_royalty_formula_versions, public.business_royalty_periods,
  public.business_royalty_payments, public.business_royalty_payment_allocations, public.business_royalty_deductions,
  public.business_royalty_track_shares, public.business_royalty_plays, public.business_royalty_calc_runs,
  public.business_royalty_point_results, public.business_royalty_accruals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_compute(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_run_preliminary(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_accrual_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_history_guard() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Business royalty: usage + accrual ledger (task 0e05333f). Expand-only.
-- One universal mechanism for ALL rightsholders (no artist-specific rules).
-- Ledger is keyed by music_rightsholders, never by the service operator:
-- an operator change (sole trader -> LLC, sale) does not move history or rights.
-- No approved rate exists: rows can only be 'estimated'/'management' until a
-- rate model is approved by a person; nothing here is a payable obligation.
-- Payouts reuse the existing author payout model (one payee = one account);
-- this migration does not create payouts and writes no data.
BEGIN;

CREATE TABLE public.business_service_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 300),
  legal_form text NOT NULL CHECK (legal_form IN ('sole_trader', 'llc', 'other')),
  tax_id text NULL CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{10,12}$'),
  -- Same legal subject as a rightsholder (e.g. sole trader = composer):
  -- accruals to that rightsholder are management-only, still computed.
  same_subject_rightsholder_id uuid NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  active_from timestamptz NOT NULL,
  active_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_service_operators_range_check CHECK (active_until IS NULL OR active_until > active_from)
);
COMMENT ON TABLE public.business_service_operators IS
  'Service operator role (who runs AudioLad Business). Not a rightsholder. History of operators; accruals reference it only as a snapshot.';

CREATE TABLE public.business_royalty_rate_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_.-]{3,64}$'),
  kind text NOT NULL CHECK (kind IN ('per_minute', 'revenue_share_pro_rata', 'location_pool')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency = 'RUB'),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'retired')),
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  approval_document text NULL CHECK (approval_document IS NULL OR length(approval_document) <= 500),
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_rate_models_approval_check CHECK (
    status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_document IS NOT NULL AND valid_from IS NOT NULL)),
  CONSTRAINT business_royalty_rate_models_range_check CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
COMMENT ON TABLE public.business_royalty_rate_models IS
  'Rate options. Same model applies to every rightsholder. Only status=approved (person + document) may produce calculated amounts.';

CREATE TABLE public.business_royalty_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_periods_range_check CHECK (period_end > period_start),
  CONSTRAINT business_royalty_periods_unique UNIQUE (period_start, period_end),
  CONSTRAINT business_royalty_periods_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

-- Aggregated actual usage per period/track/rightsholder/location (input of the formula).
CREATE TABLE public.business_royalty_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  audio_item_id uuid NOT NULL,           -- historical ref, no destructive FK (as music_rights_grants)
  artist_author_id uuid NULL,            -- artist snapshot (performer/alias), not the rightsholder
  rightsholder_id uuid NOT NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  rights_layer text NOT NULL CHECK (rights_layer IN ('recording', 'composition')),
  share_bps integer NOT NULL CHECK (share_bps BETWEEN 1 AND 10000),
  source_grant_id uuid NULL REFERENCES public.music_rights_grants(id) ON DELETE RESTRICT,
  organization_id uuid NULL,
  location_id uuid NULL,
  played_ms bigint NOT NULL CHECK (played_ms >= 0),
  offline_played_ms bigint NOT NULL DEFAULT 0 CHECK (offline_played_ms >= 0 AND offline_played_ms <= played_ms),
  source text NOT NULL CHECK (source IN ('playback_usage_facts', 'business_playback_log', 'manual_adjustment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_usage_unique UNIQUE NULLS NOT DISTINCT
    (period_id, audio_item_id, rightsholder_id, rights_layer, location_id, source)
);

CREATE TABLE public.business_royalty_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_id uuid NOT NULL REFERENCES public.business_royalty_usage(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.business_royalty_periods(id) ON DELETE RESTRICT,
  rightsholder_id uuid NOT NULL REFERENCES public.music_rightsholders(id) ON DELETE RESTRICT,
  audio_item_id uuid NOT NULL,
  rate_model_id uuid NOT NULL REFERENCES public.business_royalty_rate_models(id) ON DELETE RESTRICT,
  calculation_basis jsonb NOT NULL CHECK (jsonb_typeof(calculation_basis) = 'object'),
  applied_rate numeric(18,6) NOT NULL CHECK (applied_rate >= 0),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency = 'RUB'),
  calculation_status text NOT NULL DEFAULT 'estimated'
    CHECK (calculation_status IN ('estimated', 'calculated', 'superseded', 'void')),
  settlement_mode text NOT NULL CHECK (settlement_mode IN ('payable', 'management')),
  payout_status text NOT NULL DEFAULT 'not_payable'
    CHECK (payout_status IN ('not_payable', 'pending', 'in_payout', 'paid', 'cancelled')),
  operator_id_snapshot uuid NULL REFERENCES public.business_service_operators(id) ON DELETE RESTRICT,
  supersedes_id uuid NULL REFERENCES public.business_royalty_accruals(id) ON DELETE RESTRICT,
  calculation_version text NOT NULL DEFAULT 'royalty.v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_royalty_accruals_payable_check CHECK (
    payout_status = 'not_payable'
    OR (calculation_status = 'calculated' AND settlement_mode = 'payable')),
  CONSTRAINT business_royalty_accruals_no_self_supersede CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);
CREATE INDEX business_royalty_accruals_holder_period_idx ON public.business_royalty_accruals(rightsholder_id, period_id);
CREATE UNIQUE INDEX business_royalty_accruals_supersedes_uidx ON public.business_royalty_accruals(supersedes_id) WHERE supersedes_id IS NOT NULL;
COMMENT ON TABLE public.business_royalty_accruals IS
  'Append-only accrual history per rightsholder. estimated = example/unapproved rate, never payable. management = operator is the same subject as rightsholder (no real debt), still computed by the general formula.';

-- Guard: 'calculated' requires an approved rate; management rows never payable;
-- money/basis fields are immutable; no deletes.
CREATE FUNCTION public.business_royalty_accrual_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'business_royalty_accrual_append_only';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.usage_id, NEW.rightsholder_id, NEW.audio_item_id, NEW.rate_model_id, NEW.calculation_basis, NEW.applied_rate, NEW.amount_minor, NEW.period_id, NEW.settlement_mode)
      IS DISTINCT FROM (OLD.usage_id, OLD.rightsholder_id, OLD.audio_item_id, OLD.rate_model_id, OLD.calculation_basis, OLD.applied_rate, OLD.amount_minor, OLD.period_id, OLD.settlement_mode) THEN
    RAISE EXCEPTION 'business_royalty_accrual_immutable';
  END IF;
  IF NEW.calculation_status = 'calculated' THEN
    SELECT status INTO v_status FROM public.business_royalty_rate_models WHERE id = NEW.rate_model_id;
    IF v_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'business_royalty_rate_not_approved';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_royalty_accruals_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.business_royalty_accruals
  FOR EACH ROW EXECUTE FUNCTION public.business_royalty_accrual_guard();

ALTER TABLE public.business_service_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_rate_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_royalty_accruals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_service_operators, public.business_royalty_rate_models, public.business_royalty_periods,
  public.business_royalty_usage, public.business_royalty_accruals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_royalty_accrual_guard() FROM PUBLIC, anon, authenticated;

COMMIT;

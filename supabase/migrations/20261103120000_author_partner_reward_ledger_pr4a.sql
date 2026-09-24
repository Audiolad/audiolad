-- Partner reward ledger PR4A.
-- Schema + source-event queue only. No backfill, payouts, UI, or migration-time
-- financial rows. Partner rewards are 20% of the already accrued invitee
-- author royalty, never of payment gross.

CREATE TABLE IF NOT EXISTS public.author_partner_reward_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.author_referrals (id) ON DELETE RESTRICT,
  partner_author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  invitee_author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE RESTRICT,
  source_sale_ledger_entry_id uuid NOT NULL REFERENCES public.author_ledger_entries (id) ON DELETE RESTRICT,
  source_event_ledger_entry_id uuid NOT NULL REFERENCES public.author_ledger_entries (id) ON DELETE RESTRICT,
  entry_type text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  reward_bps integer NOT NULL DEFAULT 2000,
  effective_at timestamptz NOT NULL,
  available_at timestamptz NULL,
  rounding_policy text NOT NULL DEFAULT 'partner_reward_floor_v1',
  calculation_version text NOT NULL DEFAULT 'partner_reward.v1',
  idempotency_key text NOT NULL,
  correlation_id text NULL,
  is_test boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_partner_reward_ledger_type_check
    CHECK (entry_type IN ('reward_accrual', 'reward_reversal')),
  CONSTRAINT author_partner_reward_ledger_sign_check
    CHECK (
      (entry_type = 'reward_accrual' AND amount_minor > 0)
      OR (entry_type = 'reward_reversal' AND amount_minor < 0)
    ),
  CONSTRAINT author_partner_reward_ledger_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT author_partner_reward_ledger_bps_check CHECK (reward_bps = 2000),
  CONSTRAINT author_partner_reward_ledger_rounding_check
    CHECK (rounding_policy = 'partner_reward_floor_v1'),
  CONSTRAINT author_partner_reward_ledger_key_check
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT author_partner_reward_ledger_metadata_pii_check
    CHECK (
      NOT (metadata ? 'email')
      AND NOT (metadata ? 'buyer_email')
      AND NOT (metadata ? 'user_id')
      AND NOT (metadata ? 'token')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS author_partner_reward_ledger_key_uidx
  ON public.author_partner_reward_ledger_entries (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS author_partner_reward_ledger_sale_uidx
  ON public.author_partner_reward_ledger_entries (source_sale_ledger_entry_id)
  WHERE entry_type = 'reward_accrual';
CREATE UNIQUE INDEX IF NOT EXISTS author_partner_reward_ledger_event_uidx
  ON public.author_partner_reward_ledger_entries (source_event_ledger_entry_id);
CREATE INDEX IF NOT EXISTS author_partner_reward_ledger_partner_idx
  ON public.author_partner_reward_ledger_entries (partner_author_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS author_partner_reward_ledger_sale_idx
  ON public.author_partner_reward_ledger_entries (source_sale_ledger_entry_id);

ALTER TABLE public.author_partner_reward_ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.author_partner_reward_ledger_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.author_partner_reward_ledger_entries TO service_role;

CREATE OR REPLACE FUNCTION public.author_partner_reward_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'author_partner_reward_ledger_append_only' USING ERRCODE = '0A000';
END;
$$;

DROP TRIGGER IF EXISTS author_partner_reward_ledger_append_only_trg
  ON public.author_partner_reward_ledger_entries;
CREATE TRIGGER author_partner_reward_ledger_append_only_trg
  BEFORE UPDATE OR DELETE ON public.author_partner_reward_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.author_partner_reward_ledger_append_only();

CREATE TABLE IF NOT EXISTS public.author_partner_reward_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_type text NOT NULL,
  source_event_ledger_entry_id uuid NOT NULL
    REFERENCES public.author_ledger_entries (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  result_code text NULL,
  last_error text NULL,
  reward_ledger_entry_id uuid NULL
    REFERENCES public.author_partner_reward_ledger_entries (id) ON DELETE RESTRICT,
  correlation_id text NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT author_partner_reward_obligations_type_check
    CHECK (obligation_type IN ('sale_accrual', 'refund_reversal')),
  CONSTRAINT author_partner_reward_obligations_status_check
    CHECK (status IN ('pending', 'processed', 'skipped', 'requires_review', 'failed')),
  CONSTRAINT author_partner_reward_obligations_attempts_check CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS author_partner_reward_obligation_source_uidx
  ON public.author_partner_reward_obligations (obligation_type, source_event_ledger_entry_id);
CREATE INDEX IF NOT EXISTS author_partner_reward_obligation_due_idx
  ON public.author_partner_reward_obligations (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.author_partner_reward_obligations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.author_partner_reward_obligations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.author_partner_reward_obligations TO service_role;

CREATE OR REPLACE FUNCTION public.author_partner_reward_minor(p_author_net_minor bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT floor(greatest(coalesce(p_author_net_minor, 0), 0)::numeric * 2000 / 10000)::bigint;
$$;

CREATE OR REPLACE FUNCTION public.author_partner_reward_referral(
  p_invitee_author_id uuid,
  p_effective_at timestamptz
)
RETURNS public.author_referrals
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.*
  FROM public.author_referrals AS r
  WHERE r.invitee_author_id = p_invitee_author_id
    AND r.activated_at IS NOT NULL
    AND r.expires_at IS NOT NULL
    AND p_effective_at >= r.activated_at
    AND p_effective_at < r.expires_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_author_partner_reward_obligation(
  p_source_event_ledger_entry_id uuid,
  p_obligation_type text,
  p_correlation_id text DEFAULT NULL,
  p_is_test boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.author_partner_reward_obligations (
    obligation_type, source_event_ledger_entry_id, correlation_id, is_test
  )
  VALUES (
    p_obligation_type, p_source_event_ledger_entry_id,
    nullif(btrim(coalesce(p_correlation_id, '')), ''), coalesce(p_is_test, false)
  )
  ON CONFLICT (obligation_type, source_event_ledger_entry_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_author_partner_reward_obligation(
  p_obligation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_obligation public.author_partner_reward_obligations%ROWTYPE;
  v_source public.author_ledger_entries%ROWTYPE;
  v_sale public.author_ledger_entries%ROWTYPE;
  v_referral public.author_referrals%ROWTYPE;
  v_existing public.author_partner_reward_ledger_entries%ROWTYPE;
  v_author_net bigint;
  v_current bigint;
  v_target bigint;
  v_delta bigint;
  v_entry public.author_partner_reward_ledger_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_obligation
  FROM public.author_partner_reward_obligations
  WHERE id = p_obligation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'not_found');
  END IF;
  IF v_obligation.status IN ('processed', 'skipped', 'requires_review') THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'already_terminal', 'status', v_obligation.status);
  END IF;

  SELECT * INTO v_source FROM public.author_ledger_entries
  WHERE id = v_obligation.source_event_ledger_entry_id FOR UPDATE;
  IF NOT FOUND OR v_source.entry_type IS DISTINCT FROM v_obligation.obligation_type THEN
    UPDATE public.author_partner_reward_obligations
    SET status = 'requires_review', result_code = 'source_event_invalid',
        attempts = attempts + 1, processed_at = now(), updated_at = now()
    WHERE id = v_obligation.id;
    RETURN jsonb_build_object('ok', false, 'outcome', 'requires_review', 'result_code', 'source_event_invalid');
  END IF;

  IF v_source.entry_type = 'sale_accrual' THEN
    v_sale := v_source;
    SELECT * INTO v_referral
    FROM public.author_partner_reward_referral(v_sale.author_id, v_sale.effective_at);
    IF NOT FOUND THEN
      UPDATE public.author_partner_reward_obligations
      SET status = 'skipped', result_code = 'not_eligible',
          attempts = attempts + 1, processed_at = now(), updated_at = now()
      WHERE id = v_obligation.id;
      RETURN jsonb_build_object('ok', true, 'outcome', 'skipped', 'result_code', 'not_eligible');
    END IF;
  ELSE
    SELECT * INTO v_sale FROM public.author_ledger_entries
    WHERE payment_id = v_source.payment_id AND entry_type = 'sale_accrual';
    IF NOT FOUND THEN
      UPDATE public.author_partner_reward_obligations
      SET status = 'failed', result_code = 'source_sale_missing',
          attempts = attempts + 1,
          next_retry_at = now() + make_interval(
            mins => least(60, power(2, least(attempts, 6))::integer)
          ),
          last_error = 'source_sale_missing', updated_at = now()
      WHERE id = v_obligation.id;
      RETURN jsonb_build_object('ok', false, 'outcome', 'failed', 'result_code', 'source_sale_missing');
    END IF;
    SELECT * INTO v_existing FROM public.author_partner_reward_ledger_entries
    WHERE source_sale_ledger_entry_id = v_sale.id AND entry_type = 'reward_accrual';
    IF NOT FOUND THEN
      UPDATE public.author_partner_reward_obligations
      SET status = 'skipped', result_code = 'sale_not_partner_eligible',
          attempts = attempts + 1, processed_at = now(), updated_at = now()
      WHERE id = v_obligation.id;
      RETURN jsonb_build_object('ok', true, 'outcome', 'skipped', 'result_code', 'sale_not_partner_eligible');
    END IF;
    SELECT * INTO v_referral FROM public.author_referrals WHERE id = v_existing.referral_id;
  END IF;

  -- Serialize every event for this source sale before reading the current
  -- partner position and appending its delta. Refund rows alone are distinct
  -- locks and therefore insufficient under concurrent reconciliation.
  SELECT * INTO v_sale
  FROM public.author_ledger_entries
  WHERE id = v_sale.id
  FOR UPDATE;

  SELECT coalesce(sum(amount_minor), 0)::bigint INTO v_author_net
  FROM public.author_ledger_entries
  WHERE payment_id = v_sale.payment_id
    AND entry_type IN ('sale_accrual', 'refund_reversal');
  SELECT coalesce(sum(amount_minor), 0)::bigint INTO v_current
  FROM public.author_partner_reward_ledger_entries
  WHERE referral_id = v_referral.id AND source_sale_ledger_entry_id = v_sale.id;
  v_target := public.author_partner_reward_minor(v_author_net);
  v_delta := v_target - v_current;

  IF v_delta = 0 THEN
    UPDATE public.author_partner_reward_obligations
    SET status = 'skipped', result_code = 'reconciled_no_delta',
        attempts = attempts + 1, processed_at = now(), updated_at = now()
    WHERE id = v_obligation.id;
    RETURN jsonb_build_object('ok', true, 'outcome', 'skipped', 'result_code', 'reconciled_no_delta');
  END IF;

  INSERT INTO public.author_partner_reward_ledger_entries (
    referral_id, partner_author_id, invitee_author_id,
    source_sale_ledger_entry_id, source_event_ledger_entry_id,
    entry_type, amount_minor, currency, reward_bps, effective_at, available_at,
    idempotency_key, correlation_id, is_test,
    metadata
  )
  VALUES (
    v_referral.id, v_referral.referrer_author_id, v_sale.author_id,
    v_sale.id, v_source.id,
    CASE WHEN v_delta > 0 THEN 'reward_accrual' ELSE 'reward_reversal' END,
    v_delta, v_sale.currency, 2000, v_source.effective_at, v_sale.available_at,
    'partner_reward.v1:event:' || v_source.id::text,
    v_obligation.correlation_id, v_source.is_test,
    jsonb_build_object(
      'author_net_entitlement_minor', v_author_net,
      'partner_target_minor', v_target,
      'partner_current_before_minor', v_current
    )
  )
  RETURNING * INTO v_entry;

  UPDATE public.author_partner_reward_obligations
  SET status = 'processed', result_code = 'reward_ledger_written',
      reward_ledger_entry_id = v_entry.id, attempts = attempts + 1,
      processed_at = now(), updated_at = now()
  WHERE id = v_obligation.id;
  RETURN jsonb_build_object('ok', true, 'outcome', 'processed', 'ledger_entry_id', v_entry.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.author_partner_reward_obligation_on_author_ledger_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.enqueue_author_partner_reward_obligation(
    NEW.id, NEW.entry_type, NEW.correlation_id, NEW.is_test
  );
  -- Queue persistence is the only trigger side effect. Draining is invoked
  -- from the existing post-commit author-finance execution path, so buyer
  -- payment/access never depends on partner reward processing.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_partner_reward_on_author_ledger_insert_trg
  ON public.author_ledger_entries;
CREATE TRIGGER author_partner_reward_on_author_ledger_insert_trg
  AFTER INSERT ON public.author_ledger_entries
  FOR EACH ROW
  WHEN (NEW.entry_type IN ('sale_accrual', 'refund_reversal'))
  EXECUTE FUNCTION public.author_partner_reward_obligation_on_author_ledger_insert();

CREATE OR REPLACE FUNCTION public.process_due_author_partner_reward_obligations(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_result jsonb;
  v_total integer := 0;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_review integer := 0;
  v_failed integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.author_partner_reward_obligations
    WHERE status IN ('pending', 'failed') AND next_retry_at <= now()
    ORDER BY next_retry_at, created_at
    LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_result := public.reconcile_author_partner_reward_obligation(v_id);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.author_partner_reward_obligations
      SET status = 'failed',
          attempts = attempts + 1,
          next_retry_at = now() + make_interval(
            mins => least(60, power(2, least(attempts, 6))::integer)
          ),
          last_error = left(SQLERRM, 500),
          updated_at = now()
      WHERE id = v_id;
      v_result := jsonb_build_object('ok', false, 'outcome', 'failed');
    END;
    v_total := v_total + 1;
    CASE v_result ->> 'outcome'
      WHEN 'processed' THEN v_processed := v_processed + 1;
      WHEN 'skipped' THEN v_skipped := v_skipped + 1;
      WHEN 'failed' THEN v_failed := v_failed + 1;
      ELSE v_review := v_review + 1;
    END CASE;
  END LOOP;
  RETURN jsonb_build_object(
    'attempted', v_total,
    'processed', v_processed,
    'skipped', v_skipped,
    'requires_review', v_review,
    'failed', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.author_partner_reward_minor(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.author_partner_reward_referral(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_author_partner_reward_obligation(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_author_partner_reward_obligation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_due_author_partner_reward_obligations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_author_partner_reward_obligation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_due_author_partner_reward_obligations(integer) TO service_role;

DO $$
DECLARE v_partner_rows integer;
BEGIN
  SELECT count(*) INTO v_partner_rows FROM public.author_partner_reward_ledger_entries;
  IF v_partner_rows <> 0 THEN
    RAISE EXCEPTION 'Post-check failed: PR4A migration must not backfill partner rewards';
  END IF;
END;
$$;

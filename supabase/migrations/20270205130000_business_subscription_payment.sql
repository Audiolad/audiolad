BEGIN;

-- ---------------------------------------------------------------------------
-- Business subscription payment (Sergey 2026-10-28).
-- Additive only. Does not call Tochka. Does not apply itself to production.
--
-- One manual month: order_kind business_subscription, 79900 kopecks, RUB.
-- Card and SBP stay on the existing one-off payment link. No auto-charge.
-- One business_subscription_periods row per order. A repeated APPROVED webhook
-- does not move paid_until again. The 3-day grace window is not stored here.
-- Offer acceptance is one row per account (user_id), never per point or player.
-- A test payment records the period with opens_access = false and does not
-- move paid_until. Author accrual returns skipped / platform_business_subscription.
--
-- Rollback is not executed by this file. Run it only if this migration is the
-- latest change and Sergey confirms the new rows may go. Order:
--   1. Restore function bodies of fulfill_tochka_payment_transactional,
--      order_sale_accrual_ready and orders_enforce_author_id_snapshot from
--      supabase/migrations/20261008120000_author_project_capacity_purchase.sql.
--   2. Restore ensure_author_sale_accrual from
--      supabase/migrations/20260726140000_payments_p332_author_ledger.sql.
--   3. Drop the three order checks added below and recreate them without
--      business_subscription, as in 20261008120000.
--   4. DROP INDEX IF EXISTS public.orders_one_pending_business_subscription_per_user_idx;
--   5. DROP FUNCTION IF EXISTS public.apply_business_subscription_for_order(uuid);
--   6. DROP FUNCTION IF EXISTS public.create_business_subscription_order(uuid);
--   7. DROP FUNCTION IF EXISTS public.accept_business_offer(text, text, text);
--   8. DROP FUNCTION IF EXISTS public.business_offer_acceptance_for_caller();
--   9. DROP FUNCTION IF EXISTS public.business_subscription_email_hash(text);
--  10. DROP TABLE IF EXISTS public.business_subscription_periods;
--  11. DROP TABLE IF EXISTS public.business_offer_acceptances;
-- Do not drop orders, payments, access_grants or access_paid_periods.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_subscription_periods (
  order_id uuid PRIMARY KEY
    REFERENCES public.orders (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  email_hash text NOT NULL,
  kind text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount_minor bigint NOT NULL,
  opens_access boolean NOT NULL,
  applied_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_subscription_periods_email_hash_check
    CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_subscription_periods_kind_check
    CHECK (kind = 'business_new_client'),
  CONSTRAINT business_subscription_periods_window_check
    CHECK (period_end > period_start),
  CONSTRAINT business_subscription_periods_amount_check
    CHECK (amount_minor = 79900)
);

COMMENT ON TABLE public.business_subscription_periods IS
  'audiolad:business-subscription; one paid 30x24h window per order. Replay of the same order does not extend paid_until. Grace days are not stored. No FK to auth.users.';

CREATE INDEX IF NOT EXISTS business_subscription_periods_user_idx
  ON public.business_subscription_periods (user_id, period_end DESC);

ALTER TABLE public.business_subscription_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_subscription_periods FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_subscription_periods TO service_role;

CREATE TABLE IF NOT EXISTS public.business_offer_acceptances (
  user_id uuid PRIMARY KEY,
  document_key text NOT NULL,
  document_version text NOT NULL,
  content_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_by_user_id uuid NOT NULL,
  CONSTRAINT business_offer_acceptances_key_check
    CHECK (document_key = 'b2b-terms'),
  CONSTRAINT business_offer_acceptances_version_check
    CHECK (char_length(btrim(document_version)) BETWEEN 1 AND 80),
  CONSTRAINT business_offer_acceptances_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_offer_acceptances_actor_check
    CHECK (accepted_by_user_id = user_id)
);

COMMENT ON TABLE public.business_offer_acceptances IS
  'audiolad:business-subscription; one B2B offer acceptance per account. Covers every current and future point of that owner. No location_id and no player_id.';

ALTER TABLE public.business_offer_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_offer_acceptances FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_offer_acceptances TO service_role;

CREATE OR REPLACE FUNCTION public.business_subscription_email_hash(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_email IS NULL THEN NULL
    WHEN char_length(btrim(p_email)) = 0 OR char_length(btrim(p_email)) > 320 THEN NULL
    WHEN position('@' IN btrim(p_email)) = 0 THEN NULL
    ELSE encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex')
  END;
$$;

REVOKE ALL ON FUNCTION public.business_subscription_email_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_subscription_email_hash(text) TO service_role;

COMMENT ON FUNCTION public.business_subscription_email_hash(text) IS
  'audiolad:business-subscription; sha256 hex of the trimmed lowercased payer email. Same shape as the trial clock.';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_kind_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_kind_check
  CHECK (order_kind IN (
    'product_purchase',
    'course_upgrade',
    'studio_music_license',
    'author_project_capacity',
    'business_subscription'
  ));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_course_upgrade_target_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_course_upgrade_target_check
  CHECK (
    (order_kind = 'product_purchase' AND target_access_level IS NULL)
    OR (order_kind = 'course_upgrade' AND target_access_level >= 2)
    OR (order_kind = 'studio_music_license' AND target_access_level IS NULL)
    OR (
      order_kind = 'author_project_capacity'
      AND target_access_level IS NULL
      AND practice_id IS NULL
    )
    OR (
      order_kind = 'business_subscription'
      AND target_access_level IS NULL
      AND practice_id IS NULL
    )
  );

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_practice_id_by_kind_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_practice_id_by_kind_check
  CHECK (
    (
      order_kind = 'author_project_capacity'
      AND practice_id IS NULL
    )
    OR (
      order_kind = 'business_subscription'
      AND practice_id IS NULL
    )
    OR (
      order_kind IN (
        'product_purchase',
        'course_upgrade',
        'studio_music_license'
      )
      AND practice_id IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT orders_practice_id_by_kind_check ON public.orders IS
  'practice_id required for product_purchase/course_upgrade/studio_music_license; NULL for author_project_capacity and business_subscription.';

COMMENT ON COLUMN public.orders.order_kind IS
  'product_purchase | course_upgrade | studio_music_license | author_project_capacity | business_subscription (monthly venue access, practice_id NULL, 79900).';

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_business_subscription_per_user_idx
  ON public.orders (user_id)
  WHERE status = 'pending' AND order_kind = 'business_subscription';

COMMENT ON INDEX public.orders_one_pending_business_subscription_per_user_idx IS
  'At most one live pending business_subscription order per owner account.';

CREATE OR REPLACE FUNCTION public.orders_enforce_author_id_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_author uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.author_id_snapshot IS NOT NULL
     AND NEW.author_id_snapshot IS DISTINCT FROM OLD.author_id_snapshot THEN
    NEW.author_id_snapshot := OLD.author_id_snapshot;
  END IF;

  IF coalesce(NEW.order_kind, 'product_purchase') IN (
    'author_project_capacity',
    'business_subscription'
  ) THEN
    NEW.author_id_snapshot := NULL;
    NEW.practice_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.author_id_snapshot IS NULL THEN
    SELECT pr.author_id
    INTO v_practice_author
    FROM public.practices AS pr
    WHERE pr.id = NEW.practice_id;

    NEW.author_id_snapshot := v_practice_author;
  END IF;

  IF coalesce(NEW.amount_minor, 0) > 0 AND NEW.author_id_snapshot IS NULL THEN
    RAISE EXCEPTION 'author_snapshot_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.order_sale_accrual_ready(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_practice_author uuid;
  v_author_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders AS o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready', false, 'code', 'order_not_found');
  END IF;

  IF coalesce(v_order.order_kind, 'product_purchase') = 'author_project_capacity' THEN
    RETURN jsonb_build_object('ready', true, 'code', 'platform_capacity_sale');
  END IF;

  IF coalesce(v_order.order_kind, 'product_purchase') = 'business_subscription' THEN
    RETURN jsonb_build_object('ready', true, 'code', 'platform_business_subscription');
  END IF;

  IF coalesce(v_order.amount_minor, 0) <= 0 THEN
    RETURN jsonb_build_object('ready', true, 'code', 'zero_amount');
  END IF;

  SELECT pr.author_id INTO v_practice_author
  FROM public.practices AS pr
  WHERE pr.id = v_order.practice_id;

  v_author_id := coalesce(v_order.author_id_snapshot, v_practice_author);
  IF v_author_id IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_snapshot_missing');
  END IF;

  IF v_order.author_id_snapshot IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'code', 'author_snapshot_missing');
  END IF;

  RETURN public.author_sale_accrual_ready(v_author_id, now());
END;
$$;


CREATE OR REPLACE FUNCTION public.accept_business_offer(
  p_document_key text,
  p_document_version text,
  p_content_hash text
)
RETURNS TABLE (
  user_id uuid,
  document_key text,
  document_version text,
  content_hash text,
  accepted_at timestamptz,
  already_accepted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.business_offer_acceptances%ROWTYPE;
  v_version text := btrim(coalesce(p_document_version, ''));
  v_hash text := lower(btrim(coalesce(p_content_hash, '')));
  v_known boolean;
BEGIN
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_organization_members AS m
    WHERE m.user_id = v_user_id
      AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_organization_owner'
      USING ERRCODE = '42501',
            HINT = 'https://business.audiolad.ru/onboarding';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.business_offer_acceptances AS a
  WHERE a.user_id = v_user_id;

  IF FOUND THEN
    user_id := v_existing.user_id;
    document_key := v_existing.document_key;
    document_version := v_existing.document_version;
    content_hash := v_existing.content_hash;
    accepted_at := v_existing.accepted_at;
    already_accepted := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_known := p_document_key = 'b2b-terms' AND (
    (
      v_version = 'r8-2026-10-18'
      AND v_hash = '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a'
    )
    OR (
      v_version = 'r6.1-2026-10-18'
      AND v_hash = 'a3e74c3a6b06bd6c8e29ecc6e832984a7a2f7f5af75c44252c7ba1a85c98bc88'
    )
  );

  IF NOT v_known THEN
    RAISE EXCEPTION 'offer_document_unknown'
      USING ERRCODE = '22023',
            HINT = 'https://business.audiolad.ru/documents/b2b-terms';
  END IF;

  INSERT INTO public.business_offer_acceptances (
    user_id,
    document_key,
    document_version,
    content_hash,
    accepted_by_user_id
  ) VALUES (
    v_user_id,
    'b2b-terms',
    v_version,
    v_hash,
    v_user_id
  )
  RETURNING * INTO v_existing;

  user_id := v_existing.user_id;
  document_key := v_existing.document_key;
  document_version := v_existing.document_version;
  content_hash := v_existing.content_hash;
  accepted_at := v_existing.accepted_at;
  already_accepted := false;
  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
    INTO v_existing
    FROM public.business_offer_acceptances AS a
    WHERE a.user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    user_id := v_existing.user_id;
    document_key := v_existing.document_key;
    document_version := v_existing.document_version;
    content_hash := v_existing.content_hash;
    accepted_at := v_existing.accepted_at;
    already_accepted := true;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_business_offer(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_business_offer(text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.accept_business_offer(text, text, text) IS
  'audiolad:business-subscription; one B2B offer acceptance per owner account. A second call returns the stored row. Support mode cannot accept.';

CREATE OR REPLACE FUNCTION public.business_offer_acceptance_for_caller()
RETURNS TABLE (
  user_id uuid,
  document_key text,
  document_version text,
  content_hash text,
  accepted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.user_id, a.document_key, a.document_version, a.content_hash, a.accepted_at
  FROM public.business_offer_acceptances AS a
  WHERE a.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.business_offer_acceptance_for_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_offer_acceptance_for_caller() TO authenticated, service_role;

COMMENT ON FUNCTION public.business_offer_acceptance_for_caller() IS
  'audiolad:business-subscription; the caller reads only their own account acceptance.';

CREATE OR REPLACE FUNCTION public.create_business_subscription_order(
  p_idempotency_key uuid
)
RETURNS TABLE (
  order_id uuid,
  status text,
  amount_minor bigint,
  currency text,
  order_kind text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.orders%ROWTYPE;
  v_new_order public.orders%ROWTYPE;
  v_key text;
BEGIN
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_organization_members AS m
    WHERE m.user_id = v_user_id
      AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_organization_owner'
      USING ERRCODE = '42501',
            HINT = 'https://business.audiolad.ru/onboarding';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_offer_acceptances AS a
    WHERE a.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'offer_acceptance_required'
      USING ERRCODE = 'P0001',
            HINT = 'https://business.audiolad.ru/documents/b2b-terms';
  END IF;

  v_key := p_idempotency_key::text;
  PERFORM pg_advisory_xact_lock(hashtextextended('business_subscription_order:' || v_user_id::text, 0));

  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id
       OR v_existing.order_kind IS DISTINCT FROM 'business_subscription'
       OR v_existing.amount_minor IS DISTINCT FROM 79900 THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;
    order_id := v_existing.id;
    status := v_existing.status;
    amount_minor := v_existing.amount_minor;
    currency := v_existing.currency;
    order_kind := v_existing.order_kind;
    created_at := v_existing.created_at;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT o.*
  INTO v_existing
  FROM public.orders AS o
  WHERE o.user_id = v_user_id
    AND o.order_kind = 'business_subscription'
    AND o.status = 'pending'
  ORDER BY o.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.amount_minor IS DISTINCT FROM 79900
       OR v_existing.currency IS DISTINCT FROM 'RUB' THEN
      RAISE EXCEPTION 'pending_order_mismatch' USING ERRCODE = 'P0001';
    END IF;
    order_id := v_existing.id;
    status := v_existing.status;
    amount_minor := v_existing.amount_minor;
    currency := v_existing.currency;
    order_kind := v_existing.order_kind;
    created_at := v_existing.created_at;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.orders (
    user_id,
    practice_id,
    status,
    amount_minor,
    currency,
    practice_title_snapshot,
    practice_slug_snapshot,
    price_minor_snapshot,
    base_price_minor_snapshot,
    author_id_snapshot,
    idempotency_key,
    order_kind,
    target_access_level
  ) VALUES (
    v_user_id,
    NULL,
    'pending',
    79900,
    'RUB',
    'АудиоЛад Бизнес – доступ на 30 дней',
    'business-subscription',
    79900,
    79900,
    NULL,
    v_key,
    'business_subscription',
    NULL
  )
  RETURNING * INTO v_new_order;

  order_id := v_new_order.id;
  status := v_new_order.status;
  amount_minor := v_new_order.amount_minor;
  currency := v_new_order.currency;
  order_kind := v_new_order.order_kind;
  created_at := v_new_order.created_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_subscription_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_subscription_order(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_business_subscription_order(uuid) IS
  'audiolad:business-subscription; owner account only. Amount is 79900 on the server. One pending order per account. A point credential cannot call this.';

CREATE OR REPLACE FUNCTION public.apply_business_subscription_for_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_existing public.business_subscription_periods%ROWTYPE;
  v_grant public.access_grants%ROWTYPE;
  v_email text;
  v_hash text;
  v_kind text := 'business_new_client';
  v_paid_at timestamptz;
  v_trial_end timestamptz;
  v_paid_until timestamptz;
  v_base timestamptz;
  v_end timestamptz;
  v_opens boolean;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_order.order_kind, '') IS DISTINCT FROM 'business_subscription' THEN
    RAISE EXCEPTION 'invalid_order_kind' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'order_not_paid' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.amount_minor IS DISTINCT FROM 79900 OR v_order.currency IS DISTINCT FROM 'RUB' THEN
    RAISE EXCEPTION 'subscription_amount_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.business_subscription_periods AS s
  WHERE s.order_id = v_order.id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'inserted', false,
      'already', true,
      'opens_access', v_existing.opens_access,
      'period_end', v_existing.period_end
    );
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.order_id = v_order.id
    AND p.provider = 'tochka'
    AND p.status = 'succeeded'
    AND p.amount_minor = 79900
    AND p.currency = 'RUB'
  ORDER BY p.confirmed_at NULLS LAST, p.created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_succeeded' USING ERRCODE = 'P0001';
  END IF;

  v_paid_at := coalesce(v_payment.confirmed_at, v_order.paid_at, clock_timestamp());
  v_opens := NOT (coalesce(v_order.is_test, false) OR coalesce(v_payment.is_test, false));

  SELECT u.email
  INTO v_email
  FROM auth.users AS u
  WHERE u.id = v_order.user_id;

  v_hash := public.business_subscription_email_hash(v_email);
  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'subscription_payer_email_missing' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('access_grants:' || v_kind, 0));

  SELECT *
  INTO v_grant
  FROM public.resolve_access_grant(v_hash, v_order.user_id, v_kind)
  LIMIT 1;

  IF FOUND AND v_grant.ends_at > v_paid_at THEN
    v_trial_end := v_grant.ends_at;
  END IF;

  SELECT max(p.paid_until)
  INTO v_paid_until
  FROM public.access_paid_periods AS p
  WHERE p.kind = v_kind
    AND (p.email_hash = v_hash OR p.user_id = v_order.user_id);

  v_base := v_paid_at;
  IF v_trial_end IS NOT NULL AND v_trial_end > v_base THEN
    v_base := v_trial_end;
  END IF;
  IF v_paid_until IS NOT NULL AND v_paid_until > v_base THEN
    v_base := v_paid_until;
  END IF;
  v_end := v_base + interval '30 days';

  INSERT INTO public.business_subscription_periods (
    order_id,
    user_id,
    email_hash,
    kind,
    period_start,
    period_end,
    amount_minor,
    opens_access,
    applied_at
  ) VALUES (
    v_order.id,
    v_order.user_id,
    v_hash,
    v_kind,
    v_base,
    v_end,
    79900,
    v_opens,
    v_paid_at
  );

  IF v_opens THEN
    INSERT INTO public.access_paid_periods AS ap (
      email_hash,
      user_id,
      kind,
      paid_until
    ) VALUES (
      v_hash,
      v_order.user_id,
      v_kind,
      v_end
    )
    ON CONFLICT (email_hash, kind) DO UPDATE
    SET
      paid_until = GREATEST(ap.paid_until, EXCLUDED.paid_until),
      updated_at = clock_timestamp()
    WHERE ap.paid_until < EXCLUDED.paid_until;

    INSERT INTO public.access_grant_events (
      email_hash,
      user_id,
      kind,
      event_name,
      occurred_at
    )
    SELECT v_hash, v_order.user_id, v_kind, 'subscription_renewed', v_paid_at
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.access_grant_events AS e
      WHERE e.email_hash = v_hash
        AND e.kind = v_kind
        AND e.event_name = 'subscription_renewed'
    );
  END IF;

  RETURN jsonb_build_object(
    'inserted', true,
    'already', false,
    'opens_access', v_opens,
    'period_end', v_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_business_subscription_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_subscription_for_order(uuid) TO service_role;

COMMENT ON FUNCTION public.apply_business_subscription_for_order(uuid) IS
  'audiolad:business-subscription; webhook fulfillment only. Extends paid_until once per order. Does not grant a practice or an author royalty. Test payments do not open the cabinet clock.';

CREATE OR REPLACE FUNCTION public.ensure_author_sale_accrual(
  p_payment_id uuid,
  p_correlation_id text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_author public.authors%ROWTYPE;
  v_existing public.author_ledger_entries%ROWTYPE;
  v_entry public.author_ledger_entries%ROWTYPE;
  v_terms jsonb;
  v_bps integer;
  v_hold_days integer;
  v_amount bigint;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments AS p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'payment_not_found'
    );
  END IF;

  -- Replay: the ledger already carries this sale.
  SELECT *
  INTO v_existing
  FROM public.author_ledger_entries AS e
  WHERE e.payment_id = p_payment_id
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

  IF v_payment.status IS DISTINCT FROM 'succeeded' OR v_payment.confirmed_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'payment_not_succeeded'
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = v_payment.order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'order_not_found'
    );
  END IF;

  -- Platform venue subscription: no author, no royalty review queue.
  IF coalesce(v_order.order_kind, '') = 'business_subscription' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'platform_business_subscription',
      'order_id', v_order.id
    );
  END IF;

  -- Attribution is a write-time snapshot. A missing snapshot is a review item,
  -- never a guess from the current practice owner.
  IF v_order.author_id_snapshot IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'author_snapshot_missing',
      'order_id', v_order.id
    );
  END IF;

  SELECT *
  INTO v_author
  FROM public.authors AS a
  WHERE a.id = v_order.author_id_snapshot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'requires_review',
      'result_code', 'author_not_found',
      'author_id', v_order.author_id_snapshot
    );
  END IF;

  -- Platform-owned catalog: commercial access status alone is not a payout.
  IF NOT v_author.payout_eligible THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'author_not_payout_eligible',
      'author_id', v_author.id
    );
  END IF;

  v_terms := public.resolve_author_commercial_terms(
    v_author.id,
    v_payment.confirmed_at,
    v_payment.currency
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
  v_amount := public.author_share_minor(v_payment.amount_minor, v_bps);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'skipped',
      'result_code', 'zero_amount',
      'author_id', v_author.id
    );
  END IF;

  INSERT INTO public.author_ledger_entries (
    author_id,
    entry_type,
    amount_minor,
    currency,
    payment_id,
    order_id,
    practice_id,
    terms_id,
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
    v_payment.currency,
    v_payment.id,
    v_order.id,
    v_order.practice_id,
    (v_terms ->> 'terms_id')::uuid,
    v_bps,
    v_hold_days,
    v_payment.amount_minor,
    v_payment.amount_minor,
    v_payment.confirmed_at,
    v_payment.confirmed_at + make_interval(days => v_hold_days),
    coalesce(v_terms ->> 'calculation_version', 'p332.v1'),
    'p332:sale:' || v_payment.id::text,
    nullif(btrim(coalesce(p_correlation_id, '')), ''),
    p_actor_user_id,
    v_payment.is_test,
    jsonb_build_object(
      'terms_valid_from', v_terms -> 'valid_from',
      'terms_valid_to', v_terms -> 'valid_to'
    )
  )
  RETURNING * INTO v_entry;

  PERFORM public.write_finance_audit_log(
    p_actor_user_id,
    'author_sale_accrual_created',
    'author_ledger_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'author_id', v_entry.author_id,
      'payment_id', v_entry.payment_id,
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

CREATE OR REPLACE FUNCTION public.fulfill_tochka_payment_transactional(
  p_webhook_event_id uuid,
  p_provider_payment_id text,
  p_payment_id uuid,
  p_provider_amount_minor bigint,
  p_provider_currency text,
  p_provider_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.payment_webhook_events%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_now timestamptz := now();
  v_is_test boolean := false;
  v_test_reason text := NULL;
  v_access_before integer := 0;
  v_access_after integer := 0;
  v_grant jsonb;
  v_was_repaired boolean := false;
  v_was_already_complete boolean := false;
  v_access_inserted boolean := false;
  v_outcome text;
  v_review_reason text := NULL;
  v_payment_before text;
  v_order_before text;
  v_payment_found boolean := false;
  v_publication_class text;
  v_order_kind text;
BEGIN
  IF p_webhook_event_id IS NULL THEN
    RAISE EXCEPTION 'webhook_event_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_event
  FROM public.payment_webhook_events AS e
  WHERE e.id = p_webhook_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.provider IS DISTINCT FROM 'tochka' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'ignored',
      processed_at = v_now,
      updated_at = v_now,
      last_error = 'unsupported_provider'
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'ignored',
      'review_reason', 'unsupported_provider',
      'webhook_event_id', v_event.id,
      'processing_status', 'ignored'
    );
  END IF;

  IF v_event.processing_status IN ('processed', 'duplicate') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'already_complete',
      'was_already_complete', true,
      'was_repaired', false,
      'payment_id', v_event.payment_id,
      'order_id', v_event.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', v_event.processing_status
    );
  END IF;

  IF v_event.processing_status = 'requires_review' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', v_event.review_reason,
      'payment_id', v_event.payment_id,
      'order_id', v_event.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'was_already_complete', true,
      'was_repaired', false
    );
  END IF;

  IF p_provider_status IS DISTINCT FROM 'APPROVED' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'ignored',
      processed_at = v_now,
      updated_at = v_now,
      last_error = 'unsupported_status'
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'ignored',
      'review_reason', 'unsupported_status',
      'webhook_event_id', v_event.id,
      'processing_status', 'ignored'
    );
  END IF;

  -- Locate payment: prefer internal id, else provider operation id.
  IF p_payment_id IS NOT NULL THEN
    SELECT *
    INTO v_payment
    FROM public.payments AS p
    WHERE p.id = p_payment_id
      AND p.provider = 'tochka'
    FOR UPDATE;

    v_payment_found := FOUND;
  END IF;

  IF NOT v_payment_found
     AND p_provider_payment_id IS NOT NULL
     AND btrim(p_provider_payment_id) <> '' THEN
    SELECT *
    INTO v_payment
    FROM public.payments AS p
    WHERE p.provider = 'tochka'
      AND p.provider_payment_id = p_provider_payment_id
    FOR UPDATE;

    v_payment_found := FOUND;
  END IF;

  IF NOT v_payment_found THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'payment_not_found',
      last_error = 'payment_not_found',
      provider_payment_id = coalesce(
        provider_payment_id,
        nullif(btrim(coalesce(p_provider_payment_id, '')), '')
      )
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'payment_not_found',
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  IF p_provider_payment_id IS NOT NULL
     AND btrim(p_provider_payment_id) <> ''
     AND v_payment.provider_payment_id IS NOT NULL
     AND v_payment.provider_payment_id IS DISTINCT FROM btrim(p_provider_payment_id) THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'provider_payment_id_mismatch',
      last_error = 'provider_payment_id_mismatch',
      payment_id = v_payment.id,
      order_id = v_payment.order_id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'provider_payment_id_mismatch',
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders AS o
  WHERE o.id = v_payment.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'order_not_found',
      last_error = 'order_not_found',
      payment_id = v_payment.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'order_not_found',
      'payment_id', v_payment.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review'
    );
  END IF;

  v_payment_before := v_payment.status;
  v_order_before := v_order.status;

  -- Amount / currency integrity (integer minor units only).
  IF v_payment.amount_minor IS DISTINCT FROM v_order.amount_minor
     OR v_payment.currency IS DISTINCT FROM v_order.currency
     OR v_payment.currency IS DISTINCT FROM 'RUB'
     OR p_provider_currency IS DISTINCT FROM 'RUB'
     OR p_provider_amount_minor IS NULL
     OR p_provider_amount_minor IS DISTINCT FROM v_payment.amount_minor THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'amount_or_currency_mismatch',
      last_error = 'amount_or_currency_mismatch',
      payment_id = v_payment.id,
      order_id = v_order.id,
      provider_payment_id = coalesce(v_payment.provider_payment_id, p_provider_payment_id)
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'amount_or_currency_mismatch',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_payment.is_test
    );
  END IF;

  -- Test classification from trusted row fields (+ provider id / e2e metadata).
  v_is_test := public.payment_is_test_from_row(
    coalesce(nullif(btrim(coalesce(p_provider_payment_id, '')), ''), v_payment.provider_payment_id),
    v_payment.provider_metadata,
    v_payment.is_test OR v_order.is_test
  );

  IF v_is_test THEN
    IF v_payment.is_test AND v_payment.test_reason IS NOT NULL THEN
      v_test_reason := v_payment.test_reason;
    ELSIF v_order.is_test AND v_order.test_reason IS NOT NULL THEN
      v_test_reason := v_order.test_reason;
    ELSIF coalesce((v_payment.provider_metadata ->> 'e2e_test') IN ('true', 't', '1'), false)
       OR coalesce(p_provider_payment_id, v_payment.provider_payment_id, '') LIKE 'e2e-%' THEN
      v_test_reason := 'e2e_test';
    ELSE
      v_test_reason := 'server_test_flag';
    END IF;
  END IF;

  -- Refunded order cannot return to paid.
  IF v_order.status = 'refunded' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'refunded_order',
      last_error = 'refunded_order',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'refunded_order',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  -- Cancelled / failed order + APPROVED → keep money signal, no silent paid/access.
  IF v_order.status IN ('cancelled', 'failed') THEN
    IF v_payment.status IS DISTINCT FROM 'succeeded' THEN
      IF v_payment.status NOT IN ('pending', 'failed', 'cancelled') THEN
        UPDATE public.payment_webhook_events
        SET
          processing_status = 'requires_review',
          processed_at = v_now,
          updated_at = v_now,
          review_reason = 'unsupported_payment_status',
          last_error = 'unsupported_payment_status',
          payment_id = v_payment.id,
          order_id = v_order.id
        WHERE id = v_event.id;

        RETURN jsonb_build_object(
          'ok', true,
          'outcome', 'requires_review',
          'review_reason', 'unsupported_payment_status',
          'payment_id', v_payment.id,
          'order_id', v_order.id,
          'payment_status', v_payment.status,
          'order_status', v_order.status,
          'webhook_event_id', v_event.id,
          'processing_status', 'requires_review',
          'is_test', v_is_test
        );
      END IF;

      UPDATE public.payments
      SET
        status = 'succeeded',
        provider_payment_id = coalesce(
          nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
          provider_payment_id
        ),
        confirmed_at = coalesce(confirmed_at, v_now),
        updated_at = v_now,
        is_test = v_is_test,
        test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END,
        provider_metadata = provider_metadata || jsonb_build_object(
          'provider_status', p_provider_status,
          'fulfilled_at', v_now,
          'fulfill_outcome', 'requires_review_cancelled_or_failed_order'
        )
      WHERE id = v_payment.id;
    END IF;

    UPDATE public.orders
    SET
      is_test = CASE WHEN v_is_test THEN true ELSE is_test END,
      test_reason = CASE
        WHEN v_is_test THEN coalesce(test_reason, v_test_reason)
        ELSE test_reason
      END,
      updated_at = v_now
    WHERE id = v_order.id;

    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = CASE
        WHEN v_order.status = 'cancelled' THEN 'cancelled_order_late_approved'
        ELSE 'failed_order_late_approved'
      END,
      last_error = NULL,
      payment_id = v_payment.id,
      order_id = v_order.id,
      provider_payment_id = coalesce(
        nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
        v_payment.provider_payment_id
      )
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', CASE
        WHEN v_order.status = 'cancelled' THEN 'cancelled_order_late_approved'
        ELSE 'failed_order_late_approved'
      END,
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'payment_status', 'succeeded',
      'order_status', v_order.status,
      'access_granted', false,
      'access_inserted', false,
      'was_repaired', false,
      'was_already_complete', false,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  -- Payment transition: pending|failed|cancelled|succeeded → succeeded.
  IF v_payment.status = 'refunded' THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'refunded_payment',
      last_error = 'refunded_payment',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'refunded_payment',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  IF v_payment.status NOT IN ('pending', 'failed', 'cancelled', 'succeeded') THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'unsupported_payment_status',
      last_error = 'unsupported_payment_status',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'unsupported_payment_status',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  IF v_order.status NOT IN ('pending', 'paid') THEN
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'requires_review',
      processed_at = v_now,
      updated_at = v_now,
      review_reason = 'unsupported_order_status',
      last_error = 'unsupported_order_status',
      payment_id = v_payment.id,
      order_id = v_order.id
    WHERE id = v_event.id;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'requires_review',
      'review_reason', 'unsupported_order_status',
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'webhook_event_id', v_event.id,
      'processing_status', 'requires_review',
      'is_test', v_is_test
    );
  END IF;

  v_order_kind := coalesce(v_order.order_kind, 'product_purchase');

  IF v_order_kind = 'author_project_capacity' THEN
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.author_project_capacity_grants AS g
    WHERE g.order_id = v_order.id;
  ELSIF v_order_kind = 'business_subscription' THEN
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.business_subscription_periods AS s
    WHERE s.order_id = v_order.id;
  ELSIF v_order_kind = 'studio_music_license' THEN
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.studio_music_entitlements AS e
    WHERE e.user_id = v_order.user_id
      AND e.practice_id = v_order.practice_id
      AND e.revoked_at IS NULL;
  ELSE
    SELECT count(*)::integer
    INTO v_access_before
    FROM public.user_practices AS up
    WHERE up.user_id = v_order.user_id
      AND up.practice_id = v_order.practice_id;
  END IF;

  -- Apply payment succeeded (idempotent).
  UPDATE public.payments
  SET
    status = 'succeeded',
    provider_payment_id = coalesce(
      nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
      provider_payment_id
    ),
    confirmed_at = coalesce(confirmed_at, v_now),
    updated_at = v_now,
    is_test = v_is_test,
    test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END,
    provider_metadata = provider_metadata || jsonb_build_object(
      'provider_status', p_provider_status,
      'fulfilled_at', v_now
    )
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  -- Apply order paid (pending → paid; paid stays paid).
  IF v_order.status = 'pending' THEN
    UPDATE public.orders
    SET
      status = 'paid',
      paid_at = coalesce(paid_at, v_now),
      updated_at = v_now,
      is_test = v_is_test,
      test_reason = CASE WHEN v_is_test THEN coalesce(test_reason, v_test_reason) ELSE test_reason END
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  ELSE
    UPDATE public.orders
    SET
      paid_at = coalesce(paid_at, v_now),
      updated_at = v_now,
      is_test = CASE WHEN v_is_test THEN true ELSE is_test END,
      test_reason = CASE
        WHEN v_is_test THEN coalesce(test_reason, v_test_reason)
        ELSE test_reason
      END
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  v_order_kind := coalesce(v_order.order_kind, 'product_purchase');

  IF v_order_kind = 'author_project_capacity' THEN
    v_grant := public.grant_author_project_capacity_for_order(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  ELSIF v_order_kind = 'business_subscription' THEN
    v_grant := public.apply_business_subscription_for_order(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  ELSIF v_order_kind = 'studio_music_license' THEN
    v_grant := public.grant_studio_music_purchase_entitlement(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  ELSIF v_order_kind = 'course_upgrade' THEN
    IF v_order.target_access_level IS NULL OR v_order.target_access_level < 2 THEN
      RAISE EXCEPTION 'invalid_upgrade_target' USING ERRCODE = '22023';
    END IF;

    SELECT p.publication_class
    INTO v_publication_class
    FROM public.practices AS p
    WHERE p.id = v_order.practice_id;

    IF v_publication_class IS DISTINCT FROM 'course' THEN
      RAISE EXCEPTION 'upgrade_not_course' USING ERRCODE = '22023';
    END IF;

    -- Fulfill from immutable order snapshots (amount already matched
    -- payment/provider). Do not re-read live upgrade_price.
    v_grant := public.grant_practice_access(
      v_order.user_id,
      v_order.practice_id,
      v_order.target_access_level,
      'purchase',
      jsonb_build_object(
        'order_id', v_order.id,
        'payment_id', v_payment.id,
        'target_access_level', v_order.target_access_level,
        'granted_via', 'course_upgrade'
      )
    );
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);

    IF coalesce((v_grant ->> 'access_level')::integer, 0) < v_order.target_access_level THEN
      RAISE EXCEPTION 'access_grant_below_target' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_grant := public.grant_practice_purchase_access(v_order.id);
    v_access_inserted := coalesce((v_grant ->> 'inserted')::boolean, false);
  END IF;

  IF v_order_kind = 'author_project_capacity' THEN
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.author_project_capacity_grants AS g
    WHERE g.order_id = v_order.id;
  ELSIF v_order_kind = 'business_subscription' THEN
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.business_subscription_periods AS s
    WHERE s.order_id = v_order.id;
  ELSIF v_order_kind = 'studio_music_license' THEN
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.studio_music_entitlements AS e
    WHERE e.user_id = v_order.user_id
      AND e.practice_id = v_order.practice_id
      AND e.revoked_at IS NULL;
  ELSE
    SELECT count(*)::integer
    INTO v_access_after
    FROM public.user_practices AS up
    WHERE up.user_id = v_order.user_id
      AND up.practice_id = v_order.practice_id;
  END IF;

  IF v_access_after < 1 THEN
    -- Replay of a paid Studio order after that order's entitlement was
    -- revoked must not invent a new active grant. grant_* returns
    -- already_revoked; do not treat that as a missing first-time grant.
    IF v_order_kind = 'studio_music_license'
       AND coalesce((v_grant ->> 'already_revoked')::boolean, false) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'access_grant_missing_after_fulfill' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Success = valid payment + successful grant, not access_inserted.
  -- Upgrade typically UPDATE (inserted=false, raised=true). Existing
  -- entitlement must not classify a first upgrade as repaired/review.
  IF v_order_kind IN ('course_upgrade', 'studio_music_license', 'author_project_capacity', 'business_subscription') THEN
    IF v_payment_before = 'succeeded'
       AND v_order_before = 'paid' THEN
      v_was_already_complete := true;
      v_outcome := 'already_complete';
    ELSIF v_payment_before = 'succeeded'
       OR v_order_before = 'paid' THEN
      v_was_repaired := true;
      v_outcome := 'repaired';
    ELSE
      v_outcome := 'completed';
    END IF;
  ELSIF v_payment_before = 'succeeded'
     AND v_order_before = 'paid'
     AND v_access_before >= 1
     AND NOT v_access_inserted THEN
    v_was_already_complete := true;
    v_outcome := 'already_complete';
  ELSIF v_payment_before = 'succeeded'
     OR v_order_before = 'paid'
     OR v_access_before >= 1 THEN
    v_was_repaired := true;
    v_outcome := 'repaired';
  ELSE
    v_outcome := 'completed';
  END IF;

  UPDATE public.payment_webhook_events
  SET
    processing_status = CASE
      WHEN v_was_already_complete THEN 'duplicate'
      ELSE 'processed'
    END,
    processed_at = v_now,
    updated_at = v_now,
    last_error = NULL,
    review_reason = NULL,
    payment_id = v_payment.id,
    order_id = v_order.id,
    provider_payment_id = v_payment.provider_payment_id
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_outcome,
    'review_reason', NULL,
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'payment_status', v_payment.status,
    'order_status', v_order.status,
    'access_granted', (v_access_after >= 1),
    'access_inserted', v_access_inserted,
    'access_rows', v_access_after,
    'was_repaired', v_was_repaired,
    'was_already_complete', v_was_already_complete,
    'webhook_event_id', v_event.id,
    'processing_status', CASE
      WHEN v_was_already_complete THEN 'duplicate'
      ELSE 'processed'
    END,
    'is_test', v_is_test,
    'test_reason', v_test_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    -- PL/pgSQL subtransaction: main-body writes roll back; this UPDATE is kept
    -- when we RETURN (not RAISE), so the event stays retryable as `failed`.
    UPDATE public.payment_webhook_events
    SET
      processing_status = 'failed',
      updated_at = now(),
      last_error = left(SQLERRM, 500)
    WHERE id = p_webhook_event_id
      AND processing_status NOT IN ('processed', 'duplicate', 'requires_review');

    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'failed',
      'review_reason', 'transient_or_internal_error',
      'error_code', SQLSTATE,
      'webhook_event_id', p_webhook_event_id,
      'processing_status', 'failed'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_tochka_payment_transactional(
  uuid, text, uuid, bigint, text, text
) TO service_role;

COMMENT ON FUNCTION public.fulfill_tochka_payment_transactional IS
  'audiolad:business-subscription:v1; adds business_subscription: one period row per order, paid_until moves once; other order kinds stay on the previous grant path; service_role only';

DO $$
BEGIN
  IF to_regclass('public.business_subscription_periods') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: business_subscription_periods missing';
  END IF;
  IF to_regclass('public.business_offer_acceptances') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: business_offer_acceptances missing';
  END IF;
  IF to_regprocedure('public.create_business_subscription_order(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: create_business_subscription_order missing';
  END IF;
  IF to_regprocedure('public.apply_business_subscription_for_order(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: apply_business_subscription_for_order missing';
  END IF;
  IF to_regprocedure('public.accept_business_offer(text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: accept_business_offer missing';
  END IF;
  IF has_table_privilege('anon', 'public.business_subscription_periods', 'SELECT')
     OR has_table_privilege('authenticated', 'public.business_subscription_periods', 'SELECT')
     OR has_table_privilege('anon', 'public.business_offer_acceptances', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_offer_acceptances', 'INSERT') THEN
    RAISE EXCEPTION 'Post-check failed: client privileges on business payment tables';
  END IF;
  IF has_function_privilege('anon', 'public.create_business_subscription_order(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_business_offer(text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.apply_business_subscription_for_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: payment function privileges';
  END IF;
END;
$$;

COMMIT;

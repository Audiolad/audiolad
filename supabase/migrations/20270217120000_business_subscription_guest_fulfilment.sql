BEGIN;

-- Business subscription guest fulfilment: paid access belongs to user_id;
-- account email is optional and receipt email is never persisted here.
-- Prepared only; this file does not apply itself to production.
-- Latest apply_business_subscription_for_order copied from 20270205130000.
-- Keep order/payment row locks, the per-kind advisory lock, and the order_id
-- period PK: concurrent orders serialize before reading the current end;
-- replay of one order returns its stored period before extending anything.
--
-- Rollback (DOCUMENTED ONLY, not executed): disable guest checkout first.
-- Restore apply_business_subscription_for_order from 20270205130000 only after
-- guest settlements have been reconciled. Never delete paid history or invent
-- email hashes. Restore email NOT NULL and the old (email_hash, kind) PK only
-- after all NULL rows in all three tables have been legitimately reconciled;
-- drop the new guest indexes and surrogate id only at that point. Otherwise
-- retain the nullable schema and deploy a forward fix. Back up before rollback.

-- Preserve every existing row and the email ON CONFLICT (email_hash, kind)
-- target. A surrogate PK allows NULL hashes; NULL principals are unique by user.
ALTER TABLE public.access_paid_periods ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.access_paid_periods DROP CONSTRAINT access_paid_periods_pkey;
ALTER TABLE public.access_paid_periods ADD CONSTRAINT access_paid_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.access_paid_periods ADD CONSTRAINT access_paid_periods_email_kind_key UNIQUE (email_hash, kind);
ALTER TABLE public.access_paid_periods ALTER COLUMN email_hash DROP NOT NULL;
CREATE UNIQUE INDEX access_paid_periods_guest_user_kind_idx
  ON public.access_paid_periods (user_id, kind) WHERE email_hash IS NULL;

ALTER TABLE public.business_subscription_periods ALTER COLUMN email_hash DROP NOT NULL;
ALTER TABLE public.access_grant_events ALTER COLUMN email_hash DROP NOT NULL;
-- Existing hash format checks accept NULL, but still reject malformed hashes.
-- Mirror the existing email event uniqueness for isolated guest principals.
CREATE UNIQUE INDEX access_grant_events_guest_unique_idx
  ON public.access_grant_events (user_id, kind, event_name)
  WHERE email_hash IS NULL AND event_name <> 'subscription_go_to_payment';

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
  -- No account email is needed for access. Receipt email stays at the bank.

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
    IF v_hash IS NULL THEN
      INSERT INTO public.access_paid_periods AS ap (
        email_hash, user_id, kind, paid_until
      ) VALUES (NULL, v_order.user_id, v_kind, v_end)
      ON CONFLICT (user_id, kind) WHERE email_hash IS NULL DO UPDATE
      SET paid_until = GREATEST(ap.paid_until, EXCLUDED.paid_until),
          updated_at = clock_timestamp()
      WHERE ap.paid_until < EXCLUDED.paid_until;
    ELSE
      -- Keep the legacy email conflict target and identity ownership unchanged.
      -- v_base already includes any guest row found by user_id. On the first
      -- real renewal after email binding, fold that row into the email row,
      -- using MAX (never SUM), then remove only the superseded guest summary.
      INSERT INTO public.access_paid_periods AS ap (
        email_hash, user_id, kind, paid_until
      ) VALUES (v_hash, v_order.user_id, v_kind, v_end)
      ON CONFLICT (email_hash, kind) DO UPDATE
      SET paid_until = GREATEST(ap.paid_until, EXCLUDED.paid_until),
          updated_at = clock_timestamp()
      WHERE ap.paid_until < EXCLUDED.paid_until;

      DELETE FROM public.access_paid_periods
      WHERE user_id = v_order.user_id AND kind = v_kind AND email_hash IS NULL;
    END IF;

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
      WHERE (e.email_hash = v_hash
             OR (e.email_hash IS NULL AND e.user_id = v_order.user_id))
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

-- No public/client access is added by the nullable schema.
DO $$
BEGIN
  IF to_regclass('public.access_paid_periods_guest_user_kind_idx') IS NULL
     OR to_regclass('public.access_grant_events_guest_unique_idx') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: guest uniqueness indexes missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('access_paid_periods', 'business_subscription_periods', 'access_grant_events')
      AND column_name = 'email_hash' AND is_nullable <> 'YES'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: email_hash must be optional';
  END IF;
  IF has_function_privilege('anon', 'public.apply_business_subscription_for_order(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.apply_business_subscription_for_order(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.apply_business_subscription_for_order(uuid)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.access_paid_periods', 'SELECT')
     OR has_table_privilege('authenticated', 'public.business_subscription_periods', 'INSERT') THEN
    RAISE EXCEPTION 'Post-check failed: subscription service-role boundary';
  END IF;
END;
$$;

COMMIT;

-- Shared 30-day organization renewal, immutable active-venue checkout scope.
-- No organization opt-in, production payment or proportional top-up is performed here.
BEGIN;
ALTER TABLE public.business_subscription_periods DROP CONSTRAINT business_subscription_periods_amount_check;
ALTER TABLE public.business_subscription_periods ADD CONSTRAINT business_subscription_periods_amount_check CHECK (amount_minor IN (79900,159800,239700));
CREATE TABLE public.business_subscription_order_scopes (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  location_ids uuid[] NOT NULL CHECK (cardinality(location_ids) BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.business_subscription_order_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_subscription_order_scopes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.business_subscription_order_scopes TO service_role;
CREATE FUNCTION public.business_subscription_scope_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'subscription_scope_immutable' USING ERRCODE='42501'; END IF;
  IF cardinality(NEW.location_ids)<>(SELECT count(DISTINCT x) FROM unnest(NEW.location_ids) x)
  OR EXISTS (SELECT 1 FROM unnest(NEW.location_ids) x WHERE NOT EXISTS (
    SELECT 1 FROM public.business_locations l WHERE l.id=x AND l.organization_id=NEW.organization_id AND l.status='active'))
  OR NOT EXISTS (SELECT 1 FROM public.orders o JOIN public.business_organization_members m ON m.user_id=o.user_id
    WHERE o.id=NEW.order_id AND o.order_kind='business_subscription' AND o.status='pending'
    AND o.amount_minor=79900*cardinality(NEW.location_ids) AND o.currency='RUB'
    AND m.organization_id=NEW.organization_id AND m.role='owner') THEN
    RAISE EXCEPTION 'subscription_scope_mismatch' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.business_subscription_scope_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_subscription_scope_guard BEFORE INSERT OR UPDATE OR DELETE ON public.business_subscription_order_scopes
FOR EACH ROW EXECUTE FUNCTION public.business_subscription_scope_guard();
CREATE OR REPLACE FUNCTION public.business_pilot_order_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid; v_count integer;
BEGIN
  IF NEW.order_kind='business_subscription' AND NEW.status='pending' THEN
    SELECT o.id INTO v_org FROM public.business_organization_members m JOIN public.business_organizations o ON o.id=m.organization_id
    WHERE m.user_id=NEW.user_id AND m.role='owner' AND o.status='active' AND o.pilot_location_limit=3
    ORDER BY m.created_at,o.id LIMIT 1;
    IF v_org IS NOT NULL THEN
      SELECT count(*) INTO v_count FROM public.business_locations WHERE organization_id=v_org AND status='active';
      IF v_count NOT BETWEEN 1 AND 3 OR NEW.amount_minor IS DISTINCT FROM 79900*v_count OR NEW.currency IS DISTINCT FROM 'RUB' THEN
        RAISE EXCEPTION 'subscription_amount_mismatch' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

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
  v_org uuid; v_locations uuid[]; v_pilot boolean := false; v_amount bigint := 79900;
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

  -- Same organization lock as activation; count only physical active venues.
  SELECT o.id, o.pilot_location_limit = 3 INTO v_org, v_pilot
  FROM public.business_organization_members m JOIN public.business_organizations o ON o.id=m.organization_id
  WHERE m.user_id=v_user_id AND m.role='owner' AND o.status='active'
  ORDER BY m.created_at, o.id LIMIT 1 FOR UPDATE OF o;
  IF coalesce(v_pilot,false) THEN
    SELECT array_agg(l.id ORDER BY l.id) INTO v_locations FROM public.business_locations l
    WHERE l.organization_id=v_org AND l.status='active';
    IF coalesce(cardinality(v_locations),0) NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'invalid_active_location_count' USING ERRCODE='22023';
    END IF;
    v_amount := 79900 * cardinality(v_locations);
    -- No mid-period charge for adding a venue. Renewal can include it after expiry.
    IF EXISTS (SELECT 1 FROM public.business_subscription_order_scopes s
      JOIN public.business_subscription_periods p ON p.order_id=s.order_id
      WHERE s.organization_id=v_org AND p.opens_access AND p.period_end>clock_timestamp())
    AND EXISTS (SELECT 1 FROM unnest(v_locations) AS v(id) WHERE NOT EXISTS (
      SELECT 1 FROM public.business_subscription_order_scopes s JOIN public.business_subscription_periods p ON p.order_id=s.order_id
      WHERE s.organization_id=v_org AND p.opens_access AND p.period_end>clock_timestamp() AND v.id=ANY(s.location_ids)
    )) THEN RAISE EXCEPTION 'venue_topup_not_available' USING ERRCODE='P0001'; END IF;
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
       OR v_existing.amount_minor IS DISTINCT FROM v_amount THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;
    IF coalesce(v_pilot,false) AND NOT EXISTS (
      SELECT 1 FROM public.business_subscription_order_scopes s WHERE s.order_id=v_existing.id
      AND s.organization_id=v_org AND s.location_ids=v_locations
    ) THEN RAISE EXCEPTION 'pending_order_mismatch' USING ERRCODE='P0001'; END IF;
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
    IF v_existing.amount_minor IS DISTINCT FROM v_amount
       OR v_existing.currency IS DISTINCT FROM 'RUB' THEN
      RAISE EXCEPTION 'pending_order_mismatch' USING ERRCODE = 'P0001';
    END IF;
    IF coalesce(v_pilot,false) AND NOT EXISTS (
      SELECT 1 FROM public.business_subscription_order_scopes s WHERE s.order_id=v_existing.id
      AND s.organization_id=v_org AND s.location_ids=v_locations
    ) THEN RAISE EXCEPTION 'pending_order_mismatch' USING ERRCODE='P0001'; END IF;
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
    v_amount,
    'RUB',
    'АудиоЛад Бизнес – доступ на 30 дней',
    'business-subscription',
    v_amount,
    v_amount,
    NULL,
    v_key,
    'business_subscription',
    NULL
  )
  RETURNING * INTO v_new_order;

  IF coalesce(v_pilot,false) THEN
    INSERT INTO public.business_subscription_order_scopes(order_id,organization_id,location_ids)
    VALUES(v_new_order.id,v_org,v_locations);
  END IF;
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
  v_scope public.business_subscription_order_scopes%ROWTYPE;
  v_amount bigint := 79900;
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

  SELECT * INTO v_scope FROM public.business_subscription_order_scopes WHERE order_id=v_order.id;
  IF FOUND THEN
    v_amount := 79900 * cardinality(v_scope.location_ids);
  ELSIF EXISTS (SELECT 1 FROM public.business_organization_members m JOIN public.business_organizations o ON o.id=m.organization_id
    WHERE m.user_id=v_order.user_id AND m.role='owner' AND o.pilot_location_limit=3) THEN
    RAISE EXCEPTION 'subscription_scope_required' USING ERRCODE='P0001';
  END IF;
  IF v_order.amount_minor IS DISTINCT FROM v_amount OR v_order.currency IS DISTINCT FROM 'RUB' THEN
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
    AND p.amount_minor = v_amount
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

  IF v_scope.order_id IS NOT NULL THEN
    SELECT max(p.period_end) INTO v_paid_until
    FROM public.business_subscription_periods p JOIN public.business_subscription_order_scopes s ON s.order_id=p.order_id
    WHERE s.organization_id=v_scope.organization_id AND p.opens_access;
  ELSE
  SELECT max(p.paid_until)
  INTO v_paid_until
  FROM public.access_paid_periods AS p
  WHERE p.kind = v_kind
    AND (p.email_hash = v_hash OR p.user_id = v_order.user_id);

  END IF;

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
    v_amount,
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


COMMIT;

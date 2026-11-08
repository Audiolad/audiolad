-- PREPARE ONLY. Human Gate: backup, staging smoke, explicit approval before apply.
-- Venue slots for every Business organization, not a per-client opt-in.
-- Every organization starts with one physical Location; the owner adds the next one
-- himself, up to one system-wide limit (initially 3; raised to 10 by
-- 20270301120000). This is a single UPDATE of business_venue_slot_settings,
-- no code rebuild and no per-client setup.
-- Money rules are unchanged: 79900 × active Locations per shared 30-day period,
-- empty slots are not billed, one owner gift, no mid-period top-up.
BEGIN;

-- One system row. Hard schema ceiling is 10; raising beyond that needs a reviewed migration.
CREATE TABLE public.business_venue_slot_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  default_limit smallint NOT NULL DEFAULT 3 CHECK (default_limit BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.business_venue_slot_settings(singleton, default_limit) VALUES (true, 3);
ALTER TABLE public.business_venue_slot_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_venue_slot_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.business_venue_slot_settings TO service_role;
COMMENT ON TABLE public.business_venue_slot_settings IS
  'System-wide number of physical Location slots per Business organization. Same for every owner; raise default_limit (max 10) to allow more.';

-- Optional future raise for one organization on top of the system default. NULL for everyone
-- by default; ordinary organizations never need it. It can only raise, never lower.
ALTER TABLE public.business_organizations ADD COLUMN venue_slot_limit_override smallint NULL
  CHECK (venue_slot_limit_override IS NULL OR venue_slot_limit_override BETWEEN 1 AND 10);
COMMENT ON COLUMN public.business_organizations.venue_slot_limit_override IS
  'Optional per-organization raise over business_venue_slot_settings.default_limit. NULL = system default.';
COMMENT ON COLUMN public.business_organizations.pilot_location_limit IS
  'Deprecated pilot opt-in. Ignored after 20270227120000: every organization uses the system venue slot limit.';

CREATE FUNCTION public.business_venue_slot_limit_internal(p_organization_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT least(10, greatest(
    coalesce((SELECT s.default_limit FROM public.business_venue_slot_settings s WHERE s.singleton), 1),
    coalesce((SELECT o.venue_slot_limit_override FROM public.business_organizations o WHERE o.id = p_organization_id), 0)
  ))::integer
$$;
REVOKE ALL ON FUNCTION public.business_venue_slot_limit_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_venue_slot_limit_internal(uuid) TO service_role;

-- Read-only for the cabinet: members of the organization and service code only.
CREATE FUNCTION public.business_venue_slot_limit(p_organization_id uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_organization_member(p_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_organization_member' USING ERRCODE = '42501';
  END IF;
  RETURN public.business_venue_slot_limit_internal(p_organization_id);
END; $$;
REVOKE ALL ON FUNCTION public.business_venue_slot_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_venue_slot_limit(uuid) TO authenticated, service_role;

-- Shared limit for every insert path, including onboarding and service provisioning.
-- Closed/suspended rows consume a slot too. Existing rows are never touched.
CREATE OR REPLACE FUNCTION public.business_pilot_location_limit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_limit integer;
BEGIN
  PERFORM 1 FROM public.business_organizations WHERE id = NEW.organization_id FOR UPDATE;
  v_limit := public.business_venue_slot_limit_internal(NEW.organization_id);
  IF (SELECT count(*) FROM public.business_locations WHERE organization_id = NEW.organization_id AND id <> NEW.id) >= v_limit THEN
    RAISE EXCEPTION 'venue_slot_limit_reached' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;
-- The deprecated pilot flag no longer changes anything; keep its trigger inert.
DROP TRIGGER IF EXISTS business_pilot_organization_guard ON public.business_organizations;

CREATE OR REPLACE FUNCTION public.activate_business_pilot_location(p_organization_id uuid, p_slot integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_limit integer; v_count integer; v_source public.business_locations%ROWTYPE;
  v_location uuid; v_zone uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_organization_owner(p_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;
  -- Serializes double-clicks and simultaneous activation of the same organization.
  PERFORM 1 FROM public.business_organizations WHERE id = p_organization_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'venue_slots_not_available' USING ERRCODE = '22023'; END IF;
  v_limit := public.business_venue_slot_limit_internal(p_organization_id);
  IF p_slot IS NULL OR p_slot < 1 OR p_slot > v_limit THEN
    RAISE EXCEPTION 'venue_slot_limit_reached' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_count FROM public.business_locations WHERE organization_id = p_organization_id;
  IF p_slot <= v_count THEN
    SELECT id INTO v_location FROM public.business_locations WHERE organization_id = p_organization_id
      ORDER BY created_at, id OFFSET (p_slot - 1) LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'location_id', v_location);
  END IF;
  IF v_count >= v_limit OR p_slot <> v_count + 1 THEN
    RAISE EXCEPTION 'activate_previous_slot_first' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_source FROM public.business_locations WHERE organization_id = p_organization_id ORDER BY created_at, id LIMIT 1;
  IF v_source.id IS NULL THEN RAISE EXCEPTION 'first_location_required'; END IF;
  INSERT INTO public.business_locations(organization_id, name, business_category, country_code, timezone, created_at)
    VALUES (p_organization_id, 'Точка ' || p_slot, v_source.business_category, v_source.country_code, v_source.timezone, clock_timestamp())
    RETURNING id INTO v_location;
  INSERT INTO public.business_zones(location_id, is_default) VALUES(v_location, true) RETURNING id INTO v_zone;
  PERFORM public.business_ensure_location_rights_context(v_location);
  -- Copy atmosphere only, never rights/admissions, address, player, evidence or payment.
  INSERT INTO public.business_location_sound_settings(location_id, organization_id, character, direction,
    daypart_mode, energy_offset, morning_start, morning_end, day_start, day_end, evening_start, evening_end, point_can_edit_settings)
  SELECT v_location, p_organization_id, character, direction, daypart_mode, energy_offset,
    morning_start, morning_end, day_start, day_end, evening_start, evening_end, point_can_edit_settings
  FROM public.business_location_sound_settings WHERE location_id = v_source.id;
  RETURN jsonb_build_object('ok', true, 'location_id', v_location, 'zone_id', v_zone);
END; $$;
REVOKE ALL ON FUNCTION public.activate_business_pilot_location(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_business_pilot_location(uuid, integer) TO authenticated;

-- Money stays 79900 per active Location; only the hard schema range follows the slot ceiling.
ALTER TABLE public.business_subscription_periods DROP CONSTRAINT business_subscription_periods_amount_check;
ALTER TABLE public.business_subscription_periods ADD CONSTRAINT business_subscription_periods_amount_check
  CHECK (amount_minor BETWEEN 79900 AND 79900 * 10 AND amount_minor % 79900 = 0);
ALTER TABLE public.business_subscription_order_scopes DROP CONSTRAINT business_subscription_order_scopes_location_ids_check;
ALTER TABLE public.business_subscription_order_scopes ADD CONSTRAINT business_subscription_order_scopes_location_ids_check
  CHECK (cardinality(location_ids) BETWEEN 1 AND 10);

-- Paid end for one Location: periods whose immutable checkout snapshot includes it.
-- A 79900 order paid before snapshots existed funds exactly one hall: the first one.
CREATE FUNCTION public.business_venue_paid_until(p_organization_id uuid, p_location_id uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT greatest(
    (SELECT max(p.period_end) FROM public.business_subscription_order_scopes s
      JOIN public.business_subscription_periods p ON p.order_id = s.order_id
      WHERE s.organization_id = p_organization_id AND p.opens_access AND p_location_id = ANY(s.location_ids)),
    (SELECT max(p.period_end) FROM public.business_subscription_periods p
      JOIN public.business_organization_members m ON m.user_id = p.user_id AND m.role = 'owner' AND m.organization_id = p_organization_id
      WHERE p.opens_access
        AND NOT EXISTS (SELECT 1 FROM public.business_subscription_order_scopes s WHERE s.order_id = p.order_id)
        AND p_location_id = (SELECT l.id FROM public.business_locations l WHERE l.organization_id = p_organization_id ORDER BY l.created_at, l.id LIMIT 1))
  )
$$;
REVOKE ALL ON FUNCTION public.business_venue_paid_until(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_venue_paid_until(uuid, uuid) TO service_role;

-- Any direct pending business_subscription for an owner with active Locations must be
-- 79900 × active count, within the slot limit. Owners without an active Location keep the old path.
CREATE OR REPLACE FUNCTION public.business_pilot_order_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid; v_count integer;
BEGIN
  IF NEW.order_kind='business_subscription' AND NEW.status='pending' THEN
    SELECT o.id INTO v_org FROM public.business_organization_members m JOIN public.business_organizations o ON o.id=m.organization_id
    WHERE m.user_id=NEW.user_id AND m.role='owner' AND o.status='active'
    ORDER BY m.created_at,o.id LIMIT 1;
    IF v_org IS NOT NULL THEN
      SELECT count(*) INTO v_count FROM public.business_locations WHERE organization_id=v_org AND status='active';
      IF v_count >= 1 AND (v_count > public.business_venue_slot_limit_internal(v_org)
        OR NEW.amount_minor IS DISTINCT FROM 79900*v_count OR NEW.currency IS DISTINCT FROM 'RUB') THEN
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
  -- Every organization uses the same rule; no per-client flag is needed.
  SELECT o.id INTO v_org
  FROM public.business_organization_members m JOIN public.business_organizations o ON o.id=m.organization_id
  WHERE m.user_id=v_user_id AND m.role='owner' AND o.status='active'
  ORDER BY m.created_at, o.id LIMIT 1 FOR UPDATE OF o;
  IF v_org IS NOT NULL THEN
    SELECT array_agg(l.id ORDER BY l.id) INTO v_locations FROM public.business_locations l
    WHERE l.organization_id=v_org AND l.status='active';
    -- Without an active Location the old single 79900 order path stays unchanged.
    v_pilot := coalesce(cardinality(v_locations),0) >= 1;
  END IF;
  IF v_pilot THEN
    IF cardinality(v_locations) > public.business_venue_slot_limit_internal(v_org) THEN
      RAISE EXCEPTION 'invalid_active_location_count' USING ERRCODE='22023';
    END IF;
    v_amount := 79900 * cardinality(v_locations);
    -- No mid-period charge for adding a venue. Renewal can include it after expiry.
    IF EXISTS (SELECT 1 FROM unnest(v_locations) AS v(id)
      WHERE public.business_venue_paid_until(v_org, v.id) > clock_timestamp())
    AND EXISTS (SELECT 1 FROM unnest(v_locations) AS v(id)
      WHERE coalesce(public.business_venue_paid_until(v_org, v.id) <= clock_timestamp(), true)
    ) THEN RAISE EXCEPTION 'venue_topup_not_available' USING ERRCODE='P0001'; END IF;
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
  END IF;
  -- An order without a snapshot (created before this migration) stays a single 79900
  -- period; business_venue_paid_until credits it to the first hall only.
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

  -- One shared renewal date: the latest existing paid end of this owner/organization,
  -- including periods paid before checkout snapshots existed.
  SELECT max(p.paid_until)
  INTO v_paid_until
  FROM public.access_paid_periods AS p
  WHERE p.kind = v_kind
    AND (p.email_hash = v_hash OR p.user_id = v_order.user_id);
  IF v_scope.order_id IS NOT NULL THEN
    SELECT greatest(v_paid_until, max(p.period_end)) INTO v_paid_until
    FROM public.business_subscription_periods p JOIN public.business_subscription_order_scopes s ON s.order_id=p.order_id
    WHERE s.organization_id=v_scope.organization_id AND p.opens_access;
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
-- Safe application changes no organization row: the override column stays NULL for everyone.
-- Raise to 10 through the additive 20270301120000_business_venue_self_serve_ten.sql migration.
-- Rollback: hide the add button first, then set default_limit = 1. Keep Locations, scopes, periods and evidence. No data deletion.

-- PREPARE ONLY. Human Gate: backup, staging smoke, explicit approval before apply.
BEGIN;
ALTER TABLE public.business_organizations ADD COLUMN pilot_location_limit smallint NULL
  CHECK (pilot_location_limit IS NULL OR pilot_location_limit = 3);
COMMENT ON COLUMN public.business_organizations.pilot_location_limit IS
  'Opt-in pilot: exactly three physical Location slots, not three organizations or zones. NULL preserves legacy behavior.';

CREATE FUNCTION public.business_pilot_organization_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.pilot_location_limit=3 AND (SELECT count(*) FROM public.business_locations WHERE organization_id=NEW.id)>3 THEN
    RAISE EXCEPTION 'pilot_has_too_many_locations' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.business_pilot_organization_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_pilot_organization_guard BEFORE UPDATE OF pilot_location_limit
ON public.business_organizations FOR EACH ROW EXECUTE FUNCTION public.business_pilot_organization_guard();

-- Defense in depth for every insert path, including service provisioning.
CREATE FUNCTION public.business_pilot_location_limit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_limit smallint;
BEGIN
  SELECT pilot_location_limit INTO v_limit FROM public.business_organizations WHERE id=NEW.organization_id FOR UPDATE;
  IF v_limit=3 AND (SELECT count(*) FROM public.business_locations WHERE organization_id=NEW.organization_id AND id<>NEW.id)>=3 THEN
    RAISE EXCEPTION 'pilot_location_limit' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.business_pilot_location_limit_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_pilot_location_limit_guard BEFORE INSERT OR UPDATE OF organization_id
ON public.business_locations FOR EACH ROW EXECUTE FUNCTION public.business_pilot_location_limit_guard();

-- Existing paid periods stay unchanged. Binding is service-only and deliberate:
-- one existing 799-ruble period may fund only one physical location.
CREATE TABLE public.business_location_subscription_bindings (
  order_id uuid PRIMARY KEY REFERENCES public.business_subscription_periods(order_id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.business_locations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_location_subscription_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_location_subscription_bindings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_location_subscription_bindings TO service_role;

CREATE FUNCTION public.business_location_subscription_binding_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.location_id IS DISTINCT FROM NEW.location_id OR OLD.order_id IS DISTINCT FROM NEW.order_id) THEN
    RAISE EXCEPTION 'immutable_location_subscription_binding' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_subscription_periods p
    JOIN public.business_locations l ON l.id = NEW.location_id
    JOIN public.business_organization_members m ON m.organization_id = l.organization_id
      AND m.user_id = p.user_id AND m.role = 'owner'
    WHERE p.order_id = NEW.order_id AND p.opens_access AND p.amount_minor = 79900
  ) THEN RAISE EXCEPTION 'invalid_location_subscription_binding' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.business_location_subscription_binding_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_location_subscription_binding_guard BEFORE INSERT OR UPDATE
ON public.business_location_subscription_bindings FOR EACH ROW
EXECUTE FUNCTION public.business_location_subscription_binding_guard();

-- The legacy account checkout must not issue a 799-ruble order for multiple pilot points,
-- including callers bypassing the HTTP checkout route. Existing paid orders remain history.
CREATE FUNCTION public.business_pilot_order_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.order_kind='business_subscription' AND NEW.status='pending' AND EXISTS (
    SELECT 1 FROM public.business_organization_members m
    JOIN public.business_organizations o ON o.id=m.organization_id
    WHERE m.user_id=NEW.user_id AND m.role='owner' AND o.pilot_location_limit=3
  ) THEN RAISE EXCEPTION 'pilot_payment_requires_location_binding' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.business_pilot_order_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_pilot_order_guard BEFORE INSERT OR UPDATE OF status, order_kind
ON public.orders FOR EACH ROW EXECUTE FUNCTION public.business_pilot_order_guard();

CREATE FUNCTION public.activate_business_pilot_location(p_organization_id uuid, p_slot integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_limit smallint; v_count integer; v_source public.business_locations%ROWTYPE;
  v_location uuid; v_zone uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_organization_owner(p_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;
  -- Serializes double-clicks and simultaneous activation of the same organization.
  SELECT pilot_location_limit INTO v_limit FROM public.business_organizations
    WHERE id = p_organization_id AND status = 'active' FOR UPDATE;
  IF v_limit IS DISTINCT FROM 3 OR p_slot IS NULL OR p_slot NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'pilot_not_available' USING ERRCODE = '22023';
  END IF;
  -- Closed/suspended rows consume a slot too. No extra points by deactivating one.
  SELECT count(*) INTO v_count FROM public.business_locations WHERE organization_id = p_organization_id;
  IF p_slot <= v_count THEN
    SELECT id INTO v_location FROM public.business_locations WHERE organization_id = p_organization_id
      ORDER BY created_at, id OFFSET (p_slot - 1) LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'location_id', v_location);
  END IF;
  IF v_count >= 3 OR p_slot <> v_count + 1 THEN
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
COMMIT;
-- Safe application does not opt anyone in. Opt-in uses a reviewed organization UUID, never an email guess.
-- Rollback: disable pilot UI first; set pilot_location_limit = NULL for the reviewed org only
-- AFTER reconciling paid access. Keep Locations, assignments, bindings and evidence. No data deletion.

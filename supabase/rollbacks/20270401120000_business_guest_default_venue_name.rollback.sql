-- t1605u rollback: restore default «Моя кофейня» in business_guest_bootstrap (body as in 20270212120000).
-- Does not touch rows. Run only with Sergey's separate OK.
CREATE OR REPLACE FUNCTION public.business_guest_bootstrap(
  p_user_id uuid, p_idempotency_hash text, p_network_hash text, p_gift_seconds int, p_venue_name text
) RETURNS TABLE(organization_id uuid, location_id uuid, grant_ends_at timestamptz, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_start public.business_guest_starts%ROWTYPE;
  v_org uuid;
  v_loc uuid;
  v_name text := coalesce(nullif(btrim(p_venue_name), ''), 'Моя кофейня');
  v_ends timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id
    AND coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_gift_seconds IS NULL OR p_gift_seconds NOT BETWEEN 86400 AND 2592000
    OR p_idempotency_hash IS NULL OR p_idempotency_hash !~ '^[0-9a-f]{64}$'
    OR p_network_hash IS NULL OR p_network_hash !~ '^[0-9a-f]{64}$'
    OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_guest_start_input' USING ERRCODE = '22023';
  END IF;
  -- Consistent lock order protects both the key and concurrent retries for a user.
  PERFORM pg_advisory_xact_lock(hashtextextended('business_guest_key:' || p_idempotency_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('business_guest_user:' || p_user_id::text, 0));
  SELECT s.* INTO v_start FROM public.business_guest_starts s WHERE s.idempotency_hash = p_idempotency_hash;
  IF FOUND AND v_start.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'guest_start_conflict' USING ERRCODE = '42501';
  END IF;
  SELECT s.* INTO v_start FROM public.business_guest_starts s
    WHERE s.user_id = p_user_id AND s.status = 'ready';
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.business_organization_members m
      WHERE m.user_id = p_user_id AND m.organization_id <> v_start.organization_id) THEN
      RAISE EXCEPTION 'guest_already_member' USING ERRCODE = '42501';
    END IF;
    SELECT g.ends_at INTO v_ends FROM public.access_grants g
      WHERE g.user_id = p_user_id AND g.kind = 'business_new_client';
    RETURN QUERY SELECT v_start.organization_id, v_start.location_id, v_ends, false;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_organization_members m WHERE m.user_id = p_user_id) THEN
    RAISE EXCEPTION 'guest_already_member' USING ERRCODE = '42501';
  END IF;

  -- Same inserts/defaults as stage 1 create_business_organization_with_location.
  -- Missing country/timezone use the onboarding wizard defaults RU/Europe/Moscow.
  INSERT INTO public.business_organizations(name, status, created_by)
    VALUES (v_name, 'active', p_user_id) RETURNING id INTO v_org;
  INSERT INTO public.business_organization_members(organization_id, user_id, role)
    VALUES (v_org, p_user_id, 'owner');
  INSERT INTO public.business_locations(organization_id, name, business_category, country_code, timezone, status)
    VALUES (v_org, v_name, 'cafe', 'RU', 'Europe/Moscow', 'active') RETURNING id INTO v_loc;
  INSERT INTO public.business_zones(location_id, name, is_default, status)
    VALUES (v_loc, NULL, true, 'active');
  PERFORM public.business_ensure_location_rights_context(v_loc);

  -- Serialize with legacy issuance too. Existing windows are immutable.
  PERFORM pg_advisory_xact_lock(hashtextextended('access_grants:business_new_client', 0));
  INSERT INTO public.access_grants(email_hash, user_id, kind, source, starts_at, ends_at)
    VALUES (NULL, p_user_id, 'business_new_client', 'trial', now(), now() + make_interval(secs => p_gift_seconds))
    ON CONFLICT DO NOTHING;
  SELECT g.ends_at INTO v_ends FROM public.access_grants g
    WHERE g.user_id = p_user_id AND g.kind = 'business_new_client';
  INSERT INTO public.business_guest_starts AS s(idempotency_hash, network_hash, user_id, status, organization_id, location_id)
    VALUES (p_idempotency_hash, p_network_hash, p_user_id, 'ready', v_org, v_loc)
    ON CONFLICT (idempotency_hash) DO UPDATE SET
      status = 'ready', organization_id = EXCLUDED.organization_id,
      location_id = EXCLUDED.location_id, updated_at = now();
  RETURN QUERY SELECT v_org, v_loc, v_ends, true;
END;
$$;
REVOKE ALL ON FUNCTION public.business_guest_bootstrap(uuid, text, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_guest_bootstrap(uuid, text, text, int, text) TO service_role;

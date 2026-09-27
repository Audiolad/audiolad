-- Isolated smoke for Business Domain Core (A1).
-- Run ONLY against a scratch database. Never production postgres.

\set ON_ERROR_STOP on

DO $$
DECLARE
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  v_json jsonb;
  v_json_b jsonb;
  v_org uuid;
  v_loc uuid;
  v_zone uuid;
  v_org_b uuid;
  cnt integer;
  raised boolean;
  v_err text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (user_a, 'a@example.com'),
    (user_b, 'b@example.com');

  -- Case 1: unauthenticated bootstrap
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
  raised := false;
  BEGIN
    PERFORM public.create_business_organization_with_location(
      'Org', 'Loc', 'cafe', 'RU', 'Europe/Moscow'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('not_authenticated' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case1: expected not_authenticated, got %', v_err;
  END IF;

  -- Case 2–4, 9: authenticated bootstrap + ownership + default zone + owner RLS
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  v_json := public.create_business_organization_with_location(
    '  Beauty Line  ',
    '  Marina Salon ',
    'beauty',
    'ru',
    'Europe/Moscow'
  );
  IF coalesce(v_json->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Case2: bootstrap failed: %', v_json;
  END IF;

  v_org := (v_json->>'organization_id')::uuid;
  v_loc := (v_json->>'location_id')::uuid;
  v_zone := (v_json->>'zone_id')::uuid;

  SELECT count(*) INTO cnt FROM public.business_organizations WHERE id = v_org;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case2: org count %', cnt; END IF;

  SELECT count(*) INTO cnt
  FROM public.business_organization_members
  WHERE organization_id = v_org AND user_id = user_a AND role = 'owner';
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case3: owner membership missing'; END IF;

  SELECT count(*) INTO cnt
  FROM public.business_zones
  WHERE id = v_zone AND location_id = v_loc AND is_default = true AND name IS NULL;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case4: default zone missing'; END IF;

  SELECT count(*) INTO cnt FROM public.business_organizations WHERE id = v_org;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case9: owner cannot see org'; END IF;
  SELECT count(*) INTO cnt FROM public.business_locations WHERE id = v_loc;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case9: owner cannot see location'; END IF;
  SELECT count(*) INTO cnt FROM public.business_zones WHERE id = v_zone;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case9: owner cannot see zone'; END IF;
  SELECT count(*) INTO cnt
  FROM public.business_organization_members WHERE organization_id = v_org;
  IF cnt <> 1 THEN RAISE EXCEPTION 'Case9: owner cannot see membership'; END IF;

  -- Case 5: second default zone rejected
  RESET ROLE;
  raised := false;
  BEGIN
    INSERT INTO public.business_zones (location_id, name, is_default, status)
    VALUES (v_loc, 'Extra', true, 'active');
  EXCEPTION WHEN unique_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case5: second default zone must fail unique';
  END IF;

  -- Case 6: invalid country
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  raised := false;
  BEGIN
    PERFORM public.create_business_organization_with_location(
      'Org2', 'Loc2', 'cafe', 'RUS', 'Europe/Moscow'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('invalid_country_code' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case6: expected invalid_country_code, got %', v_err;
  END IF;

  -- Case 7: invalid timezone
  raised := false;
  BEGIN
    PERFORM public.create_business_organization_with_location(
      'Org3', 'Loc3', 'cafe', 'RU', 'UTC+3'
    );
  EXCEPTION WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised OR position('invalid_timezone' in v_err) = 0 THEN
    RAISE EXCEPTION 'Case7: expected invalid_timezone, got %', v_err;
  END IF;

  -- Case 8: outsider RLS
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO cnt FROM public.business_organizations WHERE id = v_org;
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case8: outsider sees org'; END IF;
  SELECT count(*) INTO cnt FROM public.business_locations WHERE id = v_loc;
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case8: outsider sees location'; END IF;
  SELECT count(*) INTO cnt FROM public.business_zones WHERE id = v_zone;
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case8: outsider sees zone'; END IF;
  SELECT count(*) INTO cnt
  FROM public.business_organization_members WHERE organization_id = v_org;
  IF cnt <> 0 THEN RAISE EXCEPTION 'Case8: outsider sees membership'; END IF;

  -- Case 10: no direct table INSERT as authenticated
  raised := false;
  BEGIN
    INSERT INTO public.business_organizations (name) VALUES ('Hacker Org');
  EXCEPTION WHEN insufficient_privilege THEN
    raised := true;
  WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10: direct org INSERT must fail';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.business_locations (
      organization_id, name, business_category, country_code, timezone
    ) VALUES (v_org, 'Hack Loc', 'cafe', 'RU', 'Europe/Moscow');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10: direct location INSERT must fail';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.business_zones (location_id, is_default)
    VALUES (v_loc, false);
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10: direct zone INSERT must fail';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.business_organization_members (organization_id, user_id, role)
    VALUES (v_org, user_b, 'manager');
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10: direct membership INSERT must fail';
  END IF;

  -- Case 10b: authenticated cannot direct UPDATE/DELETE core tables
  -- (even as owner who can SELECT — table privileges are SELECT-only)
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';

  raised := false;
  BEGIN
    UPDATE public.business_organizations SET name = 'Hacked' WHERE id = v_org;
  EXCEPTION WHEN insufficient_privilege THEN
    raised := true;
  WHEN OTHERS THEN
    raised := true;
    v_err := SQLERRM;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct org UPDATE must fail';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.business_locations SET name = 'Hacked' WHERE id = v_loc;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct location UPDATE must fail';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.business_zones SET status = 'closed' WHERE id = v_zone;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct zone UPDATE must fail';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.business_organization_members SET role = 'manager'
    WHERE organization_id = v_org AND user_id = user_a;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct membership UPDATE must fail';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.business_zones WHERE id = v_zone;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct zone DELETE must fail';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.business_locations WHERE id = v_loc;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct location DELETE must fail';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.business_organization_members
    WHERE organization_id = v_org AND user_id = user_a;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct membership DELETE must fail';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.business_organizations WHERE id = v_org;
  EXCEPTION WHEN OTHERS THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case10b: direct org DELETE must fail';
  END IF;

  -- Case 11: duplicate membership (service_role / table owner path)
  RESET ROLE;
  raised := false;
  BEGIN
    INSERT INTO public.business_organization_members (organization_id, user_id, role)
    VALUES (v_org, user_a, 'manager');
  EXCEPTION WHEN unique_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case11: duplicate membership must fail';
  END IF;

  -- Case 12: foreign integrity
  raised := false;
  BEGIN
    INSERT INTO public.business_locations (
      organization_id, name, business_category, country_code, timezone
    ) VALUES (
      '99999999-9999-4999-8999-999999999999',
      'Orphan', 'cafe', 'RU', 'Europe/Moscow'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case12: orphan location must fail FK';
  END IF;

  raised := false;
  BEGIN
    INSERT INTO public.business_zones (location_id, is_default)
    VALUES ('99999999-9999-4999-8999-999999999999', false);
  EXCEPTION WHEN foreign_key_violation THEN
    raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'Case12: orphan zone must fail FK';
  END IF;

  -- Multi-organization: same user can own Org A and Org B
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  EXECUTE 'SET ROLE authenticated';
  v_json_b := public.create_business_organization_with_location(
    'Second Org',
    'Second Loc',
    'spa',
    'DE',
    'Europe/Berlin'
  );
  v_org_b := (v_json_b->>'organization_id')::uuid;
  IF v_org_b IS NULL OR v_org_b = v_org THEN
    RAISE EXCEPTION 'Multi-org: second org missing or collided';
  END IF;
  SELECT count(*) INTO cnt
  FROM public.business_organization_members
  WHERE user_id = user_a AND role = 'owner';
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'Multi-org: expected 2 owner memberships, got %', cnt;
  END IF;

  RAISE NOTICE 'business_domain_core_smoke: all cases passed';
END;
$$;

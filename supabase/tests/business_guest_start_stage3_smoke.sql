-- Disposable compiler only. No live Auth or network calls. All fixtures roll back.
BEGIN;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
DO $$
DECLARE v_role text; v_table text; v_privilege text; v_function text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_table IN ARRAY ARRAY['business_guest_start_network_hits', 'business_guest_starts'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF has_table_privilege(v_role, 'public.' || v_table, v_privilege) IS DISTINCT FROM (v_role = 'service_role') THEN
          RAISE EXCEPTION 'incorrect table ACL: % % %', v_role, v_table, v_privilege;
        END IF;
      END LOOP;
    END LOOP;
    FOREACH v_function IN ARRAY ARRAY['public.business_guest_start_reserve(text,integer,integer)', 'public.business_guest_bootstrap(uuid,text,text,integer,text)'] LOOP
      IF has_function_privilege(v_role, v_function, 'EXECUTE') IS DISTINCT FROM (v_role = 'service_role') THEN
        RAISE EXCEPTION 'incorrect function ACL: % %', v_role, v_function;
      END IF;
    END LOOP;
  END LOOP;
END $$;
INSERT INTO auth.users(id, email, is_anonymous, email_confirmed_at, raw_user_meta_data) VALUES
  ('253821e0-0000-4000-8000-000000000031', NULL, true, NULL, '{}'),
  ('253821e0-0000-4000-8000-000000000032', NULL, true, NULL, '{}'),
  ('253821e0-0000-4000-8000-000000000034', NULL, true, NULL, '{}'),
  ('253821e0-0000-4000-8000-000000000033', 'stage3-owner@example.invalid', false, now(), '{}');
SET LOCAL ROLE service_role;
DO $$
DECLARE v_first record; v_again record; v_other record; v_grant public.access_grants%ROWTYPE; v_n int;
BEGIN
  FOR v_n IN 1..3 LOOP
    IF NOT public.business_guest_start_reserve(repeat('3', 64), 3, 86400) THEN RAISE EXCEPTION 'early network limit'; END IF;
  END LOOP;
  IF public.business_guest_start_reserve(repeat('3', 64), 3, 86400) THEN RAISE EXCEPTION 'network limit bypass'; END IF;
  IF NOT public.business_guest_start_reserve(repeat('4', 64), 3, 86400) THEN RAISE EXCEPTION 'other network affected'; END IF;
  SELECT * INTO v_first FROM public.business_guest_bootstrap('253821e0-0000-4000-8000-000000000031', repeat('5', 64), repeat('3', 64), 604800, '  ');
  IF v_first.created IS DISTINCT FROM true THEN RAISE EXCEPTION 'bootstrap not created'; END IF;
  PERFORM set_config('test.guest_start.org', v_first.organization_id::text, true);
  PERFORM set_config('test.guest_start.loc', v_first.location_id::text, true);
  IF NOT EXISTS (SELECT 1 FROM public.business_organizations WHERE id = v_first.organization_id AND name = 'Моя кофейня' AND status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.business_organization_members WHERE organization_id = v_first.organization_id AND user_id = '253821e0-0000-4000-8000-000000000031' AND role = 'owner')
    OR NOT EXISTS (SELECT 1 FROM public.business_locations WHERE id = v_first.location_id AND organization_id = v_first.organization_id AND business_category = 'cafe' AND country_code = 'RU' AND timezone = 'Europe/Moscow')
    OR (SELECT count(*) FROM public.business_zones WHERE location_id = v_first.location_id AND is_default AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'bootstrap domain mismatch';
  END IF;
  SELECT * INTO v_grant FROM public.access_grants WHERE user_id = '253821e0-0000-4000-8000-000000000031';
  IF NOT FOUND OR v_grant.email_hash IS NOT NULL OR v_grant.ends_at - v_grant.starts_at <> interval '7 days'
    OR v_grant.ends_at IS DISTINCT FROM v_first.grant_ends_at THEN RAISE EXCEPTION 'guest grant mismatch'; END IF;
  SELECT * INTO v_again FROM public.business_guest_bootstrap('253821e0-0000-4000-8000-000000000031', repeat('5', 64), repeat('3', 64), 86400, 'Different');
  IF v_again.created IS DISTINCT FROM false OR v_again.organization_id IS DISTINCT FROM v_first.organization_id
    OR v_again.location_id IS DISTINCT FROM v_first.location_id OR v_again.grant_ends_at IS DISTINCT FROM v_first.grant_ends_at
    OR (SELECT count(*) FROM public.access_grants WHERE user_id = '253821e0-0000-4000-8000-000000000031') <> 1 THEN
    RAISE EXCEPTION 'bootstrap retry moved grant or duplicated rows';
  END IF;
  SELECT * INTO v_again FROM public.business_guest_bootstrap('253821e0-0000-4000-8000-000000000031', repeat('9', 64), repeat('3', 64), 604800, NULL);
  IF v_again.created IS DISTINCT FROM false OR v_again.location_id IS DISTINCT FROM v_first.location_id
    OR (SELECT count(*) FROM public.business_guest_starts WHERE user_id = '253821e0-0000-4000-8000-000000000031') <> 1 THEN
    RAISE EXCEPTION 'user retry with another key duplicated start';
  END IF;
  INSERT INTO public.business_organization_members(organization_id, user_id, role)
    VALUES (v_first.organization_id, '253821e0-0000-4000-8000-000000000034', 'owner');
  BEGIN
    PERFORM public.business_guest_bootstrap('253821e0-0000-4000-8000-000000000034', repeat('b', 64), repeat('4', 64), 604800, NULL);
    RAISE EXCEPTION 'existing membership accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT * INTO v_other FROM public.business_guest_bootstrap('253821e0-0000-4000-8000-000000000032', repeat('6', 64), repeat('4', 64), 604800, 'Other fixture');
  PERFORM set_config('test.guest_start.other_org', v_other.organization_id::text, true);
  PERFORM set_config('test.guest_start.other_loc', v_other.location_id::text, true);
  BEGIN
    PERFORM public.business_guest_bootstrap('253821e0-0000-4000-8000-000000000032', repeat('5', 64), repeat('4', 64), 604800, NULL);
    RAISE EXCEPTION 'idempotency user conflict accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.business_guest_bootstrap('253821e0-0000-4000-8000-000000000033', repeat('7', 64), repeat('4', 64), 604800, NULL);
    RAISE EXCEPTION 'non anonymous bootstrap accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- NULL lookup cannot bind an identity, cannot match another guest.
  SELECT * INTO v_grant FROM public.resolve_access_grant(NULL, '253821e0-0000-4000-8000-000000000031', 'business_new_client');
  IF v_grant.user_id IS DISTINCT FROM '253821e0-0000-4000-8000-000000000031'::uuid THEN RAISE EXCEPTION 'guest resolver failed'; END IF;
  INSERT INTO public.access_grants(email_hash, user_id, kind, source, starts_at, ends_at)
    VALUES (repeat('8', 64), '253821e0-0000-4000-8000-000000000033', 'business_new_client', 'trial', now() - interval '10 days', now() + interval '20 days');
  SELECT * INTO v_grant FROM public.resolve_access_grant(repeat('8', 64), '253821e0-0000-4000-8000-000000000033', 'business_new_client');
  IF v_grant.email_hash IS DISTINCT FROM repeat('8', 64) OR v_grant.ends_at - v_grant.starts_at <> interval '30 days' THEN
    RAISE EXCEPTION 'legacy email gift changed';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '253821e0-0000-4000-8000-000000000031', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":true,"sub":"253821e0-0000-4000-8000-000000000031"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.business_organizations WHERE id = current_setting('test.guest_start.org')::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.business_locations WHERE id = current_setting('test.guest_start.loc')::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.business_zones WHERE location_id = current_setting('test.guest_start.loc')::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.business_organization_members WHERE organization_id = current_setting('test.guest_start.org')::uuid AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'guest cannot read own domain';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_organizations WHERE id = current_setting('test.guest_start.other_org')::uuid)
    OR EXISTS (SELECT 1 FROM public.business_locations WHERE id = current_setting('test.guest_start.other_loc')::uuid)
    OR EXISTS (SELECT 1 FROM public.business_zones WHERE location_id = current_setting('test.guest_start.other_loc')::uuid)
    OR EXISTS (SELECT 1 FROM public.business_organization_members WHERE organization_id = current_setting('test.guest_start.other_org')::uuid) THEN
    RAISE EXCEPTION 'guest sees another owner domain';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;

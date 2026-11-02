BEGIN;

DO $$
DECLARE
  v_role text;
  v_privilege text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'public.business_guest_auth_tickets', v_privilege) THEN
        RAISE EXCEPTION 'ticket table capability is public: % %', v_role, v_privilege;
      END IF;
    END LOOP;
    IF has_function_privilege(v_role, 'public.consume_business_guest_auth_ticket(text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'ticket consume capability is public: %', v_role;
    END IF;
  END LOOP;
  INSERT INTO public.business_guest_auth_tickets(nonce_hash, expires_at)
  VALUES (repeat('a', 64), statement_timestamp() + interval '2 minutes');
END $$;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF NOT public.consume_business_guest_auth_ticket(repeat('a', 64))
    OR public.consume_business_guest_auth_ticket(repeat('a', 64)) THEN
    RAISE EXCEPTION 'consume must succeed exactly once';
  END IF;
END $$;
RESET ROLE;

-- Only the disposable compiler fixture lacks these Auth-owned columns
-- (real GoTrue has both; profiles insert trigger reads email_confirmed_at).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
-- Create real foreign rows through the same RPC available to regular owners.
INSERT INTO auth.users(id, email, is_anonymous, email_confirmed_at, raw_user_meta_data)
VALUES ('253821e0-0000-4000-8000-000000000002', 'owner-253821e0@example.invalid', false, now(), '{}');
SELECT set_config('request.jwt.claim.sub', '253821e0-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":false,"sub":"253821e0-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_result jsonb;
BEGIN
  IF public.is_business_anonymous_user() THEN RAISE EXCEPTION 'regular user marked anonymous'; END IF;
  -- BB without a rights profile is already covered by the onboarding smoke.
  v_result := public.create_business_organization_with_location('Owner fixture', 'Owner location', 'cafe', 'BB', 'UTC');
  IF (v_result->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'owner bootstrap failed';
  END IF;
  PERFORM set_config('test.guest_auth.organization_id', v_result->>'organization_id', true);
  PERFORM set_config('test.guest_auth.location_id', v_result->>'location_id', true);
  PERFORM set_config('test.guest_auth.zone_id', v_result->>'zone_id', true);
END $$;
RESET ROLE;
DO $$
DECLARE
  v_org uuid := current_setting('test.guest_auth.organization_id')::uuid;
  v_loc uuid := current_setting('test.guest_auth.location_id')::uuid;
  v_member uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '253821e0-0000-4000-8000-000000000002')
    OR NOT EXISTS (SELECT 1 FROM public.business_organizations WHERE id = v_org AND created_by = '253821e0-0000-4000-8000-000000000002')
    OR NOT EXISTS (SELECT 1 FROM public.business_locations WHERE id = v_loc AND organization_id = v_org) THEN
    RAISE EXCEPTION 'owner fixture rows missing';
  END IF;
  SELECT id INTO v_member FROM public.business_organization_members
  WHERE organization_id = v_org AND user_id = '253821e0-0000-4000-8000-000000000002' AND role = 'owner';
  IF v_member IS NULL THEN RAISE EXCEPTION 'owner membership missing'; END IF;
  PERFORM set_config('test.guest_auth.member_id', v_member::text, true);
  IF to_regclass('public.business_zones') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.business_zones
      WHERE id = current_setting('test.guest_auth.zone_id')::uuid AND location_id = v_loc) THEN
      RAISE EXCEPTION 'owner zone missing';
    END IF;
  END IF;
END $$;

INSERT INTO auth.users(id, email, is_anonymous, raw_user_meta_data)
VALUES ('253821e0-0000-4000-8000-000000000001', NULL, true, '{}');
SELECT set_config('request.jwt.claim.sub', '253821e0-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":true,"sub":"253821e0-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.is_business_anonymous_user() THEN RAISE EXCEPTION 'anonymous detection failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email IS NULL AND full_name IS NULL AND role = 'listener') THEN
    RAISE EXCEPTION 'nullable anonymous profile missing';
  END IF;
  BEGIN
    PERFORM public.create_business_organization_with_location('Test', 'Test', 'cafe', 'RU', 'UTC');
    RAISE EXCEPTION 'anonymous bootstrap bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_practices WHERE user_id = '253821e0-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.email_contacts WHERE user_id = '253821e0-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'anonymous signup side effects';
  END IF;
END $$;
-- Check populated foreign rows as the guest, including direct mutations.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_target record;
  v_visible boolean;
  v_count bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM '253821e0-0000-4000-8000-000000000001'::uuid
    OR NOT public.is_business_anonymous_user() THEN
    RAISE EXCEPTION 'isolation checks must run as guest';
  END IF;
  FOR v_target IN
    SELECT * FROM (VALUES
      ('profiles', '253821e0-0000-4000-8000-000000000002'::uuid, 'full_name'),
      ('business_organizations', current_setting('test.guest_auth.organization_id')::uuid, 'name'),
      ('business_organization_members', current_setting('test.guest_auth.member_id')::uuid, 'role'),
      ('business_locations', current_setting('test.guest_auth.location_id')::uuid, 'name'),
      ('business_zones', current_setting('test.guest_auth.zone_id')::uuid, 'name')
    ) AS targets(table_name, row_id, update_column)
  LOOP
    IF v_target.table_name = 'business_zones' AND to_regclass('public.business_zones') IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', v_target.table_name)
      INTO v_visible USING v_target.row_id;
    IF v_visible THEN RAISE EXCEPTION 'foreign row visible: %', v_target.table_name; END IF;
    BEGIN
      EXECUTE format('UPDATE public.%I SET %I = %I WHERE id = $1',
        v_target.table_name, v_target.update_column, v_target.update_column) USING v_target.row_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count <> 0 THEN RAISE EXCEPTION 'foreign row updated: %', v_target.table_name; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_target.table_name) USING v_target.row_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count <> 0 THEN RAISE EXCEPTION 'foreign row deleted: %', v_target.table_name; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;
ROLLBACK;

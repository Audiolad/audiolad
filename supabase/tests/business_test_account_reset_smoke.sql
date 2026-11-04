-- Disposable smoke for 20270221120000_business_test_account_reset.sql. Rolls back.
\set ON_ERROR_STOP on
BEGIN;
-- Minimal Auth fixture in CI compile lacks these GoTrue columns (rolled back with the smoke).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_anon uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_loc uuid := gen_random_uuid();
  v_zone uuid := gen_random_uuid();
  v_player uuid := gen_random_uuid();
  v_order uuid;
  v_payment uuid := gen_random_uuid();
  v_hash text := public.business_subscription_email_hash('Coffee-Test@Example.TEST ');
  v_device text := encode(sha256(convert_to('business-guest-coffee:device-a', 'UTF8')), 'hex');
  v_other_device text := encode(sha256(convert_to('business-guest-coffee:device-b', 'UTF8')), 'hex');
  v_net text := repeat('a', 64);
  v_other_net text := repeat('b', 64);
  v_start_net text := repeat('c', 64);
  v_result jsonb;
  v_reset public.business_test_account_resets%ROWTYPE;
  v_count integer;
  v_orders_before text;
  v_orders_after text;
BEGIN
  IF has_function_privilege('authenticated', 'public.reset_business_test_account(uuid, uuid, text[], text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reset_business_test_account(uuid, uuid, text[], text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.business_test_accounts_for_owner(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.business_test_account_target(uuid, uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.business_test_account_allowlist', 'INSERT')
     OR has_table_privilege('anon', 'public.business_test_account_resets', 'SELECT') THEN
    RAISE EXCEPTION 'privilege: clients must not reach the test reset';
  END IF;

  BEGIN
    INSERT INTO public.business_test_account_allowlist (email_hash) VALUES ('person@example.test');
    RAISE EXCEPTION 'allowlist accepted a clear-text address';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO auth.users (id, email) VALUES
    (v_owner, 'owner@example.test'),
    (v_target, 'coffee-test@example.test'),
    (v_other, 'someone@example.test');
  INSERT INTO auth.users (id, email, is_anonymous) VALUES (v_anon, NULL, true);
  INSERT INTO public.platform_user_roles (user_id, role_code) VALUES (v_owner, 'owner');
  INSERT INTO public.business_test_account_allowlist (email_hash, note) VALUES (v_hash, 'coffee journey test');

  -- The journey state of the test account.
  INSERT INTO public.business_organizations (id, name, created_by) VALUES (v_org, 'Тестовая кофейня', v_target);
  INSERT INTO public.business_organization_members (organization_id, user_id, role) VALUES (v_org, v_target, 'owner');
  INSERT INTO public.business_locations (id, organization_id, name, business_category, country_code, timezone)
  VALUES (v_loc, v_org, 'Точка', 'cafe', 'RU', 'Europe/Moscow');
  INSERT INTO public.business_zones (id, location_id, name, is_default) VALUES (v_zone, v_loc, 'Зал', true);
  INSERT INTO public.business_players (id, organization_id, player_code) VALUES (v_player, v_org, 'AL-P-700000001');
  INSERT INTO public.business_player_assignments (player_id, zone_id) VALUES (v_player, v_zone);
  INSERT INTO public.business_trial_activity_days (organization_id, day, listened_seconds)
  VALUES (v_org, current_date, 600);
  INSERT INTO public.business_guest_starts (idempotency_hash, user_id, status, organization_id)
  VALUES (repeat('d', 64), v_target, 'ready', v_org);
  INSERT INTO public.access_grants (email_hash, user_id, kind, starts_at, ends_at, source)
  VALUES (v_hash, v_target, 'business_new_client', now() - interval '8 days', now() - interval '1 day', 'trial');
  INSERT INTO public.access_grant_identities (email_hash, user_id, kind) VALUES (v_hash, v_target, 'business_new_client');
  INSERT INTO public.access_paid_periods (email_hash, user_id, kind, paid_until)
  VALUES (v_hash, v_target, 'business_new_client', now() + interval '20 days');
  INSERT INTO public.business_guest_listening (device_hash, used_seconds) VALUES (v_device, 1800), (v_other_device, 900);
  INSERT INTO public.business_guest_listening_ip_day (ip_hash, day, device_hash, used_seconds) VALUES
    (v_net, current_date, v_device, 1800),
    (v_net, current_date, v_other_device, 900),
    (v_other_net, current_date, v_other_device, 300);
  INSERT INTO public.business_guest_start_network_hits (network_hash) VALUES (v_start_net), (v_other_net);

  -- Offer acceptance (service writer) and the real checkout order + payment.
  PERFORM * FROM public.record_business_offer_edition_acceptance(
    v_target, 'offer-v1-2026-11-04', '9d4046f36c20f5702697eac0af26de1c3579c6929c61d8ac4441c0b39617c7dc',
    'r8-2026-10-18', '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a', 'guest_start'
  );
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target::text, true);
  SET LOCAL ROLE authenticated;
  SELECT o.order_id INTO v_order FROM public.create_business_subscription_order(gen_random_uuid()) AS o;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'fixture order was not created';
  END IF;
  -- Payment history (must survive the reset unchanged).
  INSERT INTO public.payments (id, order_id, provider, idempotency_key, status, amount_minor, currency, provider_metadata)
  VALUES (v_payment, v_order, 'tochka', 'pay-' || v_payment::text, 'pending', 79900, 'RUB', '{}'::jsonb);
  INSERT INTO public.business_subscription_periods (
    order_id, user_id, email_hash, kind, period_start, period_end, amount_minor, opens_access, applied_at
  ) VALUES (
    v_order, v_target, v_hash, 'business_new_client', now() - interval '10 days', now() + interval '20 days', 79900, true, now()
  );
  SELECT md5(string_agg(to_jsonb(o)::text, ',' ORDER BY o.id)) INTO v_orders_before FROM public.orders AS o;

  -- Refusals: nothing changes.
  BEGIN
    PERFORM public.reset_business_test_account(v_other, v_target, ARRAY[v_device], v_net, v_start_net);
    RAISE EXCEPTION 'non-owner reset passed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'test_reset_forbidden' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reset_business_test_account(v_owner, v_other, '{}', NULL, NULL);
    RAISE EXCEPTION 'non-allowlisted reset passed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'test_reset_target_not_allowlisted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reset_business_test_account(v_owner, v_anon, '{}', NULL, NULL);
    RAISE EXCEPTION 'anonymous reset passed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'test_reset_target_not_allowlisted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reset_business_test_account(v_owner, v_owner, '{}', NULL, NULL);
    RAISE EXCEPTION 'self reset passed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'test_reset_target_protected' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reset_business_test_account(v_owner, v_target, '{}', 'not-a-hash', NULL);
    RAISE EXCEPTION 'bad network hash passed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  INSERT INTO public.business_organization_members (organization_id, user_id, role) VALUES (v_org, v_other, 'manager');
  BEGIN
    PERFORM public.reset_business_test_account(v_owner, v_target, ARRAY[v_device], v_net, v_start_net);
    RAISE EXCEPTION 'shared venue reset passed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'test_reset_shared_organization' THEN RAISE; END IF;
  END;
  DELETE FROM public.business_organization_members WHERE user_id = v_other;
  IF (SELECT status FROM public.business_organizations WHERE id = v_org) <> 'active'
     OR (SELECT count(*) FROM public.access_grants WHERE user_id = v_target) <> 1 THEN
    RAISE EXCEPTION 'a refused reset changed state';
  END IF;

  IF (SELECT count(*) FROM public.business_test_accounts_for_owner(v_owner)) <> 1
     OR (SELECT email_masked FROM public.business_test_accounts_for_owner(v_owner)) <> 'c•••@example.test'
     OR (SELECT organizations FROM public.business_test_accounts_for_owner(v_owner)) <> 1 THEN
    RAISE EXCEPTION 'owner list is wrong';
  END IF;
  BEGIN
    PERFORM * FROM public.business_test_accounts_for_owner(v_other);
    RAISE EXCEPTION 'non-owner listed test accounts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The reset.
  v_result := public.reset_business_test_account(v_owner, v_target, ARRAY[v_device, 'junk'], v_net, v_start_net);
  SELECT * INTO v_reset FROM public.business_test_account_resets WHERE id = (v_result->>'reset_id')::uuid;
  IF v_reset.id IS NULL OR v_reset.actor_user_id <> v_owner OR v_reset.target_email_hash <> v_hash
     OR v_reset.closed_organization_ids <> ARRAY[v_org]
     OR (v_reset.counts->>'memberships')::int <> 1
     OR (v_reset.counts->>'gifts')::int <> 1
     OR (v_reset.counts->>'paid_summaries')::int <> 1
     OR (v_reset.counts->>'guest_starts')::int <> 1
     OR (v_reset.counts->>'guest_meter_devices')::int <> 1
     OR (v_reset.counts->>'guest_meter_network_days')::int <> 2
     OR (v_reset.counts->>'guest_start_limit_hits')::int <> 1
     OR (v_reset.counts->>'offer_edition_acceptances')::int <> 1
     OR (v_reset.counts->>'offer_acceptances')::int <> 1
     OR jsonb_array_length(v_reset.archived->'access_grants') <> 1
     OR jsonb_array_length(v_reset.archived->'business_organization_members') <> 1 THEN
    RAISE EXCEPTION 'reset archive is wrong: %', v_result;
  END IF;

  IF (SELECT status FROM public.business_organizations WHERE id = v_org) <> 'closed'
     OR (SELECT status FROM public.business_locations WHERE id = v_loc) <> 'closed'
     OR (SELECT status FROM public.business_zones WHERE id = v_zone) <> 'closed'
     OR (SELECT status FROM public.business_players WHERE id = v_player) <> 'retired'
     OR EXISTS (SELECT 1 FROM public.business_player_assignments WHERE player_id = v_player AND unassigned_at IS NULL) THEN
    RAISE EXCEPTION 'venue was not closed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_organization_members WHERE user_id = v_target)
     OR EXISTS (SELECT 1 FROM public.access_grants WHERE user_id = v_target OR email_hash = v_hash)
     OR EXISTS (SELECT 1 FROM public.access_grant_identities WHERE user_id = v_target OR email_hash = v_hash)
     OR EXISTS (SELECT 1 FROM public.access_paid_periods WHERE user_id = v_target OR email_hash = v_hash)
     OR EXISTS (SELECT 1 FROM public.business_offer_edition_acceptances WHERE user_id = v_target)
     OR EXISTS (SELECT 1 FROM public.business_offer_acceptances WHERE user_id = v_target)
     OR EXISTS (SELECT 1 FROM public.business_trial_activity_days WHERE organization_id = v_org)
     OR EXISTS (SELECT 1 FROM public.business_guest_starts WHERE user_id = v_target)
     OR EXISTS (SELECT 1 FROM public.business_guest_listening WHERE device_hash = v_device)
     OR EXISTS (SELECT 1 FROM public.business_guest_listening_ip_day WHERE ip_hash = v_net)
     OR EXISTS (SELECT 1 FROM public.business_guest_start_network_hits WHERE network_hash = v_start_net) THEN
    RAISE EXCEPTION 'journey state was not cleared';
  END IF;
  -- Other devices and networks are untouched.
  IF NOT EXISTS (SELECT 1 FROM public.business_guest_listening WHERE device_hash = v_other_device)
     OR NOT EXISTS (SELECT 1 FROM public.business_guest_listening_ip_day WHERE ip_hash = v_other_net)
     OR NOT EXISTS (SELECT 1 FROM public.business_guest_start_network_hits WHERE network_hash = v_other_net) THEN
    RAISE EXCEPTION 'reset touched another device or network';
  END IF;

  -- Hard rule: payments history is untouched.
  SELECT md5(string_agg(to_jsonb(o)::text, ',' ORDER BY o.id)) INTO v_orders_after FROM public.orders AS o;
  IF v_orders_before IS DISTINCT FROM v_orders_after
     OR (SELECT count(*) FROM public.payments WHERE id = v_payment AND order_id = v_order) <> 1
     OR (SELECT count(*) FROM public.business_subscription_periods WHERE order_id = v_order) <> 1 THEN
    RAISE EXCEPTION 'reset touched orders, payments or paid periods';
  END IF;

  -- The account is new for the gift: no grant reachable through the identity graph.
  SELECT count(*) INTO v_count FROM public.resolve_access_grant(v_hash, v_target, 'business_new_client');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'old gift still resolves after reset';
  END IF;

  IF (SELECT count(*) FROM public.admin_operation_log
      WHERE operation = 'coffee_test_account_reset' AND target_auth_user_id = v_target
        AND status = 'success' AND target_email_hash = v_hash
        AND counts::text NOT LIKE '%@%') <> 1 THEN
    RAISE EXCEPTION 'audit row missing or carries an address';
  END IF;

  -- A second press is harmless.
  v_result := public.reset_business_test_account(v_owner, v_target, '{}', NULL, NULL);
  IF (v_result->'counts'->>'memberships')::int <> 0 THEN
    RAISE EXCEPTION 'second reset found leftovers: %', v_result;
  END IF;
END
$$;

ROLLBACK;

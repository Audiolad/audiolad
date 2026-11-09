-- Disposable post-apply smoke for task 8142d69a on the full replayed schema. No Tochka HTTP. Rolls back.
-- A link the cabinet replaced (a code applied over an open ordinary link, or a revoked code)
-- is still fulfilled when the bank confirms it late; an ordinary cancelled link still goes to review.
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

CREATE FUNCTION pg_temp.as_owner(p_user uuid) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user)::text, true);
END; $f$;

CREATE FUNCTION pg_temp.bank_confirms(p_order uuid, p_tag text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v_payment uuid := gen_random_uuid(); v_event uuid := gen_random_uuid(); v_amount bigint;
BEGIN
  SELECT amount_minor INTO v_amount FROM public.orders WHERE id = p_order;
  INSERT INTO public.payments (id, order_id, provider, idempotency_key, status, amount_minor, currency, provider_metadata)
  VALUES (v_payment, p_order, 'tochka', 'pay-' || v_payment::text, 'pending', v_amount, 'RUB', '{}'::jsonb);
  INSERT INTO public.payment_webhook_events (id, provider, dedup_key, provider_payment_id, event_type, processing_status, signature_verified)
  VALUES (v_event, 'tochka', 'tochka:tx:' || p_tag, 'op-' || p_tag, 'acquiringInternetPayment', 'received', true);
  RETURN public.fulfill_tochka_payment_transactional(v_event, 'op-' || p_tag, v_payment, v_amount, 'RUB', 'APPROVED');
END; $f$;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_owner2 uuid := gen_random_uuid();
  v_owner3 uuid := gen_random_uuid();
  v_org uuid; v_org2 uuid; v_org3 uuid;
  v_code uuid; v_code2 uuid;
  v_799 uuid; v_399 uuid; v_plain uuid; v_rev uuid; v_after uuid;
  v_result jsonb;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_owner, 'partner-fulfill-1@example.test', now()),
    (v_owner2, 'partner-fulfill-2@example.test', now()),
    (v_owner3, 'partner-fulfill-3@example.test', now());
  INSERT INTO public.business_partner_codes (code, purpose) VALUES ('WWWWXXXXYYYY', 'custdev') RETURNING id INTO v_code;
  INSERT INTO public.business_partner_codes (code, purpose) VALUES ('WWWWXXXXYYY2', 'custdev') RETURNING id INTO v_code2;

  -- Owner 1: an open ordinary link, then the code.
  PERFORM pg_temp.as_owner(v_owner);
  SET LOCAL ROLE authenticated;
  v_org := (public.create_business_organization_with_location('Партнёр 1', 'Зал 1', 'cafe', 'RU', 'Europe/Moscow')->>'organization_id')::uuid;
  PERFORM * FROM public.accept_business_offer('b2b-terms', 'r8-2026-10-18', '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a');
  SELECT o.order_id INTO v_799 FROM public.create_business_subscription_order(gen_random_uuid(), 79900) AS o;
  PERFORM public.reserve_business_partner_code('WWWW-XXXX-YYYY');
  SELECT o.order_id INTO v_399 FROM public.create_business_subscription_order(gen_random_uuid(), 39900) AS o;
  RESET ROLE;
  IF v_399 = v_799 OR (SELECT amount_minor FROM public.orders WHERE id = v_399) <> 39900
     OR (SELECT status FROM public.orders WHERE id = v_799) <> 'cancelled' THEN
    RAISE EXCEPTION 'code over an open ordinary link: no new 39900 link';
  END IF;
  -- The bank still confirms the replaced ordinary link: fulfilled, 30 days, nothing bound.
  v_result := pg_temp.bank_confirms(v_799, 'partner-late-799');
  IF v_result->>'outcome' IS DISTINCT FROM 'completed'
     OR (SELECT status FROM public.orders WHERE id = v_799) <> 'paid'
     OR NOT (SELECT opens_access AND amount_minor = 79900 FROM public.business_subscription_periods WHERE order_id = v_799)
     OR (SELECT late_paid_at IS NULL FROM public.business_subscription_superseded_orders WHERE order_id = v_799)
     OR (SELECT bound_organization_id IS NOT NULL FROM public.business_partner_codes WHERE id = v_code) THEN
    RAISE EXCEPTION 'late payment on a replaced ordinary link: %', v_result;
  END IF;
  -- Then the code link binds as period 1.
  v_result := pg_temp.bank_confirms(v_399, 'partner-399');
  IF v_result->>'outcome' IS DISTINCT FROM 'completed'
     OR (SELECT bound_organization_id IS DISTINCT FROM v_org FROM public.business_partner_codes WHERE id = v_code)
     OR NOT EXISTS (SELECT 1 FROM public.business_partner_entitlement_periods WHERE order_id = v_399 AND period_index = 1) THEN
    RAISE EXCEPTION 'code link after the late ordinary payment: %', v_result;
  END IF;

  -- Owner 2: an ordinary cancelled link (not replaced by a code) still goes to review, unchanged.
  PERFORM pg_temp.as_owner(v_owner2);
  SET LOCAL ROLE authenticated;
  v_org2 := (public.create_business_organization_with_location('Партнёр 2', 'Зал 1', 'cafe', 'RU', 'Europe/Moscow')->>'organization_id')::uuid;
  PERFORM * FROM public.accept_business_offer('b2b-terms', 'r8-2026-10-18', '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a');
  SELECT o.order_id INTO v_plain FROM public.create_business_subscription_order(gen_random_uuid()) AS o;
  RESET ROLE;
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now() WHERE id = v_plain;
  v_result := pg_temp.bank_confirms(v_plain, 'partner-plain-cancelled');
  IF v_result->>'outcome' IS DISTINCT FROM 'requires_review'
     OR v_result->>'review_reason' IS DISTINCT FROM 'cancelled_order_late_approved'
     OR EXISTS (SELECT 1 FROM public.business_subscription_periods WHERE order_id = v_plain) THEN
    RAISE EXCEPTION 'ordinary cancelled link behaviour changed: %', v_result;
  END IF;

  -- Owner 3: reserve, 39900 link, revoke, then the bank still confirms the revoked link.
  PERFORM pg_temp.as_owner(v_owner3);
  SET LOCAL ROLE authenticated;
  v_org3 := (public.create_business_organization_with_location('Партнёр 3', 'Зал 1', 'cafe', 'RU', 'Europe/Moscow')->>'organization_id')::uuid;
  PERFORM * FROM public.accept_business_offer('b2b-terms', 'r8-2026-10-18', '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a');
  PERFORM public.reserve_business_partner_code('WWWWXXXXYYY2');
  SELECT o.order_id INTO v_rev FROM public.create_business_subscription_order(gen_random_uuid(), 39900) AS o;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  v_result := public.revoke_business_partner_code(v_code2);
  RESET ROLE;
  IF (v_result->>'invalidated_orders')::int <> 1 OR (SELECT status FROM public.orders WHERE id = v_rev) <> 'cancelled' THEN
    RAISE EXCEPTION 'revoke did not close the open 39900 link: %', v_result;
  END IF;
  -- The owner is not stuck: a fresh ordinary link.
  PERFORM pg_temp.as_owner(v_owner3);
  SET LOCAL ROLE authenticated;
  SELECT o.order_id INTO v_after FROM public.create_business_subscription_order(gen_random_uuid(), 79900) AS o;
  RESET ROLE;
  IF v_after = v_rev OR (SELECT amount_minor FROM public.orders WHERE id = v_after) <> 79900 THEN
    RAISE EXCEPTION 'after revoke the owner did not get an ordinary link';
  END IF;
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now() WHERE id = v_after;
  v_result := pg_temp.bank_confirms(v_rev, 'partner-revoked-late');
  IF v_result->>'outcome' IS DISTINCT FROM 'completed'
     OR NOT (SELECT opens_access AND amount_minor = 39900 FROM public.business_subscription_periods WHERE order_id = v_rev)
     OR (SELECT bound_organization_id IS NOT NULL FROM public.business_partner_codes WHERE id = v_code2)
     OR EXISTS (SELECT 1 FROM public.business_partner_entitlements WHERE organization_id = v_org3)
     OR (SELECT late_paid_at IS NULL OR reason <> 'partner_code_revoked' FROM public.business_subscription_superseded_orders WHERE order_id = v_rev)
     OR (public.business_partner_quote_json(v_owner3)->'late_payment'->>'reason') IS DISTINCT FROM 'partner_code_revoked'
     OR (public.business_partner_quote_json(v_owner3)->>'unit_price_minor')::bigint <> 79900 THEN
    RAISE EXCEPTION 'late payment on a revoked code: %', v_result;
  END IF;
END $$;

SELECT 'business partner codes fulfill smoke: PASS';
ROLLBACK;

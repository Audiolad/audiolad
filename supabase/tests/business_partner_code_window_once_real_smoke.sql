-- Disposable post-apply smoke for task 8142d69a t1338u on the full replayed schema. Rolls back.
-- The 72-hour hold of a partner code is counted once per account, through the real roles.
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

CREATE FUNCTION pg_temp.as_owner(p_user uuid) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user)::text, true);
END; $f$;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_code uuid; v_code2 uuid; v_end timestamptz; v_order uuid; v_result jsonb; v_refused boolean := false;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_owner, 'partner-window-1@example.test', now()), (v_other, 'partner-window-2@example.test', now());
  INSERT INTO public.business_partner_codes (code, purpose) VALUES ('VVVVWWWWXXXX', 'custdev') RETURNING id INTO v_code;
  INSERT INTO public.business_partner_codes (code, purpose) VALUES ('VVVVWWWWXXX2', 'custdev') RETURNING id INTO v_code2;

  PERFORM pg_temp.as_owner(v_owner);
  SET LOCAL ROLE authenticated;
  PERFORM public.create_business_organization_with_location('Окно 1', 'Зал 1', 'cafe', 'RU', 'Europe/Moscow');
  PERFORM * FROM public.accept_business_offer('b2b-terms', 'r8-2026-10-18', '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a');
  v_result := public.reserve_business_partner_code('VVVV-WWWW-XXXX');
  RESET ROLE;
  IF (v_result->>'already')::boolean THEN RAISE EXCEPTION 'first entry did not open a window: %', v_result; END IF;
  -- Ten hours later.
  UPDATE public.business_partner_code_windows SET first_reserved_at = first_reserved_at - interval '10 hours',
    expires_at = expires_at - interval '10 hours' WHERE code_id = v_code RETURNING expires_at INTO v_end;
  UPDATE public.business_partner_codes SET reserved_until = v_end WHERE id = v_code;

  PERFORM pg_temp.as_owner(v_owner);
  SET LOCAL ROLE authenticated;
  PERFORM public.reserve_business_partner_code('VVVVWWWWXXXX');
  v_result := public.reserve_business_partner_code('VVVVWWWWXXXX');
  SELECT o.order_id INTO v_order FROM public.create_business_subscription_order(gen_random_uuid(), 39900) AS o;
  RESET ROLE;
  IF (SELECT reserved_until FROM public.business_partner_codes WHERE id = v_code) IS DISTINCT FROM v_end
     OR (v_result->'quote'->>'reserved_until')::timestamptz IS DISTINCT FROM v_end
     OR NOT (v_result->>'already')::boolean THEN
    RAISE EXCEPTION 'repeat visits or the payment link restarted the 72 hours: %', v_result;
  END IF;
  IF (SELECT amount_minor FROM public.orders WHERE id = v_order) <> 39900 THEN
    RAISE EXCEPTION 'payment link lost the personal price';
  END IF;

  -- Another code before the first payment: the same account end, no new 72 hours.
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now() WHERE id = v_order;
  PERFORM pg_temp.as_owner(v_owner);
  SET LOCAL ROLE authenticated;
  PERFORM public.reserve_business_partner_code('VVVVWWWWXXX2');
  PERFORM public.reserve_business_partner_code('VVVVWWWWXXXX');
  RESET ROLE;
  IF (SELECT reserved_until FROM public.business_partner_codes WHERE id = v_code) IS DISTINCT FROM v_end
     OR (SELECT expires_at FROM public.business_partner_code_windows WHERE code_id = v_code2) IS DISTINCT FROM v_end THEN
    RAISE EXCEPTION 'another code started new 72 hours for the same account';
  END IF;

  -- The 72 hours are over and the link is gone: no new 72 hours for this account.
  UPDATE public.business_partner_code_windows SET first_reserved_at = first_reserved_at - interval '70 hours',
    expires_at = expires_at - interval '70 hours' WHERE code_id = v_code RETURNING expires_at INTO v_end;
  UPDATE public.business_partner_codes SET reserved_until = v_end WHERE id = v_code;
  PERFORM pg_temp.as_owner(v_owner);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.reserve_business_partner_code('VVVVWWWWXXXX');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF;
    v_refused := true;
  END;
  BEGIN
    PERFORM public.reserve_business_partner_code('VVVVWWWWXXX2');
    v_refused := false;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
    v_refused := false;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'partner_terms_changed' THEN RAISE; END IF;
  END;
  RESET ROLE;
  IF NOT v_refused OR (SELECT reserved_until FROM public.business_partner_codes WHERE id = v_code) IS DISTINCT FROM v_end THEN
    RAISE EXCEPTION 'an ended hold was restarted for the same account';
  END IF;

  -- A browser can neither read the windows nor bypass the cap.
  IF has_table_privilege('authenticated', 'public.business_partner_code_windows', 'SELECT')
     OR has_function_privilege('authenticated', 'public.business_partner_codes_window_cap()', 'EXECUTE') THEN
    RAISE EXCEPTION 'partner code windows are not service-only';
  END IF;
END $$;

SELECT 'business partner code window once smoke: PASS';
ROLLBACK;

-- Throwaway local fixture only, applied AFTER 20270304120000 on top of the backfill fixture.
SELECT public.check_test((SELECT count(*)=2 AND count(DISTINCT expires_at)=1 FROM business_partner_code_windows
  WHERE organization_id=(SELECT v FROM public.zz_window_backfill WHERE k='org')), 'backfill: one account end for both held codes');
SELECT public.check_test((SELECT bool_and(c.reserved_until < clock_timestamp()) FROM business_partner_codes c WHERE c.code IN ('MMMMMMMMMMMM','MMMMMMMMMMM2')),
  'backfill: the later hold is brought down to the earliest account end');
SET test.uid='00000000-0000-4000-8000-0000000002a2';
SELECT public.check_test((public.business_partner_quote_for_caller()->>'source')='standard', 'backfill: second owner no longer quoted 399 after the account end');
DO $$ BEGIN
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid(), 39900); RAISE EXCEPTION 'late 39900 link after backfill';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_terms_changed' THEN RAISE; END IF; END;
  BEGIN PERFORM public.reserve_business_partner_code('MMMMMMMMMMM2'); RAISE EXCEPTION 'backfilled hold restarted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF; END;
END; $$;
SELECT public.check_test(NOT EXISTS (SELECT 1 FROM business_subscription_order_scopes WHERE organization_id=(SELECT v FROM public.zz_window_backfill WHERE k='org') AND partner_code_id IS NOT NULL), 'backfill: no personal-price link');
DROP TABLE public.zz_window_backfill;
SELECT 'partner code window backfill: PASS';

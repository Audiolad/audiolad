-- Throwaway local fixture only. Run via scripts/business-partner-codes-isolated.py, never on production.
-- Task 8142d69a, Sergey t1338u: the 72-hour hold is counted once per account from the first entry.
CREATE TEMP TABLE wo(k text PRIMARY KEY, v uuid, t timestamptz);
-- Existing hold before the migration: kept with exactly its end (see the backfill).
SELECT public.check_test((SELECT count(*)=count(w.code_id) FROM business_partner_codes c
  LEFT JOIN business_partner_code_windows w ON w.code_id=c.id AND w.expires_at=c.reserved_until
  WHERE c.reserved_by_user_id IS NOT NULL AND c.bound_organization_id IS NULL), 'existing holds: a window with the same end');
SELECT public.check_test(NOT has_table_privilege('authenticated','public.business_partner_code_windows','SELECT')
  AND NOT has_table_privilege('anon','public.business_partner_code_windows','SELECT'), 'windows are service-only');

INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000001a1'), ('00000000-0000-4000-8000-0000000001a2'),
  ('00000000-0000-4000-8000-0000000001b1');
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-0000000001a1'), ('00000000-0000-4000-8000-0000000001a2'),
  ('00000000-0000-4000-8000-0000000001b1');
INSERT INTO business_partner_codes(code, purpose) VALUES ('JJJJJJJJJJJJ','custdev'), ('JJJJJJJJJJJ2','custdev');
INSERT INTO wo(k, v) SELECT 'code', id FROM business_partner_codes WHERE code='JJJJJJJJJJJJ';
SET test.uid='00000000-0000-4000-8000-0000000001a1';
INSERT INTO wo(k, v) SELECT 'org', (public.create_business_organization_with_location('J','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
INSERT INTO business_organization_members(organization_id,user_id,role,created_at)
  SELECT v,'00000000-0000-4000-8000-0000000001a2','owner',now()+interval '1 second' FROM wo WHERE k='org';

-- First entry opens the 72 hours.
SELECT public.check_test(NOT (public.reserve_business_partner_code('jjjj-jjjj-jjjj')->>'already')::boolean, 'first entry: a new window');
SELECT public.check_test((SELECT reserved_until BETWEEN clock_timestamp()+interval '71 hours 59 minutes' AND clock_timestamp()+interval '72 hours'
  FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'first entry: hold ends in 72 hours');
-- Ten hours later (the clock is moved back on the stored rows).
UPDATE business_partner_code_windows SET first_reserved_at=first_reserved_at-interval '10 hours', expires_at=expires_at-interval '10 hours'
  WHERE code_id=(SELECT v FROM wo WHERE k='code');
UPDATE business_partner_codes SET reserved_until=reserved_until-interval '10 hours' WHERE code='JJJJJJJJJJJJ';
INSERT INTO wo(k, t) SELECT 'end', expires_at FROM business_partner_code_windows WHERE code_id=(SELECT v FROM wo WHERE k='code');
-- Repeated visits (/podarok, payment screens, the re-reserve after partner_terms_changed) keep the end.
SELECT public.check_test((public.reserve_business_partner_code('JJJJJJJJJJJJ')->>'already')::boolean, 'second entry: same window');
SELECT public.reserve_business_partner_code('JJJJJJJJJJJJ');
SELECT public.reserve_business_partner_code('JJJJ-JJJJ-JJJJ');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'repeated entries keep the first end');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'reserved_until')::timestamptz=(SELECT t FROM wo WHERE k='end'), 'quote shows the first end');
SELECT public.check_test((SELECT count(*)=1 FROM business_partner_code_windows WHERE code_id=(SELECT v FROM wo WHERE k='code')), 'one window per account and code');
-- Opening a payment link no longer moves the hold.
INSERT INTO wo(k, v) SELECT 'o1', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
SELECT public.check_test((SELECT amount_minor=39900 FROM orders WHERE id=(SELECT v FROM wo WHERE k='o1')), 'payment link at 39900');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'payment link keeps the first end');
-- Any direct write is capped at the window end too.
UPDATE business_partner_codes SET reserved_until=clock_timestamp()+interval '100 hours' WHERE code='JJJJJJJJJJJJ';
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'hold never passes the window end');
UPDATE orders SET status='cancelled' WHERE id=(SELECT v FROM wo WHERE k='o1');
-- Another code and back: the first code keeps its first end.
SELECT public.reserve_business_partner_code('JJJJJJJJJJJ2');
SELECT public.check_test((SELECT reserved_by_user_id IS NULL FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'one code held at a time');
SELECT public.reserve_business_partner_code('JJJJJJJJJJJJ');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'coming back keeps the first end');

-- The 72 hours end while a link opened in time is still open: that link can still be paid.
INSERT INTO wo(k, v) SELECT 'o2', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
UPDATE business_partner_code_windows SET first_reserved_at=first_reserved_at-interval '70 hours', expires_at=expires_at-interval '70 hours'
  WHERE code_id=(SELECT v FROM wo WHERE k='code');
UPDATE business_partner_codes SET reserved_until=reserved_until-interval '70 hours' WHERE code='JJJJJJJJJJJJ';
UPDATE wo SET t=(SELECT expires_at FROM business_partner_code_windows WHERE code_id=(SELECT v FROM wo WHERE k='code')) WHERE k='end';
SELECT public.check_test((public.reserve_business_partner_code('JJJJJJJJJJJJ')->>'already')::boolean, 'after the end with an open link: same window');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'after the end with an open link: no restart');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=39900, 'the open link keeps its price');
-- Without an open link the same account cannot start the 72 hours again.
UPDATE orders SET status='cancelled' WHERE id=(SELECT v FROM wo WHERE k='o2');
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('JJJJJJJJJJJJ'); RAISE EXCEPTION 'expired hold restarted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF; END;
END; $$;
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'refused entry changes nothing');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'source')='standard', 'after the end: standard price');
-- The second owner of the same account: the same 72 hours, no restart.
SET test.uid='00000000-0000-4000-8000-0000000001a2';
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('JJJJJJJJJJJJ'); RAISE EXCEPTION 'second owner restarted the hold';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF; END;
END; $$;
-- Another account may still take a code whose hold ran out (unchanged rule), with its own 72 hours.
SET test.uid='00000000-0000-4000-8000-0000000001b1';
SELECT public.create_business_organization_with_location('K','Зал 1','cafe','RU','Europe/Moscow');
SELECT public.check_test(NOT (public.reserve_business_partner_code('JJJJJJJJJJJJ')->>'already')::boolean, 'another account: a new window');
SELECT public.check_test((SELECT reserved_by_user_id='00000000-0000-4000-8000-0000000001b1' AND reserved_until > clock_timestamp()+interval '71 hours'
       FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'another account: its own 72 hours');
SELECT 'partner code window once: PASS';

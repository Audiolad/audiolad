-- Throwaway local fixture only. Run via scripts/business-partner-codes-isolated.py, never on production.
-- Task 8142d69a, Sergey t1338u + t1339u: the 72-hour hold is counted once per code and account from the
-- first entry of that code; a new code opens its own fresh 72 hours.
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
-- Another (new) code: its own fresh 72 hours (t1339u); the first code's window is untouched.
SELECT public.check_test(NOT (public.reserve_business_partner_code('JJJJJJJJJJJ2')->>'already')::boolean, 'new code: a new window');
SELECT public.check_test((SELECT reserved_by_user_id IS NULL FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'one code held at a time');
SELECT public.check_test((SELECT reserved_until BETWEEN clock_timestamp()+interval '71 hours 59 minutes' AND clock_timestamp()+interval '72 hours'
  FROM business_partner_codes WHERE code='JJJJJJJJJJJ2'), 'new code: fresh 72 hours, not the first code end');
SELECT public.check_test((SELECT expires_at=(SELECT t FROM wo WHERE k='end') FROM business_partner_code_windows WHERE code_id=(SELECT v FROM wo WHERE k='code')), 'new code does not touch the first window');
INSERT INTO wo(k, t) SELECT 'end2', expires_at FROM business_partner_code_windows w JOIN business_partner_codes c ON c.id=w.code_id WHERE c.code='JJJJJJJJJJJ2';
-- Re-entering the new code keeps its own end.
SELECT public.check_test((public.reserve_business_partner_code('JJJJ-JJJJ-JJJ2')->>'already')::boolean, 'new code again: same window');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end2') FROM business_partner_codes WHERE code='JJJJJJJJJJJ2'), 'new code again keeps its end');
-- Coming back to the first code keeps the first end (no restart, not the new code end).
SELECT public.check_test((public.reserve_business_partner_code('JJJJJJJJJJJJ')->>'already')::boolean, 'coming back: same window');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'coming back keeps the first end');
SELECT public.check_test((SELECT count(*)=2 FROM business_partner_code_windows WHERE organization_id=(SELECT v FROM wo WHERE k='org')), 'one window per code for the account');

-- The 72 hours end while a link opened in time is still open: that link can still be paid.
INSERT INTO wo(k, v) SELECT 'o2', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
UPDATE business_partner_code_windows SET first_reserved_at=first_reserved_at-interval '70 hours', expires_at=expires_at-interval '70 hours'
  WHERE code_id=(SELECT v FROM wo WHERE k='code');
UPDATE business_partner_codes SET reserved_until=reserved_until-interval '70 hours' WHERE code='JJJJJJJJJJJJ';
UPDATE orders SET created_at=created_at-interval '70 hours' WHERE id=(SELECT v FROM wo WHERE k='o2');
UPDATE wo SET t=(SELECT expires_at FROM business_partner_code_windows WHERE code_id=(SELECT v FROM wo WHERE k='code')) WHERE k='end';
SELECT public.check_test((public.reserve_business_partner_code('JJJJJJJJJJJJ')->>'already')::boolean, 'after the end with an open link: same window');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'after the end with an open link: no restart');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=39900, 'the open link keeps its price');
-- But no NEW personal-price link for the first payment after the end, whatever path opens it
-- (the guard fires before the scope row exists, so a made-up order id is enough here).
DO $$ BEGIN
  BEGIN
    INSERT INTO business_subscription_order_scopes(order_id, organization_id, location_ids, unit_price_minor, partner_code_id, partner_period_index)
    SELECT gen_random_uuid(), (SELECT v FROM wo WHERE k='org'), ARRAY[]::uuid[], 39900, (SELECT v FROM wo WHERE k='code'), 1;
    RAISE EXCEPTION 'late personal-price link opened';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_terms_changed' THEN RAISE; END IF; END;
END; $$;
SELECT public.check_test((SELECT status='pending' FROM orders WHERE id=(SELECT v FROM wo WHERE k='o2')), 'the link opened in time stays open and payable');
SELECT public.check_test((SELECT count(*)=0 FROM business_subscription_order_scopes s JOIN orders o ON o.id=s.order_id
  WHERE s.partner_code_id=(SELECT v FROM wo WHERE k='code') AND o.status='pending' AND o.created_at > (SELECT t FROM wo WHERE k='end')), 'no open personal-price link from after the end');
-- Without an open link the same account cannot start the 72 hours again.
UPDATE orders SET status='cancelled' WHERE id=(SELECT v FROM wo WHERE k='o2');
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('JJJJJJJJJJJJ'); RAISE EXCEPTION 'expired hold restarted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF; END;
END; $$;
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end') FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'refused entry changes nothing');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'source')='standard', 'after the end: standard price');
-- An ended code never blocks another code (t1339u): the second code continues its own 72 hours.
SELECT public.check_test((public.reserve_business_partner_code('JJJJJJJJJJJ2')->>'already')::boolean, 'after code 1 ended: code 2 continues');
SELECT public.check_test((SELECT reserved_until=(SELECT t FROM wo WHERE k='end2') FROM business_partner_codes WHERE code='JJJJJJJJJJJ2'), 'code 2 keeps its own end');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=39900, 'code 2: personal price again');
-- A fresh code after the end of code 1: its own fresh 72 hours.
INSERT INTO business_partner_codes(code, purpose) VALUES ('JJJJJJJJJJJ3','custdev');
SELECT public.check_test(NOT (public.reserve_business_partner_code('JJJJJJJJJJJ3')->>'already')::boolean, 'fresh code after the end: a new window');
SELECT public.check_test((SELECT reserved_until BETWEEN clock_timestamp()+interval '71 hours 59 minutes' AND clock_timestamp()+interval '72 hours'
  FROM business_partner_codes WHERE code='JJJJJJJJJJJ3'), 'fresh code after the end: fresh 72 hours');
-- A link for a code still inside its 72 hours opens normally, the ended code 1 still refuses.
INSERT INTO wo(k, v) SELECT 'o3', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
SELECT public.check_test((SELECT s.partner_code_id=c.id FROM business_subscription_order_scopes s, business_partner_codes c
  WHERE s.order_id=(SELECT v FROM wo WHERE k='o3') AND c.code='JJJJJJJJJJJ3'), 'payment link under the fresh code');
UPDATE orders SET status='cancelled' WHERE id=(SELECT v FROM wo WHERE k='o3');
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('JJJJJJJJJJJJ'); RAISE EXCEPTION 'ended code 1 restarted after another code';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF; END;
END; $$;
SELECT public.check_test((SELECT reserved_by_user_id IS NULL FROM business_partner_codes WHERE code='JJJJJJJJJJJJ')
  AND (SELECT expires_at=(SELECT t FROM wo WHERE k='end') FROM business_partner_code_windows WHERE code_id=(SELECT v FROM wo WHERE k='code')), 'ended code 1 stays ended');
-- The second owner of the same account: the same window for code 1, no restart.
SET test.uid='00000000-0000-4000-8000-0000000001a2';
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('JJJJJJJJJJJJ'); RAISE EXCEPTION 'second owner restarted the ended code';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_expired' THEN RAISE; END IF; END;
END; $$;
-- Another account may still take a code whose hold ran out (unchanged rule), with its own 72 hours.
SET test.uid='00000000-0000-4000-8000-0000000001b1';
SELECT public.create_business_organization_with_location('K','Зал 1','cafe','RU','Europe/Moscow');
SELECT public.check_test(NOT (public.reserve_business_partner_code('JJJJJJJJJJJJ')->>'already')::boolean, 'another account: a new window');
SELECT public.check_test((SELECT reserved_by_user_id='00000000-0000-4000-8000-0000000001b1' AND reserved_until > clock_timestamp()+interval '71 hours'
       FROM business_partner_codes WHERE code='JJJJJJJJJJJJ'), 'another account: its own 72 hours');
SELECT 'partner code window once: PASS';

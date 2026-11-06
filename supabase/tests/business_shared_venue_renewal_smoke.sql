-- Local fake ledger only: no bank/network and no real charges.
SET test.uid='00000000-0000-4000-8000-000000000001';
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO access_grants(user_id,kind,starts_at,ends_at) VALUES
 ('00000000-0000-4000-8000-000000000001','business_new_client',clock_timestamp(),clock_timestamp()+interval '7 days');
CREATE TEMP TABLE billing_fixture(order_id uuid, saved_end timestamptz, gift_end timestamptz);
INSERT INTO billing_fixture(gift_end) SELECT ends_at FROM access_grants;
UPDATE business_locations SET status='closed' WHERE id IN (SELECT second_location FROM fixture UNION ALL SELECT third_location FROM fixture);
INSERT INTO billing_fixture(order_id) SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid());
SELECT public.check_test((SELECT amount_minor=79900 FROM orders WHERE id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL)), 'one active costs 79900; empty/closed slots excluded');
UPDATE orders SET status='cancelled' WHERE id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL);
DELETE FROM billing_fixture WHERE order_id IS NOT NULL;
UPDATE business_locations SET status='active' WHERE id=(SELECT second_location FROM fixture);
INSERT INTO billing_fixture(order_id) SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid());
SELECT public.check_test((SELECT amount_minor=159800 FROM orders WHERE id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL)), 'two active cost 159800');
SELECT public.check_test((SELECT cardinality(location_ids)=2 FROM business_subscription_order_scopes WHERE order_id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL)), 'two-venue checkout snapshot');
-- Repeated starts reuse the pending order, not a second month or a separate hall payment.
SELECT public.check_test((SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid()))=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL), 'one pending organization payment');
DO $$ BEGIN
  FOR i IN 1..2 LOOP
    BEGIN INSERT INTO orders(user_id,order_kind,status,amount_minor,currency) VALUES
      ('00000000-0000-4000-8000-000000000001','business_subscription','pending',79900,'RUB');
      RAISE EXCEPTION 'lone 799 accepted for two venues';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END; $$;
INSERT INTO payments(order_id,status,amount_minor,confirmed_at) SELECT order_id,'succeeded',159800,clock_timestamp() FROM billing_fixture WHERE order_id IS NOT NULL;
UPDATE orders SET status='paid',paid_at=clock_timestamp() WHERE id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL);
DO $$ BEGIN
  BEGIN
    UPDATE orders SET amount_minor=79900 WHERE id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL);
    PERFORM public.apply_business_subscription_for_order(order_id) FROM billing_fixture WHERE order_id IS NOT NULL;
    RAISE EXCEPTION 'fulfilment accepted 799 for two venues';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'subscription_amount_mismatch' THEN RAISE; END IF; END;
END; $$;
SELECT public.apply_business_subscription_for_order(order_id) FROM billing_fixture WHERE order_id IS NOT NULL;
UPDATE billing_fixture b SET saved_end=p.period_end FROM business_subscription_periods p WHERE p.order_id=b.order_id;
SELECT public.check_test((SELECT period_end-period_start=interval '30 days' AND period_start=(SELECT gift_end FROM billing_fixture WHERE gift_end IS NOT NULL) FROM business_subscription_periods WHERE order_id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL)), 'one two-venue payment adds exactly 30 shared days after the existing gift');
SELECT public.apply_business_subscription_for_order(order_id) FROM billing_fixture WHERE order_id IS NOT NULL;
SELECT public.check_test((SELECT count(*)=1 AND max(period_end)=(SELECT saved_end FROM billing_fixture WHERE saved_end IS NOT NULL) FROM business_subscription_periods WHERE order_id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL)), 'duplicate notification cannot extend');
UPDATE business_locations SET status='active' WHERE id=(SELECT third_location FROM fixture);
SELECT public.check_test(NOT EXISTS(SELECT 1 FROM business_subscription_order_scopes s JOIN business_subscription_periods p ON p.order_id=s.order_id WHERE (SELECT third_location FROM fixture)=ANY(s.location_ids) AND p.opens_access AND p.period_end>clock_timestamp()), 'third activated after payment has no paid access');
SELECT public.check_test((SELECT ends_at=(SELECT gift_end FROM billing_fixture WHERE gift_end IS NOT NULL) FROM access_grants), 'activating more venues never restarts the one owner gift');
DO $$ BEGIN
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid()); RAISE EXCEPTION 'full third-venue mid-period charge accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'venue_topup_not_available' THEN RAISE; END IF; END;
END; $$;
-- Expire only this local fixture, then renewal may cover all three venues.
UPDATE business_subscription_periods SET period_start=clock_timestamp()-interval '31 days',period_end=clock_timestamp()-interval '1 day'
WHERE order_id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL);
DELETE FROM billing_fixture WHERE order_id IS NOT NULL;
INSERT INTO billing_fixture(order_id) SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid());
SELECT public.check_test((SELECT amount_minor=239700 FROM orders WHERE id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL)), 'three active cost 239700 at renewal');
-- A provider test payment is recorded but opens no real access.
INSERT INTO payments(order_id,status,amount_minor,confirmed_at,is_test) SELECT order_id,'succeeded',239700,clock_timestamp(),true FROM billing_fixture WHERE order_id IS NOT NULL;
UPDATE orders SET status='paid',paid_at=clock_timestamp() WHERE id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL);
SELECT public.apply_business_subscription_for_order(order_id) FROM billing_fixture WHERE order_id IS NOT NULL;
SELECT public.check_test((SELECT NOT opens_access FROM business_subscription_periods WHERE order_id=(SELECT order_id FROM billing_fixture WHERE order_id IS NOT NULL)), 'sandbox payment never opens access');
-- Additional real activation calls must preserve a pre-existing owner gift.
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000003');
SET test.uid='00000000-0000-4000-8000-000000000003';
CREATE TEMP TABLE gift_fixture AS SELECT public.create_business_organization_with_location('Fixture organization','Venue 1','cafe','RU','Europe/Moscow') AS bootstrap;
UPDATE business_organizations SET pilot_location_limit=3 WHERE id=(SELECT (bootstrap->>'organization_id')::uuid FROM gift_fixture);
INSERT INTO access_grants(user_id,kind,starts_at,ends_at) SELECT '00000000-0000-4000-8000-000000000003','business_new_client',l.created_at,l.created_at+interval '7 days'
FROM business_locations l WHERE l.id=(SELECT (bootstrap->>'location_id')::uuid FROM gift_fixture);
CREATE TEMP TABLE saved_gift AS SELECT starts_at,ends_at FROM access_grants WHERE user_id='00000000-0000-4000-8000-000000000003';
SELECT public.activate_business_pilot_location((bootstrap->>'organization_id')::uuid,2) FROM gift_fixture;
SELECT public.activate_business_pilot_location((bootstrap->>'organization_id')::uuid,3) FROM gift_fixture;
SELECT public.check_test((SELECT count(*)=1 AND min(starts_at)=(SELECT starts_at FROM saved_gift) AND max(ends_at)=(SELECT ends_at FROM saved_gift)
FROM access_grants WHERE user_id='00000000-0000-4000-8000-000000000003'), 'real extra venue activation preserves the single original gift');
SELECT 'shared-venue billing: PASS';

-- Throwaway fixture only. Run via scripts/business-pilot-isolated.py, never on production.
-- Venue slots are the same for every organization: no per-client flag, cap from one system setting.
SELECT public.check_test(NOT has_function_privilege('anon','public.business_venue_slot_limit(uuid)','EXECUTE'), 'anon cannot read slot limit');
SELECT public.check_test(has_function_privilege('authenticated','public.business_venue_slot_limit(uuid)','EXECUTE'), 'member reads slot limit');
SELECT public.check_test(NOT has_function_privilege('authenticated','public.business_venue_slot_limit_internal(uuid)','EXECUTE'), 'internal limit is private');
SELECT public.check_test(NOT has_function_privilege('authenticated','public.business_venue_paid_until(uuid,uuid)','EXECUTE'), 'paid end is service-only');
SELECT public.check_test((SELECT default_limit=3 FROM business_venue_slot_settings), 'system default is three');
DO $$ BEGIN
  BEGIN UPDATE business_venue_slot_settings SET default_limit=11; RAISE EXCEPTION 'limit above schema ceiling accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO business_venue_slot_settings(singleton,default_limit) VALUES (false,3); RAISE EXCEPTION 'second settings row accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;
-- An ordinary new owner: no pilot flag, no override.
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000004'), ('00000000-0000-4000-8000-000000000005');
SET test.uid='00000000-0000-4000-8000-000000000004';
CREATE TEMP TABLE slots_fixture AS SELECT public.create_business_organization_with_location('Обычный','Зал 1','cafe','RU','Europe/Moscow') AS bootstrap;
ALTER TABLE slots_fixture ADD COLUMN org uuid, ADD COLUMN first_location uuid, ADD COLUMN order_id uuid;
UPDATE slots_fixture SET org=(bootstrap->>'organization_id')::uuid, first_location=(bootstrap->>'location_id')::uuid;
SELECT public.check_test((SELECT pilot_location_limit IS NULL AND venue_slot_limit_override IS NULL FROM business_organizations WHERE id=(SELECT org FROM slots_fixture)), 'no special flag on ordinary organization');
SELECT public.check_test((SELECT public.business_venue_slot_limit(org)=3 FROM slots_fixture), 'ordinary organization gets three slots');
SELECT public.check_test((SELECT count(*)=1 FROM business_locations WHERE organization_id=(SELECT org FROM slots_fixture)), 'starts with one hall');
DO $$ BEGIN
  BEGIN PERFORM public.activate_business_pilot_location(org,3) FROM slots_fixture; RAISE EXCEPTION 'skipped slot accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $$;
SELECT public.activate_business_pilot_location(org,2) FROM slots_fixture;
SELECT public.activate_business_pilot_location(org,3) FROM slots_fixture;
SELECT public.check_test((SELECT count(*)=3 FROM business_locations WHERE organization_id=(SELECT org FROM slots_fixture)), 'owner added second and third hall without any flag');
DO $$ BEGIN
  BEGIN PERFORM public.activate_business_pilot_location(org,4) FROM slots_fixture; RAISE EXCEPTION 'fourth hall accepted at cap';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN INSERT INTO business_locations(organization_id,name,business_category,country_code,timezone) SELECT org,'Fourth','cafe','RU','Europe/Moscow' FROM slots_fixture; RAISE EXCEPTION 'direct fourth insert accepted at cap';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $$;
SET test.uid='00000000-0000-4000-8000-000000000005';
DO $$ BEGIN
  BEGIN PERFORM public.business_venue_slot_limit(org) FROM slots_fixture; RAISE EXCEPTION 'foreign limit read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.activate_business_pilot_location(org,4) FROM slots_fixture; RAISE EXCEPTION 'foreign activation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
-- Billing: 79900 × active halls; empty and closed slots are not billed.
SET test.uid='00000000-0000-4000-8000-000000000004';
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-000000000004');
UPDATE slots_fixture SET order_id=(SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid()));
SELECT public.check_test((SELECT amount_minor=239700 FROM orders WHERE id=(SELECT order_id FROM slots_fixture)), 'three active halls cost 239700');
SELECT public.check_test((SELECT cardinality(location_ids)=3 FROM business_subscription_order_scopes WHERE order_id=(SELECT order_id FROM slots_fixture)), 'three-hall snapshot without flag');
UPDATE orders SET status='cancelled' WHERE id=(SELECT order_id FROM slots_fixture);
UPDATE business_locations SET status='closed' WHERE organization_id=(SELECT org FROM slots_fixture) AND name='Точка 3';
UPDATE slots_fixture SET order_id=(SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid()));
SELECT public.check_test((SELECT amount_minor=159800 FROM orders WHERE id=(SELECT order_id FROM slots_fixture)), 'closed hall is not billed');
UPDATE orders SET status='cancelled' WHERE id=(SELECT order_id FROM slots_fixture);
-- Raising the one system value allows more halls for everyone, with no per-client change.
UPDATE business_venue_slot_settings SET default_limit=5;
SELECT public.check_test((SELECT public.business_venue_slot_limit(org)=5 FROM slots_fixture), 'raised system limit applies');
SELECT public.activate_business_pilot_location(org,4) FROM slots_fixture;
SELECT public.check_test((SELECT count(*)=4 FROM business_locations WHERE organization_id=(SELECT org FROM slots_fixture)), 'fourth hall after raising system limit');
UPDATE slots_fixture SET order_id=(SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid()));
SELECT public.check_test((SELECT amount_minor=239700 FROM orders WHERE id=(SELECT order_id FROM slots_fixture)), 'three active of four halls cost 239700');
UPDATE orders SET status='cancelled' WHERE id=(SELECT order_id FROM slots_fixture);
UPDATE business_venue_slot_settings SET default_limit=3;
DO $$ BEGIN
  BEGIN PERFORM public.activate_business_pilot_location(org,5) FROM slots_fixture; RAISE EXCEPTION 'hall above lowered limit accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $$;
SELECT public.check_test((SELECT count(*)=4 FROM business_locations WHERE organization_id=(SELECT org FROM slots_fixture)), 'lowering never removes halls');
-- Optional override can only raise above the system default.
UPDATE business_organizations SET venue_slot_limit_override=1 WHERE id=(SELECT org FROM slots_fixture);
SELECT public.check_test((SELECT public.business_venue_slot_limit(org)=3 FROM slots_fixture), 'override never lowers below system default');
UPDATE business_organizations SET venue_slot_limit_override=10 WHERE id=(SELECT org FROM slots_fixture);
SELECT public.check_test((SELECT public.business_venue_slot_limit(org)=10 FROM slots_fixture), 'override raises one organization');
UPDATE business_organizations SET venue_slot_limit_override=NULL WHERE id=(SELECT org FROM slots_fixture);
-- A 79900 period paid before snapshots existed funds only the first hall.
SET test.uid='00000000-0000-4000-8000-000000000005';
CREATE TEMP TABLE legacy_fixture AS SELECT public.create_business_organization_with_location('Старый','Зал 1','cafe','RU','Europe/Moscow') AS bootstrap;
ALTER TABLE legacy_fixture ADD COLUMN org uuid, ADD COLUMN first_location uuid, ADD COLUMN second_location uuid;
UPDATE legacy_fixture SET org=(bootstrap->>'organization_id')::uuid, first_location=(bootstrap->>'location_id')::uuid;
INSERT INTO business_subscription_periods(order_id,user_id,opens_access,amount_minor,period_end) VALUES
 ('00000000-0000-4000-8000-000000000060','00000000-0000-4000-8000-000000000005',true,79900,clock_timestamp()+interval '10 days');
UPDATE legacy_fixture SET second_location=(public.activate_business_pilot_location(org,2)->>'location_id')::uuid;
SELECT public.check_test((SELECT public.business_venue_paid_until(org,first_location)>clock_timestamp() FROM legacy_fixture), 'old single payment keeps first hall');
SELECT public.check_test((SELECT public.business_venue_paid_until(org,second_location) IS NULL FROM legacy_fixture), 'unpaid extra hall has no paid access');
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-000000000005');
DO $$ BEGIN
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid()); RAISE EXCEPTION 'mid-period second-hall charge accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'venue_topup_not_available' THEN RAISE; END IF; END;
END; $$;
SELECT 'venue slots systemic: PASS';

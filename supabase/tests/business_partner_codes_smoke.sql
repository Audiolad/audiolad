-- Throwaway local fixture only. Run via scripts/business-partner-codes-isolated.py, never on production.
-- Local fake ledger: no bank, no network, no real charges.
-- Demo: one account, 1 then 2 venues, three payments at 39900 per venue, then 79900 per venue.
CREATE TEMP TABLE pc(k text PRIMARY KEY, v uuid);
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000d1');
-- Codes are created by the service only.
INSERT INTO business_partner_codes(code, purpose, recipient_note) VALUES ('ABCDEFGHJKMN', 'custdev', 'кастдев');
INSERT INTO business_partner_codes(code, purpose, recipient_note) VALUES ('PQRSTUVWXYZ2', 'top10', 'участник десятки');
INSERT INTO business_partner_codes(code, purpose, revoked_at) VALUES ('RRRRSSSSTTTT', 'other', clock_timestamp());
INSERT INTO pc SELECT 'code1', id FROM business_partner_codes WHERE code='ABCDEFGHJKMN';
INSERT INTO pc SELECT 'code2', id FROM business_partner_codes WHERE code='PQRSTUVWXYZ2';
SELECT public.check_test((SELECT unit_price_minor=39900 AND discount_periods=3 FROM business_partner_codes WHERE id=(SELECT v FROM pc WHERE k='code1')), 'first campaign defaults: 39900 per venue, three periods');
DO $$ BEGIN
  BEGIN INSERT INTO business_partner_codes(code, purpose) VALUES ('ABC', 'other'); RAISE EXCEPTION 'short code accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO business_partner_codes(code, purpose) VALUES ('ABCDEFGHJKM0', 'other'); RAISE EXCEPTION 'ambiguous 0 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO business_partner_codes(code, purpose, unit_price_minor) VALUES ('ZZZZZZZZZZZZ', 'other', 39950); RAISE EXCEPTION 'kopecks accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO business_partner_codes(code, purpose, unit_price_minor) VALUES ('ZZZZZZZZZZZY', 'other', 79900); RAISE EXCEPTION 'standard price as a code accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO business_partner_codes(code, purpose) VALUES ('ABCDEFGHJKMN', 'other'); RAISE EXCEPTION 'duplicate code accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END; $$;
-- Privileges: nothing is readable or callable by a browser except the owner's own quote and reservation.
SELECT public.check_test(NOT has_table_privilege('authenticated','public.business_partner_codes','SELECT'), 'codes are service-only');
SELECT public.check_test(NOT has_table_privilege('anon','public.business_partner_codes','SELECT'), 'codes hidden from anon');
SELECT public.check_test(NOT has_table_privilege('authenticated','public.business_partner_entitlements','SELECT'), 'entitlements are service-only');
SELECT public.check_test(NOT has_function_privilege('authenticated','public.business_partner_quote_internal(uuid,uuid)','EXECUTE'), 'internal quote is private');
SELECT public.check_test(NOT has_function_privilege('authenticated','public.business_partner_code_preview(text)','EXECUTE'), 'preview is service-only');
SELECT public.check_test(NOT has_function_privilege('authenticated','public.business_partner_apply_period_internal(uuid,uuid,uuid,bigint,integer,timestamptz,timestamptz,timestamptz)','EXECUTE'), 'period record is private');
SELECT public.check_test(NOT has_function_privilege('anon','public.reserve_business_partner_code(text)','EXECUTE'), 'anon cannot reserve');
SELECT public.check_test(has_function_privilege('authenticated','public.reserve_business_partner_code(text)','EXECUTE'), 'owner can reserve');
SELECT public.check_test((public.business_partner_code_preview('abcd-efgh-jkmn')->>'available')::boolean, 'link preview: normalized code is open');
SELECT public.check_test(NOT (public.business_partner_code_preview('RRRR-SSSS-TTTT')->>'available')::boolean, 'link preview: revoked code closed');
SELECT public.check_test(NOT (public.business_partner_code_preview('nope')->>'available')::boolean, 'link preview: unknown code closed');

-- Owner A: guest start, no email; owner B: another account; owner C: ordinary account without a code.
SET test.uid='00000000-0000-4000-8000-0000000000a1';
INSERT INTO pc SELECT 'orgA', (public.create_business_organization_with_location('A','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-0000000000a1');
INSERT INTO access_grants(user_id,kind,starts_at,ends_at) VALUES
 ('00000000-0000-4000-8000-0000000000a1','business_new_client',clock_timestamp(),clock_timestamp()+interval '7 days');
SET test.uid='00000000-0000-4000-8000-0000000000b1';
INSERT INTO pc SELECT 'orgB', (public.create_business_organization_with_location('B','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-0000000000b1');
SET test.uid='00000000-0000-4000-8000-0000000000c1';
INSERT INTO pc SELECT 'orgC', (public.create_business_organization_with_location('C','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-0000000000c1');
-- Standard owner: 79900, through the old one-argument checkout, unchanged.
INSERT INTO pc SELECT 'orderC', order_id FROM public.create_business_subscription_order(gen_random_uuid());
SELECT public.check_test((SELECT amount_minor=79900 FROM orders WHERE id=(SELECT v FROM pc WHERE k='orderC')), 'owner without a code still pays 79900');
SELECT public.check_test((SELECT unit_price_minor=79900 AND partner_code_id IS NULL FROM business_subscription_order_scopes WHERE order_id=(SELECT v FROM pc WHERE k='orderC')), 'standard snapshot');
UPDATE orders SET status='cancelled' WHERE id=(SELECT v FROM pc WHERE k='orderC');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'source')='standard', 'standard quote');
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('RRRRSSSSTTTT'); RAISE EXCEPTION 'revoked code reserved';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_invalid' THEN RAISE; END IF; END;
  BEGIN PERFORM public.reserve_business_partner_code('ZZZZZZZZZZZZ'); RAISE EXCEPTION 'unknown code reserved';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_invalid' THEN RAISE; END IF; END;
END; $$;

-- A enters the code (any case, with dashes). Reservation only: nothing is bound yet.
SET test.uid='00000000-0000-4000-8000-0000000000a1';
SELECT public.check_test((public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=79900, 'A before the code: 79900');
SELECT public.check_test((public.reserve_business_partner_code('abcd-efgh-jkmn')->'quote'->>'unit_price_minor')::bigint=39900, 'A reserved: 39900 per venue');
SELECT public.check_test((SELECT bound_organization_id IS NULL FROM business_partner_codes WHERE id=(SELECT v FROM pc WHERE k='code1')), 'entering the code does not burn it');
SELECT public.check_test(NOT EXISTS(SELECT 1 FROM business_partner_entitlements), 'no entitlement before payment');
-- Parallel redemption: B tries the same code while A holds it (row lock serializes; second loses).
SET test.uid='00000000-0000-4000-8000-0000000000b1';
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('ABCDEFGHJKMN'); RAISE EXCEPTION 'second account reserved a held code';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_unavailable' THEN RAISE; END IF; END;
END; $$;
SET test.uid='00000000-0000-4000-8000-0000000000a1';
-- The checkout refuses a price the owner did not confirm.
DO $$ BEGIN
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid()); RAISE EXCEPTION 'unconfirmed personal price accepted (old form)';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_terms_changed' THEN RAISE; END IF; END;
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid(), 79900); RAISE EXCEPTION 'stale standard price accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_terms_changed' THEN RAISE; END IF; END;
END; $$;
INSERT INTO pc SELECT 'a1', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
SELECT public.check_test((SELECT amount_minor=39900 FROM orders WHERE id=(SELECT v FROM pc WHERE k='a1')), 'one venue: 39900 exactly');
SELECT public.check_test((SELECT partner_code_id=(SELECT v FROM pc WHERE k='code1') AND partner_period_index=1 AND unit_price_minor=39900 FROM business_subscription_order_scopes WHERE order_id=(SELECT v FROM pc WHERE k='a1')), 'snapshot carries code and period 1');
-- Delayed first payment: the reservation runs out, but the open payment link still holds the code.
UPDATE business_partner_codes SET reserved_until=clock_timestamp()-interval '1 hour' WHERE id=(SELECT v FROM pc WHERE k='code1');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=39900, 'open link keeps the price after the reservation runs out');
SET test.uid='00000000-0000-4000-8000-0000000000b1';
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('ABCDEFGHJKMN'); RAISE EXCEPTION 'code with an open payment link taken';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_unavailable' THEN RAISE; END IF; END;
END; $$;
-- Payment error: nothing is applied, nothing is bound.
INSERT INTO payments(order_id,status,amount_minor) SELECT v,'failed',39900 FROM pc WHERE k='a1';
DO $$ BEGIN
  BEGIN PERFORM public.apply_business_subscription_for_order(v) FROM pc WHERE k='a1'; RAISE EXCEPTION 'unpaid order applied';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'order_not_paid' THEN RAISE; END IF; END;
END; $$;
UPDATE orders SET status='cancelled' WHERE id=(SELECT v FROM pc WHERE k='a1');
SELECT public.check_test((SELECT bound_organization_id IS NULL FROM business_partner_codes WHERE id=(SELECT v FROM pc WHERE k='code1')), 'failed or cancelled payment does not bind');
SELECT public.check_test(NOT EXISTS(SELECT 1 FROM business_partner_entitlement_periods), 'failed payment is not a paid period');
-- After the cancelled link and an expired reservation the code is free again (not burned).
SET test.uid='00000000-0000-4000-8000-0000000000b1';
SELECT public.reserve_business_partner_code('ABCDEFGHJKMN');
UPDATE business_partner_codes SET reserved_until=clock_timestamp()-interval '1 hour' WHERE id=(SELECT v FROM pc WHERE k='code1');
-- Retry by A.
SET test.uid='00000000-0000-4000-8000-0000000000a1';
SELECT public.reserve_business_partner_code('ABCDEFGHJKMN');
INSERT INTO pc SELECT 'a2', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
INSERT INTO payments(order_id,status,amount_minor,confirmed_at) SELECT v,'succeeded',39900,clock_timestamp() FROM pc WHERE k='a2';
UPDATE orders SET status='paid', paid_at=clock_timestamp() WHERE id=(SELECT v FROM pc WHERE k='a2');
SELECT public.apply_business_subscription_for_order(v) FROM pc WHERE k='a2';
SELECT public.apply_business_subscription_for_order(v) FROM pc WHERE k='a2';
SELECT public.check_test((SELECT bound_organization_id=(SELECT v FROM pc WHERE k='orgA') AND reserved_by_user_id IS NULL FROM business_partner_codes WHERE id=(SELECT v FROM pc WHERE k='code1')), 'first successful payment binds the code to the account');
SELECT public.check_test((SELECT count(*)=1 FROM business_partner_entitlement_periods), 'duplicate notification records one period');
SELECT public.check_test((SELECT p.period_start=g.ends_at AND p.amount_minor=39900 FROM business_subscription_periods p, access_grants g WHERE p.order_id=(SELECT v FROM pc WHERE k='a2') AND g.user_id='00000000-0000-4000-8000-0000000000a1'), 'gift days are not consumed: first paid period starts after the gift');
SELECT public.check_test((SELECT first_paid_at IS NOT NULL FROM business_partner_entitlements WHERE organization_id=(SELECT v FROM pc WHERE k='orgA')), 'countdown starts at first payment');
-- Re-activation in the same account: no new countdown. Another code: refused.
SELECT public.check_test((public.reserve_business_partner_code('ABCDEFGHJKMN')->>'already')::boolean, 'same account re-entry is a no-op');
SELECT public.check_test((SELECT count(*)=1 FROM business_partner_entitlements), 'still one entitlement');
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('PQRSTUVWXYZ2'); RAISE EXCEPTION 'second code combined';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_already_applied' THEN RAISE; END IF; END;
END; $$;
SET test.uid='00000000-0000-4000-8000-0000000000b1';
DO $$ BEGIN
  BEGIN PERFORM public.reserve_business_partner_code('ABCDEFGHJKMN'); RAISE EXCEPTION 'bound code moved to another account';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_unavailable' THEN RAISE; END IF; END;
END; $$;

-- A adds a second venue during the discount window: no mid-period charge (existing rule).
SET test.uid='00000000-0000-4000-8000-0000000000a1';
SELECT public.activate_business_pilot_location((SELECT v FROM pc WHERE k='orgA'), 2);
DO $$ BEGIN
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid(), 39900); RAISE EXCEPTION 'mid-period top-up accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'venue_topup_not_available' THEN RAISE; END IF; END;
END; $$;
SELECT public.check_test((public.business_partner_quote_for_caller()->>'total_minor')::bigint=79800 AND (public.business_partner_quote_for_caller()->>'period_index')::int=2, 'quote: two venues x 39900, period 2');
-- Renewal: the whole account (both venues) at 39900 for periods 2 and 3, no restart for the new venue.
CREATE FUNCTION pg_temp.expire_a() RETURNS void LANGUAGE sql AS $f$
  UPDATE business_subscription_periods SET period_start=period_start-interval '400 days', period_end=period_end-interval '400 days'
  WHERE user_id='00000000-0000-4000-8000-0000000000a1';
  UPDATE access_paid_periods SET paid_until=clock_timestamp()-interval '1 day' WHERE user_id='00000000-0000-4000-8000-0000000000a1';
  UPDATE access_grants SET ends_at=clock_timestamp()-interval '1 day' WHERE user_id='00000000-0000-4000-8000-0000000000a1';
$f$;
CREATE FUNCTION pg_temp.pay_a(p_key text, p_unit bigint) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v uuid;
BEGIN
  SELECT order_id INTO v FROM public.create_business_subscription_order(gen_random_uuid(), p_unit);
  INSERT INTO pc VALUES (p_key, v);
  INSERT INTO payments(order_id,status,amount_minor,confirmed_at) SELECT v,'succeeded',o.amount_minor,clock_timestamp() FROM orders o WHERE o.id=v;
  UPDATE orders SET status='paid', paid_at=clock_timestamp() WHERE id=v;
  PERFORM public.apply_business_subscription_for_order(v);
END; $f$;
SELECT pg_temp.expire_a();
SELECT pg_temp.pay_a('a3', 39900);
SELECT public.check_test((SELECT amount_minor=79800 FROM orders WHERE id=(SELECT v FROM pc WHERE k='a3')), 'period 2: 2 venues x 39900 = 79800');
SELECT pg_temp.expire_a();
SELECT pg_temp.pay_a('a4', 39900);
SELECT public.check_test((SELECT amount_minor=79800 FROM orders WHERE id=(SELECT v FROM pc WHERE k='a4')), 'period 3: 79800');
SELECT public.check_test((SELECT array_agg(period_index ORDER BY period_index)='{1,2,3}' AND array_agg(venue_count ORDER BY period_index)='{1,2,2}' FROM business_partner_entitlement_periods), 'history: three periods, venues 1/2/2');
-- Period 4: automatic return to the standard price, with a refusal for a stale discounted confirmation.
SELECT public.check_test((public.business_partner_quote_for_caller()->>'source')='finished' AND (public.business_partner_quote_for_caller()->>'total_minor')::bigint=159800, 'quote after the window: finished, 2 x 79900');
SELECT pg_temp.expire_a();
DO $$ BEGIN
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid(), 39900); RAISE EXCEPTION 'discount after the window accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_terms_changed' THEN RAISE; END IF; END;
END; $$;
SELECT pg_temp.pay_a('a5', 79900);
SELECT public.check_test((SELECT amount_minor=159800 FROM orders WHERE id=(SELECT v FROM pc WHERE k='a5')), 'period 4: 2 x 79900');
SELECT public.check_test((SELECT count(*)=3 FROM business_partner_entitlement_periods), 'standard period is not a discount period');
SELECT public.check_test((SELECT count(*)=4 AND bool_and(opens_access) FROM business_subscription_periods WHERE user_id='00000000-0000-4000-8000-0000000000a1'), 'every successful payment opened 30 days');

-- A sandbox (test) payment never binds or consumes a code.
SET test.uid='00000000-0000-4000-8000-0000000000c1';
SELECT public.reserve_business_partner_code('PQRSTUVWXYZ2');
INSERT INTO pc SELECT 'c2', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
INSERT INTO payments(order_id,status,amount_minor,confirmed_at,is_test) SELECT v,'succeeded',39900,clock_timestamp(),true FROM pc WHERE k='c2';
UPDATE orders SET status='paid', paid_at=clock_timestamp() WHERE id=(SELECT v FROM pc WHERE k='c2');
SELECT public.apply_business_subscription_for_order(v) FROM pc WHERE k='c2';
SELECT public.check_test((SELECT bound_organization_id IS NULL FROM business_partner_codes WHERE id=(SELECT v FROM pc WHERE k='code2')), 'sandbox payment does not bind');
-- Guard: a direct order at the personal price without a code is refused.
SET test.uid='00000000-0000-4000-8000-0000000000d1';
INSERT INTO pc SELECT 'orgD', (public.create_business_organization_with_location('D','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
DO $$ BEGIN
  BEGIN INSERT INTO orders(user_id,order_kind,status,amount_minor,currency) VALUES
    ('00000000-0000-4000-8000-0000000000d1','business_subscription','pending',39900,'RUB');
    RAISE EXCEPTION 'direct 39900 order without a code accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;

-- Shared helper: a real succeeded payment for an existing order.
CREATE FUNCTION pg_temp.pay(p_order uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$ BEGIN
  INSERT INTO payments(order_id,status,amount_minor,confirmed_at) SELECT p_order,'succeeded',o.amount_minor,clock_timestamp() FROM orders o WHERE o.id=p_order;
  UPDATE orders SET status='paid', paid_at=clock_timestamp() WHERE id=p_order;
  RETURN public.apply_business_subscription_for_order(p_order);
END; $f$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000000e1'), ('00000000-0000-4000-8000-0000000000e2'),
  ('00000000-0000-4000-8000-0000000000f1'), ('00000000-0000-4000-8000-0000000000f2'), ('00000000-0000-4000-8000-0000000000a9');
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-0000000000e1'), ('00000000-0000-4000-8000-0000000000e2'),
  ('00000000-0000-4000-8000-0000000000f1'), ('00000000-0000-4000-8000-0000000000f2'), ('00000000-0000-4000-8000-0000000000a9');
INSERT INTO business_partner_codes(code, purpose) VALUES ('EEEEEEEEEEEE','other'), ('EEEEEEEEEEE2','other'), ('FFFFFFFFFFFF','other'), ('GGGGGGGGGGGG','other');

-- Revoke: reserve, open a 39900 link, revoke, then the bank still confirms the old link.
SET test.uid='00000000-0000-4000-8000-0000000000e1';
INSERT INTO pc SELECT 'orgE', (public.create_business_organization_with_location('E','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
SELECT public.reserve_business_partner_code('EEEEEEEEEEEE');
INSERT INTO pc SELECT 'e399', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
SELECT public.check_test((public.revoke_business_partner_code((SELECT id FROM business_partner_codes WHERE code='EEEEEEEEEEEE'))->>'invalidated_orders')::int=1, 'revoke: the open personal-price link is no longer offered');
SELECT public.check_test(((public.revoke_business_partner_code((SELECT id FROM business_partner_codes WHERE code='EEEEEEEEEEEE'))->>'already')::boolean), 'revoke is idempotent');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'source')='standard', 'revoke: quote back to the standard price');
INSERT INTO pc SELECT 'e799', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 79900);
SELECT public.check_test((SELECT v FROM pc WHERE k='e799')<>(SELECT v FROM pc WHERE k='e399') AND (SELECT amount_minor=79900 FROM orders WHERE id=(SELECT v FROM pc WHERE k='e799')), 'revoke: the owner gets a fresh 79900 link, the revoked link is not reused');
SELECT public.check_test(((pg_temp.pay((SELECT v FROM pc WHERE k='e399'))->'partner'->>'reason')='code_revoked'), 'revoke then late payment: the code is refused');
SELECT public.check_test((SELECT bound_organization_id IS NULL FROM business_partner_codes WHERE code='EEEEEEEEEEEE')
  AND NOT EXISTS (SELECT 1 FROM business_partner_entitlements WHERE organization_id=(SELECT v FROM pc WHERE k='orgE')), 'revoked code never binds, no personal price');
SELECT public.check_test((SELECT opens_access AND amount_minor=39900 FROM business_subscription_periods WHERE order_id=(SELECT v FROM pc WHERE k='e399')), 'the money paid buys exactly its 30 days');
SELECT public.check_test((SELECT late_paid_at IS NOT NULL AND reason='partner_code_revoked' FROM business_subscription_superseded_orders WHERE order_id=(SELECT v FROM pc WHERE k='e399')), 'late payment on a revoked code is recorded');
SELECT public.check_test((public.business_partner_quote_for_caller()->'late_payment'->>'reason')='partner_code_revoked' AND (public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=79900, 'owner sees the revoked-code payment, next price 79900');
-- A code revoked by a direct row update (no admin function) is refused the same way.
SET test.uid='00000000-0000-4000-8000-0000000000e2';
INSERT INTO pc SELECT 'orgE2', (public.create_business_organization_with_location('E2','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
SELECT public.reserve_business_partner_code('EEEEEEEEEEE2');
INSERT INTO pc SELECT 'e2', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
UPDATE business_partner_codes SET revoked_at=clock_timestamp(), reserved_by_user_id=NULL, reserved_until=NULL WHERE code='EEEEEEEEEEE2';
SELECT public.check_test(((pg_temp.pay((SELECT v FROM pc WHERE k='e2'))->'partner'->>'reason')='code_revoked'), 'revoked without the admin function: refused');
SELECT public.check_test((SELECT bound_organization_id IS NULL FROM business_partner_codes WHERE code='EEEEEEEEEEE2'), 'revoked without the admin function: never binds');
DO $$ BEGIN
  BEGIN PERFORM public.revoke_business_partner_code((SELECT id FROM business_partner_codes WHERE code='ABCDEFGHJKMN')); RAISE EXCEPTION 'bound code revoked';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_code_bound' THEN RAISE; END IF; END;
END; $$;
SELECT public.check_test(NOT has_function_privilege('authenticated','public.revoke_business_partner_code(uuid)','EXECUTE'), 'revoke is service-only');

-- An open unpaid 79900 link, then a code: the owner proceeds alone.
SET test.uid='00000000-0000-4000-8000-0000000000a9';
INSERT INTO pc SELECT 'orgG', (public.create_business_organization_with_location('G','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
INSERT INTO pc SELECT 'g799', order_id FROM public.create_business_subscription_order(gen_random_uuid());
SELECT public.reserve_business_partner_code('GGGGGGGGGGGG');
INSERT INTO pc SELECT 'g399', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
SELECT public.check_test((SELECT amount_minor=39900 FROM orders WHERE id=(SELECT v FROM pc WHERE k='g399')), 'open 79900 link: the code still gives a 39900 link');
SELECT public.check_test((SELECT reason='partner_code_applied' FROM business_subscription_superseded_orders WHERE order_id=(SELECT v FROM pc WHERE k='g799')), 'the old ordinary link is replaced, not reused');
SELECT public.check_test((SELECT order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900))=(SELECT v FROM pc WHERE k='g399'), 'repeat: the same 39900 link (idempotent)');
SELECT public.check_test((SELECT count(*)=1 FROM business_subscription_superseded_orders WHERE organization_id=(SELECT v FROM pc WHERE k='orgG')), 'replacement recorded once');
-- The bank still confirms the replaced 79900 link: 30 days at 79900, no binding, nothing lost.
SELECT public.check_test((pg_temp.pay((SELECT v FROM pc WHERE k='g799'))->>'partner') IS NULL, 'late ordinary payment: no partner record');
SELECT public.check_test((SELECT opens_access AND amount_minor=79900 FROM business_subscription_periods WHERE order_id=(SELECT v FROM pc WHERE k='g799')), 'late ordinary payment buys its 30 days');
SELECT public.check_test((SELECT bound_organization_id IS NULL AND reserved_by_user_id IS NOT NULL FROM business_partner_codes WHERE code='GGGGGGGGGGGG'), 'the code stays reserved, not burned');
SELECT public.check_test((public.business_partner_quote_for_caller()->'late_payment'->>'reason')='partner_code_applied' AND (public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=39900, 'owner sees the late payment, the code price stays');
SELECT public.check_test(((pg_temp.pay((SELECT v FROM pc WHERE k='g399'))->'partner'->>'period_index')::int=1), 'then the 39900 link is period 1');
SELECT public.check_test((SELECT bound_organization_id=(SELECT v FROM pc WHERE k='orgG') FROM business_partner_codes WHERE code='GGGGGGGGGGGG'), 'and binds the code');
SELECT public.check_test((SELECT p.period_start=(SELECT period_end FROM business_subscription_periods WHERE order_id=(SELECT v FROM pc WHERE k='g799')) FROM business_subscription_periods p WHERE p.order_id=(SELECT v FROM pc WHERE k='g399')), 'no overlap: the code period follows the late ordinary one');

-- Two owners of one account: only one open link for the same personal-price period.
SET test.uid='00000000-0000-4000-8000-0000000000f1';
INSERT INTO pc SELECT 'orgF', (public.create_business_organization_with_location('F','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
INSERT INTO business_organization_members(organization_id,user_id,role,created_at) SELECT v,'00000000-0000-4000-8000-0000000000f2','owner',now()+interval '1 second' FROM pc WHERE k='orgF';
SELECT public.reserve_business_partner_code('FFFFFFFFFFFF');
INSERT INTO pc SELECT 'f1', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
SELECT pg_temp.pay(v) FROM pc WHERE k='f1';
UPDATE business_subscription_periods SET period_start=period_start-interval '400 days', period_end=period_end-interval '400 days'
WHERE order_id=(SELECT v FROM pc WHERE k='f1');
UPDATE access_paid_periods SET paid_until=clock_timestamp()-interval '1 day' WHERE user_id='00000000-0000-4000-8000-0000000000f1';
INSERT INTO pc SELECT 'f1b', order_id FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
SET test.uid='00000000-0000-4000-8000-0000000000f2';
SELECT public.check_test((public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=39900, 'second owner sees the account price');
DO $$ BEGIN
  BEGIN PERFORM * FROM public.create_business_subscription_order(gen_random_uuid(), 39900); RAISE EXCEPTION 'two open links for one personal period';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'partner_period_in_payment' THEN RAISE; END IF; END;
END; $$;
-- Venue-less account with an active discount: quote and checkout agree on the standard single payment.
UPDATE business_locations SET status='closed' WHERE organization_id=(SELECT v FROM pc WHERE k='orgF');
SELECT public.check_test((public.business_partner_quote_for_caller()->>'source')='entitlement' AND (public.business_partner_quote_for_caller()->>'unit_price_minor')::bigint=79900, 'no active venue: quote shows the standard single payment');
SELECT 'partner codes: PASS';

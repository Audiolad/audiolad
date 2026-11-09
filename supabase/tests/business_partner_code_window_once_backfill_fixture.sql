-- Throwaway local fixture only (scripts/business-partner-codes-isolated.py), applied BEFORE 20270304120000.
-- Old shape the backfill must reconcile: two owners of one account hold different codes with different ends.
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000002a1'), ('00000000-0000-4000-8000-0000000002a2');
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-0000000002a1'), ('00000000-0000-4000-8000-0000000002a2');
INSERT INTO business_partner_codes(code, purpose) VALUES ('MMMMMMMMMMMM','custdev'), ('MMMMMMMMMMM2','custdev');
SET test.uid='00000000-0000-4000-8000-0000000002a1';
CREATE TABLE public.zz_window_backfill(k text PRIMARY KEY, v uuid);
INSERT INTO public.zz_window_backfill SELECT 'org', (public.create_business_organization_with_location('M','Зал 1','cafe','RU','Europe/Moscow')->>'organization_id')::uuid;
INSERT INTO business_organization_members(organization_id,user_id,role,created_at)
  SELECT v,'00000000-0000-4000-8000-0000000002a2','owner',now()+interval '1 second' FROM public.zz_window_backfill WHERE k='org';
SELECT public.reserve_business_partner_code('MMMMMMMMMMMM');
SET test.uid='00000000-0000-4000-8000-0000000002a2';
SELECT public.reserve_business_partner_code('MMMMMMMMMMM2');
UPDATE business_partner_codes SET reserved_until=clock_timestamp()-interval '1 hour' WHERE code='MMMMMMMMMMMM';
UPDATE business_partner_codes SET reserved_until=clock_timestamp()+interval '20 hours' WHERE code='MMMMMMMMMMM2';

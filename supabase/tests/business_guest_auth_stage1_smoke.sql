BEGIN;

DO $$
DECLARE n text := repeat('a', 64);
BEGIN
  IF has_table_privilege('authenticated', 'public.business_guest_auth_tickets', 'INSERT')
    OR has_table_privilege('anon', 'public.business_guest_auth_tickets', 'SELECT')
    OR has_function_privilege('authenticated', 'public.consume_business_guest_auth_ticket(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ticket capability is public';
  END IF;
  INSERT INTO public.business_guest_auth_tickets(nonce_hash, expires_at)
  VALUES (n, statement_timestamp() + interval '2 minutes');
  IF NOT public.consume_business_guest_auth_ticket(n)
    OR public.consume_business_guest_auth_ticket(n) THEN
    RAISE EXCEPTION 'consume must succeed exactly once';
  END IF;
END $$;

-- Only the disposable compiler fixture lacks the Auth-owned anonymous column.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
INSERT INTO auth.users(id, email, is_anonymous, raw_user_meta_data)
VALUES ('253821e0-0000-4000-8000-000000000001', NULL, true, '{}');
SELECT set_config('request.jwt.claim.sub', '253821e0-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":true,"sub":"253821e0-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.is_business_anonymous_user() THEN RAISE EXCEPTION 'anonymous detection failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email IS NULL AND full_name IS NULL AND role = 'listener') THEN
    RAISE EXCEPTION 'nullable anonymous profile missing';
  END IF;
  BEGIN
    PERFORM public.create_business_organization_with_location('Test', 'Test', 'cafe', 'RU', 'UTC');
    RAISE EXCEPTION 'anonymous bootstrap bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_practices WHERE user_id = '253821e0-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.email_contacts WHERE user_id = '253821e0-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'anonymous signup side effects';
  END IF;
END $$;
-- A different identity gets no profile or organization membership from this guest.
INSERT INTO auth.users(id, email, is_anonymous, raw_user_meta_data)
VALUES ('253821e0-0000-4000-8000-000000000002', NULL, false, '{}');
SELECT set_config('request.jwt.claim.sub', '253821e0-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":false,"sub":"253821e0-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.is_business_anonymous_user() THEN RAISE EXCEPTION 'regular user marked anonymous'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '253821e0-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'foreign profile visible';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_organization_members WHERE user_id = '253821e0-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'foreign membership visible';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;

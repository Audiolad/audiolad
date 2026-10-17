-- Rollback for 20270108120000_business_guest_listening.sql (a8240527).
-- Drops only what that migration created. Guest meter data is disposable.
BEGIN;
DROP FUNCTION IF EXISTS public.business_guest_listening_peek(text, text);
DROP FUNCTION IF EXISTS public.business_guest_listening_report(text, text, integer);
DROP FUNCTION IF EXISTS public.business_guest_listening_issue(text, text, integer);
DROP FUNCTION IF EXISTS public.business_guest_listening_effective_(integer, integer);
DROP FUNCTION IF EXISTS public.business_guest_listening_lease_owed_(public.business_guest_listening);
DROP FUNCTION IF EXISTS public.business_guest_listening_charge_(text, text, integer);
DROP FUNCTION IF EXISTS public.business_guest_listening_lock_(text, text);
DROP TABLE IF EXISTS public.business_guest_listening_ip;
DROP TABLE IF EXISTS public.business_guest_listening;
COMMIT;

-- Rollback for 20270106120000_business_guest_listening.sql (a8240527).
-- Drops only what that migration created. Guest meter data is disposable.
BEGIN;
DROP FUNCTION IF EXISTS public.business_guest_listening_peek(text, text);
DROP FUNCTION IF EXISTS public.business_guest_listening_apply(text, text, integer);
DROP TABLE IF EXISTS public.business_guest_listening;
COMMIT;

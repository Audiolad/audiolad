-- Run after the security boundary commits and releases its metadata locks.
-- VALIDATE takes SHARE UPDATE EXCLUSIVE, allowing ordinary reads and writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '0';
ALTER TABLE public.practices
  VALIDATE CONSTRAINT practices_business_only_visibility_check;
COMMIT;

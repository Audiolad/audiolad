-- Isolated regression for request-bound author support authority.
-- Requires a disposable database. Do not run against production.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.author_support_session_allows(uuid)') IS NULL THEN
    RAISE EXCEPTION 'author_support_session_allows missing';
  END IF;
  IF to_regprocedure('public.set_author_support_session_proof(text)') IS NULL THEN
    RAISE EXCEPTION 'set_author_support_session_proof missing';
  END IF;
END
$$;

-- Without a GUC/header proof the helper must fail closed even if called.
SELECT
  CASE
    WHEN public.author_support_request_token_hash() IS NULL THEN true
    ELSE false
  END AS proof_missing_fail_closed;

ROLLBACK;

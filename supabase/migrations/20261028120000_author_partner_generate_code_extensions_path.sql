-- Fix production failure of ensure_author_partner_profile:
-- author_partner_generate_code called unqualified gen_random_bytes(5) with
-- search_path = public, pg_temp. On Audiolad production pgcrypto lives in
-- schema "extensions", so PostgREST returned HTTP 404 / SQLSTATE 42883
-- ("function gen_random_bytes(integer) does not exist") and no partner
-- profile was created.
--
-- Scope: code generation helper only. No commissions / ledger / payouts.

CREATE OR REPLACE FUNCTION public.author_partner_generate_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text;
  v_code text;
  v_attempt integer := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    -- Prefer schema-qualified call so generation works even if search_path
    -- is tightened again later.
    v_raw := encode(extensions.gen_random_bytes(5), 'hex');
    v_code := 'p' || v_raw;

    IF public.author_partner_code_format_ok(v_code)
      AND NOT public.author_partner_code_is_reserved(v_code)
      AND NOT EXISTS (
        SELECT 1
        FROM public.author_partner_code_claims AS c
        WHERE c.code_normalized = public.author_partner_normalize_code(v_code)
      )
    THEN
      RETURN v_code;
    END IF;

    IF v_attempt >= 24 THEN
      RAISE EXCEPTION 'author_partner_code_generate_exhausted'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.author_partner_generate_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.author_partner_generate_code() TO service_role;

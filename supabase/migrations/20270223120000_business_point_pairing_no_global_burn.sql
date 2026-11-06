-- Point pairing: stop burning every open code worldwide after 30 wrong attempts.
-- Keep the per-client (IP) limit. Retire open codes only for the venue whose
-- code hash was guessed (historical or current non-open match). Unmatched
-- guesses never burn another coffee shop's codes.
-- Additive: one nullable column on failures + REPLACE redeem. Not applied by
-- production-deploy.yml – apply by hand after a backup and Sergey's OK.

BEGIN;

ALTER TABLE public.business_point_pairing_failures
  ADD COLUMN IF NOT EXISTS location_id uuid NULL
    REFERENCES public.business_locations (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.business_point_pairing_failures.location_id IS
  'audiolad:business-point; set when the wrong code matches a pairing row for that venue (including retired/expired/consumed). Unmatched guesses stay NULL and never burn other venues.';

CREATE INDEX IF NOT EXISTS business_point_pairing_failures_location_idx
  ON public.business_point_pairing_failures (location_id, created_at)
  WHERE location_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.redeem_business_point_pairing(p_code text, p_client_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_client_window constant interval := interval '10 minutes';
  c_venue_window constant interval := interval '20 minutes'; -- equals code TTL
  c_client_limit constant integer := 5;
  c_venue_limit constant integer := 30;
  v_code text := btrim(coalesce(p_code, ''));
  v_key bytea := public.business_point_sha256('point-pairing:' || coalesce(nullif(btrim(p_client_key), ''), 'unknown'));
  v_now timestamptz := statement_timestamp();
  v_client_failures integer;
  v_venue_failures integer;
  v_oldest timestamptz;
  v_row public.business_point_pairings%ROWTYPE;
  v_token text;
  v_hash bytea;
  v_name text;
  v_guess_location uuid;
  v_burned boolean := false;
BEGIN
  -- One redeem at a time: counts and venue burns stay consistent. Traffic is tiny.
  PERFORM pg_advisory_xact_lock(hashtext('audiolad:business-point-redeem'));

  DELETE FROM public.business_point_pairing_failures
  WHERE created_at < v_now - interval '1 day';

  SELECT count(*), min(created_at) INTO v_client_failures, v_oldest
  FROM public.business_point_pairing_failures
  WHERE client_key = v_key AND created_at > v_now - c_client_window;

  IF v_client_failures >= c_client_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'too_many_attempts',
      'retry_after', greatest(1, ceil(extract(epoch FROM (v_oldest + c_client_window - v_now)))::integer)
    );
  END IF;

  IF v_code ~ '^[0-9]{4}$' THEN
    SELECT * INTO v_row
    FROM public.business_point_pairings
    WHERE code_hash = public.business_point_sha256(v_code)
      AND consumed_at IS NULL
      AND retired_at IS NULL
      AND expires_at > v_now
    FOR UPDATE;
  END IF;

  IF v_row.id IS NULL THEN
    v_guess_location := NULL;
    IF v_code ~ '^[0-9]{4}$' THEN
      SELECT p.location_id INTO v_guess_location
      FROM public.business_point_pairings AS p
      WHERE p.code_hash = public.business_point_sha256(v_code)
      ORDER BY p.created_at DESC
      LIMIT 1;
    END IF;

    INSERT INTO public.business_point_pairing_failures (client_key, created_at, location_id)
    VALUES (v_key, v_now, v_guess_location);

    IF v_guess_location IS NOT NULL THEN
      SELECT count(*) INTO v_venue_failures
      FROM public.business_point_pairing_failures
      WHERE location_id = v_guess_location
        AND created_at > v_now - c_venue_window;

      -- Too many guesses that hit this venue's code hashes: retire only that venue.
      IF v_venue_failures >= c_venue_limit THEN
        UPDATE public.business_point_pairings
        SET retired_at = v_now
        WHERE location_id = v_guess_location
          AND consumed_at IS NULL
          AND retired_at IS NULL;
        v_burned := true;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_point_code',
      'attempts_left', greatest(0, c_client_limit - v_client_failures - 1),
      'burned', v_burned
    );
  END IF;

  UPDATE public.business_point_pairings
  SET consumed_at = v_now
  WHERE id = v_row.id;

  UPDATE public.business_point_sessions
  SET revoked_at = v_now
  WHERE player_id = v_row.player_id AND revoked_at IS NULL;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash := public.business_point_sha256(v_token);

  INSERT INTO public.business_point_sessions (
    organization_id, location_id, player_id, token_hash, pairing_id, last_seen_at
  ) VALUES (
    v_row.organization_id, v_row.location_id, v_row.player_id, v_hash, v_row.id, v_now
  );

  SELECT l.name INTO v_name
  FROM public.business_locations AS l
  WHERE l.id = v_row.location_id;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_token,
    'location_name', coalesce(v_name, '')
  );
END;
$$;

COMMENT ON FUNCTION public.redeem_business_point_pairing(text, text) IS
  'audiolad:business-point; exchange a 4-digit code once. 5 wrong codes per client per 10 minutes; 30 wrong codes attributed to one venue per 20 minutes retire only that venue. No worldwide burn. Server-only.';

REVOKE ALL ON FUNCTION public.redeem_business_point_pairing(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_business_point_pairing(text, text) TO service_role;

DO $post$
BEGIN
  IF has_function_privilege('anon', 'public.redeem_business_point_pairing(text, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.redeem_business_point_pairing(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: redeem must be server-only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_point_pairing_failures' AND column_name = 'location_id'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: failures.location_id missing';
  END IF;
END
$post$;

COMMIT;

-- Rollback after a backup and a separate decision. Roll the app back first if it
-- depends on location_id on failures (it does not today). Restores the worldwide
-- burn behaviour from 20270208120000. Do not run with the forward migration.
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.redeem_business_point_pairing(p_code text, p_client_key text)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- DECLARE
--   c_client_window constant interval := interval '10 minutes';
--   -- Equals the code TTL: a code sees fewer than c_global_limit wrong codes in its whole life.
--   c_global_window constant interval := interval '20 minutes';
--   c_client_limit constant integer := 5;
--   c_global_limit constant integer := 30;
--   v_code text := btrim(coalesce(p_code, ''));
--   v_key bytea := public.business_point_sha256('point-pairing:' || coalesce(nullif(btrim(p_client_key), ''), 'unknown'));
--   v_now timestamptz := statement_timestamp();
--   v_client_failures integer;
--   v_global_failures integer;
--   v_oldest timestamptz;
--   v_row public.business_point_pairings%ROWTYPE;
--   v_token text;
--   v_hash bytea;
--   v_name text;
-- BEGIN
--   -- One redeem at a time: counts and burns stay consistent. Traffic is tiny.
--   PERFORM pg_advisory_xact_lock(hashtext('audiolad:business-point-redeem'));
-- 
--   DELETE FROM public.business_point_pairing_failures
--   WHERE created_at < v_now - interval '1 day';
-- 
--   SELECT count(*), min(created_at) INTO v_client_failures, v_oldest
--   FROM public.business_point_pairing_failures
--   WHERE client_key = v_key AND created_at > v_now - c_client_window;
-- 
--   IF v_client_failures >= c_client_limit THEN
--     RETURN jsonb_build_object(
--       'ok', false,
--       'reason', 'too_many_attempts',
--       'retry_after', greatest(1, ceil(extract(epoch FROM (v_oldest + c_client_window - v_now)))::integer)
--     );
--   END IF;
-- 
--   IF v_code ~ '^[0-9]{4}$' THEN
--     SELECT * INTO v_row
--     FROM public.business_point_pairings
--     WHERE code_hash = public.business_point_sha256(v_code)
--       AND consumed_at IS NULL
--       AND retired_at IS NULL
--       AND expires_at > v_now
--     FOR UPDATE;
--   END IF;
-- 
--   IF v_row.id IS NULL THEN
--     INSERT INTO public.business_point_pairing_failures (client_key, created_at)
--     VALUES (v_key, v_now);
-- 
--     SELECT count(*) INTO v_global_failures
--     FROM public.business_point_pairing_failures
--     WHERE created_at > v_now - c_global_window;
-- 
--     -- Many wrong codes from anywhere: burn every open code. Owners ask for a new one.
--     IF v_global_failures >= c_global_limit THEN
--       UPDATE public.business_point_pairings
--       SET retired_at = v_now
--       WHERE consumed_at IS NULL AND retired_at IS NULL;
--     END IF;
-- 
--     RETURN jsonb_build_object(
--       'ok', false,
--       'reason', 'invalid_point_code',
--       'attempts_left', greatest(0, c_client_limit - v_client_failures - 1),
--       'burned', v_global_failures >= c_global_limit
--     );
--   END IF;
-- 
--   UPDATE public.business_point_pairings
--   SET consumed_at = v_now
--   WHERE id = v_row.id;
-- 
--   UPDATE public.business_point_sessions
--   SET revoked_at = v_now
--   WHERE player_id = v_row.player_id AND revoked_at IS NULL;
-- 
--   v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
--   v_hash := public.business_point_sha256(v_token);
-- 
--   INSERT INTO public.business_point_sessions (
--     organization_id, location_id, player_id, token_hash, pairing_id, last_seen_at
--   ) VALUES (
--     v_row.organization_id, v_row.location_id, v_row.player_id, v_hash, v_row.id, v_now
--   );
-- 
--   SELECT l.name INTO v_name
--   FROM public.business_locations AS l
--   WHERE l.id = v_row.location_id;
-- 
--   RETURN jsonb_build_object(
--     'ok', true,
--     'token', v_token,
--     'location_name', coalesce(v_name, '')
--   );
-- END;
-- $$;
-- 
-- COMMENT ON FUNCTION public.redeem_business_point_pairing(text, text) IS
--   'audiolad:business-point; exchange a 4-digit code once. 5 wrong codes per client per 10 minutes; 30 wrong codes worldwide per 20 minutes (the code TTL) burn all open codes. Server-only.';
-- 
-- REVOKE ALL ON FUNCTION public.redeem_business_point_pairing(text, text) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.redeem_business_point_pairing(text, text) TO service_role;
-- Optional: DROP INDEX IF EXISTS business_point_pairing_failures_location_idx;
-- ALTER TABLE public.business_point_pairing_failures DROP COLUMN IF EXISTS location_id;
-- COMMIT;

-- Point pairing: 4-digit codes with attempt limits.
-- Mostly additive: one new column, one new table, one new function.
-- One relaxed constraint: code_hash was UNIQUE over all rows. Four digits give
-- only 10 000 codes, so uniqueness now covers open codes only (partial index).
-- Old 10-character codes are not migrated. The new redeem function accepts
-- only 4 digits, so a code issued before this release stops working at once
-- (it would expire within 10 minutes anyway). New codes live 20 minutes.

BEGIN;

ALTER TABLE public.business_point_pairings
  ADD COLUMN IF NOT EXISTS retired_at timestamptz NULL;

COMMENT ON COLUMN public.business_point_pairings.retired_at IS
  'audiolad:business-point; closed without use: replaced by a newer code, expired and reused, or burned by the attempt limit.';

ALTER TABLE public.business_point_pairings
  DROP CONSTRAINT IF EXISTS business_point_pairings_code_hash_unique;

-- One open row per code. Expired open rows are retired before a code is reused.
CREATE UNIQUE INDEX IF NOT EXISTS business_point_pairings_open_code_uidx
  ON public.business_point_pairings (code_hash)
  WHERE consumed_at IS NULL AND retired_at IS NULL;

CREATE INDEX IF NOT EXISTS business_point_pairings_location_created_idx
  ON public.business_point_pairings (location_id, created_at);

CREATE TABLE IF NOT EXISTS public.business_point_pairing_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_key bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_point_pairing_failures_client_key_len_check
    CHECK (octet_length(client_key) = 32)
);

COMMENT ON TABLE public.business_point_pairing_failures IS
  'audiolad:business-point; wrong pairing attempts. Only SHA-256 of the client key is stored; rows older than one day are deleted.';

CREATE INDEX IF NOT EXISTS business_point_pairing_failures_client_idx
  ON public.business_point_pairing_failures (client_key, created_at);
CREATE INDEX IF NOT EXISTS business_point_pairing_failures_created_idx
  ON public.business_point_pairing_failures (created_at);

ALTER TABLE public.business_point_pairing_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_point_pairing_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_point_pairing_failures TO service_role;

-- 0000-9999 from 4 bytes of gen_random_uuid() (CSPRNG; bytes 0-3 of v4 are random).
-- Modulo bias is 2^32 mod 10000 / 2^32, below 0.0002 %.
CREATE OR REPLACE FUNCTION public.business_point_random_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT lpad(
    ((('x' || encode(substr(uuid_send(gen_random_uuid()), 1, 4), 'hex'))::bit(32)::bigint) % 10000)::text,
    4,
    '0'
  );
$$;

REVOKE ALL ON FUNCTION public.business_point_random_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_business_point_pairing(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_zone uuid;
  v_player uuid;
  v_recent integer;
  v_code text;
  v_hash bytea;
  v_id uuid;
  v_try integer := 0;
  v_expires timestamptz := statement_timestamp() + interval '20 minutes'; -- code TTL
  v_created jsonb;
  v_assigned jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id AND l.status = 'active';

  IF v_org IS NULL OR NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  SELECT z.id INTO v_zone
  FROM public.business_zones AS z
  WHERE z.location_id = p_location_id AND z.status = 'active'
  ORDER BY z.is_default DESC, z.created_at
  LIMIT 1;

  IF v_zone IS NULL THEN
    RAISE EXCEPTION 'zone_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.id INTO v_player
  FROM public.business_players AS p
  JOIN public.business_player_assignments AS a
    ON a.player_id = p.id AND a.unassigned_at IS NULL AND a.zone_id = v_zone
  WHERE p.organization_id = v_org AND p.status = 'active'
  ORDER BY a.assigned_at DESC
  LIMIT 1;

  IF v_player IS NULL THEN
    v_created := public.create_business_player(v_org, 'Устройство в зале');
    v_player := (v_created->>'player_id')::uuid;
    IF v_player IS NULL THEN
      RAISE EXCEPTION 'player_not_created' USING ERRCODE = 'P0001';
    END IF;
    v_assigned := public.assign_business_player_to_zone(v_player, v_zone);
    IF coalesce(v_assigned->>'ok', '') <> 'true' THEN
      RAISE EXCEPTION 'player_not_assigned' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Owner side limit: at most 10 new codes per кофейня in 10 minutes.
  SELECT count(*) INTO v_recent
  FROM public.business_point_pairings
  WHERE location_id = p_location_id
    AND created_at > statement_timestamp() - interval '10 minutes';

  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'too_many_open_codes' USING ERRCODE = '22023';
  END IF;

  -- Only the newest code of a кофейня stays open: fewer live codes, smaller guess target.
  UPDATE public.business_point_pairings
  SET retired_at = statement_timestamp()
  WHERE location_id = p_location_id
    AND consumed_at IS NULL
    AND retired_at IS NULL;

  -- Unique among open codes worldwide: the device sends only the code.
  LOOP
    v_try := v_try + 1;
    IF v_try > 25 THEN
      RAISE EXCEPTION 'code_space_busy' USING ERRCODE = 'P0001';
    END IF;

    v_code := public.business_point_random_code();
    v_hash := public.business_point_sha256(v_code);

    -- An expired open row with this code is closed so the code can be reused.
    UPDATE public.business_point_pairings
    SET retired_at = statement_timestamp()
    WHERE code_hash = v_hash
      AND consumed_at IS NULL
      AND retired_at IS NULL
      AND expires_at <= statement_timestamp();

    INSERT INTO public.business_point_pairings (
      organization_id, location_id, zone_id, player_id, code_hash, expires_at, created_by
    ) VALUES (
      v_org, p_location_id, v_zone, v_player, v_hash, v_expires, v_user_id
    )
    ON CONFLICT (code_hash) WHERE consumed_at IS NULL AND retired_at IS NULL DO NOTHING
    RETURNING id INTO v_id;

    EXIT WHEN v_id IS NOT NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_code,
    'expires_at', v_expires
  );
END;
$$;

COMMENT ON FUNCTION public.create_business_point_pairing(uuid) IS
  'audiolad:business-point; owner-only one-time 4-digit code, unique among open codes. Plaintext is returned once and not stored.';

REVOKE ALL ON FUNCTION public.create_business_point_pairing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_point_pairing(uuid) TO authenticated, service_role;

-- Redeem with attempt limits. Called only by the server route with service_role,
-- which passes the client IP. Never raises on a wrong code: failures must be kept.
CREATE OR REPLACE FUNCTION public.redeem_business_point_pairing(p_code text, p_client_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_client_window constant interval := interval '10 minutes';
  -- Equals the code TTL: a code sees fewer than c_global_limit wrong codes in its whole life.
  c_global_window constant interval := interval '20 minutes';
  c_client_limit constant integer := 5;
  c_global_limit constant integer := 30;
  v_code text := btrim(coalesce(p_code, ''));
  v_key bytea := public.business_point_sha256('point-pairing:' || coalesce(nullif(btrim(p_client_key), ''), 'unknown'));
  v_now timestamptz := statement_timestamp();
  v_client_failures integer;
  v_global_failures integer;
  v_oldest timestamptz;
  v_row public.business_point_pairings%ROWTYPE;
  v_token text;
  v_hash bytea;
  v_name text;
BEGIN
  -- One redeem at a time: counts and burns stay consistent. Traffic is tiny.
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
    INSERT INTO public.business_point_pairing_failures (client_key, created_at)
    VALUES (v_key, v_now);

    SELECT count(*) INTO v_global_failures
    FROM public.business_point_pairing_failures
    WHERE created_at > v_now - c_global_window;

    -- Many wrong codes from anywhere: burn every open code. Owners ask for a new one.
    IF v_global_failures >= c_global_limit THEN
      UPDATE public.business_point_pairings
      SET retired_at = v_now
      WHERE consumed_at IS NULL AND retired_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_point_code',
      'attempts_left', greatest(0, c_client_limit - v_client_failures - 1)
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
  'audiolad:business-point; exchange a 4-digit code once. 5 wrong codes per client per 10 minutes; 30 wrong codes worldwide per 20 minutes (the code TTL) burn all open codes. Server-only.';

REVOKE ALL ON FUNCTION public.redeem_business_point_pairing(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_business_point_pairing(text, text) TO service_role;

-- The old public consume had no attempt limit. It stays for rollback but is server-only now.
REVOKE EXECUTE ON FUNCTION public.consume_business_point_pairing(text) FROM PUBLIC, anon, authenticated;

DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'business_point_pairing_failures' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Post-check failed: failures table needs RLS';
  END IF;

  IF has_table_privilege('anon', 'public.business_point_pairing_failures', 'SELECT')
    OR has_table_privilege('authenticated', 'public.business_point_pairing_failures', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: failures table must not be readable';
  END IF;

  IF has_function_privilege('anon', 'public.redeem_business_point_pairing(text, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.redeem_business_point_pairing(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: redeem must be server-only';
  END IF;

  IF has_function_privilege('anon', 'public.consume_business_point_pairing(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: old consume must not stay public';
  END IF;
END
$post$;

COMMIT;

-- Rollback after a backup and a separate decision (also roll the app back first,
-- because the new app calls redeem_business_point_pairing):
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.consume_business_point_pairing(text) TO anon, authenticated, service_role;
-- DROP FUNCTION IF EXISTS public.redeem_business_point_pairing(text, text);
-- Re-run create_business_point_pairing from 20270206120000 (10-character codes).
-- DROP FUNCTION IF EXISTS public.business_point_random_code();
-- DROP TABLE IF EXISTS public.business_point_pairing_failures;
-- UPDATE public.business_point_pairings SET retired_at = coalesce(retired_at, now()) WHERE consumed_at IS NULL;
-- DROP INDEX IF EXISTS public.business_point_pairings_open_code_uidx;
-- Old UNIQUE (code_hash) cannot come back while used 4-digit hashes repeat; keep the partial index instead, or delete closed 4-digit rows not referenced by sessions first.
-- COMMIT;

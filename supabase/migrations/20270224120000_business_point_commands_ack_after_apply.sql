-- P1-7: taking a command is not proof of applying it. Prepared only; do not apply to prod.
-- One outstanding command per location, 30s lease, per-attempt fencing UUID (tabs share cookies).
BEGIN;

ALTER TABLE public.business_point_commands
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN claimed_by uuid REFERENCES public.business_point_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN claim_id uuid;

-- Owners enqueue through the checked SECURITY DEFINER RPC, never insert forged acknowledgements.
REVOKE INSERT ON TABLE public.business_point_commands FROM authenticated;
-- Remove the old acknowledgement bypass and the old result shape.
DROP FUNCTION public.ack_business_point_command(text, uuid, text);
DROP FUNCTION public.claim_business_point_commands(text);

CREATE OR REPLACE FUNCTION public.list_business_point_commands(p_token text)
RETURNS TABLE (id uuid, type text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location uuid;
BEGIN
  IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;
  SELECT s.location_id INTO v_location
  FROM public.business_point_sessions AS s
  WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
    AND s.revoked_at IS NULL;
  IF v_location IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT c.id, c.type, c.created_at
  FROM public.business_point_commands AS c
  WHERE c.location_id = v_location
    AND c.acked_at IS NULL
    AND (c.claimed_at IS NULL OR c.claimed_at <= statement_timestamp() - interval '30 seconds')
    AND c.expires_at > statement_timestamp()
  ORDER BY c.created_at, c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_business_point_commands(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_business_point_commands(text) TO anon, authenticated, service_role;

CREATE FUNCTION public.claim_business_point_commands(p_token text)
RETURNS TABLE (id uuid, type text, created_at timestamptz, claim_id uuid, claim_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location uuid;
  v_session uuid;
BEGIN
  IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;
  SELECT s.location_id, s.id INTO v_location, v_session
  FROM public.business_point_sessions AS s
  WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
    AND s.revoked_at IS NULL;
  IF v_location IS NULL THEN
    RETURN;
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_location::text, 0)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT c.id
    FROM public.business_point_commands AS c
    WHERE c.location_id = v_location
      AND c.acked_at IS NULL
      AND c.expires_at > statement_timestamp()
    ORDER BY c.created_at, c.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.business_point_commands AS c
  SET claimed_at = statement_timestamp(), claimed_by = v_session, claim_id = gen_random_uuid()
  FROM due
  WHERE c.id = due.id
    AND c.acked_at IS NULL
    AND (c.claimed_at IS NULL OR c.claimed_at <= statement_timestamp() - interval '30 seconds')
  RETURNING c.id, c.type, c.created_at, c.claim_id, c.claimed_at + interval '30 seconds';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_business_point_commands(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_business_point_commands(text) TO anon, authenticated, service_role;

CREATE FUNCTION public.ack_business_point_command(
  p_token text,
  p_command_id uuid,
  p_result text,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location uuid;
  v_session uuid;
  v_row public.business_point_commands%ROWTYPE;
BEGIN
  IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' OR p_claim_id IS NULL OR p_command_id IS NULL OR p_result IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;
  SELECT s.location_id, s.id INTO v_location, v_session
  FROM public.business_point_sessions AS s
  WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
    AND s.revoked_at IS NULL;
  IF v_location IS NULL THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.business_point_commands
  WHERE id = p_command_id
  FOR UPDATE;
  IF NOT FOUND OR v_row.location_id IS DISTINCT FROM v_location THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;
  IF v_row.claimed_by IS DISTINCT FROM v_session OR v_row.claim_id IS DISTINCT FROM p_claim_id THEN
    RAISE EXCEPTION 'point_command_claim_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_row.acked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'point_command_expired' USING ERRCODE = '22023';
  END IF;

  IF v_row.claimed_at IS NULL OR v_row.claimed_at <= statement_timestamp() - interval '30 seconds' THEN
    RAISE EXCEPTION 'point_command_claim_expired' USING ERRCODE = '22023';
  END IF;

  UPDATE public.business_point_commands
  SET acked_at = statement_timestamp(), ack_result = 'applied'
  WHERE id = p_command_id AND acked_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.ack_business_point_command(text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_business_point_command(text, uuid, text, uuid) TO anon, authenticated, service_role;

COMMIT;

-- Rollback: stop command polling / roll back the client first. Restores the previous
-- claim-at-ack behavior (including its known bug); leaves all command rows intact.
-- BEGIN;
-- DROP FUNCTION public.ack_business_point_command(text, uuid, text, uuid);
-- DROP FUNCTION public.claim_business_point_commands(text);
-- CREATE OR REPLACE FUNCTION public.list_business_point_commands(p_token text)
-- RETURNS TABLE (id uuid, type text, created_at timestamptz)
-- LANGUAGE plpgsql
-- STABLE
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- DECLARE
--   v_location uuid;
-- BEGIN
--   IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' THEN
--     RETURN;
--   END IF;
--   SELECT s.location_id INTO v_location
--   FROM public.business_point_sessions AS s
--   WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
--     AND s.revoked_at IS NULL;
--   IF v_location IS NULL THEN
--     RETURN;
--   END IF;
--   RETURN QUERY
--   SELECT c.id, c.type, c.created_at
--   FROM public.business_point_commands AS c
--   WHERE c.location_id = v_location
--     AND c.acked_at IS NULL
--     AND c.expires_at > statement_timestamp()
--   ORDER BY c.created_at, c.id;
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION public.list_business_point_commands(text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.list_business_point_commands(text) TO anon, authenticated, service_role;
--
-- -- Marks due commands as taken and returns only the rows this call took.
-- -- A second poll or a second tab with the same cookie gets nothing for those rows.
-- CREATE OR REPLACE FUNCTION public.claim_business_point_commands(p_token text)
-- RETURNS TABLE (id uuid, type text, created_at timestamptz)
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- DECLARE
--   v_location uuid;
-- BEGIN
--   IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' THEN
--     RETURN;
--   END IF;
--   SELECT s.location_id INTO v_location
--   FROM public.business_point_sessions AS s
--   WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
--     AND s.revoked_at IS NULL;
--   IF v_location IS NULL THEN
--     RETURN;
--   END IF;
--
--   RETURN QUERY
--   WITH due AS (
--     SELECT c.id
--     FROM public.business_point_commands AS c
--     WHERE c.location_id = v_location
--       AND c.acked_at IS NULL
--       AND c.expires_at > statement_timestamp()
--     ORDER BY c.created_at, c.id
--     FOR UPDATE SKIP LOCKED
--   )
--   UPDATE public.business_point_commands AS c
--   SET acked_at = statement_timestamp(), ack_result = 'applied'
--   FROM due
--   WHERE c.id = due.id
--     AND c.acked_at IS NULL
--   RETURNING c.id, c.type, c.created_at;
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION public.claim_business_point_commands(text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.claim_business_point_commands(text) TO anon, authenticated, service_role;
--
-- CREATE OR REPLACE FUNCTION public.ack_business_point_command(
--   p_token text,
--   p_command_id uuid,
--   p_result text
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- DECLARE
--   v_location uuid;
--   v_row public.business_point_commands%ROWTYPE;
-- BEGIN
--   IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' OR p_command_id IS NULL OR p_result IS DISTINCT FROM 'applied' THEN
--     RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
--   END IF;
--   SELECT s.location_id INTO v_location
--   FROM public.business_point_sessions AS s
--   WHERE s.token_hash = public.business_point_sha256(btrim(p_token))
--     AND s.revoked_at IS NULL;
--   IF v_location IS NULL THEN
--     RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
--   END IF;
--
--   SELECT * INTO v_row
--   FROM public.business_point_commands
--   WHERE id = p_command_id
--   FOR UPDATE;
--   IF NOT FOUND OR v_row.location_id IS DISTINCT FROM v_location THEN
--     RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
--   END IF;
--   IF v_row.acked_at IS NOT NULL THEN
--     RETURN jsonb_build_object('ok', true, 'already', true);
--   END IF;
--   IF v_row.expires_at <= statement_timestamp() THEN
--     RAISE EXCEPTION 'point_command_expired' USING ERRCODE = '22023';
--   END IF;
--
--   UPDATE public.business_point_commands
--   SET acked_at = statement_timestamp(), ack_result = 'applied'
--   WHERE id = p_command_id AND acked_at IS NULL;
--
--   RETURN jsonb_build_object('ok', true, 'already', false);
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION public.ack_business_point_command(text, uuid, text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.ack_business_point_command(text, uuid, text) TO anon, authenticated, service_role;
--
-- GRANT INSERT ON TABLE public.business_point_commands TO authenticated;
-- ALTER TABLE public.business_point_commands DROP COLUMN claim_id, DROP COLUMN claimed_by, DROP COLUMN claimed_at;
-- COMMIT;

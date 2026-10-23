-- Forward-only replacement of business_player_live_claim.
-- The first write for a player and the fresh-session check are one statement.
-- Signature, security, grants and later claims stay the same.
-- Applying this migration is a separate decision.
BEGIN;

CREATE OR REPLACE FUNCTION public.business_player_live_claim(p_player_id uuid, p_device_secret text, p_now timestamptz)
RETURNS TABLE (organization_id uuid, location_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_player uuid; v_org uuid; v_location uuid; v_hash bytea; v_row public.business_player_device_heartbeat%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_device_secret IS NULL OR char_length(p_device_secret) NOT BETWEEN 32 AND 128 THEN
    RAISE EXCEPTION 'invalid_device_session' USING ERRCODE = '22023';
  END IF;
  SELECT sp.player_id, sp.organization_id, sp.location_id INTO v_player, v_org, v_location
  FROM public.business_spa_session_player(p_now) sp;
  IF v_player IS NULL OR v_player IS DISTINCT FROM p_player_id THEN
    RAISE EXCEPTION 'no_access' USING ERRCODE = '42501';
  END IF;
  v_hash := sha256(convert_to(p_device_secret, 'UTF8'));
  SELECT * INTO v_row FROM public.business_player_device_heartbeat h WHERE h.player_id = p_player_id FOR UPDATE;
  IF FOUND AND v_row.device_session_hash <> v_hash AND v_row.last_seen_at > p_now - interval '5 minutes' THEN
    RAISE EXCEPTION 'device_session_conflict' USING ERRCODE = '42501';
  END IF;
  -- Accept the write only when no row exists, the secret matches, or the session is no longer fresh.
  INSERT INTO public.business_player_device_heartbeat AS h (player_id, organization_id, device_session_hash, claimed_at, last_seen_at)
  VALUES (p_player_id, v_org, v_hash, p_now, p_now)
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    claimed_at = CASE WHEN h.device_session_hash = EXCLUDED.device_session_hash THEN h.claimed_at ELSE EXCLUDED.claimed_at END,
    device_session_hash = EXCLUDED.device_session_hash,
    last_seen_at = EXCLUDED.last_seen_at
  WHERE h.device_session_hash = EXCLUDED.device_session_hash
     OR h.last_seen_at <= p_now - interval '5 minutes';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'device_session_conflict' USING ERRCODE = '42501';
  END IF;
  organization_id := v_org; location_id := v_location;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.business_player_live_claim(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

COMMIT;

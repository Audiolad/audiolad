-- NOT APPLIED. Applying after backup is Sergey's Human Gate.
-- Rollback: flag off, disable anonymous Auth. Never DROP guest rows or restore
-- email_hash NOT NULL over guests. access_paid_periods remains unchanged.
-- SQL audit: resolve_access_grant is copied from its latest definition in
-- 20270120120000 with only a NULL-principal early return. insert_access_grant
-- delegates to it unchanged; SQL email comparisons cannot match NULL hashes.
-- Subscription settlement in 20270205130000 uses the resolver and retains
-- email requirements. No other SQL identity closure writes nullable edges.
BEGIN;

ALTER TABLE public.access_grants ALTER COLUMN email_hash DROP NOT NULL;
ALTER TABLE public.access_grants DROP CONSTRAINT IF EXISTS access_grants_email_hash_check;
ALTER TABLE public.access_grants ADD CONSTRAINT access_grants_email_hash_check
  CHECK (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.resolve_access_grant(
  p_email_hash text, p_user_id uuid, p_kind text
) RETURNS SETOF public.access_grants
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('access_grants:' || p_kind, 0));
  -- NULL hashes are isolated principals, never email identity edges.
  IF p_email_hash IS NULL THEN
    RETURN QUERY SELECT g.* FROM public.access_grants g
      WHERE g.user_id = p_user_id AND g.kind = p_kind
      ORDER BY g.starts_at, g.ends_at LIMIT 1;
    RETURN;
  END IF;
  INSERT INTO public.access_grant_identities (email_hash, user_id, kind)
    VALUES (p_email_hash, p_user_id, p_kind) ON CONFLICT DO NOTHING;
  RETURN QUERY
    WITH RECURSIVE edges AS (
      SELECT i.email_hash, i.user_id FROM public.access_grant_identities i WHERE i.kind = p_kind
      UNION
      SELECT g.email_hash, g.user_id FROM public.access_grants g WHERE g.kind = p_kind
    ), identities (identity) AS (
      SELECT 'email:' || p_email_hash
      UNION
      SELECT CASE WHEN n.identity = 'email:' || e.email_hash
        THEN 'user:' || e.user_id::text ELSE 'email:' || e.email_hash END
      FROM identities n JOIN edges e
        ON n.identity = 'email:' || e.email_hash OR n.identity = 'user:' || e.user_id::text
    )
    SELECT g.* FROM public.access_grants g
    WHERE g.kind = p_kind AND (
      'email:' || g.email_hash IN (SELECT identity FROM identities)
      OR 'user:' || g.user_id::text IN (SELECT identity FROM identities)
    )
    ORDER BY g.starts_at, g.ends_at, g.email_hash LIMIT 1;
END;
$$;


CREATE TABLE IF NOT EXISTS public.business_guest_start_network_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network_hash text NOT NULL CHECK (network_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours'
);
CREATE INDEX IF NOT EXISTS business_guest_start_network_hits_network_created_idx
  ON public.business_guest_start_network_hits(network_hash, created_at);
CREATE INDEX IF NOT EXISTS business_guest_start_network_hits_expires_idx
  ON public.business_guest_start_network_hits(expires_at);
CREATE TABLE IF NOT EXISTS public.business_guest_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_hash text UNIQUE NOT NULL CHECK (idempotency_hash ~ '^[0-9a-f]{64}$'),
  network_hash text CHECK (network_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  organization_id uuid,
  location_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_guest_starts_network_retention_idx
  ON public.business_guest_starts(created_at) WHERE network_hash IS NOT NULL;
ALTER TABLE public.business_guest_start_network_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_guest_starts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_guest_start_network_hits, public.business_guest_starts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_guest_start_network_hits, public.business_guest_starts TO service_role;
REVOKE ALL ON SEQUENCE public.business_guest_start_network_hits_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.business_guest_start_network_hits_id_seq TO service_role;

-- 48 h retention of network identifiers, independent of traffic: called by the
-- hourly audiolad-business-guest-start-purge timer and (bounded) by reserve.
-- Batched to keep locks short. Idempotency rests on idempotency_hash/user_id.
CREATE OR REPLACE FUNCTION public.business_guest_start_purge(p_batch int DEFAULT 5000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_hits int; v_starts int;
BEGIN
  IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 50000 THEN
    RAISE EXCEPTION 'invalid_guest_start_input' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.business_guest_start_network_hits
    WHERE id IN (SELECT id FROM public.business_guest_start_network_hits
                  WHERE expires_at <= now() ORDER BY expires_at LIMIT p_batch FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_hits = ROW_COUNT;
  UPDATE public.business_guest_starts SET network_hash = NULL
    WHERE id IN (SELECT id FROM public.business_guest_starts
                  WHERE network_hash IS NOT NULL AND created_at <= now() - interval '48 hours'
                  ORDER BY created_at LIMIT p_batch FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_starts = ROW_COUNT;
  RETURN jsonb_build_object('hits_deleted', v_hits, 'starts_cleared', v_starts);
END;
$$;
REVOKE ALL ON FUNCTION public.business_guest_start_purge(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_guest_start_purge(int) TO service_role;

CREATE OR REPLACE FUNCTION public.business_guest_start_reserve(p_network_hash text, p_limit int, p_window_seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_hits bigint;
BEGIN
  IF p_network_hash IS NULL OR p_network_hash !~ '^[0-9a-f]{64}$'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000
    OR p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 60 AND 172800 THEN
    RAISE EXCEPTION 'invalid_guest_start_input' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('business_guest_start:' || p_network_hash));
  DELETE FROM public.business_guest_start_network_hits WHERE network_hash = p_network_hash AND expires_at <= now();
  -- Small bounded share of the global 48 h retention; the hourly timer runs the rest regardless of traffic.
  PERFORM public.business_guest_start_purge(200);
  SELECT count(*) INTO v_hits FROM public.business_guest_start_network_hits
    WHERE network_hash = p_network_hash AND created_at > now() - make_interval(secs => p_window_seconds);
  IF v_hits >= p_limit THEN RETURN false; END IF;
  INSERT INTO public.business_guest_start_network_hits(network_hash) VALUES (p_network_hash);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.business_guest_start_reserve(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_guest_start_reserve(text, int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.business_guest_bootstrap(
  p_user_id uuid, p_idempotency_hash text, p_network_hash text, p_gift_seconds int, p_venue_name text
) RETURNS TABLE(organization_id uuid, location_id uuid, grant_ends_at timestamptz, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_start public.business_guest_starts%ROWTYPE;
  v_org uuid;
  v_loc uuid;
  v_name text := coalesce(nullif(btrim(p_venue_name), ''), 'Моя кофейня');
  v_ends timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id
    AND coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_gift_seconds IS NULL OR p_gift_seconds NOT BETWEEN 86400 AND 2592000
    OR p_idempotency_hash IS NULL OR p_idempotency_hash !~ '^[0-9a-f]{64}$'
    OR p_network_hash IS NULL OR p_network_hash !~ '^[0-9a-f]{64}$'
    OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_guest_start_input' USING ERRCODE = '22023';
  END IF;
  -- Consistent lock order protects both the key and concurrent retries for a user.
  PERFORM pg_advisory_xact_lock(hashtextextended('business_guest_key:' || p_idempotency_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('business_guest_user:' || p_user_id::text, 0));
  SELECT s.* INTO v_start FROM public.business_guest_starts s WHERE s.idempotency_hash = p_idempotency_hash;
  IF FOUND AND v_start.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'guest_start_conflict' USING ERRCODE = '42501';
  END IF;
  SELECT s.* INTO v_start FROM public.business_guest_starts s
    WHERE s.user_id = p_user_id AND s.status = 'ready';
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.business_organization_members m
      WHERE m.user_id = p_user_id AND m.organization_id <> v_start.organization_id) THEN
      RAISE EXCEPTION 'guest_already_member' USING ERRCODE = '42501';
    END IF;
    SELECT g.ends_at INTO v_ends FROM public.access_grants g
      WHERE g.user_id = p_user_id AND g.kind = 'business_new_client';
    RETURN QUERY SELECT v_start.organization_id, v_start.location_id, v_ends, false;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_organization_members m WHERE m.user_id = p_user_id) THEN
    RAISE EXCEPTION 'guest_already_member' USING ERRCODE = '42501';
  END IF;

  -- Same inserts/defaults as stage 1 create_business_organization_with_location.
  -- Missing country/timezone use the onboarding wizard defaults RU/Europe/Moscow.
  INSERT INTO public.business_organizations(name, status, created_by)
    VALUES (v_name, 'active', p_user_id) RETURNING id INTO v_org;
  INSERT INTO public.business_organization_members(organization_id, user_id, role)
    VALUES (v_org, p_user_id, 'owner');
  INSERT INTO public.business_locations(organization_id, name, business_category, country_code, timezone, status)
    VALUES (v_org, v_name, 'cafe', 'RU', 'Europe/Moscow', 'active') RETURNING id INTO v_loc;
  INSERT INTO public.business_zones(location_id, name, is_default, status)
    VALUES (v_loc, NULL, true, 'active');
  PERFORM public.business_ensure_location_rights_context(v_loc);

  -- Serialize with legacy issuance too. Existing windows are immutable.
  PERFORM pg_advisory_xact_lock(hashtextextended('access_grants:business_new_client', 0));
  INSERT INTO public.access_grants(email_hash, user_id, kind, source, starts_at, ends_at)
    VALUES (NULL, p_user_id, 'business_new_client', 'trial', now(), now() + make_interval(secs => p_gift_seconds))
    ON CONFLICT DO NOTHING;
  SELECT g.ends_at INTO v_ends FROM public.access_grants g
    WHERE g.user_id = p_user_id AND g.kind = 'business_new_client';
  INSERT INTO public.business_guest_starts AS s(idempotency_hash, network_hash, user_id, status, organization_id, location_id)
    VALUES (p_idempotency_hash, p_network_hash, p_user_id, 'ready', v_org, v_loc)
    ON CONFLICT (idempotency_hash) DO UPDATE SET
      status = 'ready', organization_id = EXCLUDED.organization_id,
      location_id = EXCLUDED.location_id, updated_at = now();
  RETURN QUERY SELECT v_org, v_loc, v_ends, true;
END;
$$;
REVOKE ALL ON FUNCTION public.business_guest_bootstrap(uuid, text, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_guest_bootstrap(uuid, text, text, int, text) TO service_role;

COMMIT;

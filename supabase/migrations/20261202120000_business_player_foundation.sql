BEGIN;

-- Foundation A2: Business Player Identity, Assignment, Heartbeat & Health
-- Credential hashing uses core sha256(); credential entropy uses gen_random_uuid() only.
-- No pgcrypto / digest() / gen_random_bytes() dependency.
-- Zone → Player → Assignment → Heartbeat → derived Health.
-- Expand-only. No playback_usage_facts wiring, Music Passport, billing, or Business App UI.
-- Player Health ≠ Playback Health (heartbeat loss does not mean music stopped).

-- ---------------------------------------------------------------------------
-- Player code sequence (AL-P-#########), parallel to music AL-T-*
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.business_player_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO CYCLE;

CREATE OR REPLACE FUNCTION public.next_business_player_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT 'AL-P-' || lpad(nextval('public.business_player_code_seq')::text, 9, '0');
$$;

REVOKE ALL ON FUNCTION public.next_business_player_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_business_player_code() TO service_role;

COMMENT ON FUNCTION public.next_business_player_code() IS
  'audiolad:business-player; monotonic issuer for immutable Player codes AL-P-#########.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.business_organizations (id) ON DELETE RESTRICT,
  player_code text NOT NULL,
  display_name text NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_players_player_code_format_check
    CHECK (player_code ~ '^AL-P-[0-9]{9}$'),
  CONSTRAINT business_players_player_code_unique UNIQUE (player_code),
  CONSTRAINT business_players_display_name_length_check
    CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT business_players_status_check
    CHECK (status IN ('active', 'suspended', 'retired'))
);

COMMENT ON TABLE public.business_players IS
  'audiolad:business-player; logical B2B Player owned by Organization. Zone placement is via business_player_assignments, not a zone_id column.';

COMMENT ON COLUMN public.business_players.player_code IS
  'Immutable human-readable Player identity (AL-P-#########). Canonical FK identity remains business_players.id.';

CREATE TABLE IF NOT EXISTS public.business_player_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL
    REFERENCES public.business_players (id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL
    REFERENCES public.business_zones (id) ON DELETE RESTRICT,
  assigned_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_player_assignments_time_order_check
    CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

COMMENT ON TABLE public.business_player_assignments IS
  'audiolad:business-player; history of Player placement in a Zone. At most one active assignment per Player (partial unique). Multiple Players may share one Zone.';

CREATE TABLE IF NOT EXISTS public.business_player_credentials (
  player_id uuid PRIMARY KEY
    REFERENCES public.business_players (id) ON DELETE RESTRICT,
  credential_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_player_credentials_hash_len_check
    CHECK (octet_length(credential_hash) = 32),
  CONSTRAINT business_player_credentials_hash_unique UNIQUE (credential_hash)
);

COMMENT ON TABLE public.business_player_credentials IS
  'audiolad:business-player; SHA-256 hash of machine credential. Plaintext never stored. No authenticated SELECT.';

CREATE TABLE IF NOT EXISTS public.business_player_runtime (
  player_id uuid PRIMARY KEY
    REFERENCES public.business_players (id) ON DELETE RESTRICT,
  last_heartbeat_at timestamptz NULL,
  last_client_time timestamptz NULL,
  app_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_player_runtime_app_version_length_check
    CHECK (app_version IS NULL OR char_length(btrim(app_version)) BETWEEN 1 AND 64)
);

COMMENT ON TABLE public.business_player_runtime IS
  'audiolad:business-player; current connectivity runtime. last_heartbeat_at is server time only; used for derived health.';

COMMENT ON COLUMN public.business_player_runtime.last_heartbeat_at IS
  'Server clock at last successful heartbeat. Client clocks never drive health.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS business_players_organization_idx
  ON public.business_players (organization_id);

CREATE INDEX IF NOT EXISTS business_players_organization_status_idx
  ON public.business_players (organization_id, status);

CREATE INDEX IF NOT EXISTS business_player_assignments_player_idx
  ON public.business_player_assignments (player_id);

CREATE INDEX IF NOT EXISTS business_player_assignments_zone_idx
  ON public.business_player_assignments (zone_id);

CREATE UNIQUE INDEX IF NOT EXISTS business_player_assignments_one_active_per_player_uidx
  ON public.business_player_assignments (player_id)
  WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS business_player_runtime_last_heartbeat_idx
  ON public.business_player_runtime (last_heartbeat_at);

-- ---------------------------------------------------------------------------
-- updated_at (reuse A1 helper)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS business_players_set_updated_at ON public.business_players;
CREATE TRIGGER business_players_set_updated_at
  BEFORE UPDATE ON public.business_players
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

DROP TRIGGER IF EXISTS business_player_credentials_set_updated_at
  ON public.business_player_credentials;
CREATE TRIGGER business_player_credentials_set_updated_at
  BEFORE UPDATE ON public.business_player_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

DROP TRIGGER IF EXISTS business_player_runtime_set_updated_at
  ON public.business_player_runtime;
CREATE TRIGGER business_player_runtime_set_updated_at
  BEFORE UPDATE ON public.business_player_runtime
  FOR EACH ROW
  EXECUTE FUNCTION public.business_domain_set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable player_code
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_player_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.player_code IS DISTINCT FROM NEW.player_code THEN
    RAISE EXCEPTION 'player_code_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_players_player_code_immutable
  ON public.business_players;
CREATE TRIGGER business_players_player_code_immutable
  BEFORE UPDATE OF player_code ON public.business_players
  FOR EACH ROW
  EXECUTE FUNCTION public.business_player_code_immutable();

REVOKE ALL ON FUNCTION public.business_player_code_immutable() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cross-organization assignment guard (fail-closed for privileged writes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_player_assignment_org_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player_org uuid;
  v_zone_org uuid;
BEGIN
  SELECT p.organization_id INTO v_player_org
  FROM public.business_players AS p
  WHERE p.id = NEW.player_id;

  IF v_player_org IS NULL THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT l.organization_id INTO v_zone_org
  FROM public.business_zones AS z
  JOIN public.business_locations AS l ON l.id = z.location_id
  WHERE z.id = NEW.zone_id;

  IF v_zone_org IS NULL THEN
    RAISE EXCEPTION 'zone_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_player_org IS DISTINCT FROM v_zone_org THEN
    RAISE EXCEPTION 'cross_organization_assignment' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_player_assignments_org_guard
  ON public.business_player_assignments;
CREATE TRIGGER business_player_assignments_org_guard
  BEFORE INSERT OR UPDATE OF player_id, zone_id
  ON public.business_player_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.business_player_assignment_org_guard();

REVOKE ALL ON FUNCTION public.business_player_assignment_org_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Credential helpers (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_player_hash_credential(p_credential text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT sha256(convert_to(p_credential, 'UTF8'));
$$;

REVOKE ALL ON FUNCTION public.business_player_hash_credential(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_player_hash_credential(text) TO service_role;

-- Canonical machine credential: 64 lowercase hex chars (~244-bit UUID-v4 entropy class).
CREATE OR REPLACE FUNCTION public.business_player_generate_credential()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
$$;

REVOKE ALL ON FUNCTION public.business_player_generate_credential() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_player_generate_credential() TO service_role;

-- ---------------------------------------------------------------------------
-- Derived technical health (authoritative thresholds live only here)
-- online: age <= 90s; stale: <= 300s; else offline; NULL → never_seen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_player_derived_health(
  p_last_heartbeat_at timestamptz,
  p_as_of timestamptz DEFAULT statement_timestamp()
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_last_heartbeat_at IS NULL THEN 'never_seen'
    WHEN EXTRACT(EPOCH FROM (p_as_of - p_last_heartbeat_at)) <= 90 THEN 'online'
    WHEN EXTRACT(EPOCH FROM (p_as_of - p_last_heartbeat_at)) <= 300 THEN 'stale'
    ELSE 'offline'
  END;
$$;

COMMENT ON FUNCTION public.business_player_derived_health(timestamptz, timestamptz) IS
  'audiolad:business-player; derived connectivity health from server last_heartbeat_at using statement_timestamp as_of. Not playback health.';

REVOKE ALL ON FUNCTION public.business_player_derived_health(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.business_player_derived_health(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.business_player_derived_health(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_player_derived_health(timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.business_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_player_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_player_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_player_runtime ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_players FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_player_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_player_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_player_runtime FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.business_players TO authenticated;
GRANT SELECT ON TABLE public.business_player_assignments TO authenticated;
-- credentials + runtime: no authenticated table privileges (read via RPC)

GRANT ALL ON TABLE public.business_players TO service_role;
GRANT ALL ON TABLE public.business_player_assignments TO service_role;
GRANT ALL ON TABLE public.business_player_credentials TO service_role;
GRANT ALL ON TABLE public.business_player_runtime TO service_role;

DROP POLICY IF EXISTS "Business members can read organization players"
  ON public.business_players;
CREATE POLICY "Business members can read organization players"
  ON public.business_players
  FOR SELECT
  TO authenticated
  USING (public.is_business_organization_member(organization_id));

DROP POLICY IF EXISTS "Business members can read player assignments"
  ON public.business_player_assignments;
CREATE POLICY "Business members can read player assignments"
  ON public.business_player_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_players AS p
      WHERE p.id = business_player_assignments.player_id
        AND public.is_business_organization_member(p.organization_id)
    )
  );

-- No SELECT policies for credentials / runtime (fail-closed even if grants added later)

-- ---------------------------------------------------------------------------
-- create_business_player
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_business_player(
  p_organization_id uuid,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_display text := NULLIF(btrim(coalesce(p_display_name, '')), '');
  v_org_status text;
  v_player_id uuid;
  v_player_code text;
  v_credential text;
  v_hash bytea;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'invalid_organization_id' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_business_organization_owner(p_organization_id, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  SELECT o.status INTO v_org_status
  FROM public.business_organizations AS o
  WHERE o.id = p_organization_id;

  IF v_org_status IS NULL THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_org_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'organization_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_display IS NOT NULL AND char_length(v_display) > 120 THEN
    RAISE EXCEPTION 'invalid_display_name' USING ERRCODE = '22023';
  END IF;

  v_player_code := public.next_business_player_code();
  v_credential := public.business_player_generate_credential();
  v_hash := public.business_player_hash_credential(v_credential);

  INSERT INTO public.business_players (
    organization_id, player_code, display_name, status, created_by
  ) VALUES (
    p_organization_id, v_player_code, v_display, 'active', v_user_id
  )
  RETURNING id INTO v_player_id;

  INSERT INTO public.business_player_credentials (player_id, credential_hash)
  VALUES (v_player_id, v_hash);

  INSERT INTO public.business_player_runtime (player_id)
  VALUES (v_player_id);

  RETURN jsonb_build_object(
    'ok', true,
    'player_id', v_player_id,
    'player_code', v_player_code,
    'credential', v_credential
  );
END;
$$;

COMMENT ON FUNCTION public.create_business_player(uuid, text) IS
  'audiolad:business-player; owner-only create Player + credential hash + empty runtime. Returns plaintext credential once.';

REVOKE ALL ON FUNCTION public.create_business_player(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_business_player(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_business_player(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_player(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- assign_business_player_to_zone
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_business_player_to_zone(
  p_player_id uuid,
  p_zone_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_player_org uuid;
  v_player_status text;
  v_zone_org uuid;
  v_zone_status text;
  v_location_id uuid;
  v_location_status text;
  v_active_id uuid;
  v_active_zone uuid;
  v_assignment_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_player_id IS NULL OR p_zone_id IS NULL THEN
    RAISE EXCEPTION 'invalid_assignment_args' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent assign/reassign on this Player (row lock).
  SELECT p.organization_id, p.status
  INTO v_player_org, v_player_status
  FROM public.business_players AS p
  WHERE p.id = p_player_id
  FOR UPDATE;

  IF v_player_org IS NULL THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_business_organization_owner(v_player_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  IF v_player_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'player_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT z.status, l.id, l.organization_id, l.status
  INTO v_zone_status, v_location_id, v_zone_org, v_location_status
  FROM public.business_zones AS z
  JOIN public.business_locations AS l ON l.id = z.location_id
  WHERE z.id = p_zone_id;

  IF v_zone_org IS NULL THEN
    RAISE EXCEPTION 'zone_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_zone_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'zone_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_location_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'location_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_player_org IS DISTINCT FROM v_zone_org THEN
    RAISE EXCEPTION 'cross_organization_assignment' USING ERRCODE = '22023';
  END IF;

  SELECT a.id, a.zone_id
  INTO v_active_id, v_active_zone
  FROM public.business_player_assignments AS a
  WHERE a.player_id = p_player_id
    AND a.unassigned_at IS NULL
  FOR UPDATE;

  IF v_active_id IS NOT NULL AND v_active_zone = p_zone_id THEN
    RETURN jsonb_build_object(
      'ok', true,
      'assignment_id', v_active_id,
      'player_id', p_player_id,
      'zone_id', p_zone_id,
      'idempotent', true
    );
  END IF;

  IF v_active_id IS NOT NULL THEN
    UPDATE public.business_player_assignments
    SET unassigned_at = now()
    WHERE id = v_active_id;
  END IF;

  INSERT INTO public.business_player_assignments (
    player_id, zone_id, assigned_by
  ) VALUES (
    p_player_id, p_zone_id, v_user_id
  )
  RETURNING id INTO v_assignment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'player_id', p_player_id,
    'zone_id', p_zone_id,
    'idempotent', false
  );
END;
$$;

COMMENT ON FUNCTION public.assign_business_player_to_zone(uuid, uuid) IS
  'audiolad:business-player; owner-only assign Player to Zone. Locks Player row (FOR UPDATE), closes previous active assignment. Idempotent for same Zone.';

REVOKE ALL ON FUNCTION public.assign_business_player_to_zone(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_business_player_to_zone(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_business_player_to_zone(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_business_player_to_zone(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- rotate_business_player_credential
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rotate_business_player_credential(
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_credential text;
  v_hash bytea;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.business_players AS p
  WHERE p.id = p_player_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  v_credential := public.business_player_generate_credential();
  v_hash := public.business_player_hash_credential(v_credential);

  UPDATE public.business_player_credentials
  SET credential_hash = v_hash
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'player_id', p_player_id,
    'credential', v_credential
  );
END;
$$;

COMMENT ON FUNCTION public.rotate_business_player_credential(uuid) IS
  'audiolad:business-player; owner-only credential rotation. Old plaintext stops working immediately.';

REVOKE ALL ON FUNCTION public.rotate_business_player_credential(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_business_player_credential(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rotate_business_player_credential(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_business_player_credential(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- record_business_player_heartbeat (machine credential; no user session)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_business_player_heartbeat(
  p_credential text,
  p_client_time timestamptz DEFAULT NULL,
  p_app_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cred text := btrim(coalesce(p_credential, ''));
  v_hash bytea;
  v_player_id uuid;
  v_status text;
  v_app text := NULLIF(btrim(coalesce(p_app_version, '')), '');
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Canonical credential is exactly 64 lowercase hex; reject before hashing.
  IF v_cred !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501';
  END IF;

  v_hash := public.business_player_hash_credential(v_cred);

  SELECT c.player_id, p.status
  INTO v_player_id, v_status
  FROM public.business_player_credentials AS c
  JOIN public.business_players AS p ON p.id = c.player_id
  WHERE c.credential_hash = v_hash;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'player_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_app IS NOT NULL AND char_length(v_app) > 64 THEN
    RAISE EXCEPTION 'invalid_app_version' USING ERRCODE = '22023';
  END IF;

  UPDATE public.business_player_runtime
  SET
    last_heartbeat_at = v_now,
    last_client_time = p_client_time,
    app_version = COALESCE(v_app, app_version)
  WHERE player_id = v_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_runtime_missing' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'player_id', v_player_id,
    'server_time', v_now,
    'recommended_interval_seconds', 30
  );
END;
$$;

COMMENT ON FUNCTION public.record_business_player_heartbeat(text, timestamptz, text) IS
  'audiolad:business-player; machine heartbeat via credential hash. Does not return org/zone data. Server time drives health.';

REVOKE ALL ON FUNCTION public.record_business_player_heartbeat(text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_business_player_heartbeat(text, timestamptz, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_business_player_heartbeat(text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_business_player_heartbeat(text, timestamptz, text) TO service_role;

-- ---------------------------------------------------------------------------
-- get_business_player_health (member read projection)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_business_player_health(
  p_organization_id uuid
)
RETURNS TABLE (
  player_id uuid,
  player_code text,
  display_name text,
  player_status text,
  zone_id uuid,
  location_id uuid,
  last_heartbeat_at timestamptz,
  seconds_since_heartbeat numeric,
  health_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_as_of timestamptz := statement_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'invalid_organization_id' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_business_organization_member(p_organization_id, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_member' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.player_code,
    p.display_name,
    p.status,
    a.zone_id,
    z.location_id,
    r.last_heartbeat_at,
    CASE
      WHEN r.last_heartbeat_at IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (v_as_of - r.last_heartbeat_at))
    END,
    public.business_player_derived_health(r.last_heartbeat_at, v_as_of)
  FROM public.business_players AS p
  LEFT JOIN public.business_player_runtime AS r ON r.player_id = p.id
  LEFT JOIN public.business_player_assignments AS a
    ON a.player_id = p.id AND a.unassigned_at IS NULL
  LEFT JOIN public.business_zones AS z ON z.id = a.zone_id
  WHERE p.organization_id = p_organization_id
  ORDER BY p.created_at ASC, p.id ASC;
END;
$$;

COMMENT ON FUNCTION public.get_business_player_health(uuid) IS
  'audiolad:business-player; member projection of Player connectivity health. Never returns credential material.';

REVOKE ALL ON FUNCTION public.get_business_player_health(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_business_player_health(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_business_player_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_player_health(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Structural post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.business_players') IS NULL
     OR to_regclass('public.business_player_assignments') IS NULL
     OR to_regclass('public.business_player_credentials') IS NULL
     OR to_regclass('public.business_player_runtime') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: business player tables missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'business_player_assignments_one_active_per_player_uidx'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: one active assignment unique missing';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.business_players'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: RLS not enabled on business_players';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.business_player_credentials'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: RLS not enabled on business_player_credentials';
  END IF;

  IF to_regprocedure('public.create_business_player(uuid,text)') IS NULL
     OR to_regprocedure('public.assign_business_player_to_zone(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_business_player_heartbeat(text,timestamptz,text)') IS NULL
     OR to_regprocedure('public.get_business_player_health(uuid)') IS NULL
     OR to_regprocedure('public.rotate_business_player_credential(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: player RPCs missing';
  END IF;

  IF has_table_privilege('anon', 'public.business_players', 'SELECT')
     OR has_table_privilege('anon', 'public.business_player_assignments', 'SELECT')
     OR has_table_privilege('anon', 'public.business_player_credentials', 'SELECT')
     OR has_table_privilege('anon', 'public.business_player_runtime', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: anon must not SELECT player tables';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_player_credentials', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not SELECT credentials';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_player_runtime', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not SELECT runtime';
  END IF;

  IF has_table_privilege('authenticated', 'public.business_players', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_player_assignments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_player_credentials', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_player_runtime', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_players', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_player_assignments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_player_credentials', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_player_runtime', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_players', 'DELETE')
     OR has_table_privilege('authenticated', 'public.business_player_assignments', 'DELETE')
     OR has_table_privilege('authenticated', 'public.business_player_credentials', 'DELETE')
     OR has_table_privilege('authenticated', 'public.business_player_runtime', 'DELETE') THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must not mutate player tables';
  END IF;
END;
$$;

COMMIT;

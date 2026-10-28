-- Owner commands for the paired venue device: pause, resume, next track.
-- Additive. Atmosphere stays on business_location_sound_settings, not in this queue.
-- The device acknowledges. The owner cannot set acked_at.

BEGIN;

CREATE TABLE public.business_point_commands (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL
    REFERENCES public.business_organizations (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL
    REFERENCES public.business_locations (id) ON DELETE RESTRICT,
  player_id uuid NOT NULL
    REFERENCES public.business_players (id) ON DELETE RESTRICT,
  type text NOT NULL,
  payload jsonb NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  acked_at timestamptz NULL,
  ack_result text NULL,
  CONSTRAINT business_point_commands_type_check
    CHECK (type IN ('pause', 'resume', 'next_track')),
  CONSTRAINT business_point_commands_ack_result_check
    CHECK (ack_result IS NULL OR ack_result = 'applied'),
  CONSTRAINT business_point_commands_ack_pair_check
    CHECK ((acked_at IS NULL) = (ack_result IS NULL))
);

COMMENT ON TABLE public.business_point_commands IS
  'audiolad:business-point; owner orders for the venue device. Expired rows are not applied.';

CREATE INDEX business_point_commands_pending_idx
  ON public.business_point_commands (location_id, created_at)
  WHERE acked_at IS NULL;

CREATE OR REPLACE FUNCTION public.business_point_commands_org_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = NEW.location_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'cross_organization_command' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_point_commands_org_guard ON public.business_point_commands;
CREATE TRIGGER business_point_commands_org_guard
  BEFORE INSERT OR UPDATE OF location_id, organization_id
  ON public.business_point_commands
  FOR EACH ROW
  EXECUTE FUNCTION public.business_point_commands_org_guard();

REVOKE ALL ON FUNCTION public.business_point_commands_org_guard() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.business_point_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_point_commands FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.business_point_commands TO authenticated;
GRANT ALL ON TABLE public.business_point_commands TO service_role;

DROP POLICY IF EXISTS "Business owners can read location point commands"
  ON public.business_point_commands;
CREATE POLICY "Business owners can read location point commands"
  ON public.business_point_commands
  FOR SELECT
  TO authenticated
  USING (public.is_business_organization_owner(organization_id));

DROP POLICY IF EXISTS "Business owners can insert location point commands"
  ON public.business_point_commands;
CREATE POLICY "Business owners can insert location point commands"
  ON public.business_point_commands
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_business_organization_owner(organization_id)
  );

CREATE OR REPLACE FUNCTION public.enqueue_business_point_command(
  p_id uuid,
  p_location_id uuid,
  p_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_player uuid;
  v_existing public.business_point_commands%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_location_id IS NULL OR p_type NOT IN ('pause', 'resume', 'next_track') THEN
    RAISE EXCEPTION 'invalid_point_command' USING ERRCODE = '22023';
  END IF;

  SELECT l.organization_id INTO v_org
  FROM public.business_locations AS l
  WHERE l.id = p_location_id AND l.status = 'active';
  IF v_org IS NULL OR NOT public.is_business_organization_owner(v_org, v_user_id) THEN
    RAISE EXCEPTION 'not_organization_owner' USING ERRCODE = '42501';
  END IF;

  SELECT s.player_id INTO v_player
  FROM public.business_point_sessions AS s
  WHERE s.location_id = p_location_id AND s.revoked_at IS NULL
  ORDER BY s.last_seen_at DESC
  LIMIT 1;
  IF v_player IS NULL THEN
    SELECT p.id INTO v_player
    FROM public.business_players AS p
    JOIN public.business_player_assignments AS a
      ON a.player_id = p.id AND a.unassigned_at IS NULL
    JOIN public.business_zones AS z
      ON z.id = a.zone_id AND z.location_id = p_location_id
    WHERE p.organization_id = v_org AND p.status = 'active'
    ORDER BY a.assigned_at DESC
    LIMIT 1;
  END IF;
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'no_point_player' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.business_point_commands (
    id, organization_id, location_id, player_id, type, created_by, expires_at
  ) VALUES (
    p_id, v_org, p_location_id, v_player, p_type, v_user_id,
    statement_timestamp() + interval '2 minutes'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_existing FROM public.business_point_commands WHERE id = p_id;
  IF v_existing.location_id IS DISTINCT FROM p_location_id
    OR v_existing.type IS DISTINCT FROM p_type
    OR v_existing.created_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'command_id_conflict' USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_existing.id,
    'expires_at', v_existing.expires_at,
    'acked_at', v_existing.acked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_business_point_command(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_business_point_command(uuid, uuid, text) TO authenticated, service_role;

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
    AND c.expires_at > statement_timestamp()
  ORDER BY c.created_at, c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_business_point_commands(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_business_point_commands(text) TO anon, authenticated, service_role;

-- Marks due commands as taken and returns only the rows this call took.
-- A second poll or a second tab with the same cookie gets nothing for those rows.
CREATE OR REPLACE FUNCTION public.claim_business_point_commands(p_token text)
RETURNS TABLE (id uuid, type text, created_at timestamptz)
LANGUAGE plpgsql
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
  WITH due AS (
    SELECT c.id
    FROM public.business_point_commands AS c
    WHERE c.location_id = v_location
      AND c.acked_at IS NULL
      AND c.expires_at > statement_timestamp()
    ORDER BY c.created_at, c.id
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.business_point_commands AS c
  SET acked_at = statement_timestamp(), ack_result = 'applied'
  FROM due
  WHERE c.id = due.id
    AND c.acked_at IS NULL
  RETURNING c.id, c.type, c.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_business_point_commands(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_business_point_commands(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ack_business_point_command(
  p_token text,
  p_command_id uuid,
  p_result text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location uuid;
  v_row public.business_point_commands%ROWTYPE;
BEGIN
  IF p_token IS NULL OR btrim(p_token) !~ '^[0-9a-f]{64}$' OR p_command_id IS NULL OR p_result IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;
  SELECT s.location_id INTO v_location
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
  IF v_row.acked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'point_command_expired' USING ERRCODE = '22023';
  END IF;

  UPDATE public.business_point_commands
  SET acked_at = statement_timestamp(), ack_result = 'applied'
  WHERE id = p_command_id AND acked_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.ack_business_point_command(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_business_point_command(text, uuid, text) TO anon, authenticated, service_role;

DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'business_point_commands' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Post-check failed: command RLS is off';
  END IF;
  IF has_table_privilege('authenticated', 'public.business_point_commands', 'UPDATE')
    OR has_table_privilege('anon', 'public.business_point_commands', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: command update or anon read is open';
  END IF;
END
$post$;

COMMIT;

-- Rollback after a backup and a separate decision. Does not touch playback rows.
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.claim_business_point_commands(text);
-- DROP FUNCTION IF EXISTS public.ack_business_point_command(text, uuid, text);
-- DROP FUNCTION IF EXISTS public.list_business_point_commands(text);
-- DROP FUNCTION IF EXISTS public.enqueue_business_point_command(uuid, uuid, text);
-- DROP TABLE IF EXISTS public.business_point_commands;
-- COMMIT;

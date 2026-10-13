BEGIN;

-- Business SPA PR1: programs and raw player telemetry, not a second usage ledger.
-- No pilot users seeded. No permission inferred from program membership.
CREATE TABLE public.business_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'spa' CHECK (kind ~ '^[a-z][a-z0-9_]{0,63}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_programs_organization_idx ON public.business_programs(organization_id);
CREATE TRIGGER business_programs_set_updated_at BEFORE UPDATE ON public.business_programs
  FOR EACH ROW EXECUTE FUNCTION public.business_domain_set_updated_at();

CREATE TABLE public.business_program_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.business_programs(id) ON DELETE RESTRICT,
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 1),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  excluded_at timestamptz,
  excluded_reason text CHECK (excluded_reason IS NULL OR char_length(btrim(excluded_reason)) BETWEEN 1 AND 500),
  CONSTRAINT business_program_items_program_audio_unique UNIQUE (program_id, audio_item_id),
  CONSTRAINT business_program_items_exclusion_check CHECK (excluded_at IS NOT NULL OR excluded_reason IS NULL)
);
CREATE INDEX business_program_items_order_idx ON public.business_program_items(program_id, position);
CREATE INDEX business_program_items_audio_idx ON public.business_program_items(audio_item_id);

CREATE TABLE public.business_pilot_allowlist (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- Self-only helper prevents recursive allowlist RLS and arbitrary user probing.
CREATE FUNCTION public.has_business_pilot_access(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_business_organization_member(p_organization_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.business_pilot_allowlist a
      WHERE a.organization_id = p_organization_id AND a.user_id = auth.uid() AND a.enabled
    );
$$;
REVOKE ALL ON FUNCTION public.has_business_pilot_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_business_pilot_access(uuid) TO authenticated, service_role;

CREATE TABLE public.business_playback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.business_players(id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL REFERENCES public.business_zones(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE RESTRICT,
  program_id uuid REFERENCES public.business_programs(id) ON DELETE RESTRICT,
  usage_fact_id uuid REFERENCES public.playback_usage_facts(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  played_ms bigint NOT NULL DEFAULT 0 CHECK (played_ms >= 0),
  event text NOT NULL CHECK (event IN ('start', 'complete', 'skip', 'error')),
  client_event_id uuid NOT NULL,
  offline boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT business_playback_log_player_event_unique UNIQUE (player_id, client_event_id),
  CONSTRAINT business_playback_log_time_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX business_playback_log_org_time_idx ON public.business_playback_log(organization_id, started_at);
CREATE INDEX business_playback_log_program_idx ON public.business_playback_log(program_id);
CREATE INDEX business_playback_log_usage_fact_idx ON public.business_playback_log(usage_fact_id);
CREATE INDEX business_playback_log_zone_idx ON public.business_playback_log(zone_id);
CREATE INDEX business_playback_log_audio_idx ON public.business_playback_log(audio_item_id);

COMMENT ON TABLE public.business_program_items IS
  'Track references only. Adding a track does not grant playback or cache rights. Server must call resolve_business_track_eligibility for business_background_playback and separately offline_storage_cache before delivery.';
COMMENT ON TABLE public.business_playback_log IS
  'Raw client events; played_ms and client times are untrusted telemetry. Not accepted media-time or Proof of Play. Existing playback_usage_facts remains canonical. No automatic fact insertion.';
COMMENT ON COLUMN public.business_playback_log.usage_fact_id IS
  'Optional link to an existing A3 business fact with matching player, zone, organization and track. No duplicated attribution entity.';

-- Programs and item identities stay in their original scope; edit curation fields.
CREATE FUNCTION public.business_spa_preserve_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'business_programs' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'business_spa_program_organization_immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.program_id IS DISTINCT FROM OLD.program_id OR NEW.audio_item_id IS DISTINCT FROM OLD.audio_item_id THEN
      RAISE EXCEPTION 'business_spa_item_identity_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.business_spa_preserve_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_spa_preserve_program_scope BEFORE UPDATE ON public.business_programs
  FOR EACH ROW EXECUTE FUNCTION public.business_spa_preserve_scope();
CREATE TRIGGER business_spa_preserve_item_scope BEFORE UPDATE ON public.business_program_items
  FOR EACH ROW EXECUTE FUNCTION public.business_spa_preserve_scope();

-- Validate tenant relationships even for service writes. Historical assignment at
-- started_at allows delayed offline events after a player moves to another zone.
CREATE FUNCTION public.business_spa_validate_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_players p
    JOIN public.business_player_assignments a ON a.player_id = p.id
    JOIN public.business_zones z ON z.id = a.zone_id
    JOIN public.business_locations l ON l.id = z.location_id
    WHERE p.id = NEW.player_id AND p.organization_id = NEW.organization_id
      AND a.zone_id = NEW.zone_id AND l.organization_id = NEW.organization_id
      AND a.assigned_at <= NEW.started_at
      AND (a.unassigned_at IS NULL OR NEW.started_at < a.unassigned_at)
  ) THEN
    RAISE EXCEPTION 'business_spa_player_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.program_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_programs p
    WHERE p.id = NEW.program_id AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'business_spa_program_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.usage_fact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.playback_usage_facts f
    WHERE f.id = NEW.usage_fact_id AND f.usage_kind = 'business'
      AND f.organization_id = NEW.organization_id AND f.player_id = NEW.player_id
      AND f.zone_id = NEW.zone_id AND f.audio_item_id = NEW.audio_item_id
  ) THEN
    RAISE EXCEPTION 'business_spa_usage_fact_mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.received_at := clock_timestamp(); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.business_spa_validate_log() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_spa_validate_log BEFORE INSERT OR UPDATE ON public.business_playback_log
  FOR EACH ROW EXECUTE FUNCTION public.business_spa_validate_log();

ALTER TABLE public.business_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_program_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_pilot_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_playback_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_programs, public.business_program_items,
  public.business_pilot_allowlist, public.business_playback_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_programs, public.business_program_items,
  public.business_pilot_allowlist, public.business_playback_log TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_programs, public.business_program_items TO authenticated;
GRANT SELECT ON TABLE public.business_pilot_allowlist TO authenticated;
GRANT SELECT, INSERT ON TABLE public.business_playback_log TO authenticated;

-- Owner and manager are the existing organization-level roles. No employee scope.
CREATE POLICY business_programs_read ON public.business_programs FOR SELECT TO authenticated
  USING (public.has_business_pilot_access(organization_id));
CREATE POLICY business_programs_insert ON public.business_programs FOR INSERT TO authenticated
  WITH CHECK (public.has_business_pilot_access(organization_id) AND created_by = auth.uid());
CREATE POLICY business_programs_update ON public.business_programs FOR UPDATE TO authenticated
  USING (public.has_business_pilot_access(organization_id))
  WITH CHECK (public.has_business_pilot_access(organization_id));
CREATE POLICY business_program_items_read ON public.business_program_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.business_programs p WHERE p.id = program_id
    AND public.has_business_pilot_access(p.organization_id)));
CREATE POLICY business_program_items_insert ON public.business_program_items FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND EXISTS (SELECT 1 FROM public.business_programs p WHERE p.id = program_id
    AND public.has_business_pilot_access(p.organization_id)));
CREATE POLICY business_program_items_update ON public.business_program_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.business_programs p WHERE p.id = program_id
    AND public.has_business_pilot_access(p.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.business_programs p WHERE p.id = program_id
    AND public.has_business_pilot_access(p.organization_id)));
-- Only service_role manages admission: an owner cannot self-enroll or enroll others.
CREATE POLICY business_pilot_allowlist_read ON public.business_pilot_allowlist FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.has_business_pilot_access(organization_id));
CREATE POLICY business_playback_log_read ON public.business_playback_log FOR SELECT TO authenticated
  USING (public.has_business_pilot_access(organization_id));
CREATE POLICY business_playback_log_insert ON public.business_playback_log FOR INSERT TO authenticated
  WITH CHECK (public.has_business_pilot_access(organization_id));

COMMIT;

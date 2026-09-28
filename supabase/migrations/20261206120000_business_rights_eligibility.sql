-- A5: Country Rights Profile + Location Rights Context + Rights Eligibility
-- Expand-only. Does NOT rewrite merged A4 migration body.
-- No production country legal seeds. No licensed boolean. No Aural/Analyzer/economics.
-- MERGE/DEPLOY/PRODUCTION_DB_APPLY remain NO until explicitly lifted.

-- ---------------------------------------------------------------------------
-- A4 historical hardening: ceased_at (additive)
-- ---------------------------------------------------------------------------

ALTER TABLE public.music_rights_grants
  ADD COLUMN IF NOT EXISTS ceased_at timestamptz NULL;

COMMENT ON COLUMN public.music_rights_grants.ceased_at IS
  'audiolad:music-rights; server-set when verified → superseded|revoked. Usable historically while p_as_of < ceased_at. Not updated_at.';

-- Recreate enforce trigger with ceased_at rules (CREATE OR REPLACE; A4 file untouched).
CREATE OR REPLACE FUNCTION public.music_rights_grants_enforce_legal_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pred public.music_rights_grants%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'grant_history_immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.supersedes_grant_id IS NOT NULL THEN
      SELECT * INTO v_pred
      FROM public.music_rights_grants
      WHERE id = NEW.supersedes_grant_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'supersedes_grant_not_found' USING ERRCODE = 'P0002';
      END IF;
      IF v_pred.audio_item_id IS DISTINCT FROM NEW.audio_item_id THEN
        RAISE EXCEPTION 'supersedes_audio_item_mismatch' USING ERRCODE = '22023';
      END IF;
      IF v_pred.rights_layer IS DISTINCT FROM NEW.rights_layer THEN
        RAISE EXCEPTION 'supersedes_rights_layer_mismatch' USING ERRCODE = '22023';
      END IF;
      IF v_pred.use_type IS DISTINCT FROM NEW.use_type THEN
        RAISE EXCEPTION 'supersedes_use_type_mismatch' USING ERRCODE = '22023';
      END IF;
      IF NEW.version IS DISTINCT FROM (v_pred.version + 1) THEN
        RAISE EXCEPTION 'supersedes_version_mismatch' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF NEW.status IN ('superseded', 'revoked') THEN
      RAISE EXCEPTION 'grant_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;

    -- ceased_at must start NULL; client cannot invent cessation on insert
    IF NEW.ceased_at IS NOT NULL THEN
      RAISE EXCEPTION 'ceased_at_forbidden' USING ERRCODE = '22023';
    END IF;

    IF NEW.status = 'verified' THEN
      IF NEW.territory_scope = 'countries' THEN
        RAISE EXCEPTION 'grant_territory_incomplete' USING ERRCODE = '22023';
      END IF;
      PERFORM public.music_rights_grant_territory_coherent(NEW.id, NEW.territory_scope);
    ELSIF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'grant_status_invalid' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE path
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF NEW.ceased_at IS DISTINCT FROM OLD.ceased_at THEN
      RAISE EXCEPTION 'ceased_at_immutable' USING ERRCODE = '55000';
    END IF;
    IF NEW.supersedes_grant_id IS DISTINCT FROM OLD.supersedes_grant_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.audio_item_id IS DISTINCT FROM OLD.audio_item_id
       OR NEW.rights_layer IS DISTINCT FROM OLD.rights_layer
       OR NEW.use_type IS DISTINCT FROM OLD.use_type THEN
      IF NEW.supersedes_grant_id IS NOT NULL THEN
        SELECT * INTO v_pred
        FROM public.music_rights_grants
        WHERE id = NEW.supersedes_grant_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'supersedes_grant_not_found' USING ERRCODE = 'P0002';
        END IF;
        IF v_pred.audio_item_id IS DISTINCT FROM NEW.audio_item_id THEN
          RAISE EXCEPTION 'supersedes_audio_item_mismatch' USING ERRCODE = '22023';
        END IF;
        IF v_pred.rights_layer IS DISTINCT FROM NEW.rights_layer THEN
          RAISE EXCEPTION 'supersedes_rights_layer_mismatch' USING ERRCODE = '22023';
        END IF;
        IF v_pred.use_type IS DISTINCT FROM NEW.use_type THEN
          RAISE EXCEPTION 'supersedes_use_type_mismatch' USING ERRCODE = '22023';
        END IF;
        IF NEW.version IS DISTINCT FROM (v_pred.version + 1) THEN
          RAISE EXCEPTION 'supersedes_version_mismatch' USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_allowed :=
      (OLD.status = 'draft' AND NEW.status = 'verified')
      OR (OLD.status = 'verified' AND NEW.status IN ('superseded', 'revoked'));
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'grant_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF OLD.verified_at IS DISTINCT FROM NEW.verified_at THEN
      RAISE EXCEPTION 'verified_at_immutable' USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.status = 'draft' AND NEW.status = 'verified' THEN
    IF NEW.verified_at IS NULL THEN
      RAISE EXCEPTION 'verified_at_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Server-set ceased_at on verified → superseded|revoked; otherwise immutable
  IF OLD.status = 'verified' AND NEW.status IN ('superseded', 'revoked') THEN
    NEW.ceased_at := coalesce(NEW.ceased_at, now());
  ELSIF OLD.ceased_at IS DISTINCT FROM NEW.ceased_at THEN
    RAISE EXCEPTION 'ceased_at_immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.audio_item_id IS DISTINCT FROM NEW.audio_item_id
    OR OLD.rightsholder_id IS DISTINCT FROM NEW.rightsholder_id
    OR OLD.rights_layer IS DISTINCT FROM NEW.rights_layer
    OR OLD.use_type IS DISTINCT FROM NEW.use_type
    OR OLD.territory_scope IS DISTINCT FROM NEW.territory_scope
    OR OLD.valid_from IS DISTINCT FROM NEW.valid_from
    OR OLD.valid_until IS DISTINCT FROM NEW.valid_until
    OR OLD.source_type IS DISTINCT FROM NEW.source_type
    OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
    OR OLD.version IS DISTINCT FROM NEW.version
    OR OLD.supersedes_grant_id IS DISTINCT FROM NEW.supersedes_grant_id
  THEN
    RAISE EXCEPTION 'grant_legal_fields_immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'verified' THEN
    PERFORM public.music_rights_grant_territory_coherent(NEW.id, NEW.territory_scope);
    NEW.ceased_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Shared use_type vocabulary helper (text, no second checklist)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_rights_use_type_is_valid(p_use_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_use_type IN (
    'business_background_playback',
    'on_demand_playback',
    'public_performance_context',
    'offline_storage_cache',
    'crossfade',
    'loop',
    'tempo_adjustment',
    'stem_use',
    'remix_derivative',
    'advertising_adjacency',
    'advertising_synchronization'
  );
$$;

REVOKE ALL ON FUNCTION public.music_rights_use_type_is_valid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_use_type_is_valid(text) FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_use_type_is_valid(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.music_rights_use_type_is_valid(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.music_rights_use_type_is_valid(text) TO postgres;

-- ---------------------------------------------------------------------------
-- Country Rights Profile (versioned global legal context)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_country_rights_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  supersedes_profile_id uuid NULL
    REFERENCES public.music_country_rights_profiles (id) ON DELETE RESTRICT,
  reviewed_at timestamptz NULL,
  activated_at timestamptz NULL,
  ceased_at timestamptz NULL,
  source_reference text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_country_rights_profiles_country_code_check
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT music_country_rights_profiles_status_check
    CHECK (status IN ('draft', 'active', 'superseded')),
  CONSTRAINT music_country_rights_profiles_version_positive
    CHECK (version >= 1),
  CONSTRAINT music_country_rights_profiles_no_self_supersede
    CHECK (supersedes_profile_id IS NULL OR supersedes_profile_id IS DISTINCT FROM id)
);

COMMENT ON TABLE public.music_country_rights_profiles IS
  'audiolad:rights-eligibility; versioned Country Rights Profile. Global/shared. Each row is one version. No production legal seeds in migration.';

CREATE UNIQUE INDEX IF NOT EXISTS music_country_rights_profiles_supersedes_uidx
  ON public.music_country_rights_profiles (supersedes_profile_id)
  WHERE supersedes_profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS music_country_rights_profiles_one_active_uidx
  ON public.music_country_rights_profiles (country_code)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS music_country_rights_profiles_country_status_idx
  ON public.music_country_rights_profiles (country_code, status);

CREATE TABLE IF NOT EXISTS public.music_country_rights_profile_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL
    REFERENCES public.music_country_rights_profiles (id) ON DELETE CASCADE,
  use_type text NOT NULL,
  service_status text NOT NULL,
  client_requirement text NOT NULL,
  requires_recording boolean NOT NULL DEFAULT true,
  requires_composition boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_country_rights_profile_rules_use_type_check
    CHECK (public.music_rights_use_type_is_valid(use_type)),
  CONSTRAINT music_country_rights_profile_rules_service_status_check
    CHECK (service_status IN ('supported', 'unsupported', 'unknown')),
  CONSTRAINT music_country_rights_profile_rules_client_requirement_check
    CHECK (client_requirement IN ('none', 'required', 'unknown')),
  CONSTRAINT music_country_rights_profile_rules_profile_use_unique
    UNIQUE (profile_id, use_type)
);

COMMENT ON TABLE public.music_country_rights_profile_rules IS
  'audiolad:rights-eligibility; per-use_type rules for a Country Profile version. Immutable after parent leaves draft.';

CREATE INDEX IF NOT EXISTS music_country_rights_profile_rules_profile_use_idx
  ON public.music_country_rights_profile_rules (profile_id, use_type);

-- ---------------------------------------------------------------------------
-- Location Rights Context (versioned application of profile to Location)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_location_rights_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL
    REFERENCES public.business_locations (id) ON DELETE RESTRICT,
  country_profile_id uuid NOT NULL
    REFERENCES public.music_country_rights_profiles (id) ON DELETE RESTRICT,
  country_code_snapshot text NOT NULL,
  business_category_snapshot text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  supersedes_context_id uuid NULL
    REFERENCES public.business_location_rights_contexts (id) ON DELETE RESTRICT,
  reviewed_at timestamptz NULL,
  activated_at timestamptz NULL,
  ceased_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_location_rights_contexts_country_code_check
    CHECK (country_code_snapshot ~ '^[A-Z]{2}$'),
  CONSTRAINT business_location_rights_contexts_category_nonempty
    CHECK (char_length(btrim(business_category_snapshot)) BETWEEN 1 AND 120),
  CONSTRAINT business_location_rights_contexts_status_check
    CHECK (status IN ('draft', 'active', 'superseded')),
  CONSTRAINT business_location_rights_contexts_version_positive
    CHECK (version >= 1),
  CONSTRAINT business_location_rights_contexts_no_self_supersede
    CHECK (supersedes_context_id IS NULL OR supersedes_context_id IS DISTINCT FROM id)
);

COMMENT ON TABLE public.business_location_rights_contexts IS
  'audiolad:rights-eligibility; versioned Location Rights Context. Snapshots Location country/category + Country Profile version. Customer-specific via location_id.';

CREATE UNIQUE INDEX IF NOT EXISTS business_location_rights_contexts_supersedes_uidx
  ON public.business_location_rights_contexts (supersedes_context_id)
  WHERE supersedes_context_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS business_location_rights_contexts_one_active_uidx
  ON public.business_location_rights_contexts (location_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS business_location_rights_contexts_location_status_idx
  ON public.business_location_rights_contexts (location_id, status);

CREATE TABLE IF NOT EXISTS public.business_location_rights_context_use_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id uuid NOT NULL
    REFERENCES public.business_location_rights_contexts (id) ON DELETE CASCADE,
  use_type text NOT NULL,
  client_requirement_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_location_rights_context_use_statuses_use_type_check
    CHECK (public.music_rights_use_type_is_valid(use_type)),
  CONSTRAINT business_location_rights_context_use_statuses_crs_check
    CHECK (client_requirement_status IN (
      'not_required', 'confirmed', 'not_confirmed', 'unknown'
    )),
  CONSTRAINT business_location_rights_context_use_statuses_unique
    UNIQUE (context_id, use_type)
);

COMMENT ON TABLE public.business_location_rights_context_use_statuses IS
  'audiolad:rights-eligibility; per-use client requirement confirmation state for a Location Context version. Immutable after parent leaves draft.';

CREATE INDEX IF NOT EXISTS business_location_rights_context_use_statuses_ctx_use_idx
  ON public.business_location_rights_context_use_statuses (context_id, use_type);

-- ---------------------------------------------------------------------------
-- updated_at helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_rights_eligibility_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_country_rights_profiles_set_updated_at
  ON public.music_country_rights_profiles;
CREATE TRIGGER music_country_rights_profiles_set_updated_at
  BEFORE UPDATE ON public.music_country_rights_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_eligibility_set_updated_at();

DROP TRIGGER IF EXISTS business_location_rights_contexts_set_updated_at
  ON public.business_location_rights_contexts;
CREATE TRIGGER business_location_rights_contexts_set_updated_at
  BEFORE UPDATE ON public.business_location_rights_contexts
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_eligibility_set_updated_at();

REVOKE ALL ON FUNCTION public.music_rights_eligibility_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_eligibility_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_eligibility_set_updated_at() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Country Profile legal history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_country_rights_profiles_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pred public.music_country_rights_profiles%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'country_profile_history_immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('active', 'superseded') THEN
      RAISE EXCEPTION 'country_profile_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'country_profile_status_invalid' USING ERRCODE = '22023';
    END IF;
    IF NEW.activated_at IS NOT NULL OR NEW.ceased_at IS NOT NULL THEN
      RAISE EXCEPTION 'country_profile_activation_forbidden' USING ERRCODE = '22023';
    END IF;
    IF NEW.supersedes_profile_id IS NOT NULL THEN
      SELECT * INTO v_pred FROM public.music_country_rights_profiles
      WHERE id = NEW.supersedes_profile_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'supersedes_profile_not_found' USING ERRCODE = 'P0002';
      END IF;
      IF v_pred.country_code IS DISTINCT FROM NEW.country_code THEN
        RAISE EXCEPTION 'supersedes_country_mismatch' USING ERRCODE = '22023';
      END IF;
      IF NEW.version IS DISTINCT FROM (v_pred.version + 1) THEN
        RAISE EXCEPTION 'supersedes_version_mismatch' USING ERRCODE = '22023';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF NEW.activated_at IS DISTINCT FROM OLD.activated_at
       OR NEW.ceased_at IS DISTINCT FROM OLD.ceased_at THEN
      RAISE EXCEPTION 'country_profile_activation_forbidden' USING ERRCODE = '22023';
    END IF;
    IF NEW.supersedes_profile_id IS DISTINCT FROM OLD.supersedes_profile_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.country_code IS DISTINCT FROM OLD.country_code THEN
      IF NEW.supersedes_profile_id IS NOT NULL THEN
        SELECT * INTO v_pred FROM public.music_country_rights_profiles
        WHERE id = NEW.supersedes_profile_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'supersedes_profile_not_found' USING ERRCODE = 'P0002';
        END IF;
        IF v_pred.country_code IS DISTINCT FROM NEW.country_code THEN
          RAISE EXCEPTION 'supersedes_country_mismatch' USING ERRCODE = '22023';
        END IF;
        IF NEW.version IS DISTINCT FROM (v_pred.version + 1) THEN
          RAISE EXCEPTION 'supersedes_version_mismatch' USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_allowed :=
      (OLD.status = 'draft' AND NEW.status = 'active')
      OR (OLD.status = 'active' AND NEW.status = 'superseded');
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'country_profile_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'active' THEN
    IF NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'country_profile_reviewed_at_required' USING ERRCODE = '22023';
    END IF;
    NEW.activated_at := coalesce(NEW.activated_at, NEW.reviewed_at, now());
    NEW.ceased_at := NULL;
  ELSIF OLD.status = 'active' AND NEW.status = 'superseded' THEN
    NEW.ceased_at := coalesce(NEW.ceased_at, now());
  END IF;

  -- After leaving draft: country/version/chain/source immutable; activation stamps mostly immutable
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF OLD.country_code IS DISTINCT FROM NEW.country_code
       OR OLD.version IS DISTINCT FROM NEW.version
       OR OLD.supersedes_profile_id IS DISTINCT FROM NEW.supersedes_profile_id
       OR OLD.source_reference IS DISTINCT FROM NEW.source_reference
       OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
       OR OLD.activated_at IS DISTINCT FROM NEW.activated_at THEN
      -- allow ceased_at set on active→superseded only (handled above)
      IF NOT (OLD.status = 'active' AND NEW.status = 'superseded'
              AND OLD.country_code IS NOT DISTINCT FROM NEW.country_code
              AND OLD.version IS NOT DISTINCT FROM NEW.version
              AND OLD.supersedes_profile_id IS NOT DISTINCT FROM NEW.supersedes_profile_id
              AND OLD.source_reference IS NOT DISTINCT FROM NEW.source_reference
              AND OLD.reviewed_at IS NOT DISTINCT FROM NEW.reviewed_at
              AND OLD.activated_at IS NOT DISTINCT FROM NEW.activated_at) THEN
        RAISE EXCEPTION 'country_profile_fields_immutable' USING ERRCODE = '55000';
      END IF;
    END IF;
    IF OLD.status = 'superseded' AND OLD.ceased_at IS DISTINCT FROM NEW.ceased_at THEN
      RAISE EXCEPTION 'country_profile_ceased_at_immutable' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_country_rights_profiles_enforce_biud
  ON public.music_country_rights_profiles;
CREATE TRIGGER music_country_rights_profiles_enforce_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.music_country_rights_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.music_country_rights_profiles_enforce();

REVOKE ALL ON FUNCTION public.music_country_rights_profiles_enforce() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_country_rights_profiles_enforce() FROM anon;
REVOKE ALL ON FUNCTION public.music_country_rights_profiles_enforce() FROM authenticated;

CREATE OR REPLACE FUNCTION public.music_country_rights_profile_rules_protect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status FROM public.music_country_rights_profiles WHERE id = OLD.profile_id;
    IF v_status IS NULL THEN
      RETURN OLD; -- cascade from draft profile delete
    END IF;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'country_profile_rules_immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO v_status FROM public.music_country_rights_profiles WHERE id = NEW.profile_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'country_profile_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'country_profile_rules_immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.profile_id IS DISTINCT FROM NEW.profile_id THEN
      RAISE EXCEPTION 'country_profile_rules_immutable' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_country_rights_profile_rules_protect_biud
  ON public.music_country_rights_profile_rules;
CREATE TRIGGER music_country_rights_profile_rules_protect_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.music_country_rights_profile_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.music_country_rights_profile_rules_protect();

REVOKE ALL ON FUNCTION public.music_country_rights_profile_rules_protect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_country_rights_profile_rules_protect() FROM anon;
REVOKE ALL ON FUNCTION public.music_country_rights_profile_rules_protect() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Location Context legal history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_location_rights_contexts_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pred public.business_location_rights_contexts%ROWTYPE;
  v_loc record;
  v_prof record;
  v_allowed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'location_context_history_immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  SELECT id, country_code, business_category
  INTO v_loc
  FROM public.business_locations
  WHERE id = NEW.location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, country_code, status
  INTO v_prof
  FROM public.music_country_rights_profiles
  WHERE id = NEW.country_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'country_profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.country_code_snapshot IS DISTINCT FROM v_loc.country_code THEN
    RAISE EXCEPTION 'location_rights_context_country_mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_prof.country_code IS DISTINCT FROM v_loc.country_code THEN
    RAISE EXCEPTION 'location_rights_context_profile_country_mismatch' USING ERRCODE = '22023';
  END IF;
  IF NEW.business_category_snapshot IS DISTINCT FROM v_loc.business_category THEN
    RAISE EXCEPTION 'location_rights_context_category_mismatch' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('active', 'superseded') THEN
      RAISE EXCEPTION 'location_context_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'location_context_status_invalid' USING ERRCODE = '22023';
    END IF;
    IF NEW.activated_at IS NOT NULL OR NEW.ceased_at IS NOT NULL THEN
      RAISE EXCEPTION 'location_context_activation_forbidden' USING ERRCODE = '22023';
    END IF;
    IF NEW.supersedes_context_id IS NOT NULL THEN
      SELECT * INTO v_pred FROM public.business_location_rights_contexts
      WHERE id = NEW.supersedes_context_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'supersedes_context_not_found' USING ERRCODE = 'P0002';
      END IF;
      IF v_pred.location_id IS DISTINCT FROM NEW.location_id THEN
        RAISE EXCEPTION 'supersedes_location_mismatch' USING ERRCODE = '22023';
      END IF;
      IF NEW.version IS DISTINCT FROM (v_pred.version + 1) THEN
        RAISE EXCEPTION 'supersedes_version_mismatch' USING ERRCODE = '22023';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF NEW.activated_at IS DISTINCT FROM OLD.activated_at
       OR NEW.ceased_at IS DISTINCT FROM OLD.ceased_at THEN
      RAISE EXCEPTION 'location_context_activation_forbidden' USING ERRCODE = '22023';
    END IF;
    IF NEW.supersedes_context_id IS DISTINCT FROM OLD.supersedes_context_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.location_id IS DISTINCT FROM OLD.location_id THEN
      IF NEW.supersedes_context_id IS NOT NULL THEN
        SELECT * INTO v_pred FROM public.business_location_rights_contexts
        WHERE id = NEW.supersedes_context_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'supersedes_context_not_found' USING ERRCODE = 'P0002';
        END IF;
        IF v_pred.location_id IS DISTINCT FROM NEW.location_id THEN
          RAISE EXCEPTION 'supersedes_location_mismatch' USING ERRCODE = '22023';
        END IF;
        IF NEW.version IS DISTINCT FROM (v_pred.version + 1) THEN
          RAISE EXCEPTION 'supersedes_version_mismatch' USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_allowed :=
      (OLD.status = 'draft' AND NEW.status = 'active')
      OR (OLD.status = 'active' AND NEW.status = 'superseded');
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'location_context_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'active' THEN
    IF NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'location_context_reviewed_at_required' USING ERRCODE = '22023';
    END IF;
    -- Profile should be active or historically usable; require non-draft profile
    IF v_prof.status = 'draft' THEN
      RAISE EXCEPTION 'location_context_profile_not_ready' USING ERRCODE = '22023';
    END IF;
    NEW.activated_at := coalesce(NEW.activated_at, NEW.reviewed_at, now());
    NEW.ceased_at := NULL;
  ELSIF OLD.status = 'active' AND NEW.status = 'superseded' THEN
    NEW.ceased_at := coalesce(NEW.ceased_at, now());
  END IF;

  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF OLD.location_id IS DISTINCT FROM NEW.location_id
       OR OLD.country_profile_id IS DISTINCT FROM NEW.country_profile_id
       OR OLD.country_code_snapshot IS DISTINCT FROM NEW.country_code_snapshot
       OR OLD.business_category_snapshot IS DISTINCT FROM NEW.business_category_snapshot
       OR OLD.version IS DISTINCT FROM NEW.version
       OR OLD.supersedes_context_id IS DISTINCT FROM NEW.supersedes_context_id
       OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
       OR OLD.activated_at IS DISTINCT FROM NEW.activated_at THEN
      IF NOT (OLD.status = 'active' AND NEW.status = 'superseded'
              AND OLD.location_id IS NOT DISTINCT FROM NEW.location_id
              AND OLD.country_profile_id IS NOT DISTINCT FROM NEW.country_profile_id
              AND OLD.country_code_snapshot IS NOT DISTINCT FROM NEW.country_code_snapshot
              AND OLD.business_category_snapshot IS NOT DISTINCT FROM NEW.business_category_snapshot
              AND OLD.version IS NOT DISTINCT FROM NEW.version
              AND OLD.supersedes_context_id IS NOT DISTINCT FROM NEW.supersedes_context_id
              AND OLD.reviewed_at IS NOT DISTINCT FROM NEW.reviewed_at
              AND OLD.activated_at IS NOT DISTINCT FROM NEW.activated_at) THEN
        RAISE EXCEPTION 'location_context_fields_immutable' USING ERRCODE = '55000';
      END IF;
    END IF;
    IF OLD.status = 'superseded' AND OLD.ceased_at IS DISTINCT FROM NEW.ceased_at THEN
      RAISE EXCEPTION 'location_context_ceased_at_immutable' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_location_rights_contexts_enforce_biud
  ON public.business_location_rights_contexts;
CREATE TRIGGER business_location_rights_contexts_enforce_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.business_location_rights_contexts
  FOR EACH ROW
  EXECUTE FUNCTION public.business_location_rights_contexts_enforce();

REVOKE ALL ON FUNCTION public.business_location_rights_contexts_enforce() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.business_location_rights_contexts_enforce() FROM anon;
REVOKE ALL ON FUNCTION public.business_location_rights_contexts_enforce() FROM authenticated;

CREATE OR REPLACE FUNCTION public.business_location_rights_context_use_statuses_protect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status FROM public.business_location_rights_contexts WHERE id = OLD.context_id;
    IF v_status IS NULL THEN
      RETURN OLD;
    END IF;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'location_context_use_statuses_immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO v_status FROM public.business_location_rights_contexts WHERE id = NEW.context_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'location_context_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'location_context_use_statuses_immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.context_id IS DISTINCT FROM NEW.context_id THEN
    RAISE EXCEPTION 'location_context_use_statuses_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_location_rights_context_use_statuses_protect_biud
  ON public.business_location_rights_context_use_statuses;
CREATE TRIGGER business_location_rights_context_use_statuses_protect_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.business_location_rights_context_use_statuses
  FOR EACH ROW
  EXECUTE FUNCTION public.business_location_rights_context_use_statuses_protect();

REVOKE ALL ON FUNCTION public.business_location_rights_context_use_statuses_protect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.business_location_rights_context_use_statuses_protect() FROM anon;
REVOKE ALL ON FUNCTION public.business_location_rights_context_use_statuses_protect() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Helpers: historical grant / territory / eligibility resolution
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_rights_grant_covers_country(
  p_grant_id uuid,
  p_country_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope text;
  v_excluded boolean;
  v_included boolean;
BEGIN
  SELECT territory_scope INTO v_scope
  FROM public.music_rights_grants
  WHERE id = p_grant_id;

  IF v_scope IS NULL THEN
    RETURN false;
  END IF;

  IF v_scope = 'worldwide' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.music_rights_grant_countries
      WHERE grant_id = p_grant_id
        AND country_code = p_country_code
        AND effect = 'exclude'
    ) INTO v_excluded;
    RETURN NOT v_excluded;
  END IF;

  IF v_scope = 'countries' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.music_rights_grant_countries
      WHERE grant_id = p_grant_id
        AND country_code = p_country_code
        AND effect = 'include'
    ) INTO v_included;
    RETURN v_included;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.music_rights_grant_covers_country(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_grant_covers_country(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_grant_covers_country(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.music_rights_grant_covers_country(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.music_rights_grant_covers_country(uuid, text) TO postgres;

CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid,
  p_location_id uuid,
  p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback',
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_as_of timestamptz := coalesce(p_as_of, now());
  v_engine text := 'rights_eligibility_v1';
  v_track_code text;
  v_kind text;
  v_loc record;
  v_zone_loc uuid;
  v_profile record;
  v_context record;
  v_rule record;
  v_crs text;
  v_decision text := 'UNKNOWN';
  v_reasons text[] := ARRAY[]::text[];
  v_rec_ids uuid[] := ARRAY[]::uuid[];
  v_comp_ids uuid[] := ARRAY[]::uuid[];
  v_has_rec boolean := false;
  v_has_comp boolean := false;
  v_client_ok boolean := false;
BEGIN
  IF p_audio_item_id IS NULL THEN
    RAISE EXCEPTION 'audio_item_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_use_type IS NULL OR NOT public.music_rights_use_type_is_valid(p_use_type) THEN
    RAISE EXCEPTION 'use_type_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT ai.music_track_code, p.product_kind
  INTO v_track_code, v_kind
  FROM public.audio_items AS ai
  JOIN public.practices AS p ON p.id = ai.practice_id
  WHERE ai.id = p_audio_item_id;

  IF NOT FOUND OR v_kind IS NULL THEN
    RAISE EXCEPTION 'audio_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kind IS DISTINCT FROM 'music' THEN
    RAISE EXCEPTION 'audio_item_not_music' USING ERRCODE = '22023';
  END IF;

  SELECT id, country_code, business_category
  INTO v_loc
  FROM public.business_locations
  WHERE id = p_location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_zone_id IS NOT NULL THEN
    SELECT location_id INTO v_zone_loc
    FROM public.business_zones
    WHERE id = p_zone_id;
    IF v_zone_loc IS NULL THEN
      RAISE EXCEPTION 'zone_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_zone_loc IS DISTINCT FROM p_location_id THEN
      RAISE EXCEPTION 'zone_location_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Historical Country Profile: activated and not yet ceased at as_of
  SELECT *
  INTO v_profile
  FROM public.music_country_rights_profiles
  WHERE country_code = v_loc.country_code
    AND status IN ('active', 'superseded')
    AND activated_at IS NOT NULL
    AND activated_at <= v_as_of
    AND (ceased_at IS NULL OR v_as_of < ceased_at)
  ORDER BY version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'COUNTRY_RIGHTS_PROFILE_MISSING');
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', NULL,
      'country_profile_version', NULL,
      'location_rights_context_id', NULL,
      'location_rights_context_version', NULL,
      'recording_grant_ids', '[]'::jsonb,
      'composition_grant_ids', '[]'::jsonb,
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  SELECT *
  INTO v_context
  FROM public.business_location_rights_contexts
  WHERE location_id = p_location_id
    AND status IN ('active', 'superseded')
    AND activated_at IS NOT NULL
    AND activated_at <= v_as_of
    AND (ceased_at IS NULL OR v_as_of < ceased_at)
  ORDER BY version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'LOCATION_RIGHTS_CONTEXT_MISSING');
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', v_profile.id,
      'country_profile_version', v_profile.version,
      'location_rights_context_id', NULL,
      'location_rights_context_version', NULL,
      'recording_grant_ids', '[]'::jsonb,
      'composition_grant_ids', '[]'::jsonb,
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  IF v_context.country_code_snapshot IS DISTINCT FROM v_loc.country_code
     OR v_context.country_profile_id IS DISTINCT FROM v_profile.id
     OR v_context.country_code_snapshot IS DISTINCT FROM v_profile.country_code THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'LOCATION_RIGHTS_CONTEXT_MISMATCH');
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', v_profile.id,
      'country_profile_version', v_profile.version,
      'location_rights_context_id', v_context.id,
      'location_rights_context_version', v_context.version,
      'recording_grant_ids', '[]'::jsonb,
      'composition_grant_ids', '[]'::jsonb,
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  SELECT *
  INTO v_rule
  FROM public.music_country_rights_profile_rules
  WHERE profile_id = v_profile.id
    AND use_type = p_use_type;

  IF NOT FOUND THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'COUNTRY_USE_RULE_MISSING');
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', v_profile.id,
      'country_profile_version', v_profile.version,
      'location_rights_context_id', v_context.id,
      'location_rights_context_version', v_context.version,
      'recording_grant_ids', '[]'::jsonb,
      'composition_grant_ids', '[]'::jsonb,
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  IF v_rule.service_status = 'unsupported' THEN
    v_decision := 'INELIGIBLE';
    v_reasons := array_append(v_reasons, 'COUNTRY_USE_UNSUPPORTED');
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', v_profile.id,
      'country_profile_version', v_profile.version,
      'location_rights_context_id', v_context.id,
      'location_rights_context_version', v_context.version,
      'recording_grant_ids', '[]'::jsonb,
      'composition_grant_ids', '[]'::jsonb,
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  IF v_rule.service_status = 'unknown' THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'COUNTRY_USE_STATUS_UNKNOWN');
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', v_profile.id,
      'country_profile_version', v_profile.version,
      'location_rights_context_id', v_context.id,
      'location_rights_context_version', v_context.version,
      'recording_grant_ids', '[]'::jsonb,
      'composition_grant_ids', '[]'::jsonb,
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  -- service_status = supported → match historical grants
  SELECT coalesce(array_agg(rg.id ORDER BY rg.version, rg.id), ARRAY[]::uuid[])
  INTO v_rec_ids
  FROM public.music_rights_grants AS rg
  WHERE rg.audio_item_id = p_audio_item_id
    AND rg.rights_layer = 'recording'
    AND rg.use_type = p_use_type
    AND rg.verified_at IS NOT NULL
    AND rg.verified_at <= v_as_of
    AND rg.valid_from <= v_as_of
    AND (rg.valid_until IS NULL OR v_as_of < rg.valid_until)
    AND (rg.ceased_at IS NULL OR v_as_of < rg.ceased_at)
    AND public.music_rights_grant_covers_country(rg.id, v_loc.country_code);

  SELECT coalesce(array_agg(rg.id ORDER BY rg.version, rg.id), ARRAY[]::uuid[])
  INTO v_comp_ids
  FROM public.music_rights_grants AS rg
  WHERE rg.audio_item_id = p_audio_item_id
    AND rg.rights_layer = 'composition'
    AND rg.use_type = p_use_type
    AND rg.verified_at IS NOT NULL
    AND rg.verified_at <= v_as_of
    AND rg.valid_from <= v_as_of
    AND (rg.valid_until IS NULL OR v_as_of < rg.valid_until)
    AND (rg.ceased_at IS NULL OR v_as_of < rg.ceased_at)
    AND public.music_rights_grant_covers_country(rg.id, v_loc.country_code);

  v_has_rec := coalesce(cardinality(v_rec_ids), 0) > 0;
  v_has_comp := coalesce(cardinality(v_comp_ids), 0) > 0;

  IF v_rule.requires_recording AND NOT v_has_rec THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'RECORDING_RIGHTS_NOT_VERIFIED');
  END IF;

  IF v_rule.requires_composition AND NOT v_has_comp THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'COMPOSITION_RIGHTS_NOT_VERIFIED');
  END IF;

  IF cardinality(v_reasons) > 0 THEN
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', v_profile.id,
      'country_profile_version', v_profile.version,
      'location_rights_context_id', v_context.id,
      'location_rights_context_version', v_context.version,
      'recording_grant_ids', to_jsonb(v_rec_ids),
      'composition_grant_ids', to_jsonb(v_comp_ids),
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  -- Client requirement
  IF v_rule.client_requirement = 'unknown' THEN
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'CLIENT_REQUIREMENT_UNKNOWN');
    RETURN jsonb_build_object(
      'decision', v_decision,
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'location_id', p_location_id,
      'zone_id', p_zone_id,
      'country_code', v_loc.country_code,
      'use_type', p_use_type,
      'as_of', v_as_of,
      'engine_version', v_engine,
      'country_profile_id', v_profile.id,
      'country_profile_version', v_profile.version,
      'location_rights_context_id', v_context.id,
      'location_rights_context_version', v_context.version,
      'recording_grant_ids', to_jsonb(v_rec_ids),
      'composition_grant_ids', to_jsonb(v_comp_ids),
      'reason_codes', to_jsonb(v_reasons)
    );
  END IF;

  IF v_rule.client_requirement = 'none' THEN
    v_client_ok := true;
  ELSIF v_rule.client_requirement = 'required' THEN
    SELECT client_requirement_status INTO v_crs
    FROM public.business_location_rights_context_use_statuses
    WHERE context_id = v_context.id
      AND use_type = p_use_type;

    IF v_crs IS NULL OR v_crs = 'unknown' THEN
      v_decision := 'CONDITIONAL';
      v_reasons := array_append(v_reasons, 'CLIENT_REQUIREMENT_CONFIRMATION_REQUIRED');
      RETURN jsonb_build_object(
        'decision', v_decision,
        'audio_item_id', p_audio_item_id,
        'track_code', v_track_code,
        'location_id', p_location_id,
        'zone_id', p_zone_id,
        'country_code', v_loc.country_code,
        'use_type', p_use_type,
        'as_of', v_as_of,
        'engine_version', v_engine,
        'country_profile_id', v_profile.id,
        'country_profile_version', v_profile.version,
        'location_rights_context_id', v_context.id,
        'location_rights_context_version', v_context.version,
        'recording_grant_ids', to_jsonb(v_rec_ids),
        'composition_grant_ids', to_jsonb(v_comp_ids),
        'reason_codes', to_jsonb(v_reasons)
      );
    ELSIF v_crs = 'not_confirmed' THEN
      v_decision := 'CONDITIONAL';
      v_reasons := array_append(v_reasons, 'CLIENT_REQUIREMENT_NOT_CONFIRMED');
      RETURN jsonb_build_object(
        'decision', v_decision,
        'audio_item_id', p_audio_item_id,
        'track_code', v_track_code,
        'location_id', p_location_id,
        'zone_id', p_zone_id,
        'country_code', v_loc.country_code,
        'use_type', p_use_type,
        'as_of', v_as_of,
        'engine_version', v_engine,
        'country_profile_id', v_profile.id,
        'country_profile_version', v_profile.version,
        'location_rights_context_id', v_context.id,
        'location_rights_context_version', v_context.version,
        'recording_grant_ids', to_jsonb(v_rec_ids),
        'composition_grant_ids', to_jsonb(v_comp_ids),
        'reason_codes', to_jsonb(v_reasons)
      );
    ELSIF v_crs = 'confirmed' OR v_crs = 'not_required' THEN
      v_client_ok := true;
    ELSE
      v_decision := 'CONDITIONAL';
      v_reasons := array_append(v_reasons, 'CLIENT_REQUIREMENT_CONFIRMATION_REQUIRED');
      RETURN jsonb_build_object(
        'decision', v_decision,
        'audio_item_id', p_audio_item_id,
        'track_code', v_track_code,
        'location_id', p_location_id,
        'zone_id', p_zone_id,
        'country_code', v_loc.country_code,
        'use_type', p_use_type,
        'as_of', v_as_of,
        'engine_version', v_engine,
        'country_profile_id', v_profile.id,
        'country_profile_version', v_profile.version,
        'location_rights_context_id', v_context.id,
        'location_rights_context_version', v_context.version,
        'recording_grant_ids', to_jsonb(v_rec_ids),
        'composition_grant_ids', to_jsonb(v_comp_ids),
        'reason_codes', to_jsonb(v_reasons)
      );
    END IF;
  END IF;

  IF v_client_ok THEN
    v_decision := 'ELIGIBLE';
    v_reasons := array_append(v_reasons, 'ALL_RIGHTS_CONDITIONS_MET');
  ELSE
    v_decision := 'UNKNOWN';
    v_reasons := array_append(v_reasons, 'ELIGIBILITY_INCOMPLETE');
  END IF;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'audio_item_id', p_audio_item_id,
    'track_code', v_track_code,
    'location_id', p_location_id,
    'zone_id', p_zone_id,
    'country_code', v_loc.country_code,
    'use_type', p_use_type,
    'as_of', v_as_of,
    'engine_version', v_engine,
    'country_profile_id', v_profile.id,
    'country_profile_version', v_profile.version,
    'location_rights_context_id', v_context.id,
    'location_rights_context_version', v_context.version,
    'recording_grant_ids', to_jsonb(v_rec_ids),
    'composition_grant_ids', to_jsonb(v_comp_ids),
    'reason_codes', to_jsonb(v_reasons)
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) IS
  'audiolad:rights-eligibility; rights_eligibility_v1. Returns ELIGIBLE|INELIGIBLE|CONDITIONAL|UNKNOWN. UNKNOWN never defaults to ELIGIBLE. service_role only. No Aural wiring.';

REVOKE ALL ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_business_track_eligibility(uuid, uuid, uuid, text, timestamptz) TO postgres;

-- ---------------------------------------------------------------------------
-- RLS / privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.music_country_rights_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_country_rights_profile_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_location_rights_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_location_rights_context_use_statuses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.music_country_rights_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_country_rights_profile_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_location_rights_contexts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_location_rights_context_use_statuses FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.music_country_rights_profiles TO service_role;
GRANT ALL ON TABLE public.music_country_rights_profile_rules TO service_role;
GRANT ALL ON TABLE public.business_location_rights_contexts TO service_role;
GRANT ALL ON TABLE public.business_location_rights_context_use_statuses TO service_role;

GRANT ALL ON TABLE public.music_country_rights_profiles TO postgres;
GRANT ALL ON TABLE public.music_country_rights_profile_rules TO postgres;
GRANT ALL ON TABLE public.business_location_rights_contexts TO postgres;
GRANT ALL ON TABLE public.business_location_rights_context_use_statuses TO postgres;

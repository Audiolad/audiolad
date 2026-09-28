-- A4 Music Rights Foundation (Rights Passport v1 / Rights Grants Core)
-- Expand-only. Rights Grant = legal source of truth. Passport = projection.
-- No auto-map from Studio catalog permission fields.
-- No Country Eligibility / Location Context (A5). No Business UI. No Money.

-- ---------------------------------------------------------------------------
-- Rightsholder (global; Creator/Author ≠ Rightsholder)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_rightsholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  entity_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_rightsholders_display_name_nonempty
    CHECK (length(btrim(display_name)) > 0 AND length(display_name) <= 200),
  CONSTRAINT music_rightsholders_entity_type_check
    CHECK (entity_type IN ('person', 'organization')),
  CONSTRAINT music_rightsholders_status_check
    CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE public.music_rightsholders IS
  'audiolad:music-rights; global Rightsholder entity. Not Author. No author_id.';

COMMENT ON COLUMN public.music_rightsholders.display_name IS
  'Human-readable Rightsholder name (trimmed nonempty, max 200).';

-- ---------------------------------------------------------------------------
-- Rights Grant (primary legal fact)
-- audio_item_id: historical reference WITHOUT destructive FK to audio_items
-- (historical snapshot/reference semantics; legal history survives Track deletion).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_rights_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_item_id uuid NOT NULL,
  rightsholder_id uuid NOT NULL
    REFERENCES public.music_rightsholders (id) ON DELETE RESTRICT,
  rights_layer text NOT NULL,
  use_type text NOT NULL,
  territory_scope text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NULL,
  source_type text NOT NULL,
  source_reference text NULL,
  status text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  supersedes_grant_id uuid NULL
    REFERENCES public.music_rights_grants (id) ON DELETE RESTRICT,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_rights_grants_rights_layer_check
    CHECK (rights_layer IN ('recording', 'composition')),
  CONSTRAINT music_rights_grants_use_type_check
    CHECK (use_type IN (
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
    )),
  CONSTRAINT music_rights_grants_territory_scope_check
    CHECK (territory_scope IN ('worldwide', 'countries')),
  CONSTRAINT music_rights_grants_source_type_check
    CHECK (source_type IN (
      'platform_agreement',
      'direct_license',
      'contract',
      'distributor',
      'cmo_pro',
      'other'
    )),
  CONSTRAINT music_rights_grants_status_check
    CHECK (status IN ('draft', 'verified', 'superseded', 'revoked')),
  CONSTRAINT music_rights_grants_version_positive
    CHECK (version >= 1),
  CONSTRAINT music_rights_grants_validity_range_check
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT music_rights_grants_verified_at_invariant
    CHECK (
      (status = 'draft' AND verified_at IS NULL)
      OR (status IN ('verified', 'superseded', 'revoked') AND verified_at IS NOT NULL)
    ),
  CONSTRAINT music_rights_grants_source_reference_len
    CHECK (source_reference IS NULL OR length(source_reference) <= 500),
  CONSTRAINT music_rights_grants_no_self_supersede
    CHECK (supersedes_grant_id IS NULL OR supersedes_grant_id <> id)
);

-- One predecessor may have at most one successor version (NULLs allowed multiple times).
CREATE UNIQUE INDEX IF NOT EXISTS music_rights_grants_supersedes_uidx
  ON public.music_rights_grants (supersedes_grant_id)
  WHERE supersedes_grant_id IS NOT NULL;

COMMENT ON TABLE public.music_rights_grants IS
  'audiolad:music-rights; primary legal Rights Grant. Source of truth for Rights Passport projection. No organization_id (global catalog).';

COMMENT ON COLUMN public.music_rights_grants.audio_item_id IS
  'Current Track root UUID (audio_items.id). No destructive FK — legal history survives Track/Product deletion. Write path validates music Track existence.';

COMMENT ON COLUMN public.music_rights_grants.rights_layer IS
  'Semantic layer: recording | composition. Two grants may cover both for one audio_item_id. Not all_rights.';

COMMENT ON COLUMN public.music_rights_grants.use_type IS
  'Permissioned use vocabulary. One use_type does not imply others. Primary B2B: business_background_playback.';

COMMENT ON COLUMN public.music_rights_grants.territory_scope IS
  'worldwide | countries. Not a single global-boolean territory model. Country rows live in music_rights_grant_countries.';

COMMENT ON COLUMN public.music_rights_grants.status IS
  'Grant lifecycle draft|verified|superseded|revoked. Allowed: draft→verified; verified→superseded|revoked. Terminal: superseded, revoked. Not eligibility. Temporal expiration uses valid_until.';

-- ---------------------------------------------------------------------------
-- Territory countries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_rights_grant_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL
    REFERENCES public.music_rights_grants (id) ON DELETE CASCADE,
  country_code text NOT NULL,
  effect text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_rights_grant_countries_country_code_check
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT music_rights_grant_countries_effect_check
    CHECK (effect IN ('include', 'exclude')),
  CONSTRAINT music_rights_grant_countries_grant_country_effect_uidx
    UNIQUE (grant_id, country_code, effect)
);

COMMENT ON TABLE public.music_rights_grant_countries IS
  'audiolad:music-rights; territory rows. countries+include = allowlist; worldwide+exclude = worldwide excluding X. Identity only — not a legal coverage claim.';

CREATE INDEX IF NOT EXISTS music_rights_grants_audio_item_idx
  ON public.music_rights_grants (audio_item_id);

CREATE INDEX IF NOT EXISTS music_rights_grants_audio_item_status_idx
  ON public.music_rights_grants (audio_item_id, status);

CREATE INDEX IF NOT EXISTS music_rights_grants_rightsholder_idx
  ON public.music_rights_grants (rightsholder_id);

CREATE INDEX IF NOT EXISTS music_rights_grant_countries_grant_idx
  ON public.music_rights_grant_countries (grant_id);

CREATE INDEX IF NOT EXISTS music_rights_grant_countries_country_grant_idx
  ON public.music_rights_grant_countries (country_code, grant_id);

-- ---------------------------------------------------------------------------
-- updated_at helper (local; mirrors business_domain pattern)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_rights_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_rightsholders_set_updated_at ON public.music_rightsholders;
CREATE TRIGGER music_rightsholders_set_updated_at
  BEFORE UPDATE ON public.music_rightsholders
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_set_updated_at();

DROP TRIGGER IF EXISTS music_rights_grants_set_updated_at ON public.music_rights_grants;
CREATE TRIGGER music_rights_grants_set_updated_at
  BEFORE UPDATE ON public.music_rights_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_set_updated_at();

REVOKE ALL ON FUNCTION public.music_rights_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_set_updated_at() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Write-path: validate Track is music (no destructive FK)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_rights_grants_validate_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT p.product_kind
  INTO v_kind
  FROM public.audio_items AS ai
  JOIN public.practices AS p ON p.id = ai.practice_id
  WHERE ai.id = NEW.audio_item_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'audio_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kind IS DISTINCT FROM 'music' THEN
    RAISE EXCEPTION 'audio_item_not_music' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_rights_grants_validate_track_bi
  ON public.music_rights_grants;
CREATE TRIGGER music_rights_grants_validate_track_bi
  BEFORE INSERT ON public.music_rights_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_grants_validate_track();

REVOKE ALL ON FUNCTION public.music_rights_grants_validate_track() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_grants_validate_track() FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_grants_validate_track() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Territory coherence
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_rights_grant_countries_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope text;
BEGIN
  SELECT territory_scope INTO v_scope
  FROM public.music_rights_grants
  WHERE id = NEW.grant_id;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'grant_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_scope = 'worldwide' AND NEW.effect IS DISTINCT FROM 'exclude' THEN
    RAISE EXCEPTION 'worldwide_requires_exclude_effect' USING ERRCODE = '22023';
  END IF;

  IF v_scope = 'countries' AND NEW.effect IS DISTINCT FROM 'include' THEN
    RAISE EXCEPTION 'countries_requires_include_effect' USING ERRCODE = '22023';
  END IF;

  NEW.country_code := upper(btrim(NEW.country_code));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_rights_grant_countries_validate_bi
  ON public.music_rights_grant_countries;
CREATE TRIGGER music_rights_grant_countries_validate_bi
  BEFORE INSERT OR UPDATE ON public.music_rights_grant_countries
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_grant_countries_validate();

REVOKE ALL ON FUNCTION public.music_rights_grant_countries_validate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_grant_countries_validate() FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_grant_countries_validate() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Legal history hardening:
-- draft editable; non-draft immutable (incl. DELETE + territory);
-- lifecycle state machine; territory complete before verify; version chain.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_rights_grant_territory_coherent(
  p_grant_id uuid,
  p_territory_scope text
)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_include integer;
  v_exclude integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE effect = 'include'),
    count(*) FILTER (WHERE effect = 'exclude')
  INTO v_include, v_exclude
  FROM public.music_rights_grant_countries
  WHERE grant_id = p_grant_id;

  IF p_territory_scope = 'countries' THEN
    IF v_include < 1 THEN
      RAISE EXCEPTION 'grant_territory_incomplete' USING ERRCODE = '22023';
    END IF;
    IF v_exclude > 0 THEN
      RAISE EXCEPTION 'grant_territory_incoherent' USING ERRCODE = '22023';
    END IF;
  ELSIF p_territory_scope = 'worldwide' THEN
    IF v_include > 0 THEN
      RAISE EXCEPTION 'grant_territory_incoherent' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

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

  -- INSERT path: version chain + non-draft territory completeness
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

    IF NEW.status IS DISTINCT FROM 'draft' THEN
      IF NEW.status NOT IN ('verified', 'superseded', 'revoked') THEN
        RAISE EXCEPTION 'grant_status_invalid' USING ERRCODE = '22023';
      END IF;
      -- Direct insert into non-draft is allowed only when territory already coherent
      -- (countries must be attached after insert while draft — prefer draft→verify).
      -- For insert-as-verified worldwide with zero countries: OK.
      -- For insert-as-verified countries: fail (no rows yet at BEFORE INSERT).
      IF NEW.territory_scope = 'countries' THEN
        RAISE EXCEPTION 'grant_territory_incomplete' USING ERRCODE = '22023';
      END IF;
      PERFORM public.music_rights_grant_territory_coherent(NEW.id, NEW.territory_scope);
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE path
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    -- draft stays editable for substantive fields; still validate version chain if set
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

  -- Lifecycle transitions
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_allowed :=
      (OLD.status = 'draft' AND NEW.status = 'verified')
      OR (OLD.status = 'verified' AND NEW.status IN ('superseded', 'revoked'));
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'grant_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- verified_at immutable after leaving draft
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF OLD.verified_at IS DISTINCT FROM NEW.verified_at THEN
      RAISE EXCEPTION 'verified_at_immutable' USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.status = 'draft' AND NEW.status = 'verified' THEN
    IF NEW.verified_at IS NULL THEN
      RAISE EXCEPTION 'verified_at_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Substantive legal fields immutable once leaving draft / for non-draft
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

  -- Territory complete on draft → verified
  IF OLD.status = 'draft' AND NEW.status = 'verified' THEN
    PERFORM public.music_rights_grant_territory_coherent(NEW.id, NEW.territory_scope);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_rights_grants_protect_legal_fields_bu
  ON public.music_rights_grants;
DROP TRIGGER IF EXISTS music_rights_grants_enforce_legal_history_biud
  ON public.music_rights_grants;
CREATE TRIGGER music_rights_grants_enforce_legal_history_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.music_rights_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_grants_enforce_legal_history();

REVOKE ALL ON FUNCTION public.music_rights_grant_territory_coherent(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_grant_territory_coherent(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_grant_territory_coherent(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.music_rights_grants_enforce_legal_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_grants_enforce_legal_history() FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_grants_enforce_legal_history() FROM authenticated;
DROP FUNCTION IF EXISTS public.music_rights_grants_protect_legal_fields();

-- Territory rows: immutable when parent grant is non-draft
CREATE OR REPLACE FUNCTION public.music_rights_grant_countries_protect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_grant_id uuid;
BEGIN
  v_grant_id := coalesce(NEW.grant_id, OLD.grant_id);
  SELECT status INTO v_status
  FROM public.music_rights_grants
  WHERE id = v_grant_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'grant_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'grant_territory_immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_rights_grant_countries_protect_biud
  ON public.music_rights_grant_countries;
CREATE TRIGGER music_rights_grant_countries_protect_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.music_rights_grant_countries
  FOR EACH ROW
  EXECUTE FUNCTION public.music_rights_grant_countries_protect();

REVOKE ALL ON FUNCTION public.music_rights_grant_countries_protect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_rights_grant_countries_protect() FROM anon;
REVOKE ALL ON FUNCTION public.music_rights_grant_countries_protect() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Rights Passport Basic projection (service_role / internal only)
-- HAS_VERIFIED_GRANTS ≠ ELIGIBLE. No legal-eligibility flag.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_music_rights_passport_basic(
  p_audio_item_id uuid,
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
  v_track_code text;
  v_kind text;
  v_grants jsonb;
  v_count integer;
BEGIN
  IF p_audio_item_id IS NULL THEN
    RAISE EXCEPTION 'audio_item_id_required' USING ERRCODE = '22023';
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

  SELECT coalesce(jsonb_agg(g.payload ORDER BY g.valid_from, g.id), '[]'::jsonb),
         count(*)::integer
  INTO v_grants, v_count
  FROM (
    SELECT
      jsonb_build_object(
        'grant_id', rg.id,
        'rightsholder_id', rg.rightsholder_id,
        'rights_layer', rg.rights_layer,
        'use_type', rg.use_type,
        'territory_scope', rg.territory_scope,
        'valid_from', rg.valid_from,
        'valid_until', rg.valid_until,
        'source_type', rg.source_type,
        'status', rg.status,
        'version', rg.version,
        'verified_at', rg.verified_at,
        'countries', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'country_code', c.country_code,
              'effect', c.effect
            )
            ORDER BY c.country_code, c.effect
          )
          FROM public.music_rights_grant_countries AS c
          WHERE c.grant_id = rg.id
        ), '[]'::jsonb)
      ) AS payload,
      rg.valid_from,
      rg.id
    FROM public.music_rights_grants AS rg
    WHERE rg.audio_item_id = p_audio_item_id
      AND rg.status = 'verified'
      AND rg.valid_from <= v_as_of
      AND (rg.valid_until IS NULL OR rg.valid_until > v_as_of)
  ) AS g;

  RETURN jsonb_build_object(
    'audio_item_id', p_audio_item_id,
    'track_code', v_track_code,
    'as_of', v_as_of,
    'review_status', CASE
      WHEN v_count > 0 THEN 'HAS_VERIFIED_GRANTS'
      ELSE 'REVIEW_REQUIRED'
    END,
    'active_grants', v_grants
  );
END;
$$;

COMMENT ON FUNCTION public.get_music_rights_passport_basic(uuid, timestamptz) IS
  'audiolad:music-rights; Rights Passport Basic projection from verified in-term grants. Missing track → audio_item_not_found; non-music → audio_item_not_music; music without verified in-term grants → REVIEW_REQUIRED. Never returns legal eligibility. service_role only.';

REVOKE ALL ON FUNCTION public.get_music_rights_passport_basic(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_music_rights_passport_basic(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_music_rights_passport_basic(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_music_rights_passport_basic(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_music_rights_passport_basic(uuid, timestamptz) TO postgres;

-- ---------------------------------------------------------------------------
-- RLS / privileges — raw rights tables not browser-readable
-- ---------------------------------------------------------------------------

ALTER TABLE public.music_rightsholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_rights_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_rights_grant_countries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.music_rightsholders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_rights_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_rights_grant_countries FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.music_rightsholders TO service_role;
GRANT ALL ON TABLE public.music_rights_grants TO service_role;
GRANT ALL ON TABLE public.music_rights_grant_countries TO service_role;

GRANT ALL ON TABLE public.music_rightsholders TO postgres;
GRANT ALL ON TABLE public.music_rights_grants TO postgres;
GRANT ALL ON TABLE public.music_rights_grant_countries TO postgres;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'music_rightsholders',
        'music_rights_grants',
        'music_rights_grant_countries'
      )
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'music rights tables must not grant browser roles SELECT/INSERT/UPDATE/DELETE';
  END IF;
END;
$$;

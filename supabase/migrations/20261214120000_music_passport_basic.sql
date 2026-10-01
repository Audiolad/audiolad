-- P1-01 Music Passport Basic (product path, Analyzer stage 1).
-- Expand-only. No catalog backfill. No rights grants. No eligibility.
-- Not music_lab_* (R&D console). Not get_music_rights_passport_basic (A4 projection).
-- Track Identity (audio_items.id / music_track_code) is not altered.
--
-- MERGE: review. DEPLOY / PRODUCTION_DB_APPLY: only after this migration is accepted.
-- Safe to apply on production: new tables + functions only.

-- ---------------------------------------------------------------------------
-- Versioned passport. One sealed active row per music audio_item.
-- Historical rows stay readable at as_of. Snapshots are not edited in place.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_passport_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_item_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL,
  analysis_version text NOT NULL,
  observed_at timestamptz NOT NULL,
  supersedes_passport_id uuid NULL
    REFERENCES public.music_passport_versions (id) ON DELETE RESTRICT,
  activated_at timestamptz NOT NULL,
  ceased_at timestamptz NULL,
  sealed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_passport_versions_version_positive
    CHECK (version >= 1),
  CONSTRAINT music_passport_versions_status_check
    CHECK (status IN ('active', 'superseded')),
  CONSTRAINT music_passport_versions_status_window
    CHECK (
      (status = 'active' AND ceased_at IS NULL)
      OR (status = 'superseded' AND ceased_at IS NOT NULL)
    ),
  CONSTRAINT music_passport_versions_observed_before_activation
    CHECK (observed_at <= activated_at),
  CONSTRAINT music_passport_versions_ceased_after_activation
    CHECK (ceased_at IS NULL OR ceased_at > activated_at),
  CONSTRAINT music_passport_versions_sealed_after_activation
    CHECK (sealed_at IS NULL OR sealed_at >= activated_at),
  CONSTRAINT music_passport_versions_analysis_version_check
    CHECK (analysis_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  CONSTRAINT music_passport_versions_no_self_supersede
    CHECK (supersedes_passport_id IS NULL OR supersedes_passport_id <> id)
);

COMMENT ON TABLE public.music_passport_versions IS
  'audiolad:music-passport; versioned Music Passport Basic for one music audio_item. Sonic attributes only. Not a rights grant, not a rights projection, not a music_lab experiment.';

COMMENT ON COLUMN public.music_passport_versions.audio_item_id IS
  'Track root UUID (audio_items.id). No destructive FK — passport history is not cascaded away with the track. Write path requires product_kind=music and a music_track_code.';

COMMENT ON COLUMN public.music_passport_versions.version IS
  'Monotonic passport snapshot number for this audio_item. Distinct from analysis_version (pipeline label).';

COMMENT ON COLUMN public.music_passport_versions.analysis_version IS
  'Analyzer / operator pipeline label for this snapshot (stage 1). Not a legal version and not music_track_code.';

COMMENT ON COLUMN public.music_passport_versions.observed_at IS
  'When the measurement or interpretation was taken. Caller-supplied. Must be <= activated_at and not in the future at write time.';

COMMENT ON COLUMN public.music_passport_versions.activated_at IS
  'Server clock_timestamp() when this snapshot became effective. Read as_of uses this window.';

COMMENT ON COLUMN public.music_passport_versions.ceased_at IS
  'Server clock when this snapshot was superseded. Effective while as_of < ceased_at. Not updated_at.';

COMMENT ON COLUMN public.music_passport_versions.sealed_at IS
  'Server clock when the attribute set was closed. Unsealed rows are invisible to the read path.';

CREATE UNIQUE INDEX IF NOT EXISTS music_passport_versions_audio_version_uidx
  ON public.music_passport_versions (audio_item_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS music_passport_versions_one_active_uidx
  ON public.music_passport_versions (audio_item_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS music_passport_versions_supersedes_uidx
  ON public.music_passport_versions (supersedes_passport_id)
  WHERE supersedes_passport_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS music_passport_versions_effective_idx
  ON public.music_passport_versions (audio_item_id, activated_at DESC);

-- ---------------------------------------------------------------------------
-- Attributes. origin separates measured facts from interpretation.
-- provenance records who wrote the value (pipeline vs operator).
-- Missing attribute = unknown. Never a stored zero default.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_passport_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id uuid NOT NULL
    REFERENCES public.music_passport_versions (id) ON DELETE RESTRICT,
  attribute_key text NOT NULL,
  origin text NOT NULL,
  value_numeric numeric NULL,
  value_text text NULL,
  confidence numeric NULL,
  provenance text NOT NULL,
  source_ref text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_passport_attributes_key_check
    CHECK (attribute_key IN (
      'bpm',
      'musical_key',
      'mode',
      'energy',
      'loudness_lufs',
      'vocal_role',
      'genre_class',
      'mood',
      'instrument'
    )),
  CONSTRAINT music_passport_attributes_origin_check
    CHECK (origin IN ('measured', 'interpreted')),
  CONSTRAINT music_passport_attributes_provenance_check
    CHECK (provenance IN ('analyzer', 'manual')),
  CONSTRAINT music_passport_attributes_source_ref_len
    CHECK (source_ref IS NULL OR length(source_ref) <= 200),
  CONSTRAINT music_passport_attributes_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT music_passport_attributes_measured_confidence
    CHECK (origin IS DISTINCT FROM 'measured' OR confidence IS NOT NULL)
);

COMMENT ON TABLE public.music_passport_attributes IS
  'audiolad:music-passport; one measured or interpreted value inside a sealed passport version. Measured confidence is required. Interpreted confidence may be absent. Not rights, not eligibility.';

COMMENT ON COLUMN public.music_passport_attributes.origin IS
  'measured = signal/classifier fact. interpreted = a reading of that fact (operator or later model). The same attribute_key may exist in both origins and they must not be collapsed.';

COMMENT ON COLUMN public.music_passport_attributes.provenance IS
  'analyzer = written by the analysis pipeline. manual = written by an operator. Independent of origin: a measured BPM may be manual, an interpreted mood may come from a model.';

COMMENT ON COLUMN public.music_passport_attributes.attribute_key IS
  'Stage-1 storage keys. musical_key stores the ROADMAP/Bible key slot. genre_class stores the genre slot. Names are a storage proposal mapped in docs/DECISIONS.md; Track Identity canon is unchanged.';

CREATE UNIQUE INDEX IF NOT EXISTS music_passport_attributes_scalar_uidx
  ON public.music_passport_attributes (passport_id, attribute_key, origin)
  WHERE attribute_key IN (
    'bpm', 'musical_key', 'mode', 'energy', 'loudness_lufs', 'vocal_role'
  );

CREATE UNIQUE INDEX IF NOT EXISTS music_passport_attributes_multi_uidx
  ON public.music_passport_attributes (passport_id, attribute_key, origin, value_text)
  WHERE attribute_key IN ('genre_class', 'mood', 'instrument');

CREATE INDEX IF NOT EXISTS music_passport_attributes_passport_origin_idx
  ON public.music_passport_attributes (passport_id, origin);

-- ---------------------------------------------------------------------------
-- Validation (shared by the write RPC and the insert trigger)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_passport_check_attribute(
  p_attribute_key text,
  p_origin text,
  p_value_numeric numeric,
  p_value_text text,
  p_confidence numeric,
  p_provenance text,
  p_source_ref text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_text text := NULLIF(btrim(coalesce(p_value_text, '')), '');
BEGIN
  IF p_attribute_key IS NULL OR p_attribute_key NOT IN (
    'bpm', 'musical_key', 'mode', 'energy', 'loudness_lufs', 'vocal_role',
    'genre_class', 'mood', 'instrument'
  ) THEN
    RAISE EXCEPTION 'music_passport_attribute_unknown' USING ERRCODE = '22023';
  END IF;

  IF p_origin IS NULL OR p_origin NOT IN ('measured', 'interpreted') THEN
    RAISE EXCEPTION 'music_passport_origin_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_provenance IS NULL OR p_provenance NOT IN ('analyzer', 'manual') THEN
    RAISE EXCEPTION 'music_passport_provenance_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_source_ref IS NOT NULL AND length(p_source_ref) > 200 THEN
    RAISE EXCEPTION 'music_passport_attribute_shape' USING ERRCODE = '22023';
  END IF;

  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1) THEN
    RAISE EXCEPTION 'music_passport_confidence_range' USING ERRCODE = '22023';
  END IF;

  IF p_origin = 'measured' AND p_confidence IS NULL THEN
    RAISE EXCEPTION 'music_passport_measured_confidence_required' USING ERRCODE = '22023';
  END IF;

  IF p_attribute_key IN ('bpm', 'energy', 'loudness_lufs') THEN
    IF p_value_numeric IS NULL OR p_value_text IS NOT NULL THEN
      RAISE EXCEPTION 'music_passport_value_conflict' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_text IS NULL OR p_value_numeric IS NOT NULL THEN
      RAISE EXCEPTION 'music_passport_value_conflict' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_attribute_key = 'bpm' AND (p_value_numeric < 20 OR p_value_numeric > 300) THEN
    RAISE EXCEPTION 'music_passport_bpm_range' USING ERRCODE = '22023';
  END IF;

  IF p_attribute_key = 'energy' AND (p_value_numeric < 0 OR p_value_numeric > 1) THEN
    RAISE EXCEPTION 'music_passport_energy_range' USING ERRCODE = '22023';
  END IF;

  IF p_attribute_key = 'loudness_lufs'
     AND (p_value_numeric < -80 OR p_value_numeric > 5) THEN
    RAISE EXCEPTION 'music_passport_loudness_range' USING ERRCODE = '22023';
  END IF;

  IF p_attribute_key = 'musical_key' AND v_text NOT IN (
    'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'
  ) THEN
    RAISE EXCEPTION 'music_passport_musical_key_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_attribute_key = 'mode' AND v_text NOT IN ('major', 'minor') THEN
    RAISE EXCEPTION 'music_passport_mode_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_attribute_key = 'vocal_role'
     AND v_text NOT IN ('instrumental', 'vocal', 'mixed', 'spoken') THEN
    RAISE EXCEPTION 'music_passport_vocal_role_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_attribute_key IN ('genre_class', 'mood', 'instrument')
     AND v_text !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'music_passport_slug_invalid' USING ERRCODE = '22023';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.music_passport_check_attribute(text, text, numeric, text, numeric, text, text) IS
  'audiolad:music-passport; stage-1 attribute guard. Internal. Measured values require confidence. Does not accept rights or playback-decision fields.';

CREATE OR REPLACE FUNCTION public.music_passport_versions_protect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pred public.music_passport_versions%ROWTYPE;
  v_same boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'music_passport_history_immutable' USING ERRCODE = '55000';
  END IF;

  IF current_setting('audiolad.music_passport_write', true) IS DISTINCT FROM 'upsert' THEN
    RAISE EXCEPTION 'music_passport_write_path' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'active' OR NEW.ceased_at IS NOT NULL OR NEW.sealed_at IS NOT NULL THEN
      RAISE EXCEPTION 'music_passport_lifecycle_forbidden' USING ERRCODE = '22023';
    END IF;
    IF NEW.activated_at IS NULL
       OR NEW.observed_at IS NULL
       OR NEW.observed_at > NEW.activated_at THEN
      RAISE EXCEPTION 'music_passport_observed_at_invalid' USING ERRCODE = '22023';
    END IF;
    IF NEW.analysis_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
      RAISE EXCEPTION 'music_passport_analysis_version_invalid' USING ERRCODE = '22023';
    END IF;

    IF NEW.supersedes_passport_id IS NULL THEN
      IF NEW.version <> 1 THEN
        RAISE EXCEPTION 'music_passport_version_root' USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT * INTO v_pred
      FROM public.music_passport_versions
      WHERE id = NEW.supersedes_passport_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'supersedes_passport_not_found' USING ERRCODE = 'P0002';
      END IF;
      IF v_pred.audio_item_id IS DISTINCT FROM NEW.audio_item_id THEN
        RAISE EXCEPTION 'supersedes_audio_item_mismatch' USING ERRCODE = '22023';
      END IF;
      IF v_pred.status IS DISTINCT FROM 'superseded' THEN
        RAISE EXCEPTION 'supersedes_passport_not_closed' USING ERRCODE = '22023';
      END IF;
      IF NEW.version IS DISTINCT FROM (v_pred.version + 1) THEN
        RAISE EXCEPTION 'supersedes_version_mismatch' USING ERRCODE = '22023';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  v_same :=
    NEW.id = OLD.id
    AND NEW.audio_item_id = OLD.audio_item_id
    AND NEW.version = OLD.version
    AND NEW.analysis_version = OLD.analysis_version
    AND NEW.observed_at = OLD.observed_at
    AND NEW.supersedes_passport_id IS NOT DISTINCT FROM OLD.supersedes_passport_id
    AND NEW.activated_at = OLD.activated_at
    AND NEW.created_at = OLD.created_at;

  IF v_same
     AND OLD.status = 'active'
     AND NEW.status = 'active'
     AND OLD.ceased_at IS NULL
     AND NEW.ceased_at IS NULL
     AND OLD.sealed_at IS NULL
     AND NEW.sealed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_same
     AND OLD.status = 'active'
     AND NEW.status = 'superseded'
     AND OLD.ceased_at IS NULL
     AND NEW.ceased_at IS NOT NULL
     AND NEW.ceased_at > OLD.activated_at
     AND OLD.sealed_at IS NOT NULL
     AND NEW.sealed_at IS NOT DISTINCT FROM OLD.sealed_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'music_passport_immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS music_passport_versions_protect_biud
  ON public.music_passport_versions;
CREATE TRIGGER music_passport_versions_protect_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.music_passport_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.music_passport_versions_protect();

CREATE OR REPLACE FUNCTION public.music_passport_attributes_protect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sealed timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'music_passport_attribute_immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'music_passport_attribute_immutable' USING ERRCODE = '55000';
  END IF;

  IF current_setting('audiolad.music_passport_write', true) IS DISTINCT FROM 'upsert' THEN
    RAISE EXCEPTION 'music_passport_write_path' USING ERRCODE = '42501';
  END IF;

  SELECT sealed_at
  INTO v_sealed
  FROM public.music_passport_versions
  WHERE id = NEW.passport_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'music_passport_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sealed IS NOT NULL THEN
    RAISE EXCEPTION 'music_passport_attribute_sealed' USING ERRCODE = '55000';
  END IF;

  PERFORM public.music_passport_check_attribute(
    NEW.attribute_key,
    NEW.origin,
    NEW.value_numeric,
    NEW.value_text,
    NEW.confidence,
    NEW.provenance,
    NEW.source_ref
  );

  IF NEW.attribute_key IN ('genre_class', 'mood', 'instrument', 'musical_key', 'mode', 'vocal_role') THEN
    NEW.value_text := btrim(NEW.value_text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_passport_attributes_protect_biud
  ON public.music_passport_attributes;
CREATE TRIGGER music_passport_attributes_protect_biud
  BEFORE INSERT OR UPDATE OR DELETE ON public.music_passport_attributes
  FOR EACH ROW
  EXECUTE FUNCTION public.music_passport_attributes_protect();

REVOKE ALL ON FUNCTION public.music_passport_check_attribute(text, text, numeric, text, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_passport_check_attribute(text, text, numeric, text, numeric, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.music_passport_check_attribute(text, text, numeric, text, numeric, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.music_passport_versions_protect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_passport_versions_protect() FROM anon;
REVOKE ALL ON FUNCTION public.music_passport_versions_protect() FROM authenticated;
REVOKE ALL ON FUNCTION public.music_passport_attributes_protect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_passport_attributes_protect() FROM anon;
REVOKE ALL ON FUNCTION public.music_passport_attributes_protect() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Read path. NO_PASSPORT is an empty snapshot, not invented attributes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.music_passport_require_track(p_audio_item_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_track_code text;
  v_kind text;
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
  IF v_track_code IS NULL THEN
    RAISE EXCEPTION 'music_track_code_required' USING ERRCODE = '22023';
  END IF;

  RETURN v_track_code;
END;
$$;

COMMENT ON FUNCTION public.music_passport_require_track(uuid) IS
  'audiolad:music-passport; resolve a music Track Identity. Missing row → audio_item_not_found. Non-music → audio_item_not_music. Music without AL-T code → music_track_code_required. Does not allocate codes.';

CREATE OR REPLACE FUNCTION public.music_passport_origin_json(
  p_passport_id uuid,
  p_origin text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
BEGIN
  IF p_origin NOT IN ('measured', 'interpreted') THEN
    RAISE EXCEPTION 'music_passport_origin_invalid' USING ERRCODE = '22023';
  END IF;

  FOR v_key IN
    SELECT DISTINCT a.attribute_key
    FROM public.music_passport_attributes AS a
    WHERE a.passport_id = p_passport_id
      AND a.origin = p_origin
    ORDER BY a.attribute_key
  LOOP
    IF v_key IN ('genre_class', 'mood', 'instrument') THEN
      SELECT coalesce(
        jsonb_agg(item.payload ORDER BY item.value_text, item.provenance),
        '[]'::jsonb
      )
      INTO v_value
      FROM (
        SELECT
          a.value_text,
          a.provenance,
          jsonb_build_object(
            'value_numeric', a.value_numeric,
            'value_text', a.value_text,
            'confidence', a.confidence,
            'provenance', a.provenance,
            'source_ref', a.source_ref
          ) AS payload
        FROM public.music_passport_attributes AS a
        WHERE a.passport_id = p_passport_id
          AND a.origin = p_origin
          AND a.attribute_key = v_key
      ) AS item;
    ELSE
      SELECT jsonb_build_object(
        'value_numeric', a.value_numeric,
        'value_text', a.value_text,
        'confidence', a.confidence,
        'provenance', a.provenance,
        'source_ref', a.source_ref
      )
      INTO v_value
      FROM public.music_passport_attributes AS a
      WHERE a.passport_id = p_passport_id
        AND a.origin = p_origin
        AND a.attribute_key = v_key;
    END IF;

    v_result := v_result || jsonb_build_object(v_key, v_value);
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.music_passport_origin_json(uuid, text) IS
  'audiolad:music-passport; internal JSON for one origin. Absent keys are omitted. Multi-value keys are arrays. Does not fill defaults.';

CREATE OR REPLACE FUNCTION public.get_music_passport_basic(
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
  v_count integer;
  v_row public.music_passport_versions%ROWTYPE;
BEGIN
  v_track_code := public.music_passport_require_track(p_audio_item_id);

  SELECT count(*)::integer
  INTO v_count
  FROM public.music_passport_versions
  WHERE audio_item_id = p_audio_item_id
    AND sealed_at IS NOT NULL
    AND activated_at <= v_as_of
    AND (ceased_at IS NULL OR v_as_of < ceased_at);

  IF v_count > 1 THEN
    RAISE EXCEPTION 'music_passport_effective_ambiguous' USING ERRCODE = '55000';
  END IF;

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'object', 'music_passport_basic',
      'audio_item_id', p_audio_item_id,
      'track_code', v_track_code,
      'as_of', v_as_of,
      'status', 'NO_PASSPORT',
      'passport', NULL
    );
  END IF;

  SELECT *
  INTO v_row
  FROM public.music_passport_versions
  WHERE audio_item_id = p_audio_item_id
    AND sealed_at IS NOT NULL
    AND activated_at <= v_as_of
    AND (ceased_at IS NULL OR v_as_of < ceased_at);

  RETURN jsonb_build_object(
    'object', 'music_passport_basic',
    'audio_item_id', p_audio_item_id,
    'track_code', v_track_code,
    'as_of', v_as_of,
    'status', 'HAS_PASSPORT',
    'passport', jsonb_build_object(
      'id', v_row.id,
      'version', v_row.version,
      'analysis_version', v_row.analysis_version,
      'observed_at', v_row.observed_at,
      'activated_at', v_row.activated_at,
      'ceased_at', v_row.ceased_at,
      'measured', public.music_passport_origin_json(v_row.id, 'measured'),
      'interpreted', public.music_passport_origin_json(v_row.id, 'interpreted')
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_music_passport_basic(uuid, timestamptz) IS
  'audiolad:music-passport; Music Passport Basic read for a future Engine. status NO_PASSPORT means no sealed snapshot at as_of — attributes are null, not zeroes. HAS_PASSPORT is not a rights projection and is not get_music_rights_passport_basic. service_role only.';

-- ---------------------------------------------------------------------------
-- Write path. Full snapshot per version. Previous sealed active row is superseded.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_music_passport_basic(
  p_audio_item_id uuid,
  p_analysis_version text,
  p_observed_at timestamptz,
  p_attributes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_prev_id uuid;
  v_prev_version integer;
  v_prev_sealed timestamptz;
  v_new_id uuid;
  v_obj jsonb;
  v_key text;
  v_origin text;
  v_provenance text;
  v_source_ref text;
  v_text text;
  v_num numeric;
  v_confidence numeric;
  v_seen text[] := ARRAY[]::text[];
  v_slot text;
  v_n integer;
BEGIN
  PERFORM public.music_passport_require_track(p_audio_item_id);

  PERFORM 1
  FROM public.audio_items
  WHERE id = p_audio_item_id
  FOR UPDATE;

  IF p_analysis_version IS NULL
     OR p_analysis_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'music_passport_analysis_version_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_observed_at IS NULL THEN
    RAISE EXCEPTION 'music_passport_observed_at_required' USING ERRCODE = '22023';
  END IF;

  v_now := clock_timestamp();
  IF p_observed_at > v_now THEN
    RAISE EXCEPTION 'music_passport_observed_at_future' USING ERRCODE = '22023';
  END IF;

  IF p_attributes IS NULL
     OR jsonb_typeof(p_attributes) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_attributes) < 1 THEN
    RAISE EXCEPTION 'music_passport_attributes_required' USING ERRCODE = '22023';
  END IF;

  v_n := jsonb_array_length(p_attributes);
  IF v_n > 32 THEN
    RAISE EXCEPTION 'music_passport_attributes_too_many' USING ERRCODE = '22023';
  END IF;

  SELECT id, version, sealed_at
  INTO v_prev_id, v_prev_version, v_prev_sealed
  FROM public.music_passport_versions
  WHERE audio_item_id = p_audio_item_id
    AND status = 'active'
  FOR UPDATE;

  IF FOUND AND v_prev_sealed IS NULL THEN
    RAISE EXCEPTION 'music_passport_unsealed' USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('audiolad.music_passport_write', 'upsert', true);

  IF v_prev_id IS NOT NULL THEN
    UPDATE public.music_passport_versions
    SET status = 'superseded',
        ceased_at = v_now,
        updated_at = v_now
    WHERE id = v_prev_id;
  END IF;

  INSERT INTO public.music_passport_versions (
    audio_item_id,
    version,
    status,
    analysis_version,
    observed_at,
    supersedes_passport_id,
    activated_at,
    ceased_at,
    sealed_at
  ) VALUES (
    p_audio_item_id,
    coalesce(v_prev_version, 0) + 1,
    'active',
    p_analysis_version,
    p_observed_at,
    v_prev_id,
    v_now,
    NULL,
    NULL
  )
  RETURNING id INTO v_new_id;

  FOR v_obj IN
    SELECT value FROM jsonb_array_elements(p_attributes) AS attrs(value)
  LOOP
    IF jsonb_typeof(v_obj) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'music_passport_attribute_shape' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_object_keys(v_obj) AS object_key
      WHERE object_key NOT IN (
        'attribute_key',
        'origin',
        'value_numeric',
        'value_text',
        'confidence',
        'provenance',
        'source_ref'
      )
    ) THEN
      RAISE EXCEPTION 'music_passport_attribute_shape' USING ERRCODE = '22023';
    END IF;

    v_key := v_obj->>'attribute_key';
    v_origin := v_obj->>'origin';
    v_provenance := v_obj->>'provenance';
    v_source_ref := NULLIF(btrim(coalesce(v_obj->>'source_ref', '')), '');

    IF v_obj ? 'value_numeric'
       AND jsonb_typeof(v_obj->'value_numeric') IS DISTINCT FROM 'null' THEN
      IF jsonb_typeof(v_obj->'value_numeric') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'music_passport_attribute_shape' USING ERRCODE = '22023';
      END IF;
      v_num := (v_obj->>'value_numeric')::numeric;
    ELSE
      v_num := NULL;
    END IF;

    IF v_obj ? 'value_text'
       AND jsonb_typeof(v_obj->'value_text') IS DISTINCT FROM 'null' THEN
      IF jsonb_typeof(v_obj->'value_text') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'music_passport_attribute_shape' USING ERRCODE = '22023';
      END IF;
      v_text := NULLIF(btrim(v_obj->>'value_text'), '');
    ELSE
      v_text := NULL;
    END IF;

    IF v_obj ? 'confidence'
       AND jsonb_typeof(v_obj->'confidence') IS DISTINCT FROM 'null' THEN
      IF jsonb_typeof(v_obj->'confidence') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'music_passport_attribute_shape' USING ERRCODE = '22023';
      END IF;
      v_confidence := (v_obj->>'confidence')::numeric;
    ELSE
      v_confidence := NULL;
    END IF;

    PERFORM public.music_passport_check_attribute(
      v_key,
      v_origin,
      v_num,
      v_text,
      v_confidence,
      v_provenance,
      v_source_ref
    );

    IF v_key IN ('bpm', 'musical_key', 'mode', 'energy', 'loudness_lufs', 'vocal_role') THEN
      v_slot := v_key || ':' || v_origin;
    ELSE
      v_slot := v_key || ':' || v_origin || ':' || coalesce(v_text, '');
    END IF;

    IF v_slot = ANY (v_seen) THEN
      RAISE EXCEPTION 'music_passport_attribute_duplicate' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_slot);

    INSERT INTO public.music_passport_attributes (
      passport_id,
      attribute_key,
      origin,
      value_numeric,
      value_text,
      confidence,
      provenance,
      source_ref
    ) VALUES (
      v_new_id,
      v_key,
      v_origin,
      v_num,
      v_text,
      v_confidence,
      v_provenance,
      v_source_ref
    );
  END LOOP;

  UPDATE public.music_passport_versions
  SET sealed_at = v_now,
      updated_at = v_now
  WHERE id = v_new_id;

  PERFORM set_config('audiolad.music_passport_write', '', true);

  RETURN public.get_music_passport_basic(p_audio_item_id, v_now);
END;
$$;

COMMENT ON FUNCTION public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb) IS
  'audiolad:music-passport; append a sealed Music Passport Basic snapshot for one music audio_item. Replaces the previous active snapshot by supersede. Does not backfill the catalog, does not write music_lab_* or music_rights_*, and does not return a playback decision. service_role only.';

REVOKE ALL ON FUNCTION public.music_passport_require_track(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_passport_require_track(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.music_passport_require_track(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.music_passport_origin_json(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.music_passport_origin_json(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.music_passport_origin_json(uuid, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.get_music_passport_basic(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_music_passport_basic(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_music_passport_basic(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_music_passport_basic(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_music_passport_basic(uuid, timestamptz) TO postgres;

REVOKE ALL ON FUNCTION public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_music_passport_basic(uuid, text, timestamptz, jsonb) TO postgres;

-- ---------------------------------------------------------------------------
-- RLS. Raw passport tables are not browser-readable.
-- ---------------------------------------------------------------------------

ALTER TABLE public.music_passport_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_passport_attributes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.music_passport_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_passport_attributes FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.music_passport_versions TO service_role;
GRANT ALL ON TABLE public.music_passport_attributes TO service_role;
GRANT ALL ON TABLE public.music_passport_versions TO postgres;
GRANT ALL ON TABLE public.music_passport_attributes TO postgres;

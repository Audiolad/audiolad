-- Jazz Relax pilot: bind a track passport version to one analyzer run and
-- store immutable album passport versions built only from those track versions.
-- Expand-only. No catalog backfill. No row rewrites of historical passports.
-- The application allowlist is the Jazz Relax author UUID. This migration does
-- not grant authors access to music-analyzer HTTP or to passport tables.

-- ---------------------------------------------------------------------------
-- Track passport version points at the run. Structured fields are a copy of
-- the values step 3 needs. The full analyzer JSON stays on music_analyzer_runs.
-- ---------------------------------------------------------------------------

ALTER TABLE public.music_passport_versions
  ADD COLUMN IF NOT EXISTS analyzer_run_id uuid NULL
    REFERENCES public.music_analyzer_runs (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_sha256 text NULL,
  ADD COLUMN IF NOT EXISTS analyzer_git_commit text NULL,
  ADD COLUMN IF NOT EXISTS analyzer_version_text text NULL,
  ADD COLUMN IF NOT EXISTS structured_fields jsonb NULL;

ALTER TABLE public.music_passport_versions
  DROP CONSTRAINT IF EXISTS music_passport_versions_source_sha256_check;

ALTER TABLE public.music_passport_versions
  ADD CONSTRAINT music_passport_versions_source_sha256_check
  CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE public.music_passport_versions
  DROP CONSTRAINT IF EXISTS music_passport_versions_analyzer_git_commit_check;

ALTER TABLE public.music_passport_versions
  ADD CONSTRAINT music_passport_versions_analyzer_git_commit_check
  CHECK (
    analyzer_git_commit IS NULL
    OR analyzer_git_commit ~ '^[0-9a-fA-F]{7,64}$'
  );

ALTER TABLE public.music_passport_versions
  DROP CONSTRAINT IF EXISTS music_passport_versions_analyzer_version_text_check;

ALTER TABLE public.music_passport_versions
  ADD CONSTRAINT music_passport_versions_analyzer_version_text_check
  CHECK (
    analyzer_version_text IS NULL
    OR char_length(analyzer_version_text) BETWEEN 1 AND 200
  );

COMMENT ON COLUMN public.music_passport_versions.analyzer_run_id IS
  'audiolad:music-passport; FK to the music_analyzer_runs row this snapshot was copied from. Null for passports written without an analyzer run. Not a second copy of raw_json.';

COMMENT ON COLUMN public.music_passport_versions.structured_fields IS
  'audiolad:music-passport; structured published/candidate/raw fields copied for UI and step 3. Not the full analyzer document.';

CREATE UNIQUE INDEX IF NOT EXISTS music_passport_versions_analyzer_run_uidx
  ON public.music_passport_versions (analyzer_run_id)
  WHERE analyzer_run_id IS NOT NULL;

-- Keep the new identity columns immutable across seal and supersede updates.
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
    AND NEW.created_at = OLD.created_at
    AND NEW.analyzer_run_id IS NOT DISTINCT FROM OLD.analyzer_run_id
    AND NEW.source_sha256 IS NOT DISTINCT FROM OLD.source_sha256
    AND NEW.analyzer_git_commit IS NOT DISTINCT FROM OLD.analyzer_git_commit
    AND NEW.analyzer_version_text IS NOT DISTINCT FROM OLD.analyzer_version_text
    AND NEW.structured_fields IS NOT DISTINCT FROM OLD.structured_fields;

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

-- ---------------------------------------------------------------------------
-- Append one track passport version from a succeeded analyzer run.
-- A second call for the same run returns the existing version and does not
-- overwrite it. vocal_role is rejected: this pilot does not infer vocals.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.append_music_passport_from_analyzer_run(
  p_audio_item_id uuid,
  p_analyzer_run_id uuid,
  p_analysis_version text,
  p_analyzer_version_text text,
  p_analyzer_git_commit text,
  p_source_sha256 text,
  p_observed_at timestamptz,
  p_structured_fields jsonb,
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
  v_existing_id uuid;
  v_run_status text;
  v_run_sha text;
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

  IF p_analyzer_run_id IS NULL THEN
    RAISE EXCEPTION 'music_passport_analyzer_run_required' USING ERRCODE = '22023';
  END IF;

  SELECT status, sha256
  INTO v_run_status, v_run_sha
  FROM public.music_analyzer_runs
  WHERE id = p_analyzer_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'music_analyzer_run_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_run_status IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'music_analyzer_run_not_succeeded' USING ERRCODE = '22023';
  END IF;
  IF p_source_sha256 IS NULL OR p_source_sha256 !~ '^[0-9a-f]{64}$' OR p_source_sha256 IS DISTINCT FROM v_run_sha THEN
    RAISE EXCEPTION 'music_passport_source_sha_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.music_passport_versions
  WHERE analyzer_run_id = p_analyzer_run_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'passport_id', v_existing_id,
      'created', false
    );
  END IF;

  IF p_analysis_version IS NULL
     OR p_analysis_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'music_passport_analysis_version_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_analyzer_version_text IS NOT NULL
     AND char_length(p_analyzer_version_text) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'music_passport_analyzer_version_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_analyzer_git_commit IS NOT NULL
     AND p_analyzer_git_commit !~ '^[0-9a-fA-F]{7,64}$' THEN
    RAISE EXCEPTION 'music_passport_analyzer_commit_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_observed_at IS NULL THEN
    RAISE EXCEPTION 'music_passport_observed_at_required' USING ERRCODE = '22023';
  END IF;
  IF p_structured_fields IS NULL
     OR jsonb_typeof(p_structured_fields) IS DISTINCT FROM 'object'
     OR octet_length(p_structured_fields::text) > 20000 THEN
    RAISE EXCEPTION 'music_passport_structured_fields_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_attributes IS NULL OR jsonb_typeof(p_attributes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'music_passport_attributes_required' USING ERRCODE = '22023';
  END IF;

  v_n := jsonb_array_length(p_attributes);
  IF v_n > 32 THEN
    RAISE EXCEPTION 'music_passport_attributes_too_many' USING ERRCODE = '22023';
  END IF;

  v_now := clock_timestamp();
  IF p_observed_at > v_now THEN
    RAISE EXCEPTION 'music_passport_observed_at_future' USING ERRCODE = '22023';
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
    sealed_at,
    analyzer_run_id,
    source_sha256,
    analyzer_git_commit,
    analyzer_version_text,
    structured_fields
  ) VALUES (
    p_audio_item_id,
    coalesce(v_prev_version, 0) + 1,
    'active',
    p_analysis_version,
    p_observed_at,
    v_prev_id,
    v_now,
    NULL,
    NULL,
    p_analyzer_run_id,
    p_source_sha256,
    p_analyzer_git_commit,
    p_analyzer_version_text,
    p_structured_fields
  )
  RETURNING id INTO v_new_id;

  FOR v_obj IN
    SELECT value FROM jsonb_array_elements(p_attributes) AS attrs(value)
  LOOP
    IF jsonb_typeof(v_obj) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'music_passport_attribute_shape' USING ERRCODE = '22023';
    END IF;

    v_key := v_obj->>'attribute_key';
    IF v_key = 'vocal_role' THEN
      RAISE EXCEPTION 'music_passport_vocal_role_out_of_scope' USING ERRCODE = '22023';
    END IF;
    v_origin := v_obj->>'origin';
    v_provenance := v_obj->>'provenance';
    v_source_ref := NULLIF(btrim(coalesce(v_obj->>'source_ref', '')), '');

    IF v_obj ? 'value_numeric'
       AND jsonb_typeof(v_obj->'value_numeric') IS DISTINCT FROM 'null' THEN
      v_num := (v_obj->>'value_numeric')::numeric;
    ELSE
      v_num := NULL;
    END IF;

    IF v_obj ? 'value_text'
       AND jsonb_typeof(v_obj->'value_text') IS DISTINCT FROM 'null' THEN
      v_text := NULLIF(btrim(v_obj->>'value_text'), '');
    ELSE
      v_text := NULL;
    END IF;

    IF v_obj ? 'confidence'
       AND jsonb_typeof(v_obj->'confidence') IS DISTINCT FROM 'null' THEN
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

  RETURN jsonb_build_object(
    'passport_id', v_new_id,
    'created', true
  );
END;
$$;

COMMENT ON FUNCTION public.append_music_passport_from_analyzer_run(
  uuid, uuid, text, text, text, text, timestamptz, jsonb, jsonb
) IS
  'audiolad:music-passport; append one sealed track passport version bound to a succeeded music_analyzer_runs row. Does not overwrite that version. Does not copy raw_json. service_role only.';

REVOKE ALL ON FUNCTION public.append_music_passport_from_analyzer_run(
  uuid, uuid, text, text, text, text, timestamptz, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_music_passport_from_analyzer_run(
  uuid, uuid, text, text, text, text, timestamptz, jsonb, jsonb
) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- Album passport versions. Insert-only. A later analysis inserts a new row.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_album_passports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE RESTRICT,
  version integer NOT NULL,
  status text NOT NULL,
  aggregation_version text NOT NULL,
  analyzer_version text NOT NULL,
  analyzer_git_commit text NULL,
  sources jsonb NOT NULL,
  bpm_profile jsonb NOT NULL,
  key_profile jsonb NOT NULL,
  genre_profile jsonb NOT NULL,
  style_profile jsonb NOT NULL,
  mood_profile jsonb NOT NULL,
  instrument_profile jsonb NOT NULL,
  character_profile jsonb NOT NULL,
  source_fingerprint text NOT NULL,
  aggregated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_album_passports_version_positive
    CHECK (version >= 1),
  CONSTRAINT music_album_passports_status_check
    CHECK (status IN ('pending', 'completed', 'partial', 'failed')),
  CONSTRAINT music_album_passports_aggregation_version_check
    CHECK (aggregation_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  CONSTRAINT music_album_passports_analyzer_version_check
    CHECK (char_length(analyzer_version) BETWEEN 1 AND 200),
  CONSTRAINT music_album_passports_analyzer_git_commit_check
    CHECK (
      analyzer_git_commit IS NULL
      OR analyzer_git_commit ~ '^[0-9a-fA-F]{7,64}$'
    ),
  CONSTRAINT music_album_passports_sources_array
    CHECK (jsonb_typeof(sources) = 'array'),
  CONSTRAINT music_album_passports_profiles_object
    CHECK (
      jsonb_typeof(bpm_profile) = 'object'
      AND jsonb_typeof(key_profile) = 'object'
      AND jsonb_typeof(genre_profile) = 'object'
      AND jsonb_typeof(style_profile) = 'object'
      AND jsonb_typeof(mood_profile) = 'object'
      AND jsonb_typeof(instrument_profile) = 'object'
      AND jsonb_typeof(character_profile) = 'object'
    ),
  CONSTRAINT music_album_passports_fingerprint_len
    CHECK (char_length(source_fingerprint) BETWEEN 1 AND 4000),
  CONSTRAINT music_album_passports_practice_version_key
    UNIQUE (practice_id, version),
  CONSTRAINT music_album_passports_practice_fingerprint_key
    UNIQUE (practice_id, source_fingerprint)
);

COMMENT ON TABLE public.music_album_passports IS
  'audiolad:music-passport; immutable album passport versions built from track passport version ids. A new analysis inserts a new version. Rows are not updated.';

COMMENT ON COLUMN public.music_album_passports.sources IS
  'Exact list this version was built from: track_passport_version_id, music_analyzer_run_id, audio_item_id, analyzer version/commit, outcome.';

COMMENT ON COLUMN public.music_album_passports.aggregated_at IS
  'Server clock when this album snapshot was inserted. Not updated later.';

CREATE INDEX IF NOT EXISTS music_album_passports_practice_version_idx
  ON public.music_album_passports (practice_id, version DESC);

CREATE OR REPLACE FUNCTION public.music_album_passports_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'music_album_passport_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_album_passports_immutable_biud
  ON public.music_album_passports;
CREATE TRIGGER music_album_passports_immutable_biud
  BEFORE UPDATE OR DELETE ON public.music_album_passports
  FOR EACH ROW
  EXECUTE FUNCTION public.music_album_passports_immutable();

CREATE OR REPLACE FUNCTION public.insert_music_album_passport(
  p_practice_id uuid,
  p_status text,
  p_aggregation_version text,
  p_analyzer_version text,
  p_analyzer_git_commit text,
  p_sources jsonb,
  p_bpm_profile jsonb,
  p_key_profile jsonb,
  p_genre_profile jsonb,
  p_style_profile jsonb,
  p_mood_profile jsonb,
  p_instrument_profile jsonb,
  p_character_profile jsonb,
  p_source_fingerprint text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_version integer;
  v_id uuid;
  v_source jsonb;
BEGIN
  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending', 'completed', 'partial', 'failed') THEN
    RAISE EXCEPTION 'music_album_passport_status_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.practices
  WHERE id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id
  INTO v_existing
  FROM public.music_album_passports
  WHERE practice_id = p_practice_id
    AND source_fingerprint = p_source_fingerprint;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF p_status = 'completed' THEN
    IF p_sources IS NULL
       OR jsonb_typeof(p_sources) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_sources) < 1 THEN
      RAISE EXCEPTION 'music_album_passport_sources_invalid' USING ERRCODE = '22023';
    END IF;
    FOR v_source IN
      SELECT value FROM jsonb_array_elements(p_sources) AS src(value)
    LOOP
      IF jsonb_typeof(v_source) IS DISTINCT FROM 'object'
         OR NULLIF(v_source->>'track_passport_version_id', '') IS NULL
         OR NULLIF(v_source->>'music_analyzer_run_id', '') IS NULL THEN
        RAISE EXCEPTION 'music_album_passport_sources_invalid' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  SELECT coalesce(max(version), 0) + 1
  INTO v_version
  FROM public.music_album_passports
  WHERE practice_id = p_practice_id;

  INSERT INTO public.music_album_passports (
    practice_id,
    version,
    status,
    aggregation_version,
    analyzer_version,
    analyzer_git_commit,
    sources,
    bpm_profile,
    key_profile,
    genre_profile,
    style_profile,
    mood_profile,
    instrument_profile,
    character_profile,
    source_fingerprint,
    aggregated_at
  ) VALUES (
    p_practice_id,
    v_version,
    p_status,
    p_aggregation_version,
    p_analyzer_version,
    p_analyzer_git_commit,
    p_sources,
    p_bpm_profile,
    p_key_profile,
    p_genre_profile,
    p_style_profile,
    p_mood_profile,
    p_instrument_profile,
    p_character_profile,
    p_source_fingerprint,
    clock_timestamp()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.insert_music_album_passport(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) IS
  'audiolad:music-passport; insert one immutable album passport version. The same fingerprint returns the existing id and does not update it. service_role only.';

REVOKE ALL ON FUNCTION public.insert_music_album_passport(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_music_album_passport(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.music_album_passports_immutable() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.music_album_passports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.music_album_passports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.music_album_passports TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- Which analyzer run was requested for which product track.
-- Insert-only. The passport version, not this row, is updated... it is not.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.music_passport_analysis_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE RESTRICT,
  audio_item_id uuid NOT NULL,
  analyzer_run_id uuid NOT NULL UNIQUE
    REFERENCES public.music_analyzer_runs (id) ON DELETE RESTRICT,
  source_sha256 text NOT NULL,
  track_title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_passport_analysis_links_sha_check
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT music_passport_analysis_links_title_check
    CHECK (char_length(track_title) BETWEEN 1 AND 300)
);

COMMENT ON TABLE public.music_passport_analysis_links IS
  'audiolad:music-passport; one requested analyzer run for a product track. Re-analysis inserts another row. Not a passport.';

CREATE INDEX IF NOT EXISTS music_passport_analysis_links_practice_idx
  ON public.music_passport_analysis_links (practice_id, audio_item_id, created_at);

CREATE OR REPLACE FUNCTION public.music_passport_analysis_links_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'music_passport_analysis_link_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_passport_analysis_links_immutable_biud
  ON public.music_passport_analysis_links;
CREATE TRIGGER music_passport_analysis_links_immutable_biud
  BEFORE UPDATE OR DELETE ON public.music_passport_analysis_links
  FOR EACH ROW
  EXECUTE FUNCTION public.music_passport_analysis_links_immutable();

REVOKE ALL ON FUNCTION public.music_passport_analysis_links_immutable() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.music_passport_analysis_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.music_passport_analysis_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.music_passport_analysis_links TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- Description metadata. Bind once. Do not move the binding on re-analysis.
-- Does not rewrite description or SEO text.
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS description_generation_metadata jsonb;

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_description_generation_metadata_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_description_generation_metadata_check
  CHECK (
    description_generation_metadata IS NULL
    OR (
      jsonb_typeof(description_generation_metadata) = 'object'
      AND (
        NOT (description_generation_metadata ? 'generated_from_album_passport_version_id')
        OR (
          jsonb_typeof(description_generation_metadata->'generated_from_album_passport_version_id') = 'string'
          AND (description_generation_metadata->>'generated_from_album_passport_version_id')
            ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    )
  );

COMMENT ON COLUMN public.practices.description_generation_metadata IS
  'audiolad:music-passport; description generation binding. generated_from_album_passport_version_id is the frozen album passport version the text was generated from. Re-analysis does not change it.';

CREATE OR REPLACE FUNCTION public.bind_description_album_passport(
  p_practice_id uuid,
  p_album_passport_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing text;
  v_album_practice uuid;
  v_status text;
BEGIN
  IF p_practice_id IS NULL OR p_album_passport_id IS NULL THEN
    RAISE EXCEPTION 'album_passport_binding_required' USING ERRCODE = '22023';
  END IF;

  SELECT practice_id, status
  INTO v_album_practice, v_status
  FROM public.music_album_passports
  WHERE id = p_album_passport_id;

  IF NOT FOUND OR v_album_practice IS DISTINCT FROM p_practice_id THEN
    RAISE EXCEPTION 'album_passport_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'album_passport_not_completed' USING ERRCODE = '22023';
  END IF;

  SELECT description_generation_metadata->>'generated_from_album_passport_version_id'
  INTO v_existing
  FROM public.practices
  WHERE id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing IS NOT NULL AND v_existing IS DISTINCT FROM p_album_passport_id::text THEN
    RETURN v_existing::uuid;
  END IF;

  UPDATE public.practices
  SET description_generation_metadata = jsonb_set(
    coalesce(description_generation_metadata, '{}'::jsonb),
    '{generated_from_album_passport_version_id}',
    to_jsonb(p_album_passport_id::text),
    true
  )
  WHERE id = p_practice_id
    AND (
      description_generation_metadata IS NULL
      OR description_generation_metadata->>'generated_from_album_passport_version_id' IS NULL
      OR description_generation_metadata->>'generated_from_album_passport_version_id'
        = p_album_passport_id::text
    );

  RETURN p_album_passport_id;
END;
$$;

COMMENT ON FUNCTION public.bind_description_album_passport(uuid, uuid) IS
  'audiolad:music-passport; set generated_from_album_passport_version_id once. A different existing binding is left unchanged. Does not rewrite description text. service_role only.';

REVOKE ALL ON FUNCTION public.bind_description_album_passport(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_description_album_passport(uuid, uuid) TO service_role, postgres;

-- Music Analyzer Lab Phase 2A: immutable automated runs.
-- Expand-only. Does not alter music_lab_*, music_passport_*, catalog, or
-- the human-listening bucket music-analyzer-lab.
-- Service role selects rows and calls RPCs. Owner/admin is enforced in the app.
-- A second analysis of the same SHA256 inserts a new row. Sealed rows do not change.

BEGIN;

CREATE TABLE IF NOT EXISTS public.music_analyzer_runs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued',
  source_filename text NOT NULL,
  sha256 text NOT NULL,
  byte_size bigint NOT NULL,
  mime_type text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'music-analyzer-runs',
  storage_path text NOT NULL,
  version_number integer NOT NULL,
  analyzer_version text NULL,
  analyzer_git_commit text NULL,
  analyzer_content_commit text NULL,
  model_checkpoint text NULL,
  taxonomy_version text NULL,
  prompt_version text NULL,
  device text NULL,
  raw_json jsonb NULL,
  normalized_json jsonb NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  CONSTRAINT music_analyzer_runs_status_check
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  CONSTRAINT music_analyzer_runs_sha256_check
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT music_analyzer_runs_byte_size_check
    CHECK (byte_size > 0 AND byte_size <= 104857600),
  CONSTRAINT music_analyzer_runs_mime_check
    CHECK (mime_type IN ('audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave')),
  CONSTRAINT music_analyzer_runs_bucket_check
    CHECK (storage_bucket = 'music-analyzer-runs'),
  CONSTRAINT music_analyzer_runs_storage_path_check
    CHECK (storage_path ~ '^runs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,120}$'),
  CONSTRAINT music_analyzer_runs_version_check
    CHECK (version_number >= 1),
  CONSTRAINT music_analyzer_runs_attempt_check
    CHECK (attempt_count >= 0 AND attempt_count <= 10),
  CONSTRAINT music_analyzer_runs_filename_check
    CHECK (
      char_length(source_filename) BETWEEN 1 AND 180
      AND source_filename !~ '[[:cntrl:]]'
      AND strpos(source_filename, '/') = 0
      AND strpos(source_filename, E'\\') = 0
    ),
  CONSTRAINT music_analyzer_runs_version_unique
    UNIQUE (sha256, version_number),
  CONSTRAINT music_analyzer_runs_path_unique
    UNIQUE (storage_bucket, storage_path),
  CONSTRAINT music_analyzer_runs_lease_check
    CHECK (
      (
        status = 'processing'
        AND lease_token IS NOT NULL
        AND lease_expires_at IS NOT NULL
      )
      OR (
        status <> 'processing'
        AND lease_token IS NULL
        AND lease_expires_at IS NULL
      )
    ),
  CONSTRAINT music_analyzer_runs_phase_check
    CHECK (
      (
        status IN ('queued', 'processing')
        AND raw_json IS NULL
        AND normalized_json IS NULL
        AND finished_at IS NULL
        AND analyzer_git_commit IS NULL
      )
      OR (
        status = 'succeeded'
        AND raw_json IS NOT NULL
        AND jsonb_typeof(raw_json) = 'object'
        AND normalized_json IS NOT NULL
        AND jsonb_typeof(normalized_json) = 'object'
        AND finished_at IS NOT NULL
        AND analyzer_version IS NOT NULL
        AND analyzer_git_commit ~ '^932c4ce[0-9a-f]{0,33}$'
        AND analyzer_content_commit ~ '^3750f3b[0-9a-f]{0,33}$'
        AND model_checkpoint IS NOT NULL
        AND device = 'cpu'
        AND provenance->>'candidate_a' = 'false'
        AND provenance->>'instrument_strategy' = 'checkout_default'
      )
      OR (
        status = 'failed'
        AND finished_at IS NOT NULL
        AND error_code IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS music_analyzer_runs_queue_idx
  ON public.music_analyzer_runs (created_at, id)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS music_analyzer_runs_created_idx
  ON public.music_analyzer_runs (created_at DESC);

COMMENT ON TABLE public.music_analyzer_runs IS
  'Immutable automated Music Analyzer runs. Not music_lab_* human listening and not Music Passport.';

CREATE OR REPLACE FUNCTION public.music_analyzer_runs_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'music_analyzer_run_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued'
      OR NEW.raw_json IS NOT NULL
      OR NEW.normalized_json IS NOT NULL
      OR NEW.lease_token IS NOT NULL
      OR NEW.attempt_count <> 0
      OR NEW.finished_at IS NOT NULL
      OR NEW.storage_path !~ ('^runs/' || NEW.id::text || '/') THEN
      RAISE EXCEPTION 'music_analyzer_run_must_start_queued'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'music_analyzer_run_sealed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.source_filename IS DISTINCT FROM OLD.source_filename
    OR NEW.sha256 IS DISTINCT FROM OLD.sha256
    OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.version_number IS DISTINCT FROM OLD.version_number THEN
    RAISE EXCEPTION 'music_analyzer_run_identity_locked'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_analyzer_runs_guard_trigger ON public.music_analyzer_runs;
CREATE TRIGGER music_analyzer_runs_guard_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.music_analyzer_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.music_analyzer_runs_guard();

CREATE OR REPLACE FUNCTION public.enqueue_music_analyzer_run(
  p_id uuid,
  p_created_by uuid,
  p_source_filename text,
  p_sha256 text,
  p_byte_size bigint,
  p_mime_type text,
  p_storage_path text
)
RETURNS public.music_analyzer_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version integer;
  v_row public.music_analyzer_runs;
BEGIN
  IF p_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'invalid_music_analyzer_run' USING ERRCODE = '22023';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_sha256' USING ERRCODE = '22023';
  END IF;
  IF p_storage_path !~ (
    '^runs/' || p_id::text || '/[A-Za-z0-9._-]{1,120}$'
  ) THEN
    RAISE EXCEPTION 'invalid_storage_path' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_sha256, 0::bigint));

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version
  FROM public.music_analyzer_runs
  WHERE sha256 = p_sha256;

  INSERT INTO public.music_analyzer_runs (
    id,
    created_by,
    status,
    source_filename,
    sha256,
    byte_size,
    mime_type,
    storage_bucket,
    storage_path,
    version_number,
    provenance
  )
  VALUES (
    p_id,
    p_created_by,
    'queued',
    p_source_filename,
    p_sha256,
    p_byte_size,
    p_mime_type,
    'music-analyzer-runs',
    p_storage_path,
    v_version,
    '{}'::jsonb
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_music_analyzer_runs(
  p_max_attempts integer DEFAULT 2
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;

  WITH recovered AS (
    UPDATE public.music_analyzer_runs
    SET status = CASE
          WHEN attempt_count < p_max_attempts THEN 'queued'
          ELSE 'failed'
        END,
        lease_token = NULL,
        lease_expires_at = NULL,
        finished_at = CASE
          WHEN attempt_count < p_max_attempts THEN finished_at
          ELSE COALESCE(finished_at, clock_timestamp())
        END,
        error_code = CASE
          WHEN attempt_count < p_max_attempts THEN NULL
          ELSE 'worker_lease_expired'
        END,
        updated_at = clock_timestamp()
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= clock_timestamp()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM recovered;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_music_analyzer_run(
  p_lease_seconds integer DEFAULT 1800,
  p_max_attempts integer DEFAULT 2
)
RETURNS public.music_analyzer_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.music_analyzer_runs;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_row
  FROM public.music_analyzer_runs
  WHERE status = 'queued'
    AND attempt_count < p_max_attempts
  ORDER BY created_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.music_analyzer_runs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, clock_timestamp()),
      lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      error_code = NULL,
      updated_at = clock_timestamp()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_music_analyzer_run_lease(
  p_run_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 1800
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_lease_token IS NULL OR p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RETURN false;
  END IF;

  UPDATE public.music_analyzer_runs
  SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  WHERE id = p_run_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_music_analyzer_run(
  p_run_id uuid,
  p_lease_token uuid,
  p_analyzer_version text,
  p_analyzer_git_commit text,
  p_analyzer_content_commit text,
  p_model_checkpoint text,
  p_taxonomy_version text,
  p_prompt_version text,
  p_device text,
  p_raw_json jsonb,
  p_normalized_json jsonb,
  p_provenance jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_lease_token IS NULL
    OR p_device IS DISTINCT FROM 'cpu'
    OR p_analyzer_git_commit !~ '^932c4ce[0-9a-f]{0,33}$'
    OR p_analyzer_content_commit !~ '^3750f3b[0-9a-f]{0,33}$'
    OR NULLIF(btrim(p_analyzer_version), '') IS NULL
    OR NULLIF(btrim(p_model_checkpoint), '') IS NULL
    OR p_raw_json IS NULL
    OR jsonb_typeof(p_raw_json) <> 'object'
    OR p_normalized_json IS NULL
    OR jsonb_typeof(p_normalized_json) <> 'object'
    OR p_provenance IS NULL
    OR jsonb_typeof(p_provenance) <> 'object'
    OR p_provenance->>'candidate_a' IS DISTINCT FROM 'false'
    OR p_provenance->>'instrument_strategy' IS DISTINCT FROM 'checkout_default' THEN
    RAISE EXCEPTION 'invalid_music_analyzer_seal' USING ERRCODE = '23514';
  END IF;

  UPDATE public.music_analyzer_runs
  SET status = 'succeeded',
      analyzer_version = btrim(p_analyzer_version),
      analyzer_git_commit = p_analyzer_git_commit,
      analyzer_content_commit = p_analyzer_content_commit,
      model_checkpoint = btrim(p_model_checkpoint),
      taxonomy_version = NULLIF(btrim(COALESCE(p_taxonomy_version, '')), ''),
      prompt_version = NULLIF(btrim(COALESCE(p_prompt_version, '')), ''),
      device = 'cpu',
      raw_json = p_raw_json,
      normalized_json = p_normalized_json,
      provenance = p_provenance,
      error_code = NULL,
      finished_at = clock_timestamp(),
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_run_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_music_analyzer_run(
  p_run_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_permanent boolean DEFAULT false,
  p_max_attempts integer DEFAULT 2
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.music_analyzer_runs;
  v_permanent boolean;
  v_code text;
  v_updated integer;
BEGIN
  IF p_lease_token IS NULL OR p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RETURN false;
  END IF;

  v_code := NULLIF(btrim(COALESCE(p_error_code, '')), '');
  IF v_code IS NULL THEN
    v_code := 'analyze_failed';
  END IF;

  SELECT *
  INTO v_row
  FROM public.music_analyzer_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_row.status <> 'processing'
    OR v_row.lease_token IS DISTINCT FROM p_lease_token
    OR v_row.lease_expires_at IS NULL
    OR v_row.lease_expires_at <= clock_timestamp() THEN
    RETURN false;
  END IF;

  v_permanent := p_permanent OR v_row.attempt_count >= p_max_attempts;

  UPDATE public.music_analyzer_runs
  SET status = CASE WHEN v_permanent THEN 'failed' ELSE 'queued' END,
      lease_token = NULL,
      lease_expires_at = NULL,
      finished_at = CASE WHEN v_permanent THEN clock_timestamp() ELSE NULL END,
      error_code = CASE WHEN v_permanent THEN v_code ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE id = p_run_id
    AND status = 'processing'
    AND lease_token = p_lease_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_music_analyzer_run(
  p_run_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_lease_token IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.music_analyzer_runs
  SET status = 'queued',
      lease_token = NULL,
      lease_expires_at = NULL,
      attempt_count = GREATEST(0, attempt_count - 1),
      error_code = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_run_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

ALTER TABLE public.music_analyzer_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.music_analyzer_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.music_analyzer_runs TO service_role;

REVOKE ALL ON FUNCTION public.music_analyzer_runs_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.music_analyzer_runs_guard() TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_music_analyzer_run(uuid, uuid, text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_music_analyzer_runs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_music_analyzer_run(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_music_analyzer_run_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_music_analyzer_run(uuid, uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_music_analyzer_run(uuid, uuid, text, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_music_analyzer_run(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_music_analyzer_run(uuid, uuid, text, text, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_music_analyzer_runs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_music_analyzer_run(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_music_analyzer_run_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_music_analyzer_run(uuid, uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_music_analyzer_run(uuid, uuid, text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_music_analyzer_run(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'storage.buckets is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'music-analyzer-runs'
  ) THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'music-analyzer-runs',
      'music-analyzer-runs',
      false,
      104857600,
      ARRAY['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave']::text[]
    );
  END IF;

  UPDATE storage.buckets
  SET public = false
  WHERE id = 'music-analyzer-runs';
END;
$$;

COMMIT;

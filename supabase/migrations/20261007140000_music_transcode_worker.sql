BEGIN;

-- Slice 2: worker lease/RPC + output stream link. Does not promote public delivery.
ALTER TABLE public.music_transcode_jobs
  ADD COLUMN IF NOT EXISTS output_asset_id uuid NULL
    REFERENCES public.music_audio_assets(id) ON DELETE SET NULL;

ALTER TABLE public.music_transcode_jobs
  DROP CONSTRAINT IF EXISTS music_transcode_jobs_ready_output_check;

ALTER TABLE public.music_transcode_jobs
  ADD CONSTRAINT music_transcode_jobs_ready_output_check
  CHECK (
    (
      status = 'ready'
      AND output_asset_id IS NOT NULL
      AND completed_at IS NOT NULL
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
    )
    OR status <> 'ready'
  );

CREATE OR REPLACE FUNCTION public.guard_music_transcode_job_output()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'ready' THEN
    IF NEW.output_asset_id IS NULL OR NEW.completed_at IS NULL
      OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_music_transcode_ready_job' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.music_audio_assets AS asset
      WHERE asset.id = NEW.output_asset_id
        AND asset.asset_role = 'stream'
        AND asset.lifecycle_state = 'verified'
        AND asset.source_asset_id = NEW.source_asset_id
    ) THEN
      RAISE EXCEPTION 'invalid_music_transcode_output_asset' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_music_transcode_job_output_trigger ON public.music_transcode_jobs;
CREATE TRIGGER guard_music_transcode_job_output_trigger
  BEFORE INSERT OR UPDATE ON public.music_transcode_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_music_transcode_job_output();

CREATE OR REPLACE FUNCTION public.recover_stale_music_transcode_jobs(
  p_max_attempts integer DEFAULT 3
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
    UPDATE public.music_transcode_jobs
    SET status = CASE WHEN attempt_count < p_max_attempts THEN 'queued' ELSE 'failed' END,
        lease_token = NULL,
        lease_expires_at = NULL,
        completed_at = CASE WHEN attempt_count < p_max_attempts THEN completed_at ELSE COALESCE(completed_at, now()) END,
        error_code = CASE
          WHEN attempt_count < p_max_attempts THEN NULL
          ELSE 'worker_lease_expired'
        END,
        error_message_safe = CASE
          WHEN attempt_count < p_max_attempts THEN NULL
          ELSE 'Не удалось подготовить версию для прослушивания.'
        END,
        updated_at = now()
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= clock_timestamp()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM recovered;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_music_transcode_job(
  p_lease_seconds integer DEFAULT 1800,
  p_max_attempts integer DEFAULT 3
)
RETURNS public.music_transcode_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.music_transcode_jobs;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job
  FROM public.music_transcode_jobs
  WHERE status = 'queued' AND attempt_count < p_max_attempts
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE public.music_transcode_jobs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()),
      lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      error_code = NULL,
      error_message_safe = NULL,
      updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_music_transcode_job_lease(
  p_job_id uuid,
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
  IF p_lease_token IS NULL THEN
    RETURN false;
  END IF;
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  UPDATE public.music_transcode_jobs
  SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp()
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_music_transcode_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_output_asset_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.music_transcode_jobs;
  v_updated integer;
BEGIN
  IF p_lease_token IS NULL OR p_output_asset_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO v_job
  FROM public.music_transcode_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_job.status <> 'processing'
    OR v_job.lease_token IS DISTINCT FROM p_lease_token
    OR v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.music_audio_assets AS asset
    WHERE asset.id = p_output_asset_id
      AND asset.asset_role = 'stream'
      AND asset.lifecycle_state = 'verified'
      AND asset.source_asset_id = v_job.source_asset_id
  ) THEN
    RAISE EXCEPTION 'invalid_music_transcode_output_asset' USING ERRCODE = '23514';
  END IF;
  UPDATE public.music_transcode_jobs
  SET status = 'ready',
      output_asset_id = p_output_asset_id,
      completed_at = now(),
      lease_token = NULL,
      lease_expires_at = NULL,
      error_code = NULL,
      error_message_safe = NULL,
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp()
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_music_transcode_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message_safe text,
  p_max_attempts integer DEFAULT 3
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.music_transcode_jobs;
  v_updated integer;
  v_permanent boolean;
BEGIN
  IF p_lease_token IS NULL THEN
    RETURN false;
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job
  FROM public.music_transcode_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_job.status <> 'processing'
    OR v_job.lease_token IS DISTINCT FROM p_lease_token
    OR v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN false;
  END IF;
  v_permanent := v_job.attempt_count >= p_max_attempts;
  UPDATE public.music_transcode_jobs
  SET status = CASE WHEN v_permanent THEN 'failed' ELSE 'queued' END,
      lease_token = NULL,
      lease_expires_at = NULL,
      completed_at = CASE WHEN v_permanent THEN now() ELSE completed_at END,
      error_code = COALESCE(NULLIF(btrim(p_error_code), ''), 'transcode_failed'),
      error_message_safe = CASE
        WHEN v_permanent THEN 'Не удалось подготовить версию для прослушивания.'
        ELSE 'Не удалось подготовить версию для прослушивания. Попробуем обработать файл повторно.'
      END,
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp()
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_music_transcode_job(
  p_job_id uuid,
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
  UPDATE public.music_transcode_jobs
  SET status = 'queued',
      lease_token = NULL,
      lease_expires_at = NULL,
      attempt_count = GREATEST(0, attempt_count - 1),
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at > clock_timestamp()
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_music_transcode_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_music_transcode_job(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_music_transcode_job_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_music_transcode_job(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_music_transcode_job(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_music_transcode_job(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recover_stale_music_transcode_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_music_transcode_job(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_music_transcode_job_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_music_transcode_job(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_music_transcode_job(uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_music_transcode_job(uuid, uuid) TO service_role;

COMMIT;

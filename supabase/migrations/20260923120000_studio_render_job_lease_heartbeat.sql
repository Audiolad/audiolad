BEGIN;

-- Ownership token + heartbeat renew for long-form Studio renders.
-- Applying this migration does not start or restart the worker.

ALTER TABLE public.studio_render_jobs
  ADD COLUMN IF NOT EXISTS lease_token uuid NULL;

CREATE OR REPLACE FUNCTION public.claim_studio_render_job(p_lease_seconds integer DEFAULT 1800)
RETURNS public.studio_render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.studio_render_jobs;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_job
  FROM public.studio_render_jobs
  WHERE status = 'queued' AND attempt_count < 2
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.studio_render_jobs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      lease_token = gen_random_uuid(),
      updated_at = now(),
      error_code = NULL,
      error_message_safe = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_studio_render_job_lease(
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
  UPDATE public.studio_render_jobs
  SET lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_studio_render_job(
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
  UPDATE public.studio_render_jobs
  SET status = 'queued',
      lease_token = NULL,
      lease_expires_at = NULL,
      attempt_count = GREATEST(0, attempt_count - 1),
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_studio_render_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  WITH recovered AS (
    UPDATE public.studio_render_jobs
    SET status = CASE WHEN attempt_count < 2 THEN 'queued' ELSE 'failed' END,
        lease_expires_at = NULL,
        lease_token = NULL,
        error_code = CASE WHEN attempt_count < 2 THEN NULL ELSE 'worker_lease_expired' END,
        error_message_safe = CASE WHEN attempt_count < 2 THEN NULL ELSE 'Превышено время выполнения задачи рендеринга.' END,
        updated_at = now()
    WHERE status = 'processing' AND lease_expires_at < now()
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM recovered;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_studio_render_job_lease(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_studio_render_job(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_studio_render_job_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_studio_render_job(uuid, uuid) TO service_role;

COMMIT;

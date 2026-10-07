-- Persist real FFmpeg progress for author MP4 export jobs.
-- progress_percent is NULL while queued (no fake percent).
-- Processing stores 0–99 from encoded time / audio duration.
-- Completed is always 100. The value is monotonic within one processing attempt.
-- Lease, claim, and stale recovery functions are unchanged; a BEFORE trigger
-- clears progress when a job returns to queued and forces 100 on completed.

ALTER TABLE public.product_video_render_jobs
  ADD COLUMN IF NOT EXISTS progress_percent smallint NULL;

UPDATE public.product_video_render_jobs
SET progress_percent = 100
WHERE status = 'completed'
  AND progress_percent IS NULL;

CREATE OR REPLACE FUNCTION public.guard_product_video_render_job_progress()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'queued' THEN
    NEW.progress_percent := NULL;
  ELSIF NEW.status = 'completed' THEN
    NEW.progress_percent := 100;
  ELSIF NEW.status = 'processing' THEN
    IF NEW.progress_percent IS NOT NULL THEN
      IF NEW.progress_percent < 0 THEN
        NEW.progress_percent := 0;
      ELSIF NEW.progress_percent > 99 THEN
        NEW.progress_percent := 99;
      END IF;
      IF TG_OP = 'UPDATE'
         AND OLD.status = 'processing'
         AND OLD.progress_percent IS NOT NULL
         AND NEW.progress_percent < OLD.progress_percent THEN
        NEW.progress_percent := OLD.progress_percent;
      END IF;
    END IF;
  ELSIF NEW.progress_percent IS NOT NULL THEN
    IF NEW.progress_percent < 0 THEN
      NEW.progress_percent := 0;
    ELSIF NEW.progress_percent > 99 THEN
      NEW.progress_percent := 99;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_video_render_jobs_progress_guard
  ON public.product_video_render_jobs;

CREATE TRIGGER product_video_render_jobs_progress_guard
  BEFORE INSERT OR UPDATE ON public.product_video_render_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_video_render_job_progress();

ALTER TABLE public.product_video_render_jobs
  DROP CONSTRAINT IF EXISTS product_video_render_jobs_progress_percent_check;

ALTER TABLE public.product_video_render_jobs
  ADD CONSTRAINT product_video_render_jobs_progress_percent_check
    CHECK (
      (status = 'queued' AND progress_percent IS NULL)
      OR (
        status = 'processing'
        AND (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 99)
      )
      OR (status = 'completed' AND progress_percent = 100)
      OR (
        status IN ('failed', 'superseded')
        AND (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 99)
      )
    );

CREATE OR REPLACE FUNCTION public.report_product_video_render_progress(
  p_job_id uuid,
  p_lease_token uuid,
  p_progress_percent integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
  v_percent integer;
BEGIN
  IF p_lease_token IS NULL OR p_progress_percent IS NULL THEN
    RETURN false;
  END IF;

  v_percent := LEAST(GREATEST(p_progress_percent, 0), 99);

  UPDATE public.product_video_render_jobs
  SET progress_percent = v_percent,
      updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at > clock_timestamp()
    AND (
      progress_percent IS NULL
      OR progress_percent < v_percent
    )
  RETURNING 1 INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_product_video_render_job_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_product_video_render_progress(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.guard_product_video_render_job_progress() TO service_role;
GRANT EXECUTE ON FUNCTION public.report_product_video_render_progress(uuid, uuid, integer) TO service_role;

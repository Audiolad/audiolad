-- Not a migration. Deploy does not apply files under docs/.
-- Do not apply this file from a laptop.
--
-- ORDER: revert the app code FIRST (uploads.ts and reanalyze/route.ts call
-- enqueue_music_analyzer_run_deduplicated). Dropping that RPC while the new
-- app code is live breaks upload finalize and admin reanalyze.
-- Then apply this script in one transaction to restore the v01 claim body,
-- drop the dedup RPC, and optionally drop last_claimed_at.
-- Claim body below is copied exactly from
-- supabase/migrations/20261217120000_music_analyzer_runs_v01.sql.

BEGIN;

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

DROP FUNCTION IF EXISTS public.enqueue_music_analyzer_run_deduplicated(uuid, uuid, text, text, bigint, text, text);

ALTER TABLE public.music_analyzer_runs
  DROP COLUMN IF EXISTS last_claimed_at;

COMMIT;

-- Additive fair scheduling and opt-in dedupe. Active states are queued / processing.
-- The legacy enqueue RPC remains unchanged for passport callers.
-- Existing duplicate active rows are left intact, so they cannot fail this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Keep first started_at semantics; retries and releases still consume author turns.
ALTER TABLE public.music_analyzer_runs
  ADD COLUMN IF NOT EXISTS last_claimed_at timestamptz;

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
  -- One global worker: each author turn claims at most this many jobs.
  v_jobs_per_author_turn CONSTANT integer := 1;
BEGIN
  IF p_lease_seconds < 60 OR p_lease_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid_lease' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE = '22023';
  END IF;

  -- Least recently served author first. New authors sort before served ones;
  -- FIFO and UUID break ties deterministically, including a single-author queue.
  WITH author_history AS (
    SELECT created_by, MAX(COALESCE(last_claimed_at, started_at)) AS last_served
    FROM public.music_analyzer_runs
    GROUP BY created_by
  )
  SELECT runs.*
  INTO v_row
  FROM public.music_analyzer_runs AS runs
  JOIN author_history USING (created_by)
  WHERE runs.status = 'queued'
    AND runs.attempt_count < p_max_attempts
  ORDER BY author_history.last_served ASC NULLS FIRST, runs.created_at, runs.id
  FOR UPDATE OF runs SKIP LOCKED
  LIMIT v_jobs_per_author_turn;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.music_analyzer_runs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      last_claimed_at = clock_timestamp(),
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

-- A distinct RPC name avoids default-argument overload ambiguity in PostgREST.
-- No signature replacement, DROP, or unique index affects legacy enqueue callers.
CREATE OR REPLACE FUNCTION public.enqueue_music_analyzer_run_deduplicated(
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
  v_row public.music_analyzer_runs;
BEGIN
  IF p_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'invalid_music_analyzer_run' USING ERRCODE = '22023';
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_sha256' USING ERRCODE = '22023';
  END IF;
  IF p_storage_path IS NULL OR p_storage_path !~ (
    '^runs/' || p_id::text || '/[A-Za-z0-9._-]{1,120}$'
  ) THEN
    RAISE EXCEPTION 'invalid_storage_path' USING ERRCODE = '22023';
  END IF;

  -- Same transaction lock as legacy enqueue; held through lookup and insert.
  -- The nested legacy call can safely reacquire this transaction's advisory lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_sha256, 0::bigint));
  SELECT * INTO v_row
  FROM public.music_analyzer_runs
  WHERE sha256 = p_sha256 AND created_by = p_created_by
    AND status IN ('queued', 'processing')
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  RETURN public.enqueue_music_analyzer_run(
    p_id, p_created_by, p_source_filename, p_sha256,
    p_byte_size, p_mime_type, p_storage_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_music_analyzer_run_deduplicated(uuid, uuid, text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_music_analyzer_run_deduplicated(uuid, uuid, text, text, bigint, text, text) TO service_role;

COMMIT;

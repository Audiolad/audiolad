-- Widen the analyzer seal to the previous pin and cc5b2828.
-- Schema and function only. Applying this file does not rewrite or delete rows.
-- The assignment inside complete_music_analyzer_run is the existing seal body
-- and does not run when this migration is applied.
-- Historical succeeded rows match ^932c4ce[0-9a-f]{0,33}$. The new predicate
-- accepts that prefix or cc5b2828, and the other branches are unchanged, so
-- every row that already satisfied the valid check still satisfies this one.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.music_analyzer_runs
    WHERE NOT (
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
        AND analyzer_git_commit ~ '^(932c4ce|cc5b2828)[0-9a-f]{0,33}$'
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
  ) THEN
    RAISE EXCEPTION 'seal_prefix_widen_rejected_existing_row';
  END IF;
END $$;

ALTER TABLE public.music_analyzer_runs
  DROP CONSTRAINT IF EXISTS music_analyzer_runs_phase_check;

ALTER TABLE public.music_analyzer_runs
  ADD CONSTRAINT music_analyzer_runs_phase_check
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
      AND analyzer_git_commit ~ '^(932c4ce|cc5b2828)[0-9a-f]{0,33}$'
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
  ) NOT VALID;

ALTER TABLE public.music_analyzer_runs
  VALIDATE CONSTRAINT music_analyzer_runs_phase_check;

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
    OR p_analyzer_git_commit !~ '^(932c4ce|cc5b2828)[0-9a-f]{0,33}$'
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

GRANT EXECUTE ON FUNCTION public.complete_music_analyzer_run(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'music_analyzer_runs_phase_check'
      AND conrelid = 'public.music_analyzer_runs'::regclass
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'music_analyzer_runs_phase_check is not validated';
  END IF;
END $$;

COMMIT;

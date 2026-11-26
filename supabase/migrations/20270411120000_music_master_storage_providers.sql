BEGIN;

-- Per-asset storage routing for music masters. Existing rows stay on the
-- self-hosted Supabase file backend until an individually verified cutover.
ALTER TABLE public.music_audio_assets
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase_file',
  ADD COLUMN IF NOT EXISTS content_sha256 text NULL;

ALTER TABLE public.music_audio_assets
  DROP CONSTRAINT IF EXISTS music_audio_assets_storage_provider_check,
  DROP CONSTRAINT IF EXISTS music_audio_assets_content_sha256_check;

ALTER TABLE public.music_audio_assets
  ADD CONSTRAINT music_audio_assets_storage_provider_check
    CHECK (
      (asset_role = 'master' AND storage_provider IN ('supabase_file', 'timeweb_s3'))
      OR (asset_role = 'stream' AND storage_provider = 'supabase_file')
    ),
  ADD CONSTRAINT music_audio_assets_content_sha256_check
    CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');

CREATE INDEX IF NOT EXISTS music_audio_assets_provider_role_idx
  ON public.music_audio_assets (storage_provider, asset_role, lifecycle_state);

-- A verified master remains immutable except for recording its checksum and
-- switching its provider. A provider switch is accepted only after the
-- checksum has been stored; the logical bucket/path never change.
CREATE OR REPLACE FUNCTION public.guard_music_audio_asset_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.asset_role = 'stream' AND NOT EXISTS (
    SELECT 1
    FROM public.music_audio_assets AS source
    WHERE source.id = NEW.source_asset_id
      AND source.audio_item_id = NEW.audio_item_id
      AND source.asset_role = 'master'
      AND source.lifecycle_state = 'verified'
  ) THEN
    RAISE EXCEPTION 'invalid_music_stream_source' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.asset_role = 'master'
    AND OLD.lifecycle_state = 'verified'
    AND (
      to_jsonb(NEW) - ARRAY['storage_provider', 'content_sha256', 'updated_at']
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY['storage_provider', 'content_sha256', 'updated_at']
    ) THEN
    RAISE EXCEPTION 'verified_music_master_immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.asset_role = 'master'
    AND OLD.lifecycle_state = 'verified'
    AND OLD.content_sha256 IS NOT NULL
    AND NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 THEN
    RAISE EXCEPTION 'music_master_checksum_immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.asset_role = 'master'
    AND OLD.lifecycle_state = 'verified'
    AND NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
    AND (
      OLD.content_sha256 IS NULL
      OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    ) THEN
    RAISE EXCEPTION 'music_master_provider_switch_unverified' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.music_storage_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.music_audio_assets(id) ON DELETE CASCADE,
  source_provider text NOT NULL,
  target_provider text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL,
  source_sha256 text NULL,
  target_sha256 text NULL,
  status text NOT NULL DEFAULT 'planned',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text NULL,
  verified_at timestamptz NULL,
  cutover_at timestamptz NULL,
  rolled_back_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_storage_copies_provider_check CHECK (
    source_provider IN ('supabase_file', 'timeweb_s3')
    AND target_provider IN ('supabase_file', 'timeweb_s3')
    AND source_provider <> target_provider
  ),
  CONSTRAINT music_storage_copies_size_check CHECK (size_bytes > 0),
  CONSTRAINT music_storage_copies_hash_check CHECK (
    (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$')
    AND (target_sha256 IS NULL OR target_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT music_storage_copies_status_check CHECK (
    status IN ('planned', 'copying', 'verified', 'failed', 'cutover', 'rolled_back')
  ),
  CONSTRAINT music_storage_copies_attempt_check CHECK (attempt_count >= 0),
  UNIQUE (asset_id, target_provider, storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS music_storage_copies_status_updated_idx
  ON public.music_storage_copies (status, updated_at DESC);

ALTER TABLE public.music_storage_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.music_storage_copies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.music_storage_copies TO service_role;

CREATE TABLE IF NOT EXISTS public.music_storage_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_item_id uuid NOT NULL,
  provider text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'blocked',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT music_storage_cleanup_jobs_provider_check
    CHECK (provider IN ('supabase_file', 'timeweb_s3')),
  CONSTRAINT music_storage_cleanup_jobs_status_check
    CHECK (status IN ('blocked', 'pending', 'resolved')),
  CONSTRAINT music_storage_cleanup_jobs_attempt_check
    CHECK (attempt_count >= 0),
  UNIQUE (provider, storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS music_storage_cleanup_jobs_status_updated_idx
  ON public.music_storage_cleanup_jobs (status, updated_at);

ALTER TABLE public.music_storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.music_storage_cleanup_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.music_storage_cleanup_jobs TO service_role;

CREATE TABLE IF NOT EXISTS public.music_storage_daily_metrics (
  metric_date date NOT NULL DEFAULT current_date,
  provider text NOT NULL,
  operation text NOT NULL,
  outcome text NOT NULL,
  request_count bigint NOT NULL DEFAULT 0,
  byte_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_date, provider, operation, outcome),
  CONSTRAINT music_storage_daily_metrics_provider_check
    CHECK (provider IN ('supabase_file', 'timeweb_s3')),
  CONSTRAINT music_storage_daily_metrics_operation_check
    CHECK (operation IN ('sign_upload', 'sign_download', 'head', 'upload', 'download', 'delete')),
  CONSTRAINT music_storage_daily_metrics_outcome_check
    CHECK (outcome IN ('ok', 'error')),
  CONSTRAINT music_storage_daily_metrics_count_check
    CHECK (request_count >= 0 AND byte_count >= 0)
);

ALTER TABLE public.music_storage_daily_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.music_storage_daily_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.music_storage_daily_metrics TO service_role;

CREATE OR REPLACE FUNCTION public.record_music_storage_metric(
  p_provider text,
  p_operation text,
  p_outcome text,
  p_bytes bigint DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_provider NOT IN ('supabase_file', 'timeweb_s3')
    OR p_operation NOT IN ('sign_upload', 'sign_download', 'head', 'upload', 'download', 'delete')
    OR p_outcome NOT IN ('ok', 'error') THEN
    RAISE EXCEPTION 'invalid_music_storage_metric' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.music_storage_daily_metrics (
    metric_date, provider, operation, outcome, request_count, byte_count, updated_at
  ) VALUES (
    current_date,
    p_provider,
    p_operation,
    p_outcome,
    1,
    GREATEST(COALESCE(p_bytes, 0), 0),
    now()
  )
  ON CONFLICT (metric_date, provider, operation, outcome)
  DO UPDATE SET
    request_count = public.music_storage_daily_metrics.request_count + 1,
    byte_count = public.music_storage_daily_metrics.byte_count
      + GREATEST(COALESCE(EXCLUDED.byte_count, 0), 0),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_music_storage_metric(text, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_music_storage_metric(text, text, text, bigint)
  TO service_role;

COMMIT;

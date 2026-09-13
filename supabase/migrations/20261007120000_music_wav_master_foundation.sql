BEGIN;

-- Slice 1: immutable private WAV masters. Legacy audio_items.audio_path remains
-- the only public/listener delivery pointer until a later delivery slice.
CREATE TABLE public.music_audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE CASCADE,
  source_asset_id uuid NULL REFERENCES public.music_audio_assets(id) ON DELETE RESTRICT,
  asset_role text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL,
  accepted_mime_type text NOT NULL,
  size_bytes bigint NULL,
  duration_seconds numeric NULL,
  lifecycle_state text NOT NULL DEFAULT 'uploading',
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_audio_assets_role_check
    CHECK (asset_role IN ('master', 'stream')),
  CONSTRAINT music_audio_assets_bucket_role_check
    CHECK (
      (asset_role = 'master' AND storage_bucket = 'music-masters')
      OR (asset_role = 'stream' AND storage_bucket = 'music-streams')
    ),
  CONSTRAINT music_audio_assets_source_link_check
    CHECK (
      (asset_role = 'master' AND source_asset_id IS NULL)
      OR (asset_role = 'stream' AND source_asset_id IS NOT NULL)
    ),
  CONSTRAINT music_audio_assets_size_check
    CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 314572800)),
  CONSTRAINT music_audio_assets_duration_check
    CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  CONSTRAINT music_audio_assets_lifecycle_check
    CHECK (lifecycle_state IN ('uploading', 'verified', 'rejected', 'abandoned')),
  CONSTRAINT music_audio_assets_verified_state_check
    CHECK (
      (lifecycle_state = 'verified' AND size_bytes IS NOT NULL
        AND duration_seconds IS NOT NULL AND verified_at IS NOT NULL)
      OR lifecycle_state <> 'verified'
    )
);

CREATE INDEX music_audio_assets_audio_item_created_idx
  ON public.music_audio_assets (audio_item_id, created_at DESC);

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
  IF TG_OP = 'UPDATE' AND OLD.asset_role = 'master'
    AND OLD.lifecycle_state = 'verified'
    AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'verified_music_master_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_music_audio_asset_integrity_trigger
  BEFORE INSERT OR UPDATE ON public.music_audio_assets
  FOR EACH ROW EXECUTE FUNCTION public.guard_music_audio_asset_integrity();

-- Reserved pointer for a future delivery resolver. It intentionally remains
-- NULL in Slice 1: no stream object or public-player switch exists here.
ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS active_music_delivery_asset_id uuid NULL
  REFERENCES public.music_audio_assets(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_active_music_delivery_asset()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.active_music_delivery_asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.music_audio_assets AS asset
    WHERE asset.id = NEW.active_music_delivery_asset_id
      AND asset.audio_item_id = NEW.id
      AND asset.asset_role = 'stream'
      AND asset.lifecycle_state = 'verified'
  ) THEN
    RAISE EXCEPTION 'invalid_active_music_delivery_asset' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_active_music_delivery_asset_trigger
  BEFORE INSERT OR UPDATE OF active_music_delivery_asset_id ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_music_delivery_asset();

CREATE TABLE public.music_transcode_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id uuid NOT NULL REFERENCES public.music_audio_assets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  error_code text NULL,
  error_message_safe text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  CONSTRAINT music_transcode_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  CONSTRAINT music_transcode_jobs_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT music_transcode_jobs_lease_check
    CHECK (
      (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
    )
);

CREATE INDEX music_transcode_jobs_queued_created_idx
  ON public.music_transcode_jobs (created_at) WHERE status = 'queued';
CREATE UNIQUE INDEX music_transcode_jobs_one_active_source_idx
  ON public.music_transcode_jobs (source_asset_id)
  WHERE status IN ('queued', 'processing');

ALTER TABLE public.music_audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_transcode_jobs ENABLE ROW LEVEL SECURITY;
-- No browser table policies. API routes authorize author membership first and
-- use the service role; masters and worker details never become client-readable.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'music-masters', 'music-masters', false, 314572800,
    ARRAY['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']::text[]
  ),
  ('music-streams', 'music-streams', false, 314572800, ARRAY['audio/mpeg']::text[])
ON CONFLICT (id) DO NOTHING;
-- No storage.objects policies: signed master PUT comes from a server-issued
-- token; reads, deletion and future stream delivery stay server-managed.

CREATE OR REPLACE FUNCTION public.finalize_music_master_asset(
  p_asset_id uuid,
  p_size_bytes bigint,
  p_duration_seconds numeric
)
RETURNS public.music_audio_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset public.music_audio_assets;
BEGIN
  SELECT * INTO v_asset
  FROM public.music_audio_assets
  WHERE id = p_asset_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'music_asset_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.asset_role <> 'master' OR v_asset.lifecycle_state NOT IN ('uploading', 'verified') THEN
    RAISE EXCEPTION 'invalid_music_asset_state' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 314572800
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
    RAISE EXCEPTION 'invalid_music_asset' USING ERRCODE = '22023';
  END IF;

  IF v_asset.lifecycle_state = 'uploading' THEN
    UPDATE public.music_audio_assets
    SET size_bytes = p_size_bytes,
        duration_seconds = p_duration_seconds,
        lifecycle_state = 'verified',
        verified_at = now(),
        updated_at = now()
    WHERE id = p_asset_id
    RETURNING * INTO v_asset;
  ELSIF v_asset.size_bytes <> p_size_bytes
    OR v_asset.duration_seconds <> p_duration_seconds THEN
    RAISE EXCEPTION 'music_asset_metadata_mismatch' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.music_transcode_jobs (source_asset_id, status)
  VALUES (p_asset_id, 'queued')
  ON CONFLICT (source_asset_id) WHERE status IN ('queued', 'processing')
  DO NOTHING;

  RETURN v_asset;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_music_master_asset(uuid, bigint, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_music_master_asset(uuid, bigint, numeric)
  TO service_role;

COMMIT;

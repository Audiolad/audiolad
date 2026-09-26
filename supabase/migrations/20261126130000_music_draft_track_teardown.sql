BEGIN;

-- Draft music tracks with a ready transcode cannot be deleted: dropping the
-- stream asset SET NULLs music_transcode_jobs.output_asset_id while status is
-- still 'ready', and guard_music_transcode_job_output rejects that update.
-- Teardown nulls delivery pointers, deletes jobs, then streams, then masters.
-- Storage objects are returned for best-effort cleanup and are not removed here.
-- A monotonic upload generation makes a late finalize of an older file a no-op.

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS music_upload_generation bigint NOT NULL DEFAULT 0;

ALTER TABLE public.audio_items
  DROP CONSTRAINT IF EXISTS audio_items_music_upload_generation_check;

ALTER TABLE public.audio_items
  ADD CONSTRAINT audio_items_music_upload_generation_check
  CHECK (music_upload_generation >= 0);

ALTER TABLE public.music_audio_assets
  ADD COLUMN IF NOT EXISTS upload_generation bigint NULL;

ALTER TABLE public.music_audio_assets
  DROP CONSTRAINT IF EXISTS music_audio_assets_upload_generation_check;

ALTER TABLE public.music_audio_assets
  ADD CONSTRAINT music_audio_assets_upload_generation_check
  CHECK (upload_generation IS NULL OR upload_generation > 0);

CREATE TABLE IF NOT EXISTS public.music_direct_upload_generations (
  audio_item_id uuid NOT NULL REFERENCES public.audio_items(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  upload_generation bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audio_item_id, storage_path),
  CONSTRAINT music_direct_upload_generations_generation_check
    CHECK (upload_generation > 0)
);

ALTER TABLE public.music_direct_upload_generations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_music_upload_generation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.music_upload_generation IS DISTINCT FROM OLD.music_upload_generation
    AND (
      current_setting('role', true) IN ('anon', 'authenticated')
      OR current_user IN ('anon', 'authenticated')
    ) THEN
    RAISE EXCEPTION 'music_upload_generation_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_music_upload_generation_trigger ON public.audio_items;
CREATE TRIGGER guard_music_upload_generation_trigger
  BEFORE UPDATE OF music_upload_generation ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_music_upload_generation();

CREATE OR REPLACE FUNCTION public.claim_music_track_upload_generation(
  p_audio_item_id uuid,
  p_practice_id uuid,
  p_storage_path text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_generation bigint;
BEGIN
  UPDATE public.audio_items
  SET music_upload_generation = music_upload_generation + 1,
      updated_at = now()
  WHERE id = p_audio_item_id
    AND practice_id = p_practice_id
  RETURNING music_upload_generation INTO v_generation;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'music_asset_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_storage_path IS NOT NULL AND btrim(p_storage_path) <> '' THEN
    INSERT INTO public.music_direct_upload_generations (
      audio_item_id, storage_path, upload_generation
    ) VALUES (
      p_audio_item_id, p_storage_path, v_generation
    )
    ON CONFLICT (audio_item_id, storage_path)
    DO UPDATE SET
      upload_generation = EXCLUDED.upload_generation,
      created_at = now();
  END IF;

  RETURN v_generation;
END;
$$;

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
  v_item public.audio_items;
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

  -- Only the real uploading → verified transition may claim desired + enqueue.
  IF v_asset.lifecycle_state = 'uploading' THEN
    SELECT * INTO v_item
    FROM public.audio_items
    WHERE id = v_asset.audio_item_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'music_asset_not_found' USING ERRCODE = 'P0002';
    END IF;

    -- Latest claim wins. A late finalize of an older master must not replace it.
    IF v_asset.upload_generation IS NOT NULL
      AND v_asset.upload_generation IS DISTINCT FROM v_item.music_upload_generation THEN
      UPDATE public.music_audio_assets
      SET lifecycle_state = 'abandoned',
          updated_at = now()
      WHERE id = p_asset_id
        AND lifecycle_state = 'uploading'
      RETURNING * INTO v_asset;
      IF NOT FOUND THEN
        SELECT * INTO v_asset
        FROM public.music_audio_assets
        WHERE id = p_asset_id;
      END IF;
      RETURN v_asset;
    END IF;

    IF public.practice_is_content_locked_after_sale(v_item.practice_id)
      AND public.audio_item_has_existing_music_current_audio(
        v_item.audio_path,
        v_item.active_music_delivery_asset_id,
        v_item.desired_music_master_asset_id
      ) THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.music_audio_assets
    SET size_bytes = p_size_bytes,
        duration_seconds = p_duration_seconds,
        lifecycle_state = 'verified',
        verified_at = now(),
        updated_at = now()
    WHERE id = p_asset_id
    RETURNING * INTO v_asset;

    UPDATE public.audio_items
    SET desired_music_master_asset_id = v_asset.id,
        updated_at = now()
    WHERE id = v_asset.audio_item_id;

    INSERT INTO public.music_transcode_jobs (source_asset_id, status)
    VALUES (p_asset_id, 'queued')
    ON CONFLICT (source_asset_id) WHERE status IN ('queued', 'processing')
    DO NOTHING;

    RETURN v_asset;
  END IF;

  -- Idempotent verified retry: return asset, do not touch desired/active/jobs.
  IF v_asset.size_bytes <> p_size_bytes
    OR v_asset.duration_seconds <> p_duration_seconds THEN
    RAISE EXCEPTION 'music_asset_metadata_mismatch' USING ERRCODE = '22023';
  END IF;
  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_music_direct_mp3_delivery(
  p_audio_item_id uuid,
  p_audio_path text,
  p_duration_seconds numeric,
  p_original_file_name text,
  p_file_size_bytes bigint,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.audio_items;
  v_updated integer;
  v_claim_generation bigint;
BEGIN
  IF p_audio_item_id IS NULL
    OR p_audio_path IS NULL
    OR btrim(p_audio_path) = ''
    OR p_duration_seconds IS NULL
    OR p_duration_seconds <= 0
    OR p_file_size_bytes IS NULL
    OR p_file_size_bytes <= 0
    OR p_status IS NULL
    OR btrim(p_status) = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = p_audio_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Once a generation has been issued, only the path claimed for that
  -- generation may become current. A missing or older claim does not write.
  IF v_item.music_upload_generation > 0 THEN
    SELECT upload_generation INTO v_claim_generation
    FROM public.music_direct_upload_generations
    WHERE audio_item_id = p_audio_item_id
      AND storage_path = p_audio_path;
    IF NOT FOUND OR v_claim_generation IS DISTINCT FROM v_item.music_upload_generation THEN
      RETURN false;
    END IF;
  END IF;

  IF public.practice_is_content_locked_after_sale(v_item.practice_id)
    AND public.audio_item_has_existing_music_current_audio(
      v_item.audio_path,
      v_item.active_music_delivery_asset_id,
      v_item.desired_music_master_asset_id
    ) THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.audio_items
  SET audio_path = p_audio_path,
      duration_seconds = p_duration_seconds,
      original_file_name = p_original_file_name,
      file_size_bytes = p_file_size_bytes,
      status = p_status,
      desired_music_master_asset_id = NULL,
      active_music_delivery_asset_id = NULL,
      updated_at = now()
  WHERE id = p_audio_item_id
  RETURNING 1 INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.teardown_music_track_delivery(
  p_audio_item_id uuid,
  p_practice_id uuid,
  p_delete_item boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.audio_items;
  v_objects jsonb := '[]'::jsonb;
  v_asset_objects jsonb := '[]'::jsonb;
  v_norm record;
BEGIN
  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = p_audio_item_id
    AND practice_id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'objects', '[]'::jsonb);
  END IF;

  IF public.practice_is_content_locked_after_sale(v_item.practice_id) THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM public.music_audio_assets
  WHERE audio_item_id = p_audio_item_id
  FOR UPDATE;

  IF v_item.audio_path IS NOT NULL AND btrim(v_item.audio_path) <> '' THEN
    v_objects := v_objects || jsonb_build_array(
      jsonb_build_object('bucket', 'practice-audio', 'path', v_item.audio_path)
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', asset.storage_bucket,
    'path', asset.storage_path
  )), '[]'::jsonb)
  INTO v_asset_objects
  FROM public.music_audio_assets AS asset
  WHERE asset.audio_item_id = p_audio_item_id;
  v_objects := v_objects || v_asset_objects;

  FOR v_norm IN
    SELECT source_storage_path, target_storage_path
    FROM public.product_audio_normalize_jobs
    WHERE audio_item_id = p_audio_item_id
  LOOP
    IF v_norm.source_storage_path IS NOT NULL AND btrim(v_norm.source_storage_path) <> '' THEN
      v_objects := v_objects || jsonb_build_array(
        jsonb_build_object('bucket', 'practice-audio', 'path', v_norm.source_storage_path)
      );
    END IF;
    IF v_norm.target_storage_path IS NOT NULL AND btrim(v_norm.target_storage_path) <> '' THEN
      v_objects := v_objects || jsonb_build_array(
        jsonb_build_object('bucket', 'practice-audio', 'path', v_norm.target_storage_path)
      );
    END IF;
  END LOOP;

  UPDATE public.audio_items
  SET active_music_delivery_asset_id = NULL,
      desired_music_master_asset_id = NULL,
      desired_product_audio_normalize_job_id = NULL,
      audio_path = NULL,
      duration_seconds = NULL,
      original_file_name = NULL,
      file_size_bytes = NULL,
      music_upload_generation = music_upload_generation + 1,
      updated_at = now()
  WHERE id = p_audio_item_id;

  DELETE FROM public.music_direct_upload_generations
  WHERE audio_item_id = p_audio_item_id;

  DELETE FROM public.music_transcode_jobs
  WHERE source_asset_id IN (
      SELECT id FROM public.music_audio_assets WHERE audio_item_id = p_audio_item_id
    )
    OR output_asset_id IN (
      SELECT id FROM public.music_audio_assets WHERE audio_item_id = p_audio_item_id
    );

  DELETE FROM public.music_audio_assets
  WHERE audio_item_id = p_audio_item_id
    AND asset_role = 'stream';

  DELETE FROM public.music_audio_assets
  WHERE audio_item_id = p_audio_item_id
    AND asset_role = 'master';

  DELETE FROM public.product_audio_normalize_jobs
  WHERE audio_item_id = p_audio_item_id;

  IF EXISTS (
    SELECT 1 FROM public.music_audio_assets WHERE audio_item_id = p_audio_item_id
  ) OR EXISTS (
    SELECT 1 FROM public.music_transcode_jobs AS job
    WHERE job.source_asset_id IN (
        SELECT id FROM public.music_audio_assets WHERE audio_item_id = p_audio_item_id
      )
      OR job.output_asset_id IN (
        SELECT id FROM public.music_audio_assets WHERE audio_item_id = p_audio_item_id
      )
  ) THEN
    RAISE EXCEPTION 'music_track_teardown_incomplete' USING ERRCODE = '55000';
  END IF;

  IF p_delete_item THEN
    DELETE FROM public.audio_items
    WHERE id = p_audio_item_id
      AND practice_id = p_practice_id;
    RETURN jsonb_build_object('status', 'deleted', 'objects', v_objects);
  END IF;

  RETURN jsonb_build_object('status', 'cleared', 'objects', v_objects);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_music_track_upload_generation(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_music_track_upload_generation(uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_music_master_asset(uuid, bigint, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_music_master_asset(uuid, bigint, numeric)
  TO service_role;

REVOKE ALL ON FUNCTION public.activate_music_direct_mp3_delivery(uuid, text, numeric, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_music_direct_mp3_delivery(uuid, text, numeric, text, bigint, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.teardown_music_track_delivery(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teardown_music_track_delivery(uuid, uuid, boolean)
  TO service_role;

COMMIT;

BEGIN;

-- Slice 3: current desired master + atomic public-delivery promotion.
-- Extends sale-lock current-audio semantics to music pointers + service-role RPCs.
-- Does not add Storage policies.

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS desired_music_master_asset_id uuid NULL
    REFERENCES public.music_audio_assets(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.audio_item_has_existing_music_current_audio(
  p_audio_path text,
  p_active_music_delivery_asset_id uuid,
  p_desired_music_master_asset_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    (p_audio_path IS NOT NULL AND btrim(p_audio_path) <> '')
    OR p_active_music_delivery_asset_id IS NOT NULL
    OR p_desired_music_master_asset_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.audio_item_has_existing_music_current_audio(text, uuid, uuid) IS
  'audiolad:music-current-audio:v1; true when path, active stream, or desired master is set';

CREATE OR REPLACE FUNCTION public.audio_item_has_delivered_music_audio(
  p_audio_path text,
  p_active_music_delivery_asset_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    (p_audio_path IS NOT NULL AND btrim(p_audio_path) <> '')
    OR p_active_music_delivery_asset_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.audio_item_has_delivered_music_audio(text, uuid) IS
  'audiolad:music-delivered-audio:v1; listener-visible current delivery via path or active stream';

CREATE OR REPLACE FUNCTION public.guard_desired_music_master_asset()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.desired_music_master_asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.music_audio_assets AS asset
    WHERE asset.id = NEW.desired_music_master_asset_id
      AND asset.audio_item_id = NEW.id
      AND asset.asset_role = 'master'
      AND asset.lifecycle_state = 'verified'
  ) THEN
    RAISE EXCEPTION 'invalid_desired_music_master_asset' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_desired_music_master_asset_trigger ON public.audio_items;
CREATE TRIGGER guard_desired_music_master_asset_trigger
  BEFORE INSERT OR UPDATE OF desired_music_master_asset_id ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_desired_music_master_asset();

CREATE OR REPLACE FUNCTION public.guard_music_delivery_pointer_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      NEW.active_music_delivery_asset_id IS DISTINCT FROM OLD.active_music_delivery_asset_id
      OR NEW.desired_music_master_asset_id IS DISTINCT FROM OLD.desired_music_master_asset_id
    )
    AND (
      current_setting('role', true) IN ('anon', 'authenticated')
      OR current_user IN ('anon', 'authenticated')
    ) THEN
    RAISE EXCEPTION 'music_delivery_pointer_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_music_delivery_pointer_roles_trigger ON public.audio_items;
CREATE TRIGGER guard_music_delivery_pointer_roles_trigger
  BEFORE UPDATE OF active_music_delivery_asset_id, desired_music_master_asset_id
  ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_music_delivery_pointer_roles();

-- Extend canonical audio_items sale-lock trigger for music current-audio semantics.
-- Reuses practice_is_content_locked_after_sale (user_practices + paid orders +
-- non-revoked studio_music_entitlements).
CREATE OR REPLACE FUNCTION public.guard_audio_items_content_sale_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
  v_locked boolean;
  v_old_existing boolean;
BEGIN
  v_practice_id := COALESCE(NEW.practice_id, OLD.practice_id);
  v_locked := public.practice_is_content_locked_after_sale(v_practice_id);

  IF NOT v_locked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  v_old_existing := public.audio_item_has_existing_music_current_audio(
    OLD.audio_path,
    OLD.active_music_delivery_asset_id,
    OLD.desired_music_master_asset_id
  );

  -- Path: allow true first fill only when no existing current audio.
  IF NEW.audio_path IS DISTINCT FROM OLD.audio_path THEN
    IF v_old_existing
      OR NOT (
        NEW.audio_path IS NOT NULL
        AND btrim(NEW.audio_path) <> ''
      ) THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Active: allow first delivery only; never clear/replace an existing delivery.
  IF NEW.active_music_delivery_asset_id IS DISTINCT FROM OLD.active_music_delivery_asset_id THEN
    IF OLD.active_music_delivery_asset_id IS NOT NULL
      OR (OLD.audio_path IS NOT NULL AND btrim(OLD.audio_path) <> '')
      OR NEW.active_music_delivery_asset_id IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Desired: allow first claim or clear of a stale desired; block replace.
  IF NEW.desired_music_master_asset_id IS DISTINCT FROM OLD.desired_music_master_asset_id THEN
    IF NEW.desired_music_master_asset_id IS NULL THEN
      NULL; -- clearing stale desired under lock is allowed
    ELSIF v_old_existing THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF OLD.status = 'published'
     AND NEW.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_audio_items_content_sale_lock_trigger ON public.audio_items;
CREATE TRIGGER guard_audio_items_content_sale_lock_trigger
  BEFORE UPDATE OR DELETE ON public.audio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_audio_items_content_sale_lock();

CREATE OR REPLACE FUNCTION public.promote_music_item_delivery(
  p_audio_item_id uuid,
  p_stream_asset_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.audio_items;
  v_stream public.music_audio_assets;
  v_updated integer;
BEGIN
  IF p_audio_item_id IS NULL OR p_stream_asset_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_item
  FROM public.audio_items
  WHERE id = p_audio_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_stream
  FROM public.music_audio_assets
  WHERE id = p_stream_asset_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Sale-lock after replacement WAV started: never replace delivered audio.
  -- Job may still become ready; clear stale desired for durable cabinet state.
  IF public.practice_is_content_locked_after_sale(v_item.practice_id)
    AND public.audio_item_has_delivered_music_audio(
      v_item.audio_path,
      v_item.active_music_delivery_asset_id
    )
    AND v_item.active_music_delivery_asset_id IS DISTINCT FROM p_stream_asset_id
  THEN
    IF v_item.desired_music_master_asset_id IS NOT NULL THEN
      UPDATE public.audio_items
      SET desired_music_master_asset_id = NULL,
          updated_at = now()
      WHERE id = p_audio_item_id
        AND desired_music_master_asset_id IS NOT NULL;
    END IF;
    RETURN false;
  END IF;

  UPDATE public.audio_items AS item
  SET active_music_delivery_asset_id = p_stream_asset_id,
      updated_at = now()
  FROM public.music_audio_assets AS stream
  WHERE item.id = p_audio_item_id
    AND stream.id = p_stream_asset_id
    AND stream.audio_item_id = item.id
    AND stream.asset_role = 'stream'
    AND stream.lifecycle_state = 'verified'
    AND stream.storage_bucket = 'music-streams'
    AND stream.source_asset_id IS NOT NULL
    AND stream.source_asset_id = item.desired_music_master_asset_id
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
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
  v_audio_item_id uuid;
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
  IF v_updated IS NULL THEN
    RETURN false;
  END IF;
  SELECT audio_item_id INTO v_audio_item_id
  FROM public.music_audio_assets
  WHERE id = p_output_asset_id;
  PERFORM public.promote_music_item_delivery(v_audio_item_id, p_output_asset_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_music_item_delivery(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_music_item_delivery(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_music_master_asset(uuid, bigint, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_music_master_asset(uuid, bigint, numeric)
  TO service_role;

REVOKE ALL ON FUNCTION public.activate_music_direct_mp3_delivery(uuid, text, numeric, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_music_direct_mp3_delivery(uuid, text, numeric, text, bigint, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_music_transcode_job(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_music_transcode_job(uuid, uuid, uuid)
  TO service_role;

COMMIT;

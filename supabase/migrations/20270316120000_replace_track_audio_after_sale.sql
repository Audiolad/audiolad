BEGIN;

-- t1529u: authors can replace the audio file of a track in a product that
-- listeners already bought (audio course, practice, audio post, story, music).
--
-- Before: the sale lock forbade any change of a track's current audio once the
-- product had an entitlement or a paid order. After: replacing is allowed,
-- removing is still forbidden.
--   * guard_audio_items_content_sale_lock: under the lock a track that had
--     playable audio (audio_path or active stream) must still have playable
--     audio after the update. DELETE, practice_id change, blank path and
--     published -> other status stay blocked exactly as before.
--   * finalize_music_master_asset / activate_music_direct_mp3_delivery /
--     promote_music_item_delivery: the sale-lock refusal is removed, the rest of
--     each body is copied unchanged from the live definition
--     (20261126130000_music_draft_track_teardown.sql,
--     20261007180000_music_publish_playable_audio.sql).
--   * teardown_music_track_delivery keeps its sale-lock refusal (it clears audio).
--
-- No tables, columns, rows or grants change. CREATE OR REPLACE keeps grants.
-- Rollback: supabase/rollbacks/20270316120000_replace_track_audio_after_sale.rollback.sql re-creates the previous four definitions.

CREATE OR REPLACE FUNCTION public.guard_audio_items_content_sale_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
  v_locked boolean;
BEGIN
  v_practice_id := COALESCE(NEW.practice_id, OLD.practice_id);
  v_locked := public.practice_is_content_locked_after_sale(v_practice_id);

  IF NOT v_locked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Deleting a track of a purchased product stays forbidden.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  -- A path that is set must not be blank.
  IF NEW.audio_path IS DISTINCT FROM OLD.audio_path
    AND NEW.audio_path IS NOT NULL
    AND btrim(NEW.audio_path) = '' THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  -- t1529u: replacing the audio of a purchased track is allowed (path swap,
  -- new active stream, new desired master). Removing it is not: a track that
  -- listeners could play must still have playable audio after the update.
  IF public.audio_item_has_delivered_music_audio(
       OLD.audio_path,
       OLD.active_music_delivery_asset_id
     )
     AND NOT public.audio_item_has_delivered_music_audio(
       NEW.audio_path,
       NEW.active_music_delivery_asset_id
     ) THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'published'
     AND NEW.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_music_master_asset(p_asset_id uuid, p_size_bytes bigint, p_duration_seconds numeric)
 RETURNS music_audio_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.activate_music_direct_mp3_delivery(p_audio_item_id uuid, p_audio_path text, p_duration_seconds numeric, p_original_file_name text, p_file_size_bytes bigint, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.promote_music_item_delivery(p_audio_item_id uuid, p_stream_asset_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  UPDATE public.audio_items AS item
  SET active_music_delivery_asset_id = p_stream_asset_id,
      duration_seconds = CASE
        WHEN stream.duration_seconds IS NOT NULL AND stream.duration_seconds > 0
          THEN stream.duration_seconds
        ELSE item.duration_seconds
      END,
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

COMMENT ON FUNCTION public.guard_audio_items_content_sale_lock() IS
  'audiolad:practice-sale-lock:v2 (t1529u); after sale a track audio may be replaced but not removed';

COMMIT;

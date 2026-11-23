-- t1655u/t1656u: allow the platform-owner admin to unlink collection tracks
-- and delete a collection. Rights and one additive function only. No CASCADE,
-- no row or schema change.
-- Approved by the operator 20.11.2026, with a production backup before deploy.
-- The function was added after review: it only serializes album unlinking
-- (advisory lock + remaining-count check + DELETE in one transaction).
--
-- Rollback (only with a separate operator OK, after a backup):
--   DROP FUNCTION IF EXISTS public.remove_business_personal_collection_album(uuid, uuid);
--   REVOKE DELETE ON TABLE
--     public.business_personal_collections,
--     public.business_personal_collection_items,
--     public.business_personal_collection_accounts,
--     public.business_personal_collection_locations
--   FROM service_role;

BEGIN;
SET LOCAL lock_timeout = '5s';

GRANT DELETE ON TABLE
  public.business_personal_collections,
  public.business_personal_collection_items,
  public.business_personal_collection_accounts,
  public.business_personal_collection_locations
TO service_role;

CREATE FUNCTION public.remove_business_personal_collection_album(
  p_collection_id uuid,
  p_album_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revoked timestamptz;
  v_remove_ids uuid[];
  v_remaining integer;
  v_deleted integer;
BEGIN
  IF p_collection_id IS NULL OR p_album_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SET LOCAL lock_timeout = '5s';
  PERFORM pg_advisory_xact_lock(hashtextextended('business_personal_collection:' || p_collection_id::text, 70406));

  SELECT revoked_at INTO v_revoked
  FROM public.business_personal_collections
  WHERE id = p_collection_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_revoked IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  -- Membership is every linked audio_item of this album, including tracks that
  -- later lost admission. Playback and add-album still use the admitted catalog.
  SELECT coalesce(array_agg(i.audio_item_id), ARRAY[]::uuid[])
  INTO v_remove_ids
  FROM public.business_personal_collection_items AS i
  JOIN public.audio_items AS a ON a.id = i.audio_item_id
  WHERE i.collection_id = p_collection_id
    AND a.practice_id = p_album_id;

  IF coalesce(cardinality(v_remove_ids), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_in');
  END IF;

  SELECT count(*)::integer INTO v_remaining
  FROM public.business_personal_collection_items
  WHERE collection_id = p_collection_id
    AND NOT (audio_item_id = ANY (v_remove_ids));

  IF v_remaining < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'last_album');
  END IF;

  DELETE FROM public.business_personal_collection_items
  WHERE collection_id = p_collection_id
    AND audio_item_id = ANY (v_remove_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'removed', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_business_personal_collection_album(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_business_personal_collection_album(uuid, uuid)
  TO service_role;

COMMIT;

BEGIN;

-- Business SPA PR3: player manifest. Read-only: no rights, allowlist, grant or usage writes.
-- Only tracks with an ELIGIBLE business_background_playback decision from the existing
-- engine (resolve_business_track_eligibility) are delivered; everything else is withheld
-- (UNKNOWN = deny). Offline caching is a separate ELIGIBLE offline_storage_cache decision.
-- Offline TTL is one universal rule for every rightsholder:
--   offline_cache_until = least(generated_at + 7 days,
--                               earliest valid_until of the offline grants,
--                               earliest valid_until of the playback grants).
-- The license term itself (term of the exclusive right) is carried by grant valid_until;
-- the 7-day cache cap is independent of it.

CREATE FUNCTION public.business_spa_offline_cache_max()
RETURNS interval LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT interval '7 days' $$;
REVOKE ALL ON FUNCTION public.business_spa_offline_cache_max() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_spa_offline_cache_max() TO authenticated, service_role;

-- Earliest valid_until among the grants the engine cited (recording + composition).
-- NULL = open-ended (no earlier bound than the caller's own cap).
CREATE FUNCTION public.business_spa_grants_valid_until(p_eligibility jsonb)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT min(g.valid_until)
  FROM public.music_rights_grants g
  WHERE g.id IN (
    SELECT x::uuid FROM jsonb_array_elements_text(coalesce(p_eligibility->'recording_grant_ids', '[]'::jsonb)) x
    UNION
    SELECT x::uuid FROM jsonb_array_elements_text(coalesce(p_eligibility->'composition_grant_ids', '[]'::jsonb)) x
  );
$$;
REVOKE ALL ON FUNCTION public.business_spa_grants_valid_until(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_spa_grants_valid_until(jsonb) TO service_role;

CREATE FUNCTION public.business_spa_program_manifest(p_program_id uuid, p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_status text;
  v_now timestamptz := now();
  v_cap timestamptz;
  v_items jsonb;
  v_withheld integer;
  v_expires timestamptz;
BEGIN
  SELECT organization_id, status INTO v_org, v_status FROM public.business_programs WHERE id = p_program_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'business_spa_program_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_business_pilot_access(v_org) THEN
    RAISE EXCEPTION 'business_spa_pilot_access_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_locations l WHERE l.id = p_location_id AND l.organization_id = v_org) THEN
    RAISE EXCEPTION 'business_spa_location_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'business_spa_program_archived' USING ERRCODE = '23514';
  END IF;
  v_cap := v_now + public.business_spa_offline_cache_max();

  WITH items AS (
    SELECT i.position, i.audio_item_id, i.gain_db, ai.music_track_code, ai.title, ai.duration_seconds,
      (ai.status = 'published') AS published,
      public.resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'business_background_playback', v_now) AS bbp,
      public.resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'offline_storage_cache', v_now) AS off
    FROM public.business_program_items i
    JOIN public.audio_items ai ON ai.id = i.audio_item_id
    WHERE i.program_id = p_program_id AND i.excluded_at IS NULL
  ), decided AS (
    SELECT it.*,
      (it.published AND coalesce(it.bbp->>'decision' = 'ELIGIBLE', false)) AS playable,
      (it.published AND coalesce(it.bbp->>'decision' = 'ELIGIBLE' AND it.off->>'decision' = 'ELIGIBLE', false)) AS cacheable,
      public.business_spa_grants_valid_until(it.bbp) AS play_until
    FROM items it
  ), delivered AS (
    SELECT d.*,
      CASE WHEN d.cacheable THEN
        least(v_cap, public.business_spa_grants_valid_until(d.off), d.play_until)
      END AS cache_until
    FROM decided d WHERE d.playable AND (d.play_until IS NULL OR d.play_until > v_now)
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'position', d.position,
      'audio_item_id', d.audio_item_id,
      'track_code', d.music_track_code,
      'title', d.title,
      'duration_seconds', d.duration_seconds,
      'gain_db', d.gain_db,
      'playable_until', d.play_until,
      'offline_allowed', d.cache_until IS NOT NULL AND d.cache_until > v_now,
      'offline_cache_until', CASE WHEN d.cache_until > v_now THEN d.cache_until END
    ) ORDER BY d.position), '[]'::jsonb),
    least(v_cap, min(d.play_until))
  INTO v_items, v_expires
  FROM delivered d;

  SELECT count(*)::integer - jsonb_array_length(v_items) INTO v_withheld
  FROM public.business_program_items i WHERE i.program_id = p_program_id AND i.excluded_at IS NULL;

  RETURN jsonb_build_object(
    'manifest_version', 'business_spa_manifest_v1',
    'program_id', p_program_id,
    'location_id', p_location_id,
    'program_status', v_status,
    'generated_at', v_now,
    'expires_at', v_expires,
    'offline_cache_max_seconds', extract(epoch FROM public.business_spa_offline_cache_max())::integer,
    'withheld_count', v_withheld,
    -- Stable across calls: identity/order/gain/offline flag only, no timestamps.
    'content_hash', md5(coalesce((SELECT string_agg(concat_ws(':', e->>'position', e->>'audio_item_id', e->>'gain_db', e->>'offline_allowed'), '|' ORDER BY (e->>'position')::integer)
      FROM jsonb_array_elements(v_items) e), '')),
    'items', v_items
  );
END;
$$;
COMMENT ON FUNCTION public.business_spa_program_manifest(uuid, uuid) IS
  'Business SPA PR3 player manifest. Only ELIGIBLE business_background_playback tracks; offline only on ELIGIBLE offline_storage_cache; offline_cache_until <= 7 days and <= grant valid_until. Withheld tracks are counted, not described. Read-only.';
REVOKE ALL ON FUNCTION public.business_spa_program_manifest(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_spa_program_manifest(uuid, uuid) TO authenticated, service_role;

COMMIT;

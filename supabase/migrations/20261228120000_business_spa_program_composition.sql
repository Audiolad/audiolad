BEGIN;

-- Business SPA PR2: pilot program composition + loudness gain per item.
-- No rights rows, no pilot users, no programs are seeded. Composition never grants
-- rights: every row is re-evaluated through resolve_business_track_eligibility.
ALTER TABLE public.business_program_items
  ADD COLUMN gain_db numeric(5,2) CHECK (gain_db IS NULL OR gain_db BETWEEN -30 AND 6);
COMMENT ON COLUMN public.business_program_items.gain_db IS
  'Player loudness normalisation offset (dB) from offline EBU R128 analysis. Playback hint only, not a rights or quality decision.';

-- Catalog visibility gate shared by every SPA reader/writer (review 2026-10-13):
-- published music track whose parent practice the CURRENT caller may read under the
-- existing catalog rule (can_current_viewer_read_practice). No service-role bypass:
-- server calls without a user see only public (listed/unlisted) practices.
CREATE FUNCTION public.business_spa_track_visible(p_audio_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audio_items ai
    JOIN public.practices p ON p.id = ai.practice_id
    WHERE ai.id = p_audio_item_id
      AND ai.status = 'published'
      AND p.product_kind = 'music'
      AND public.can_current_viewer_read_practice(ai.practice_id)
  );
$$;
REVOKE ALL ON FUNCTION public.business_spa_track_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_spa_track_visible(uuid) TO authenticated, service_role;

-- Offline permission needs an actually cited grant. The resolver may return ELIGIBLE
-- with empty grant-id arrays when the country rule requires neither right; that is
-- not an offline_storage_cache grant. Empty = no grants; NULL valid_until on cited
-- grants = open-ended (handled separately by business_spa_grants_valid_until).
CREATE FUNCTION public.business_spa_offline_grants_cited(p_eligibility jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(p_eligibility->>'decision' = 'ELIGIBLE', false)
    AND (coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p_eligibility->'recording_grant_ids') = 'array' THEN p_eligibility->'recording_grant_ids' END), 0)
       + coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p_eligibility->'composition_grant_ids') = 'array' THEN p_eligibility->'composition_grant_ids' END), 0)) > 0;
$$;
REVOKE ALL ON FUNCTION public.business_spa_offline_grants_cited(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_spa_offline_grants_cited(jsonb) TO authenticated, service_role;

-- Direct-write path (RLS insert/update) gets the same gate as the setter: an active
-- item must reference a track the writer may see. Exclusion is always allowed.
CREATE FUNCTION public.business_spa_item_visibility_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.excluded_at IS NULL AND NOT public.business_spa_track_visible(NEW.audio_item_id) THEN
    RAISE EXCEPTION 'business_spa_track_not_visible' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.business_spa_item_visibility_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_spa_item_visibility_guard BEFORE INSERT OR UPDATE OF audio_item_id, excluded_at ON public.business_program_items
  FOR EACH ROW EXECUTE FUNCTION public.business_spa_item_visibility_guard();

-- Atomic ordered composition: listed tracks become active in the given order,
-- previously active tracks not listed are excluded (soft, with reason), never deleted.
CREATE FUNCTION public.business_spa_set_program_items(
  p_program_id uuid,
  p_audio_item_ids uuid[],
  p_exclusion_reason text DEFAULT 'removed_from_composition'
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_status text;
  v_count integer := 0;
  v_pos integer;
BEGIN
  SELECT organization_id, status INTO v_org, v_status FROM public.business_programs WHERE id = p_program_id FOR UPDATE;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'business_spa_program_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_business_pilot_access(v_org) THEN
    RAISE EXCEPTION 'business_spa_pilot_access_denied' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'archived' THEN
    RAISE EXCEPTION 'business_spa_program_archived' USING ERRCODE = '23514';
  END IF;
  IF p_audio_item_ids IS NULL OR cardinality(p_audio_item_ids) > 500
     OR cardinality(p_audio_item_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_audio_item_ids) x) THEN
    RAISE EXCEPTION 'business_spa_composition_invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_audio_item_ids) x WHERE NOT public.business_spa_track_visible(x)) THEN
    RAISE EXCEPTION 'business_spa_track_not_published' USING ERRCODE = '23514';
  END IF;

  UPDATE public.business_program_items
     SET excluded_at = now(), excluded_reason = coalesce(nullif(btrim(p_exclusion_reason), ''), 'removed_from_composition')
   WHERE program_id = p_program_id AND excluded_at IS NULL AND NOT (audio_item_id = ANY (p_audio_item_ids));

  -- Move active positions out of the way first so reordering never collides.
  UPDATE public.business_program_items SET position = position + 100000
   WHERE program_id = p_program_id AND audio_item_id = ANY (p_audio_item_ids);

  FOR v_pos IN 1 .. coalesce(cardinality(p_audio_item_ids), 0) LOOP
    INSERT INTO public.business_program_items(program_id, audio_item_id, position, added_by)
    VALUES (p_program_id, p_audio_item_ids[v_pos], v_pos, auth.uid())
    ON CONFLICT (program_id, audio_item_id)
    DO UPDATE SET position = EXCLUDED.position, excluded_at = NULL, excluded_reason = NULL;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.business_spa_set_program_items(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_spa_set_program_items(uuid, uuid[], text) TO authenticated, service_role;

-- Remove ONE track (admin "снять с Business"). Locks the program row so concurrent
-- removals serialize; never re-activates other items (review 2026-10-13).
CREATE FUNCTION public.business_spa_exclude_program_item(p_program_id uuid, p_audio_item_id uuid, p_reason text DEFAULT 'removed_by_admin')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_hit integer;
BEGIN
  SELECT organization_id INTO v_org FROM public.business_programs WHERE id = p_program_id FOR UPDATE;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'business_spa_program_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_business_pilot_access(v_org) THEN
    RAISE EXCEPTION 'business_spa_pilot_access_denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.business_program_items
     SET excluded_at = now(), excluded_reason = coalesce(nullif(btrim(p_reason), ''), 'removed_by_admin')
   WHERE program_id = p_program_id AND audio_item_id = p_audio_item_id AND excluded_at IS NULL;
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.business_spa_exclude_program_item(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_spa_exclude_program_item(uuid, uuid, text) TO authenticated, service_role;

-- Read model for admin/player: composition with live rights decisions per use type.
-- playable/offline_cacheable are true only on an ELIGIBLE decision; UNKNOWN = deny.
CREATE FUNCTION public.business_spa_program_composition(p_program_id uuid, p_location_id uuid)
RETURNS TABLE (
  item_position integer,
  audio_item_id uuid,
  track_code text,
  title text,
  duration_seconds integer,
  gain_db numeric,
  background_decision text,
  offline_decision text,
  playable boolean,
  offline_cacheable boolean,
  background_eligibility jsonb,
  offline_eligibility jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.business_programs WHERE id = p_program_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'business_spa_program_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_business_pilot_access(v_org) THEN
    RAISE EXCEPTION 'business_spa_pilot_access_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_locations l WHERE l.id = p_location_id AND l.organization_id = v_org) THEN
    RAISE EXCEPTION 'business_spa_location_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN QUERY
  WITH items AS (
    SELECT i.position, i.audio_item_id, i.gain_db, ai.music_track_code, ai.title, ai.duration_seconds,
      public.resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'business_background_playback') AS bbp,
      public.resolve_business_track_eligibility(i.audio_item_id, p_location_id, NULL, 'offline_storage_cache') AS off
    FROM public.business_program_items i
    JOIN public.audio_items ai ON ai.id = i.audio_item_id
    WHERE i.program_id = p_program_id AND i.excluded_at IS NULL
      -- Stored references the caller may not see are withheld entirely (no metadata).
      AND public.business_spa_track_visible(i.audio_item_id)
  )
  SELECT it.position, it.audio_item_id, it.music_track_code::text, it.title::text, it.duration_seconds::integer, it.gain_db,
    it.bbp->>'decision', it.off->>'decision',
    coalesce(it.bbp->>'decision' = 'ELIGIBLE', false),
    coalesce(it.bbp->>'decision' = 'ELIGIBLE', false) AND public.business_spa_offline_grants_cited(it.off),
    it.bbp, it.off
  FROM items it ORDER BY it.position;
END;
$$;
REVOKE ALL ON FUNCTION public.business_spa_program_composition(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_spa_program_composition(uuid, uuid) TO authenticated, service_role;

COMMIT;

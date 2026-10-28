-- Internal sound-quality decisions. No catalogue writes, author events or backfill.
BEGIN;

CREATE TABLE IF NOT EXISTS public.business_track_sound_reviews (
  -- UUID retained after normal catalogue deletion; Business must not block it.
  audio_item_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked', 'approved', 'rejected')),
  audio_identity text NOT NULL,
  reason text CHECK (char_length(reason) <= 2000),
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.business_track_sound_review_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  audio_item_id uuid NOT NULL,
  old_status text NOT NULL CHECK (old_status IN ('unchecked', 'approved', 'rejected')),
  new_status text NOT NULL CHECK (new_status IN ('unchecked', 'approved', 'rejected')),
  old_audio_identity text,
  audio_identity text NOT NULL,
  reason text CHECK (char_length(reason) <= 2000),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN ('manual', 'audio_replaced'))
);
CREATE INDEX IF NOT EXISTS business_sound_history_track_idx
  ON public.business_track_sound_review_history(audio_item_id, id DESC);
CREATE INDEX IF NOT EXISTS business_space_admissions_audio_item_idx
  ON public.business_space_admissions(audio_item_id);
ALTER TABLE public.business_track_sound_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_track_sound_review_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_track_sound_reviews, public.business_track_sound_review_history FROM PUBLIC, anon, authenticated, service_role;
-- No direct client writes, even by administrators: the guarded RPC owns audit writes.
GRANT SELECT ON public.business_track_sound_reviews, public.business_track_sound_review_history TO authenticated, service_role;
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'business_sound_admin_read') THEN
CREATE POLICY business_sound_admin_read ON public.business_track_sound_reviews FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'admin_panel.access')
    AND public.has_platform_permission(auth.uid(), 'author_products.moderate'));
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'business_sound_history_admin_read') THEN
CREATE POLICY business_sound_history_admin_read ON public.business_track_sound_review_history FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'admin_panel.access')
    AND public.has_platform_permission(auth.uid(), 'author_products.moderate'));
END IF;
END $$;

CREATE OR REPLACE FUNCTION public.business_sound_audio_identity(p_item public.audio_items)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_array(p_item.audio_path, p_item.desired_music_master_asset_id,
    p_item.active_music_delivery_asset_id)::text
$$;

-- Review queue follows the direction matrix. business_space_admissions does not grant access.
-- An album is listed when its effective artist/album admission is allowed for a direction.
CREATE OR REPLACE VIEW public.business_sound_admitted_albums AS
  SELECT p.id AS practice_id, array_agg(DISTINCT d.key ORDER BY d.key) AS spaces
  FROM public.practices p
  JOIN public.business_content_directions d ON d.active
  WHERE p.product_kind = 'music'
    AND coalesce((public.resolve_business_content_admission(p.id, d.key)->>'allowed')::boolean, false)
  GROUP BY p.id;
REVOKE ALL ON public.business_sound_admitted_albums FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.business_sound_album_spaces(p_practice_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT spaces FROM public.business_sound_admitted_albums
    WHERE practice_id = p_practice_id), '{}'::text[])
$$;

CREATE OR REPLACE FUNCTION public.business_sound_track_allowed(p_audio_item_id uuid, p_direction text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audio_items a
    JOIN public.practices p ON p.id = a.practice_id
    JOIN public.business_track_sound_reviews r ON r.audio_item_id = a.id
    WHERE a.id = p_audio_item_id AND r.status = 'approved'
      AND r.audio_identity = public.business_sound_audio_identity(a)
      AND coalesce((public.resolve_business_content_admission(p.id, p_direction)->>'allowed')::boolean, false)
      AND p.product_kind = 'music' AND p.status = 'published' AND p.deleted_at IS NULL
      AND p.catalog_visibility = 'listed' AND a.status = 'published'
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_review_business_track_sound(
  p_audio_item_id uuid, p_status text, p_reason text, p_audio_identity text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.audio_items; previous public.business_track_sound_reviews; identity text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('unchecked', 'approved', 'rejected')
    OR char_length(p_reason) > 2000 THEN RAISE EXCEPTION 'invalid_review' USING ERRCODE = '22023'; END IF;
  -- Same lock order as replacement: audio item, then review. Serializes first insert too.
  SELECT * INTO a FROM public.audio_items WHERE id = p_audio_item_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.practices p WHERE p.id = a.practice_id
    AND p.product_kind = 'music' AND p.deleted_at IS NULL AND p.status = 'published'
    AND p.catalog_visibility = 'listed') OR a.status <> 'published'
    OR cardinality(public.business_sound_album_spaces(a.practice_id)) = 0 THEN
    RAISE EXCEPTION 'track_not_in_queue' USING ERRCODE = '22023';
  END IF;
  identity := public.business_sound_audio_identity(a);
  IF p_audio_identity IS DISTINCT FROM identity THEN
    RAISE EXCEPTION 'audio_replaced_reload' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO previous FROM public.business_track_sound_reviews WHERE audio_item_id = a.id;
  INSERT INTO public.business_track_sound_reviews(audio_item_id, status, audio_identity, reason, reviewed_by)
    VALUES (a.id, p_status, identity, nullif(btrim(p_reason), ''), auth.uid())
    ON CONFLICT (audio_item_id) DO UPDATE SET status = EXCLUDED.status, audio_identity = EXCLUDED.audio_identity,
      reason = EXCLUDED.reason, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = clock_timestamp();
  INSERT INTO public.business_track_sound_review_history
    (audio_item_id, old_status, new_status, old_audio_identity, audio_identity, reason, changed_by, event)
    VALUES (a.id, coalesce(previous.status, 'unchecked'), p_status, previous.audio_identity,
      identity, nullif(btrim(p_reason), ''), auth.uid(), 'manual');
END;
$$;

CREATE OR REPLACE FUNCTION public.business_sound_reset_replaced_audio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous public.business_track_sound_reviews; identity text;
BEGIN
  identity := public.business_sound_audio_identity(NEW);
  IF identity IS NOT DISTINCT FROM public.business_sound_audio_identity(OLD) THEN RETURN NEW; END IF;
  SELECT * INTO previous FROM public.business_track_sound_reviews WHERE audio_item_id = NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  UPDATE public.business_track_sound_reviews SET status = 'unchecked', audio_identity = identity,
    reason = NULL, reviewed_at = clock_timestamp(), reviewed_by = NULL WHERE audio_item_id = NEW.id;
  INSERT INTO public.business_track_sound_review_history
    (audio_item_id, old_status, new_status, old_audio_identity, audio_identity, reason, changed_by, event)
    VALUES (NEW.id, previous.status, 'unchecked', previous.audio_identity, identity,
      'Аудиофайл заменён', auth.uid(), 'audio_replaced');
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER business_sound_audio_replaced AFTER UPDATE OF
  audio_path, desired_music_master_asset_id, active_music_delivery_asset_id ON public.audio_items
  FOR EACH ROW EXECUTE FUNCTION public.business_sound_reset_replaced_audio();

-- New/restored programme items must pass the same space and sound gate as delivery.
-- Existing items remain intact and are withheld at manifest/signing time.
CREATE OR REPLACE FUNCTION public.business_sound_guard_program_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE space text;
BEGIN
  IF NEW.excluded_at IS NOT NULL OR NOT public.business_manual_content_gate_enabled() THEN
    RETURN NEW;
  END IF;
  SELECT kind INTO space FROM public.business_programs WHERE id = NEW.program_id;
  IF NOT public.business_sound_track_allowed(NEW.audio_item_id, space) THEN
    RAISE EXCEPTION 'business_sound_review_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER business_sound_program_item BEFORE INSERT OR UPDATE OF
  program_id, audio_item_id, excluded_at ON public.business_program_items
  FOR EACH ROW EXECUTE FUNCTION public.business_sound_guard_program_item();

-- One gate: rights, then direction admission, then an approved sound review.
-- The manual gate defaults off, so this body matches the rights resolver until it is switched on.
CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb; r record; v_direction text; v_admission jsonb; v_sound text;
BEGIN
  v := public.resolve_business_track_eligibility_v1(p_audio_item_id, p_location_id, p_zone_id, p_use_type, p_as_of);
  SELECT id, decision INTO r FROM public.business_track_eligibility_reviews
    WHERE audio_item_id = p_audio_item_id
      AND (coalesce(p_as_of, now()) >= now() OR created_at <= p_as_of)
    ORDER BY created_at DESC, id DESC LIMIT 1;
  IF FOUND AND r.decision IN ('blocked', 'proof_requested') THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || to_jsonb('BUSINESS_TRACK_ADMISSION_' || upper(r.decision)),
      'business_track_review_id', r.id);
  END IF;
  IF NOT public.business_manual_content_gate_enabled() THEN
    RETURN v;
  END IF;
  SELECT c.direction_key INTO v_direction FROM public.business_locations l
    JOIN public.business_content_categories c ON c.category = lower(btrim(l.business_category))
    WHERE l.id = p_location_id;
  SELECT public.resolve_business_content_admission(ai.practice_id, v_direction) INTO v_admission
    FROM public.audio_items ai WHERE ai.id = p_audio_item_id;
  IF NOT coalesce((v_admission->>'allowed')::boolean, false) THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || '["MANUAL_DIRECTION_ADMISSION_REQUIRED"]'::jsonb);
  END IF;
  SELECT s.status INTO v_sound FROM public.business_track_sound_reviews s
    JOIN public.audio_items a ON a.id = s.audio_item_id
    WHERE s.audio_item_id = p_audio_item_id
      AND s.audio_identity = public.business_sound_audio_identity(a);
  IF v_sound IS DISTINCT FROM 'approved' THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || '["BUSINESS_SOUND_REVIEW_REQUIRED"]'::jsonb);
  END IF;
  RETURN v || jsonb_build_object('content_direction', v_direction, 'content_admission', v_admission);
END;
$$;

-- Batch gate is uncached, including when the workspace caches legal decisions.
CREATE OR REPLACE FUNCTION public.business_sound_allowed_tracks(p_audio_item_ids uuid[], p_space_id text)
RETURNS TABLE(audio_item_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM unnest(p_audio_item_ids) id WHERE public.business_sound_track_allowed(id, p_space_id)
$$;

CREATE OR REPLACE FUNCTION public.admin_business_sound_queue(
  p_status text DEFAULT NULL, p_artist uuid DEFAULT NULL, p_album uuid DEFAULT NULL,
  p_space text DEFAULT NULL, p_page integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT a.id, a.title, a.duration_seconds, p.id AS album_id, p.title AS album,
      au.id AS artist_id, au.name AS artist, public.business_sound_audio_identity(a) AS audio_identity,
      admitted.spaces,
      CASE WHEN r.audio_identity = public.business_sound_audio_identity(a) THEN r.status ELSE 'unchecked' END AS status,
      r.reason, r.reviewed_at, r.reviewed_by
    FROM public.audio_items a JOIN public.practices p ON p.id = a.practice_id
    JOIN public.business_sound_admitted_albums admitted ON admitted.practice_id = p.id
    JOIN public.authors au ON au.id = p.author_id
    LEFT JOIN public.business_track_sound_reviews r ON r.audio_item_id = a.id
    WHERE p.product_kind = 'music' AND p.deleted_at IS NULL AND p.status = 'published'
      AND p.catalog_visibility = 'listed' AND a.status = 'published'
  ), filtered AS MATERIALIZED (
    SELECT * FROM candidates WHERE (p_artist IS NULL OR artist_id = p_artist)
      AND (p_album IS NULL OR album_id = p_album) AND (p_space IS NULL OR p_space = ANY(spaces))
  ), page AS (
    SELECT * FROM filtered WHERE p_status IS NULL OR status = p_status
    ORDER BY artist, album, title, id LIMIT 100 OFFSET greatest(0, least(p_page, 100000)) * 100
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY artist, album, title, id) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered WHERE p_status IS NULL OR status = p_status),
    'counts', (SELECT jsonb_build_object('unchecked', count(*) FILTER (WHERE status = 'unchecked'),
      'approved', count(*) FILTER (WHERE status = 'approved'), 'rejected', count(*) FILTER (WHERE status = 'rejected')) FROM filtered),
    'artists', coalesce((SELECT jsonb_agg(x ORDER BY name, id) FROM
      (SELECT DISTINCT artist_id AS id, artist AS name FROM candidates) x), '[]'::jsonb),
    'albums', coalesce((SELECT jsonb_agg(x ORDER BY name, id) FROM
      (SELECT DISTINCT album_id AS id, album AS name FROM candidates WHERE p_artist IS NULL OR artist_id = p_artist) x), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.business_sound_audio_identity(public.audio_items),
  public.business_sound_album_spaces(uuid), public.business_sound_track_allowed(uuid,text),
  public.business_sound_reset_replaced_audio(), public.business_sound_guard_program_item(), public.business_sound_allowed_tracks(uuid[],text),
  public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz),
  public.admin_review_business_track_sound(uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_business_sound_queue(text,uuid,uuid,text,integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_business_sound_queue(text,uuid,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_business_track_sound(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_sound_allowed_tracks(uuid[],text),
  public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz) TO service_role;

COMMIT;

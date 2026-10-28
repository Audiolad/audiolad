-- Artist sound auto-admission. Additive: no catalogue updates and no seed rows.
-- Sergey turns the toggle on in /admin/business-admissions. Explicit per-track
-- «Не допущен» still wins. Rights and direction admission are unchanged.

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_artist_sound_auto (
  author_id uuid PRIMARY KEY REFERENCES public.authors(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changed_by uuid
);

CREATE TABLE IF NOT EXISTS public.business_artist_sound_auto_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id uuid NOT NULL,
  old_enabled boolean,
  new_enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changed_by uuid
);

CREATE OR REPLACE FUNCTION public.business_artist_sound_auto_enabled(p_author_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT enabled FROM public.business_artist_sound_auto WHERE author_id = p_author_id), false)
$$;

CREATE OR REPLACE FUNCTION public.set_business_artist_sound_auto(p_author_id uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL OR NOT EXISTS (SELECT 1 FROM public.authors WHERE id = p_author_id) THEN
    RAISE EXCEPTION 'invalid_author' USING ERRCODE = '22023';
  END IF;
  SELECT enabled INTO current FROM public.business_artist_sound_auto WHERE author_id = p_author_id;
  IF FOUND AND current IS NOT DISTINCT FROM p_enabled THEN RETURN; END IF;
  INSERT INTO public.business_artist_sound_auto(author_id, enabled, changed_by)
    VALUES (p_author_id, p_enabled, auth.uid())
    ON CONFLICT (author_id) DO UPDATE SET enabled = EXCLUDED.enabled, changed_by = EXCLUDED.changed_by,
      changed_at = clock_timestamp();
  INSERT INTO public.business_artist_sound_auto_audit(author_id, old_enabled, new_enabled, changed_by)
    VALUES (p_author_id, current, p_enabled, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.business_sound_track_allowed(p_audio_item_id uuid, p_direction text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audio_items a
    JOIN public.practices p ON p.id = a.practice_id
    LEFT JOIN public.business_track_sound_reviews r ON r.audio_item_id = a.id
      AND r.audio_identity = public.business_sound_audio_identity(a)
    WHERE a.id = p_audio_item_id
      AND (
        r.status = 'approved'
        OR (public.business_artist_sound_auto_enabled(p.author_id) AND r.status IS DISTINCT FROM 'rejected')
      )
      AND coalesce((public.resolve_business_content_admission(p.id, p_direction)->>'allowed')::boolean, false)
      AND p.product_kind = 'music' AND p.status = 'published' AND p.deleted_at IS NULL
      AND p.catalog_visibility = 'listed' AND a.status = 'published'
  )
$$;

CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb; r record; v_direction text; v_admission jsonb; v_sound text; v_auto boolean;
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
  SELECT public.business_artist_sound_auto_enabled(p.author_id) INTO v_auto
    FROM public.audio_items a JOIN public.practices p ON p.id = a.practice_id
    WHERE a.id = p_audio_item_id;
  IF v_sound IS DISTINCT FROM 'approved' AND NOT (coalesce(v_auto, false) AND v_sound IS DISTINCT FROM 'rejected') THEN
    v := v || jsonb_build_object('decision', 'INELIGIBLE',
      'reason_codes', coalesce(v->'reason_codes', '[]'::jsonb) || '["BUSINESS_SOUND_REVIEW_REQUIRED"]'::jsonb);
  END IF;
  RETURN v || jsonb_build_object('content_direction', v_direction, 'content_admission', v_admission);
END;
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
      (
        coalesce(auto_sound.enabled, false)
        AND NOT coalesce(
          r.audio_identity = public.business_sound_audio_identity(a) AND r.status = 'rejected',
          false
        )
      ) AS sound_auto,
      r.reason, r.reviewed_at, r.reviewed_by
    FROM public.audio_items a JOIN public.practices p ON p.id = a.practice_id
    JOIN public.business_sound_admitted_albums admitted ON admitted.practice_id = p.id
    JOIN public.authors au ON au.id = p.author_id
    LEFT JOIN public.business_track_sound_reviews r ON r.audio_item_id = a.id
    LEFT JOIN public.business_artist_sound_auto auto_sound ON auto_sound.author_id = au.id
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

ALTER TABLE public.business_artist_sound_auto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_artist_sound_auto_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_artist_sound_auto, public.business_artist_sound_auto_audit FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.business_artist_sound_auto_audit_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.business_artist_sound_auto, public.business_artist_sound_auto_audit TO authenticated, service_role;
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'business_artist_sound_auto_admin_read') THEN
CREATE POLICY business_artist_sound_auto_admin_read ON public.business_artist_sound_auto FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'admin_panel.access')
    AND public.has_platform_permission(auth.uid(), 'author_products.moderate'));
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'business_artist_sound_auto_audit_admin_read') THEN
CREATE POLICY business_artist_sound_auto_audit_admin_read ON public.business_artist_sound_auto_audit FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'admin_panel.access')
    AND public.has_platform_permission(auth.uid(), 'author_products.moderate'));
END IF;
END $$;
REVOKE ALL ON FUNCTION public.business_artist_sound_auto_enabled(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_artist_sound_auto_enabled(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_business_artist_sound_auto(uuid, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_business_artist_sound_auto(uuid, boolean) TO authenticated;

COMMIT;

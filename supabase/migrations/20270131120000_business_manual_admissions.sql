BEGIN;

-- Directions and category aliases are data. No content decisions are seeded.
CREATE TABLE public.business_content_directions (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.business_content_categories (
  category text PRIMARY KEY CHECK (category = lower(btrim(category)) AND length(category) > 0),
  direction_key text NOT NULL REFERENCES public.business_content_directions(key) ON DELETE RESTRICT
);
INSERT INTO public.business_content_directions(key, name) VALUES
 ('cafe', 'Кофейни'), ('restaurant', 'Рестораны'), ('spa', 'SPA / медитативные центры');
INSERT INTO public.business_content_categories(category, direction_key) VALUES
 ('cafe','cafe'), ('кафе','cafe'), ('кофейня','cafe'), ('кафе / кофейня','cafe'),
 ('restaurant','restaurant'), ('ресторан','restaurant'), ('рестораны','restaurant'),
 ('spa','spa'), ('спа','spa'), ('медитативный центр','spa');

-- Default off: Business keeps today's playback until an admin turns the gate on.
CREATE TABLE public.business_runtime_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  enabled boolean NOT NULL
);
INSERT INTO public.business_runtime_flags(key, enabled) VALUES ('manual_content_gate', false);

CREATE FUNCTION public.business_manual_content_gate_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT enabled FROM public.business_runtime_flags WHERE key = 'manual_content_gate'), false);
$$;

CREATE FUNCTION public.set_business_manual_content_gate(p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_next boolean := coalesce(p_enabled, false);
BEGIN
  IF NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
  END IF;
  UPDATE public.business_runtime_flags SET enabled = v_next WHERE key = 'manual_content_gate';
  INSERT INTO public.business_content_admission_audit(actor_id, entity, old_value, new_value)
  VALUES (auth.uid(), 'business_runtime_flags', NULL,
    jsonb_build_object('key', 'manual_content_gate', 'enabled', v_next));
END;
$$;

CREATE TABLE public.business_content_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_key text NOT NULL REFERENCES public.business_content_directions(key) ON DELETE RESTRICT,
  author_id uuid REFERENCES public.authors(id) ON DELETE RESTRICT,
  practice_id uuid REFERENCES public.practices(id) ON DELETE RESTRICT,
  -- NULL resets to inheritance/unreviewed, without removing history.
  allowed boolean,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((author_id IS NOT NULL)::integer + (practice_id IS NOT NULL)::integer = 1),
  UNIQUE(direction_key, author_id),
  UNIQUE(direction_key, practice_id)
);
CREATE TABLE public.business_content_admission_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  entity text NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL
);

CREATE FUNCTION public.audit_business_content_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.business_content_admission_audit(actor_id, entity, old_value, new_value)
  VALUES (auth.uid(), TG_TABLE_NAME, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW));
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_content_admissions_audit AFTER INSERT OR UPDATE ON public.business_content_admissions
 FOR EACH ROW EXECUTE FUNCTION public.audit_business_content_change();
CREATE TRIGGER business_content_directions_audit AFTER INSERT OR UPDATE ON public.business_content_directions
 FOR EACH ROW EXECUTE FUNCTION public.audit_business_content_change();
CREATE TRIGGER business_content_categories_audit AFTER INSERT OR UPDATE ON public.business_content_categories
 FOR EACH ROW EXECUTE FUNCTION public.audit_business_content_change();

CREATE FUNCTION public.set_business_content_admissions(p_direction text, p_kind text, p_ids uuid[], p_allowed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('artist', 'album') OR p_kind IS NULL
    OR coalesce(cardinality(p_ids), 0) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Выберите от 1 до 200 записей';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_content_directions WHERE key = p_direction AND active) THEN
    RAISE EXCEPTION 'Направление недоступно';
  END IF;
  -- Deterministic lock order for concurrent bulk operations. All changes are atomic.
  FOR v_id IN SELECT DISTINCT unnest(p_ids) ORDER BY 1 LOOP
    IF p_kind = 'artist' THEN
      INSERT INTO public.business_content_admissions(direction_key, author_id, allowed, changed_by)
      VALUES(p_direction, v_id, p_allowed, auth.uid())
      ON CONFLICT(direction_key, author_id) DO UPDATE
        SET allowed = excluded.allowed, changed_by = auth.uid(), changed_at = clock_timestamp();
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.practices WHERE id = v_id AND product_kind = 'music') THEN
        RAISE EXCEPTION 'Музыкальный альбом не найден';
      END IF;
      INSERT INTO public.business_content_admissions(direction_key, practice_id, allowed, changed_by)
      VALUES(p_direction, v_id, p_allowed, auth.uid())
      ON CONFLICT(direction_key, practice_id) DO UPDATE
        SET allowed = excluded.allowed, changed_by = auth.uid(), changed_at = clock_timestamp();
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.add_business_content_direction(p_key text, p_name text, p_categories text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_category text;
BEGIN
  IF NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.business_content_directions(key, name) VALUES(p_key, btrim(p_name));
  FOREACH v_category IN ARRAY p_categories LOOP
    INSERT INTO public.business_content_categories(category, direction_key) VALUES(lower(btrim(v_category)), p_key);
  END LOOP;
END;
$$;

-- SQL filtering precedes pagination; a filter without a direction matches any direction.
CREATE FUNCTION public.list_business_content_admissions(
  p_kind text, p_query text DEFAULT '', p_direction text DEFAULT NULL,
  p_decision text DEFAULT NULL, p_offset integer DEFAULT 0, p_limit integer DEFAULT 51
) RETURNS TABLE(id uuid, title text, author_id uuid, author_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 WITH subjects AS (
   SELECT a.id, a.name::text AS title, a.id AS author_id, a.name::text AS author_name
   FROM public.authors a WHERE p_kind = 'artist'
   UNION ALL
   SELECT p.id, p.title::text, p.author_id, coalesce(a.name, '')::text
   FROM public.practices p LEFT JOIN public.authors a ON a.id = p.author_id
   WHERE p_kind = 'album' AND p.product_kind = 'music' AND p.deleted_at IS NULL
 )
 SELECT s.id, s.title, s.author_id, s.author_name FROM subjects s
 WHERE strpos(lower(coalesce(s.title,'') || ' ' || s.author_name), lower(coalesce(p_query,''))) > 0
 AND (p_decision IS NULL OR EXISTS (
   SELECT 1 FROM public.business_content_directions d
   LEFT JOIN public.business_content_admissions ar ON ar.author_id = s.author_id AND ar.direction_key = d.key
   LEFT JOIN public.business_content_admissions al ON p_kind = 'album' AND al.practice_id = s.id AND al.direction_key = d.key
   WHERE d.active AND (p_direction IS NULL OR d.key = p_direction)
    AND CASE p_decision WHEN 'allowed' THEN coalesce(al.allowed, ar.allowed) IS TRUE
      WHEN 'denied' THEN coalesce(al.allowed, ar.allowed) IS FALSE
      WHEN 'unreviewed' THEN coalesce(al.allowed, ar.allowed) IS NULL ELSE false END
 ))
 ORDER BY s.title, s.id OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),201);
$$;
REVOKE ALL ON FUNCTION public.list_business_content_admissions(text,text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_business_content_admissions(text,text,text,text,integer,integer) TO service_role;

-- Style only. Rights are deliberately resolved separately by the existing engine.
CREATE FUNCTION public.resolve_business_content_admission(p_practice_id uuid, p_direction text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT jsonb_build_object(
   'allowed', coalesce(al.allowed, ar.allowed, false),
   'source', CASE WHEN al.allowed IS NOT NULL THEN 'album' WHEN ar.allowed IS NOT NULL THEN 'artist' ELSE 'unreviewed' END)
 FROM public.practices p
 JOIN public.business_content_directions d ON d.key = p_direction AND d.active
 LEFT JOIN public.business_content_admissions al ON al.practice_id = p.id AND al.direction_key = d.key
 LEFT JOIN public.business_content_admissions ar ON ar.author_id = p.author_id AND ar.direction_key = d.key
 WHERE p.id = p_practice_id AND p.product_kind = 'music';
$$;

-- Reduce the candidate pool before audio delivery / per-track legal checks.
-- Uses the same resolver as the mandatory playback gate, never a second policy.
CREATE FUNCTION public.business_content_candidate_albums(p_location_id uuid)
RETURNS TABLE(id uuid, title text, author_id uuid, author_name text, status text,
 product_kind text, catalog_visibility text, deleted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT p.id, p.title::text, p.author_id, a.name::text, p.status::text,
   p.product_kind::text, p.catalog_visibility::text, p.deleted_at
 FROM public.business_locations l
 JOIN public.business_content_categories c ON c.category = lower(btrim(l.business_category))
 CROSS JOIN public.practices p
 JOIN public.authors a ON a.id = p.author_id
 WHERE l.id = p_location_id AND p.product_kind = 'music' AND p.status = 'published'
   AND p.catalog_visibility = 'listed' AND p.deleted_at IS NULL
   AND coalesce((public.resolve_business_content_admission(p.id, c.direction_key)->>'allowed')::boolean, false)
 ORDER BY p.id;
$$;
REVOKE ALL ON FUNCTION public.business_content_candidate_albums(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_content_candidate_albums(uuid) TO service_role;

-- Preserve the existing rights + individual track review overlay. This is the common
-- gate for Business workspace, venue player, SPA manifests and offline manifests.
CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb; r record; v_direction text; v_admission jsonb;
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
  -- Off: current rights result only. On: album/artist admission may only exclude.
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
  RETURN v || jsonb_build_object('content_direction', v_direction, 'content_admission', v_admission);
END;
$$;

ALTER TABLE public.business_runtime_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_content_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_content_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_content_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_content_admission_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_runtime_flags, public.business_content_directions, public.business_content_categories,
 public.business_content_admissions, public.business_content_admission_audit FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.business_content_admission_audit_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.business_runtime_flags, public.business_content_directions, public.business_content_categories,
 public.business_content_admissions, public.business_content_admission_audit TO service_role;
REVOKE ALL ON FUNCTION public.business_manual_content_gate_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_manual_content_gate_enabled() TO service_role;
REVOKE ALL ON FUNCTION public.set_business_manual_content_gate(boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_business_manual_content_gate(boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.audit_business_content_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_business_content_admissions(text,text,uuid[],boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.add_business_content_direction(text,text,text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_business_content_admissions(text,text,uuid[],boolean),
 public.add_business_content_direction(text,text,text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_business_content_admission(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_business_content_admission(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz) TO service_role;

COMMIT;

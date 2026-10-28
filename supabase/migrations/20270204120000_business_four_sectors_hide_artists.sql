BEGIN;

-- Four active sectors in cabinet order. Restaurant rows stay, but the direction is inactive:
-- its categories now resolve to cafe, and its stored decisions are not consulted.
ALTER TABLE public.business_content_directions
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

ALTER TABLE public.business_content_directions DISABLE TRIGGER business_content_directions_audit;
ALTER TABLE public.business_content_categories DISABLE TRIGGER business_content_categories_audit;

UPDATE public.business_content_directions
SET name = 'Кафе, кофейни, рестораны', sort_order = 10, active = true
WHERE key = 'cafe';
UPDATE public.business_content_directions
SET name = 'Спа и массаж', sort_order = 20, active = true
WHERE key = 'spa';
UPDATE public.business_content_directions
SET active = false, sort_order = 90
WHERE key = 'restaurant';

INSERT INTO public.business_content_directions(key, name, sort_order, active) VALUES
  ('retail', 'Магазины, салоны красоты, барбершопы', 30, true),
  ('fitness', 'Фитнес-клубы', 40, true)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active;

UPDATE public.business_content_categories
SET direction_key = 'cafe'
WHERE category IN ('restaurant', 'ресторан', 'рестораны');

INSERT INTO public.business_content_categories(category, direction_key) VALUES
  ('массаж', 'spa'),
  ('магазин', 'retail'),
  ('салон красоты', 'retail'),
  ('барбершоп', 'retail'),
  ('shop', 'retail'),
  ('store', 'retail'),
  ('beauty salon', 'retail'),
  ('barbershop', 'retail'),
  ('barber shop', 'retail'),
  ('фитнес', 'fitness'),
  ('фитнес-клуб', 'fitness'),
  ('fitness', 'fitness')
ON CONFLICT (category) DO UPDATE SET direction_key = EXCLUDED.direction_key;

ALTER TABLE public.business_content_directions ENABLE TRIGGER business_content_directions_audit;
ALTER TABLE public.business_content_categories ENABLE TRIGGER business_content_categories_audit;

-- Presence of a row hides the artist from admissions and the sound queue. Decisions stay.
CREATE TABLE IF NOT EXISTS public.business_admission_hidden_artists (
  author_id uuid PRIMARY KEY REFERENCES public.authors(id) ON DELETE RESTRICT,
  hidden_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  hidden_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.business_admission_hidden_artists_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id uuid NOT NULL,
  old_hidden boolean,
  new_hidden boolean NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_business_artist_admission_hidden(p_author_id uuid, p_hidden boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current boolean;
BEGIN
  IF NOT public.has_platform_permission(auth.uid(), 'admin_panel.access')
    OR NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'Доступ запрещён' USING ERRCODE = '42501';
  END IF;
  IF p_hidden IS NULL OR NOT EXISTS (SELECT 1 FROM public.authors WHERE id = p_author_id) THEN
    RAISE EXCEPTION 'Выберите артиста';
  END IF;
  SELECT true INTO current FROM public.business_admission_hidden_artists WHERE author_id = p_author_id;
  current := FOUND;
  IF current IS NOT DISTINCT FROM p_hidden THEN RETURN; END IF;
  IF p_hidden THEN
    INSERT INTO public.business_admission_hidden_artists(author_id, hidden_by)
    VALUES (p_author_id, auth.uid())
    ON CONFLICT (author_id) DO UPDATE SET hidden_by = EXCLUDED.hidden_by, hidden_at = clock_timestamp();
  ELSE
    DELETE FROM public.business_admission_hidden_artists WHERE author_id = p_author_id;
  END IF;
  INSERT INTO public.business_admission_hidden_artists_audit(author_id, old_hidden, new_hidden, changed_by)
  VALUES (p_author_id, current, p_hidden, auth.uid());
END;
$$;

ALTER TABLE public.business_admission_hidden_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_admission_hidden_artists_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_admission_hidden_artists, public.business_admission_hidden_artists_audit
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.business_admission_hidden_artists_audit_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.business_admission_hidden_artists, public.business_admission_hidden_artists_audit
  TO authenticated, service_role;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'business_admission_hidden_artists_admin_read') THEN
  CREATE POLICY business_admission_hidden_artists_admin_read ON public.business_admission_hidden_artists
    FOR SELECT TO authenticated
    USING (public.has_platform_permission(auth.uid(), 'admin_panel.access')
      AND public.has_platform_permission(auth.uid(), 'author_products.moderate'));
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'business_admission_hidden_artists_audit_admin_read') THEN
  CREATE POLICY business_admission_hidden_artists_audit_admin_read ON public.business_admission_hidden_artists_audit
    FOR SELECT TO authenticated
    USING (public.has_platform_permission(auth.uid(), 'admin_panel.access')
      AND public.has_platform_permission(auth.uid(), 'author_products.moderate'));
END IF;
END $$;

REVOKE ALL ON FUNCTION public.set_business_artist_admission_hidden(uuid, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_business_artist_admission_hidden(uuid, boolean) TO authenticated;

COMMIT;

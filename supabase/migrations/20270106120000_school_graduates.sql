-- Manual, empty-by-default editorial selection. No author/product copies or seeds.
BEGIN;
CREATE TABLE public.school_graduates (
  author_id uuid PRIMARY KEY REFERENCES public.authors(id) ON DELETE CASCADE,
  cohort text NOT NULL DEFAULT '' CHECK (length(cohort) <= 100),
  enabled boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  product_1_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  product_2_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  CHECK (product_1_id IS NULL OR product_2_id IS NULL OR product_1_id <> product_2_id)
);

CREATE FUNCTION public.validate_school_graduate_selection() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE selected_ids uuid[];
BEGIN
  -- Hiding/removing selections and FK cleanup remain possible after unpublishing.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.author_id = OLD.author_id
       AND (NEW.product_1_id IS NULL OR NEW.product_1_id IS NOT DISTINCT FROM OLD.product_1_id)
       AND (NEW.product_2_id IS NULL OR NEW.product_2_id IS NOT DISTINCT FROM OLD.product_2_id) THEN
      RETURN NEW;
    END IF;
  END IF;
  selected_ids := array_remove(ARRAY[NEW.product_1_id, NEW.product_2_id], NULL);
  IF (SELECT count(*) FROM public.practices p
      WHERE p.id = ANY(selected_ids) AND p.author_id = NEW.author_id
        AND p.status = 'published' AND p.deleted_at IS NULL
        AND p.catalog_visibility = 'listed'
        AND (p.published_at <= now() OR p.scheduled_publish_at IS NULL OR p.scheduled_publish_at <= now()))
     <> cardinality(selected_ids) THEN
    RAISE EXCEPTION 'school_graduate_selection_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER school_graduate_selection_guard
BEFORE INSERT OR UPDATE ON public.school_graduates
FOR EACH ROW EXECUTE FUNCTION public.validate_school_graduate_selection();

ALTER TABLE public.school_graduates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.school_graduates TO anon, authenticated;
GRANT ALL ON public.school_graduates TO service_role;
CREATE POLICY school_graduates_public_read ON public.school_graduates
FOR SELECT TO anon, authenticated USING (enabled);
-- All mutations use guarded server actions and service_role; no browser writes.
COMMIT;

-- Manual, empty-by-default editorial selection. No author/product copies or seeds.
-- Public readers see only the showcase view: enabled graduates and product ids
-- that are published and listed now. The base table keeps cohort and unpublished ids
-- for the admin service role and is not granted to anon or authenticated.
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

CREATE FUNCTION public.school_graduate_product_is_public(product_id uuid, owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT product_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.practices p
    WHERE p.id = product_id
      AND p.author_id = owner_id
      AND p.status = 'published'
      AND p.deleted_at IS NULL
      AND p.catalog_visibility = 'listed'
      AND (
        p.published_at <= now()
        OR p.scheduled_publish_at IS NULL
        OR p.scheduled_publish_at <= now()
      )
  );
$$;

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
  IF (
    SELECT count(*)
    FROM unnest(selected_ids) AS selected(id)
    WHERE public.school_graduate_product_is_public(selected.id, NEW.author_id)
  ) <> cardinality(selected_ids) THEN
    RAISE EXCEPTION 'school_graduate_selection_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER school_graduate_selection_guard
BEFORE INSERT OR UPDATE ON public.school_graduates
FOR EACH ROW EXECUTE FUNCTION public.validate_school_graduate_selection();

-- security_invoker stays off so anon reads the projection without table privileges.
-- The joins repeat school_graduate_product_is_public: a function call here would
-- be checked as the session user, who must not have EXECUTE on that function.
-- cohort is not a column of this view.
CREATE VIEW public.school_graduate_showcase
WITH (security_barrier = true, security_invoker = false) AS
SELECT
  g.author_id,
  g.position,
  p1.id AS product_1_id,
  p2.id AS product_2_id
FROM public.school_graduates g
LEFT JOIN public.practices p1
  ON p1.id = g.product_1_id
 AND p1.author_id = g.author_id
 AND p1.status = 'published'
 AND p1.deleted_at IS NULL
 AND p1.catalog_visibility = 'listed'
 AND (
   p1.published_at <= now()
   OR p1.scheduled_publish_at IS NULL
   OR p1.scheduled_publish_at <= now()
 )
LEFT JOIN public.practices p2
  ON p2.id = g.product_2_id
 AND p2.author_id = g.author_id
 AND p2.status = 'published'
 AND p2.deleted_at IS NULL
 AND p2.catalog_visibility = 'listed'
 AND (
   p2.published_at <= now()
   OR p2.scheduled_publish_at IS NULL
   OR p2.scheduled_publish_at <= now()
 )
WHERE g.enabled
  AND (p1.id IS NOT NULL OR p2.id IS NOT NULL);

ALTER TABLE public.school_graduates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.school_graduates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.school_graduates TO service_role;
REVOKE ALL ON FUNCTION public.validate_school_graduate_selection() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_school_graduate_selection() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.school_graduate_product_is_public(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.school_graduate_product_is_public(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_school_graduate_selection() TO service_role;
GRANT EXECUTE ON FUNCTION public.school_graduate_product_is_public(uuid, uuid) TO service_role;
REVOKE ALL ON TABLE public.school_graduate_showcase FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.school_graduate_showcase TO anon, authenticated;
-- No public policy on the base table: anon and authenticated have no table grant.
-- Mutations use guarded server actions and service_role, which bypasses RLS.
COMMIT;

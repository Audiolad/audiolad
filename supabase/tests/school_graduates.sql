-- Run only in an isolated test database after the migration. All fixture rows roll back.
BEGIN;
INSERT INTO public.authors(id, name, slug) VALUES
 ('00000000-0000-4000-8000-000000000001', 'Fixture Graduate A', 'fixture-graduate-a'),
 ('00000000-0000-4000-8000-000000000002', 'Fixture Graduate B', 'fixture-graduate-b');
INSERT INTO public.practices(id, author_id, title, slug, status, catalog_visibility) VALUES
 ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Fixture 1', 'fixture-grad-1', 'published', 'listed'),
 ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'Fixture 2', 'fixture-grad-2', 'published', 'listed'),
 ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000002', 'Fixture 3', 'fixture-grad-3', 'published', 'listed'),
 ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000001', 'Fixture draft', 'fixture-grad-draft', 'draft', 'listed');
INSERT INTO public.school_graduates(author_id, enabled, product_1_id, product_2_id) VALUES
 ('00000000-0000-4000-8000-000000000001', true, '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012');

DO $$
BEGIN
  BEGIN
    UPDATE public.school_graduates SET product_2_id = product_1_id;
    RAISE EXCEPTION 'Duplicate selection was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.school_graduates SET product_2_id = '00000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'Another author was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.school_graduates SET product_2_id = '00000000-0000-4000-8000-000000000014';
    RAISE EXCEPTION 'Draft was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
UPDATE public.school_graduates SET product_1_id = product_2_id, product_2_id = product_1_id;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.school_graduates WHERE product_1_id = '00000000-0000-4000-8000-000000000012' AND product_2_id = '00000000-0000-4000-8000-000000000011') THEN
    RAISE EXCEPTION 'Slot order was not saved';
  END IF;
END;
$$;
UPDATE public.practices SET status = 'draft' WHERE id = '00000000-0000-4000-8000-000000000011';
-- Unpublishing does not lock graduate controls.
UPDATE public.school_graduates SET enabled = false;
-- FK cleanup must not be blocked by the other, now unpublished, selection.
DELETE FROM public.practices WHERE id = '00000000-0000-4000-8000-000000000012';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_graduates WHERE product_1_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Deleted product selection was not cleared';
  END IF;
END;
$$;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_graduates) THEN RAISE EXCEPTION 'Disabled graduate leaked'; END IF;
  BEGIN
    INSERT INTO public.school_graduates(author_id) VALUES ('00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Anonymous write was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
ROLLBACK;

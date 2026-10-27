-- Run only in an isolated test database after the migration. All fixture rows roll back.
BEGIN;
INSERT INTO public.authors(id, name, slug) VALUES
 ('00000000-0000-4000-8000-000000000001', 'Fixture Graduate A', 'fixture-graduate-a'),
 ('00000000-0000-4000-8000-000000000002', 'Fixture Graduate B', 'fixture-graduate-b');
INSERT INTO public.practices(
  id, author_id, title, slug, status, catalog_visibility, is_catalog_listed, published_at, scheduled_publish_at
) VALUES
 ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Fixture 1', 'fixture-grad-1', 'published', 'listed', true, now(), NULL),
 ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'Fixture 2', 'fixture-grad-2', 'published', 'listed', true, now(), NULL),
 ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000002', 'Fixture 3', 'fixture-grad-3', 'published', 'listed', true, now(), NULL),
 ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000001', 'Fixture draft', 'fixture-grad-draft', 'draft', 'listed', true, NULL, NULL),
 ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000001', 'Fixture scheduled', 'fixture-grad-scheduled', 'published', 'listed', true, NULL, now() + interval '7 days');
INSERT INTO public.school_graduates(author_id, cohort, enabled, product_1_id, product_2_id) VALUES
 ('00000000-0000-4000-8000-000000000001', 'Поток А', true, '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_graduate_showcase' AND column_name = 'cohort'
  ) THEN
    RAISE EXCEPTION 'Public showcase exposes cohort';
  END IF;
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
  BEGIN
    UPDATE public.school_graduates SET product_2_id = '00000000-0000-4000-8000-000000000015';
    RAISE EXCEPTION 'Future scheduled_publish_at was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    UPDATE public.school_graduates SET product_2_id = '00000000-0000-4000-8000-000000000014';
    RAISE EXCEPTION 'service_role draft was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_graduate_showcase
    WHERE author_id = '00000000-0000-4000-8000-000000000001'
      AND product_1_id = '00000000-0000-4000-8000-000000000011'
      AND product_2_id = '00000000-0000-4000-8000-000000000012'
  ) THEN
    RAISE EXCEPTION 'Enabled published selection was hidden from anon';
  END IF;
  BEGIN
    PERFORM 1 FROM public.school_graduates;
    RAISE EXCEPTION 'Anonymous table read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.school_graduates(author_id) VALUES ('00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Anonymous write was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

UPDATE public.school_graduates SET product_1_id = product_2_id, product_2_id = product_1_id;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_graduates
    WHERE product_1_id = '00000000-0000-4000-8000-000000000012'
      AND product_2_id = '00000000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'Slot order was not saved';
  END IF;
END;
$$;

UPDATE public.practices
SET published_at = NULL, scheduled_publish_at = now() + interval '7 days'
WHERE id = '00000000-0000-4000-8000-000000000012';
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.school_graduate_showcase
    WHERE product_1_id = '00000000-0000-4000-8000-000000000012'
       OR product_2_id = '00000000-0000-4000-8000-000000000012'
  ) THEN
    RAISE EXCEPTION 'Future scheduled product id leaked';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.school_graduate_showcase
    WHERE product_2_id = '00000000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'Still-public product was hidden';
  END IF;
END;
$$;
RESET ROLE;
UPDATE public.practices
SET published_at = now(), scheduled_publish_at = NULL
WHERE id = '00000000-0000-4000-8000-000000000012';

UPDATE public.practices SET status = 'draft' WHERE id = '00000000-0000-4000-8000-000000000011';
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.school_graduate_showcase
    WHERE product_1_id = '00000000-0000-4000-8000-000000000011'
       OR product_2_id = '00000000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'Unpublished product id leaked';
  END IF;
END;
$$;
RESET ROLE;

-- Unpublishing does not lock graduate controls.
UPDATE public.school_graduates SET enabled = false;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_graduate_showcase) THEN
    RAISE EXCEPTION 'Disabled graduate leaked';
  END IF;
END;
$$;
RESET ROLE;

-- FK cleanup must not be blocked by the other, now unpublished, selection.
DELETE FROM public.practices WHERE id = '00000000-0000-4000-8000-000000000012';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_graduates WHERE product_1_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Deleted product selection was not cleared';
  END IF;
END;
$$;
ROLLBACK;

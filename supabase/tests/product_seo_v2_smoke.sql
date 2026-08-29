-- Product SEO v2 schema and security smoke — run only on an isolated test DB
-- after applying 20260908120000_product_seo_v2.sql.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f supabase/tests/product_seo_v2_smoke.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_table text;
  v_constraint text;
  v_policy text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'practice_seo_usage_items',
    'practice_seo_faq_items',
    'practice_related_products',
    'practice_related_listens'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'product SEO v2 table missing: %', v_table;
    END IF;

    IF NOT (
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = format('public.%I', v_table)::regclass
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled: %', v_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'practices'
      AND column_name IN ('seo_about', 'seo_secondary_queries')
      AND is_nullable = 'NO'
  ) OR (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'practices'
      AND column_name IN ('seo_about', 'seo_secondary_queries')
  ) <> 2 THEN
    RAISE EXCEPTION 'practice SEO v2 columns must both exist and be nullable';
  END IF;

  FOREACH v_constraint IN ARRAY ARRAY[
    'practices_seo_secondary_queries_count_check',
    'practice_seo_usage_items_content_check',
    'practice_seo_usage_items_position_check',
    'practice_seo_usage_items_practice_position_key',
    'practice_seo_faq_items_pair_check',
    'practice_seo_faq_items_position_check',
    'practice_seo_faq_items_practice_position_key',
    'practice_related_products_not_self_check',
    'practice_related_products_practice_related_key',
    'practice_related_products_practice_position_key',
    'practice_related_listens_slug_check',
    'practice_related_listens_practice_slug_key',
    'practice_related_listens_practice_position_key'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = v_constraint
    ) THEN
      RAISE EXCEPTION 'product SEO v2 constraint missing: %', v_constraint;
    END IF;
  END LOOP;

  IF position(
    'cardinality(seo_secondary_queries) <= 10'
    IN pg_get_constraintdef(
      (
        SELECT oid FROM pg_constraint
        WHERE conname = 'practices_seo_secondary_queries_count_check'
          AND conrelid = 'public.practices'::regclass
      )
    )
  ) = 0 THEN
    RAISE EXCEPTION 'secondary-query database cap is not 10';
  END IF;

  FOREACH v_policy IN ARRAY ARRAY[
    'Public can read listed practice SEO usage items',
    'Public can read listed practice SEO FAQ items',
    'Public can read verified listed related products',
    'Public can read listed practice related listens',
    'Authors can manage practice SEO usage items',
    'Authors can manage practice SEO FAQ items',
    'Authors can manage practice related products',
    'Authors can manage practice related listens'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND policyname = v_policy
    ) THEN
      RAISE EXCEPTION 'product SEO v2 policy missing: %', v_policy;
    END IF;
  END LOOP;

  IF to_regprocedure('public.validate_practice_related_product()') IS NULL
     OR to_regprocedure('public.enforce_practice_seo_usage_item_limit()') IS NULL
     OR to_regprocedure('public.enforce_practice_seo_faq_item_limit()') IS NULL
     OR to_regprocedure('public.can_manage_practice_seo(uuid)') IS NULL
     OR to_regprocedure('public.is_public_listed_practice(uuid)') IS NULL THEN
    RAISE EXCEPTION 'product SEO v2 validation or visibility function missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'practice_related_products_related_practice_idx'
  ) THEN
    RAISE EXCEPTION 'related product reverse lookup index missing';
  END IF;
END;
$$;

ROLLBACK;

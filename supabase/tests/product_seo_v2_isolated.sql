-- Product SEO v2 executable authorization and transaction proof.
-- Run only through scripts/product-seo-v2-isolated.mjs against an isolated DB.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := 'be910001-0000-4000-8000-000000000001';
  v_other_id uuid := 'be910002-0000-4000-8000-000000000002';
  v_author_id uuid := 'be910010-0000-4000-8000-000000000010';
  v_practice_id uuid := 'be910011-0000-4000-8000-000000000011';
  v_target_id uuid := 'be910012-0000-4000-8000-000000000012';
  v_count integer;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES
    (v_owner_id, 'product.seo.owner@example.test'),
    (v_other_id, 'product.seo.other@example.test');

  INSERT INTO public.authors (id, name, slug, author_type, access_status)
  VALUES (v_author_id, 'Product SEO isolated', 'product-seo-isolated', 'person', 'free');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, is_catalog_listed, catalog_visibility
  )
  VALUES (v_practice_id, v_author_id, 'Product SEO source', 'product-seo-source', 'published', true, 0, true, 'listed');

  INSERT INTO public.practices (
    id, author_id, title, slug, status, is_free, price, is_catalog_listed, catalog_visibility
  )
  VALUES (v_target_id, v_author_id, 'Product SEO target', 'product-seo-target', 'published', true, 0, true, 'listed');

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_owner_id, 'owner');

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.replace_practice_seo_content(
    v_practice_id,
    '[{"content":"Original saved item"}]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(v_target_id::text),
    '[]'::jsonb
  );
  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.practice_seo_usage_items
  WHERE practice_id = v_practice_id AND content = 'Original saved item';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'authenticated owner RPC did not save child content';
  END IF;

  BEGIN
    UPDATE public.practices
    SET seo_secondary_queries = ARRAY['Breathing', ' breathing ']
    WHERE id = v_practice_id;
    RAISE EXCEPTION 'duplicate secondary SEO queries unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_count
  FROM public.practice_related_products
  WHERE practice_id = v_practice_id AND related_practice_id = v_target_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'public relation visibility did not expose two listed practices';
  END IF;
  RESET ROLE;

  UPDATE public.practices SET is_catalog_listed = false
  WHERE id = v_target_id;
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_count
  FROM public.practice_related_products
  WHERE practice_id = v_practice_id AND related_practice_id = v_target_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'public relation visibility exposed a non-listed related practice';
  END IF;
  RESET ROLE;
  UPDATE public.practices SET is_catalog_listed = true
  WHERE id = v_target_id;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.practice_seo_usage_items (practice_id, content, position)
    VALUES (v_practice_id, 'Direct DML must fail', 1);
    RAISE EXCEPTION 'authenticated direct child DML unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    INSERT INTO public.practice_seo_usage_items (practice_id, content, position)
    VALUES (v_practice_id, 'Anonymous direct DML must fail', 1);
    RAISE EXCEPTION 'anon direct child DML unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_other_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.replace_practice_seo_content(v_practice_id, '[]', '[]', '[]', '[]');
    RAISE EXCEPTION 'non-owner RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.replace_practice_seo_content(v_practice_id, '[]', '[]', '[]', '[]');
    RAISE EXCEPTION 'anon RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.replace_practice_seo_content(
      v_practice_id,
      '[{"content":"Must roll back"}]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(v_target_id::text, v_target_id::text),
      '[]'::jsonb
    );
    RAISE EXCEPTION 'duplicate relation unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.practice_seo_usage_items
  WHERE practice_id = v_practice_id AND content = 'Original saved item';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'failed RPC did not roll back its child replacement';
  END IF;
END;
$$;

ROLLBACK;

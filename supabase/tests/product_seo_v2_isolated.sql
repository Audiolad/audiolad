-- Product SEO v2 executable authorization and transaction proof.
-- Run only through scripts/product-seo-v2-isolated.mjs against an isolated DB.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := 'be910001-0000-4000-8000-000000000001';
  v_other_id uuid := 'be910002-0000-4000-8000-000000000002';
  v_author_id uuid;
  v_practice_id uuid;
  v_target_id uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  VALUES
    (v_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'product.seo.owner@example.com', crypt('test-password', gen_salt('bf')),
      now(), now(), now(), '', '', '', ''),
    (v_other_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'product.seo.other@example.com', crypt('test-password', gen_salt('bf')),
      now(), now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.authors (name, slug, author_type, access_status)
  VALUES ('Product SEO isolated', 'product-seo-isolated-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'person', 'free')
  RETURNING id INTO v_author_id;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, catalog_visibility
  )
  VALUES (v_author_id, 'Product SEO source', 'product-seo-source-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'published', true, 0, true, 'listed')
  RETURNING id INTO v_practice_id;

  INSERT INTO public.practices (
    author_id, title, slug, status, is_free, price, is_catalog_listed, catalog_visibility
  )
  VALUES (v_author_id, 'Product SEO target', 'product-seo-target-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'published', true, 0, true, 'listed')
  RETURNING id INTO v_target_id;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_owner_id, 'owner');

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.replace_practice_seo_content(
    v_practice_id,
    '[{"content":"Original saved item"}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.practice_seo_usage_items
  WHERE practice_id = v_practice_id AND content = 'Original saved item';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'authenticated owner RPC did not save child content';
  END IF;

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

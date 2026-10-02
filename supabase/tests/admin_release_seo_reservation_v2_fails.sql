-- Current v2 admin release of a linked reservation must fail the product check.
-- Never run on production.

DO $$
DECLARE
  v_admin uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_author uuid := '11111111-1111-4111-8111-111111111111';
  v_query uuid := '22222222-2222-4222-8222-222222222222';
  v_practice uuid := '33333333-3333-4333-8333-333333333333';
  v_reservation uuid := '44444444-4444-4444-8444-444444444444';
  v_status text;
  v_product uuid;
  v_primary uuid;
  v_text text;
BEGIN
  INSERT INTO public.authors (id, name, slug)
  VALUES (v_author, 'Настольная лампа', 'nastolnaya-lampa');

  INSERT INTO public.seo_queries (id, query_text, normalized_query)
  VALUES (v_query, 'Босса нова музыка для кофейни', 'босса нова музыка для кофейни');

  PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
  INSERT INTO public.practices (
    id, author_id, title, slug, status, moderation_status, primary_seo_query_id, seo_primary_query
  ) VALUES (
    v_practice,
    v_author,
    'Босса нова музыка для кофейни',
    'bossa-nova',
    'draft',
    'not_submitted',
    v_query,
    'Босса нова музыка для кофейни'
  );

  INSERT INTO public.seo_query_reservations (
    id, query_id, author_id, product_id, status, expires_at
  ) VALUES (
    v_reservation, v_query, v_author, v_practice, 'active', NULL
  );

  INSERT INTO public.test_platform_permissions (user_id, permission_code)
  VALUES (v_admin, 'seo.manage');

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  BEGIN
    PERFORM public.admin_release_seo_query_reservation(v_reservation);
    RAISE EXCEPTION 'expected seo_query_reservations_product_active_check';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLSTATE <> '23514'
         OR SQLERRM NOT LIKE '%seo_query_reservations_product_active_check%' THEN
        RAISE EXCEPTION 'unexpected check failure: % %', SQLSTATE, SQLERRM;
      END IF;
  END;

  SELECT status, product_id INTO v_status, v_product
  FROM public.seo_query_reservations
  WHERE id = v_reservation;

  IF v_status IS DISTINCT FROM 'active' OR v_product IS DISTINCT FROM v_practice THEN
    RAISE EXCEPTION 'failed release must leave the linked reservation active';
  END IF;

  SELECT primary_seo_query_id, seo_primary_query INTO v_primary, v_text
  FROM public.practices
  WHERE id = v_practice;

  IF v_primary IS DISTINCT FROM v_query OR v_text IS DISTINCT FROM 'Босса нова музыка для кофейни' THEN
    RAISE EXCEPTION 'failed release must roll back practice SEO fields';
  END IF;
END;
$$;

SELECT 'admin_release_seo_reservation_v2_fails: ALL PASS' AS result;

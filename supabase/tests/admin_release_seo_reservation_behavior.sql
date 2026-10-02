-- Fixed admin release. Never run on production.

DO $$
DECLARE
  v_admin uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_author uuid := '11111111-1111-4111-8111-111111111111';
  v_query uuid := '22222222-2222-4222-8222-222222222222';
  v_practice uuid := '33333333-3333-4333-8333-333333333333';
  v_reservation uuid := '44444444-4444-4444-8444-444444444444';
  v_free_query uuid := '22222222-2222-4222-8222-222222222223';
  v_free_reservation uuid := '44444444-4444-4444-8444-444444444445';
  v_used_query uuid := '22222222-2222-4222-8222-222222222224';
  v_used_reservation uuid := '44444444-4444-4444-8444-444444444446';
  v_row public.seo_query_reservations%ROWTYPE;
  v_primary uuid;
  v_text text;
  v_status text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  v_row := public.admin_release_seo_query_reservation(v_reservation);
  IF v_row.status IS DISTINCT FROM 'released'
     OR v_row.product_id IS NOT NULL
     OR v_row.released_at IS NULL THEN
    RAISE EXCEPTION 'linked admin release did not clear product_id';
  END IF;

  SELECT primary_seo_query_id, seo_primary_query INTO v_primary, v_text
  FROM public.practices
  WHERE id = v_practice;
  IF v_primary IS NOT NULL OR v_text IS NOT NULL THEN
    RAISE EXCEPTION 'linked admin release did not clear practice SEO fields';
  END IF;

  INSERT INTO public.seo_queries (id, query_text, normalized_query)
  VALUES (v_free_query, 'свободный запрос', 'свободный запрос');
  INSERT INTO public.seo_query_reservations (
    id, query_id, author_id, product_id, status, expires_at
  ) VALUES (
    v_free_reservation, v_free_query, v_author, NULL, 'active', now() + interval '7 days'
  );
  v_row := public.admin_release_seo_query_reservation(v_free_reservation);
  IF v_row.status IS DISTINCT FROM 'released' OR v_row.product_id IS NOT NULL THEN
    RAISE EXCEPTION 'unlinked admin release failed';
  END IF;

  INSERT INTO public.seo_queries (id, query_text, normalized_query)
  VALUES (v_used_query, 'занятый запрос', 'занятый запрос');
  INSERT INTO public.seo_query_reservations (
    id, query_id, author_id, product_id, status, released_at
  ) VALUES (
    v_used_reservation, v_used_query, v_author, NULL, 'used', NULL
  );
  BEGIN
    PERFORM public.admin_release_seo_query_reservation(v_used_reservation);
    RAISE EXCEPTION 'used reservation must not be releasable';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM NOT LIKE '%seo_reservation_not_releasable%' THEN
        RAISE;
      END IF;
  END;

  DELETE FROM public.test_platform_permissions WHERE user_id = v_admin;
  BEGIN
    PERFORM public.admin_release_seo_query_reservation(v_free_reservation);
    RAISE EXCEPTION 'missing seo.manage must be denied';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%permission_denied%' THEN
        RAISE;
      END IF;
  END;

  INSERT INTO public.test_platform_permissions (user_id, permission_code)
  VALUES (v_admin, 'seo.manage');

  UPDATE public.seo_query_reservations
  SET status = 'active', product_id = v_practice, released_at = NULL
  WHERE id = v_reservation;
  BEGIN
    UPDATE public.seo_query_reservations
    SET status = 'released', released_at = now()
    WHERE id = v_reservation;
    RAISE EXCEPTION 'constraint must still reject released rows that keep product_id';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%seo_query_reservations_product_active_check%' THEN
        RAISE;
      END IF;
  END;

  SELECT status INTO v_status
  FROM public.seo_query_reservations
  WHERE id = v_reservation;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'constraint probe must roll back';
  END IF;
END;
$$;

SELECT 'admin_release_seo_reservation_behavior: ALL PASS' AS result;

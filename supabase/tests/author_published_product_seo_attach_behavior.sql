-- Behavior tests for attach_published_seo_query_to_product. Never run on production.

DO $$
DECLARE
  a1 uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  a2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  p_free uuid := '11111111-1111-4111-8111-111111111101';
  p_own uuid := '11111111-1111-4111-8111-111111111102';
  p_draft uuid := '11111111-1111-4111-8111-111111111103';
  p_linked uuid := '11111111-1111-4111-8111-111111111104';
  p_other_used uuid := '11111111-1111-4111-8111-111111111105';
  p_na uuid := '11111111-1111-4111-8111-111111111106';
  p_guard uuid := '11111111-1111-4111-8111-111111111107';
  q_free uuid := '22222222-2222-4222-8222-222222222201';
  q_used uuid := '22222222-2222-4222-8222-222222222202';
  q_reserved uuid := '22222222-2222-4222-8222-222222222203';
  q_own uuid := '22222222-2222-4222-8222-222222222204';
  q_linked uuid := '22222222-2222-4222-8222-222222222205';
  q_na uuid := '22222222-2222-4222-8222-222222222206';
  q_long uuid := '22222222-2222-4222-8222-222222222207';
  r jsonb;
  v_count integer;
  v_status text;
  v_expires timestamptz;
  v_primary uuid;
  v_text text;
  v_analysis text;
  v_freq integer;
  v_source text;
  v_err text;
  v_res_id uuid;
  v_new_qid uuid;
BEGIN
  INSERT INTO public.authors (id, name, slug) VALUES
    (a1, 'Author One', 'author-one'),
    (a2, 'Author Two', 'author-two');

  INSERT INTO public.practices (id, author_id, title, slug, status, product_kind) VALUES
    (p_free, a1, 'Free Pub', 'free-pub', 'published', 'practice'),
    (p_own, a1, 'Own Pub', 'own-pub', 'published', 'practice'),
    (p_draft, a1, 'Draft', 'draft-p', 'draft', 'practice'),
    (p_linked, a1, 'Linked', 'linked-p', 'published', 'practice'),
    (p_other_used, a2, 'Other Used', 'other-used', 'published', 'practice'),
    (p_na, a1, 'NA Pub', 'na-pub', 'published', 'practice'),
    (p_guard, a1, 'Guard Pub', 'guard-pub', 'published', 'practice');

  -- Seed queries (normalized via trigger). Provide dummy normalized_query placeholder overwritten by trigger.
  INSERT INTO public.seo_queries (id, query_text, normalized_query, source, frequency, analysis_status)
  VALUES
    (q_free, 'музыка для спа', 'placeholder', 'manual', 100, 'analyzed'),
    (q_used, 'занятый запрос', 'placeholder', 'manual', 10, 'analyzed'),
    (q_reserved, 'бронь другого', 'placeholder', 'manual', 5, 'analyzed'),
    (q_own, 'мой в работе', 'placeholder', 'manual', NULL, 'analyzed'),
    (q_linked, 'уже связан', 'placeholder', 'manual', 3, 'analyzed'),
    (q_na, 'не проанализирован', 'placeholder', 'manual', NULL, 'not_analyzed'),
    (q_long, repeat('я', 121), 'placeholder', 'manual', NULL, 'analyzed');

  -- used by other product
  INSERT INTO public.seo_query_reservations (query_id, author_id, product_id, reserved_at, expires_at, status)
  VALUES (q_used, a2, p_other_used, now(), NULL, 'used');
  PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
  UPDATE public.practices
  SET primary_seo_query_id = q_used, seo_primary_query = 'занятый запрос'
  WHERE id = p_other_used;

  -- active other-author unlinked non-expired
  INSERT INTO public.seo_query_reservations (query_id, author_id, product_id, reserved_at, expires_at, status)
  VALUES (q_reserved, a2, NULL, now(), now() + interval '7 days', 'active');

  -- own active unlinked
  INSERT INTO public.seo_query_reservations (query_id, author_id, product_id, reserved_at, expires_at, status)
  VALUES (q_own, a1, NULL, now(), now() + interval '7 days', 'active');

  -- already linked product
  INSERT INTO public.seo_query_reservations (query_id, author_id, product_id, reserved_at, expires_at, status)
  VALUES (q_linked, a1, p_linked, now(), NULL, 'used');
  PERFORM set_config('audiolad.allow_primary_seo_query_link', 'on', true);
  UPDATE public.practices
  SET primary_seo_query_id = q_linked, seo_primary_query = 'уже связан'
  WHERE id = p_linked;

  ------------------------------------------------------------------
  -- A. published + free existing query
  ------------------------------------------------------------------
  r := public.attach_published_seo_query_to_product(p_free, q_free, NULL);
  ASSERT (r->>'status') = 'used', 'A status';
  ASSERT (r->>'created_query')::boolean IS FALSE, 'A created';
  SELECT primary_seo_query_id, seo_primary_query INTO v_primary, v_text FROM public.practices WHERE id = p_free;
  ASSERT v_primary = q_free, 'A primary id';
  ASSERT v_text = 'музыка для спа', 'A primary text';
  SELECT status, expires_at, id INTO v_status, v_expires, v_res_id
  FROM public.seo_query_reservations WHERE query_id = q_free AND status = 'used';
  ASSERT v_status = 'used', 'A reservation used';
  ASSERT v_expires IS NULL, 'A expires null';
  ASSERT (r->>'reservation_id')::uuid = v_res_id, 'A reservation id';
  RAISE NOTICE 'A PASS';

  ------------------------------------------------------------------
  -- B. absent query text → create manual analyzed frequency NULL
  ------------------------------------------------------------------
  -- reset p_free for separate product: use a fresh published product
  INSERT INTO public.practices (id, author_id, title, slug, status, product_kind)
  VALUES ('11111111-1111-4111-8111-111111111108', a1, 'Create Pub', 'create-pub', 'published', 'music');
  r := public.attach_published_seo_query_to_product(
    '11111111-1111-4111-8111-111111111108',
    NULL,
    'новый ручной запрос для теста'
  );
  ASSERT (r->>'created_query')::boolean IS TRUE, 'B created';
  ASSERT (r->>'status') = 'used', 'B status';
  v_new_qid := (r->>'query_id')::uuid;
  SELECT frequency, analysis_status, source, intent INTO v_freq, v_analysis, v_source, v_text
  FROM public.seo_queries WHERE id = v_new_qid;
  ASSERT v_freq IS NULL, 'B frequency null';
  ASSERT v_analysis = 'analyzed', 'B analyzed';
  ASSERT v_source = 'manual', 'B source';
  ASSERT v_text = 'music', 'B music intent';
  RAISE NOTICE 'B PASS';

  ------------------------------------------------------------------
  -- C. own active unlinked → converted to used
  ------------------------------------------------------------------
  r := public.attach_published_seo_query_to_product(p_own, q_own, NULL);
  ASSERT (r->>'status') = 'used', 'C status';
  ASSERT (r->>'created_query')::boolean IS FALSE, 'C not created';
  SELECT status, product_id, expires_at INTO v_status, v_primary, v_expires
  FROM public.seo_query_reservations WHERE query_id = q_own;
  ASSERT v_status = 'used', 'C used';
  ASSERT v_primary = p_own, 'C product';
  ASSERT v_expires IS NULL, 'C expires';
  RAISE NOTICE 'C PASS';

  ------------------------------------------------------------------
  -- D. used by another → seo_query_already_used
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.attach_published_seo_query_to_product(p_na, q_used, NULL);
    RAISE EXCEPTION 'D expected raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%seo_query_already_used%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'D PASS';

  ------------------------------------------------------------------
  -- E. active other-author → seo_query_already_reserved
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.attach_published_seo_query_to_product(p_na, q_reserved, NULL);
    RAISE EXCEPTION 'E expected raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%seo_query_already_reserved%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'E PASS';

  ------------------------------------------------------------------
  -- F. draft product → seo_attach_product_not_published
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.attach_published_seo_query_to_product(p_draft, q_free, NULL);
    RAISE EXCEPTION 'F expected raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%seo_attach_product_not_published%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'F PASS';

  ------------------------------------------------------------------
  -- G. same product / same query → idempotent
  ------------------------------------------------------------------
  r := public.attach_published_seo_query_to_product(p_free, q_free, NULL);
  ASSERT (r->>'idempotent')::boolean IS TRUE, 'G idempotent';
  ASSERT (r->>'status') = 'used', 'G status';
  SELECT count(*) INTO v_count FROM public.seo_query_reservations
  WHERE query_id = q_free AND status IN ('active', 'used');
  ASSERT v_count = 1, 'G single reservation';
  RAISE NOTICE 'G PASS';

  ------------------------------------------------------------------
  -- H. different query after linked → practice_already_has_primary_seo_query
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.attach_published_seo_query_to_product(p_linked, q_na, NULL);
    RAISE EXCEPTION 'H expected raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%practice_already_has_primary_seo_query%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'H PASS';

  ------------------------------------------------------------------
  -- I. >120 chars → seo_query_too_long_for_product
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.attach_published_seo_query_to_product(p_na, q_long, NULL);
    RAISE EXCEPTION 'I expected raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%seo_query_too_long_for_product%' THEN
        RAISE;
      END IF;
  END;
  RAISE NOTICE 'I PASS';

  ------------------------------------------------------------------
  -- J. existing non-analyzed exact → reuse, promote analyzed, no duplicate
  ------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('не проанализирован');
  ASSERT v_count = 1, 'J pre count';
  r := public.attach_published_seo_query_to_product(p_na, NULL, 'Не Проанализирован');
  ASSERT (r->>'created_query')::boolean IS FALSE, 'J not created';
  ASSERT (r->>'query_id')::uuid = q_na, 'J same id';
  SELECT analysis_status INTO v_analysis FROM public.seo_queries WHERE id = q_na;
  ASSERT v_analysis = 'analyzed', 'J analyzed';
  SELECT count(*) INTO v_count FROM public.seo_queries
  WHERE normalized_query = public.normalize_seo_query('не проанализирован');
  ASSERT v_count = 1, 'J no duplicate';
  RAISE NOTICE 'J PASS';

  ------------------------------------------------------------------
  -- K. guard keeps primary/text synchronized; direct update blocked
  ------------------------------------------------------------------
  -- Clear session allow flag left on by earlier RPC calls in this transaction.
  PERFORM set_config('audiolad.allow_primary_seo_query_link', '', true);
  BEGIN
    UPDATE public.practices
    SET seo_primary_query = 'хак текста'
    WHERE id = p_na;
    RAISE EXCEPTION 'K expected mismatch raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%linked_primary_seo_query_mismatch%' THEN
        RAISE;
      END IF;
  END;
  BEGIN
    UPDATE public.practices
    SET primary_seo_query_id = q_free
    WHERE id = p_guard;
    RAISE EXCEPTION 'K expected rpc guard raise';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%primary_seo_query_requires_rpc%' THEN
        RAISE;
      END IF;
  END;
  SELECT primary_seo_query_id, seo_primary_query INTO v_primary, v_text
  FROM public.practices WHERE id = p_na;
  ASSERT v_primary = q_na, 'K primary';
  SELECT query_text INTO v_err FROM public.seo_queries WHERE id = q_na;
  ASSERT v_text = v_err, 'K text synced';
  RAISE NOTICE 'K PASS';

  RAISE NOTICE 'author_published_product_seo_attach_behavior: ALL PASS';
END $$;

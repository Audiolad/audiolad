-- Isolated smoke for 20270104120000 (task c353a4b5, ИИ-компания catalog stats). Rolls back.
-- Proves: authors vs spaces are separate; author with several spaces counts once; product with
-- several tracks; draft/unpublished/deleted products and draft tracks excluded; a track counted
-- once; "as of" points by real timestamps; daily snapshot upsert is idempotent and shows a
-- withdrawal as a decrease; no anon/authenticated access.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
DO $$
DECLARE
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  pc uuid := gen_random_uuid(); pd uuid := gen_random_uuid();
  base public.ecompany_catalog_stats_snapshots; r record; snap public.ecompany_catalog_stats_snapshots; n bigint;
  t_now timestamptz := now();
BEGIN
  -- Baseline from whatever the disposable DB already contains.
  SELECT * INTO r FROM public.ecompany_catalog_stats_counts(ARRAY[t_now]);
  base.authors_total := r.authors_total; base.authors_with_published := r.authors_with_published;
  base.spaces_with_published := r.spaces_with_published; base.published_products := r.published_products;
  base.published_tracks := r.published_tracks;

  INSERT INTO auth.users(id, email) VALUES (u1, 'stats-u1@test.invalid'), (u2, 'stats-u2@test.invalid'), (u3, 'stats-u3@test.invalid');
  INSERT INTO public.authors(id, name, slug) VALUES
    (a1, 'Стат Первый', 'stats-c353-a1'), (a2, 'Стат Второй', 'stats-c353-a2'),
    (b, 'Стат Третий', 'stats-c353-b'), (c, 'Стат Четвёртый', 'stats-c353-c');
  -- u1 owns two spaces; u2 one space with only a draft; u3 one space whose product was withdrawn.
  INSERT INTO public.author_members(author_id, user_id, role, created_at) VALUES
    (a1, u1, 'owner', t_now - interval '40 days'), (a2, u1, 'owner', t_now - interval '3 days'),
    (b, u2, 'owner', t_now - interval '20 days'), (c, u3, 'owner', t_now - interval '1 day');

  PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
  INSERT INTO public.practices(id, author_id, title, slug, status, is_free, price, product_kind, catalog_visibility, published_at) VALUES
    (p1, a1, 'Продукт один', 'stats-c353-p1', 'published', true, 0, 'practice', 'listed', t_now - interval '10 days'),
    (p2, a2, 'Продукт два', 'stats-c353-p2', 'published', true, 0, 'practice', 'unlisted', t_now - interval '2 days'),
    (pb, b, 'Черновик', 'stats-c353-pb', 'draft', true, 0, 'practice', 'listed', NULL),
    (pc, c, 'Снятый', 'stats-c353-pc', 'unpublished', true, 0, 'practice', 'listed', t_now - interval '30 days'),
    (pd, a1, 'Удалённый', 'stats-c353-pd', 'published', true, 0, 'practice', 'listed', t_now - interval '5 days');
  PERFORM set_config('audiolad.allow_practice_soft_delete', 'on', true);
  UPDATE public.practices SET deleted_at = t_now WHERE id = pd;

  INSERT INTO public.audio_items(practice_id, title, position, status, created_at) VALUES
    (p1, 't1', 1, 'published', t_now - interval '15 days'),
    (p1, 't2', 2, 'published', t_now - interval '6 days'),
    (p1, 't3-draft', 3, 'draft', t_now - interval '15 days'),
    (p2, 't4', 1, 'published', t_now - interval '2 days'),
    (pb, 'tb', 1, 'published', t_now - interval '2 days'),
    (pc, 'tc', 1, 'published', t_now - interval '30 days'),
    (pd, 'td', 1, 'published', t_now - interval '5 days');

  SELECT * INTO r FROM public.ecompany_catalog_stats_counts(ARRAY[t_now]);
  IF r.authors_total - base.authors_total <> 3 THEN RAISE EXCEPTION 'authors_total +3, got %', r.authors_total - base.authors_total; END IF;
  IF r.authors_with_published - base.authors_with_published <> 1 THEN RAISE EXCEPTION 'author with 2 spaces counts once'; END IF;
  IF r.spaces_with_published - base.spaces_with_published <> 2 THEN RAISE EXCEPTION 'two spaces with publication'; END IF;
  IF r.published_products - base.published_products <> 2 THEN RAISE EXCEPTION 'draft/unpublished/deleted excluded, got %', r.published_products - base.published_products; END IF;
  IF r.published_tracks - base.published_tracks <> 3 THEN RAISE EXCEPTION 'tracks: 3 expected, got %', r.published_tracks - base.published_tracks; END IF;

  -- As of 7 days ago: only P1 (published 10d ago) with t1 (t2 uploaded 6d ago); a2 not yet published.
  SELECT * INTO r FROM public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '7 days']);
  IF r.published_products - base.published_products > 1 THEN RAISE EXCEPTION 'past products'; END IF;
  -- Growth for our fixtures within the last 7 days: P2 +1 product, +1 space, +2 tracks (t2, t4), +0 author-with-publication.
  SELECT (a.published_products - b2.published_products) AS dp, (a.spaces_with_published - b2.spaces_with_published) AS ds,
         (a.published_tracks - b2.published_tracks) AS dt, (a.authors_with_published - b2.authors_with_published) AS da,
         (a.authors_total - b2.authors_total) AS dau
    INTO r
    FROM public.ecompany_catalog_stats_counts(ARRAY[t_now]) a,
         public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '7 days']) b2;
  -- Other rows in the disposable DB carry their own (real) dates; only assert lower bounds for ours.
  IF r.dp < 1 OR r.ds < 1 OR r.dt < 2 OR r.dau < 1 THEN RAISE EXCEPTION 'week growth %', r; END IF;

  -- Half-open periods: a product published exactly at point T counts at points > T, not at T.
  SELECT a.published_products - b2.published_products AS d INTO r
    FROM public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '2 days' + interval '1 microsecond']) a,
         public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '2 days']) b2;
  IF r.d < 1 THEN RAISE EXCEPTION 'product at exact boundary belongs to the period that starts there'; END IF;

  -- Track uploaded long ago, product published later → track counts from product publication.
  SELECT a.published_tracks - b2.published_tracks AS d INTO r
    FROM public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '10 days' + interval '1 microsecond']) a,
         public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '10 days']) b2;
  IF r.d < 1 THEN RAISE EXCEPTION 't1 (uploaded 15d ago) counts from P1 go-live 10d ago'; END IF;

  -- Withdrawing the EARLIEST product of a space must not make the space/author "new" again.
  SELECT spaces_with_published AS s0, authors_with_published AS a0 INTO r
    FROM public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '7 days']);
  UPDATE public.practices SET status = 'unpublished' WHERE id = p1;
  INSERT INTO public.practices(id, author_id, title, slug, status, is_free, price, product_kind, catalog_visibility, published_at)
    VALUES (gen_random_uuid(), a1, 'Продукт новый', 'stats-c353-p1b', 'published', true, 0, 'practice', 'listed', t_now - interval '1 day');
  SELECT b2.spaces_with_published - r.s0 AS ds, b2.authors_with_published - r.a0 AS da INTO r
    FROM public.ecompany_catalog_stats_counts(ARRAY[t_now - interval '7 days']) b2;
  IF r.ds <> 0 OR r.da <> 0 THEN RAISE EXCEPTION 'space a1 keeps its first-publication date (ds %, da %)', r.ds, r.da; END IF;
  UPDATE public.practices SET status = 'published' WHERE id = p1;

  -- Snapshot upsert: twice in a day = one row (throttled); withdrawal shows as decrease after refresh.
  DELETE FROM public.ecompany_catalog_stats_snapshots;
  snap := public.ecompany_catalog_stats_capture();
  snap := public.ecompany_catalog_stats_capture();
  SELECT count(*) INTO n FROM public.ecompany_catalog_stats_snapshots;
  IF n <> 1 THEN RAISE EXCEPTION 'one snapshot per Moscow day, got %', n; END IF;
  IF snap.snapshot_date <> (now() AT TIME ZONE 'Europe/Moscow')::date THEN RAISE EXCEPTION 'Moscow date'; END IF;
  UPDATE public.practices SET status = 'unpublished' WHERE id = p2;
  snap := public.ecompany_catalog_stats_capture();
  IF snap.published_products - base.published_products <> 3 THEN RAISE EXCEPTION 'capture within an hour is throttled (got %)', snap.published_products - base.published_products; END IF;
  UPDATE public.ecompany_catalog_stats_snapshots SET captured_at = now() - interval '2 hours';
  snap := public.ecompany_catalog_stats_capture();
  IF snap.published_products - base.published_products <> 2 THEN RAISE EXCEPTION 'withdrawal decreases products'; END IF;
  IF snap.spaces_with_published - base.spaces_with_published <> 1 THEN RAISE EXCEPTION 'withdrawal decreases spaces'; END IF;
  IF snap.authors_with_published - base.authors_with_published <> 1 THEN RAISE EXCEPTION 'author keeps other space'; END IF;
  IF snap.published_tracks - base.published_tracks <> 2 THEN RAISE EXCEPTION 'withdrawn product tracks excluded'; END IF;
  SELECT count(*) INTO n FROM public.ecompany_catalog_stats_history(10);
  IF n <> 1 THEN RAISE EXCEPTION 'history'; END IF;
  IF public.ecompany_catalog_stats_history_started() IS NULL THEN RAISE EXCEPTION 'history start'; END IF;

  -- Privileges: service_role only.
  IF has_table_privilege('anon', 'public.ecompany_catalog_stats_snapshots', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ecompany_catalog_stats_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'snapshots must not be readable by anon/authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.ecompany_catalog_stats_counts(timestamptz[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ecompany_catalog_stats_capture()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ecompany_catalog_stats_history(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'functions must be service_role only';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.ecompany_catalog_stats_capture()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role capture';
  END IF;
  RAISE NOTICE 'ecompany_catalog_stats_smoke: ok';
END $$;
ROLLBACK;

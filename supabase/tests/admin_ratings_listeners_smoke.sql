-- Isolated smoke for admin «Оценки → Слушатели» RPCs. Synthetic data only.
-- Never run against production.
DO $$
DECLARE
  v jsonb;
  d jsonb;
  u1 uuid := 'c0000000-0000-4000-8000-000000000001';
  u2 uuid := 'c0000000-0000-4000-8000-000000000002';
  u3 uuid := 'c0000000-0000-4000-8000-000000000003';
  u4 uuid := 'c0000000-0000-4000-8000-000000000004';
BEGIN
  -- Default: newest activity first, raters only (U4 has no rating).
  v := public.admin_ratings_listeners();
  ASSERT (v->>'total')::int = 3, 'total raters must be 3, got ' || (v->>'total');
  ASSERT v->'rows'->0->>'user_id' = u3::text, 'last_activity desc first must be U3';
  ASSERT v->'rows'->2->>'user_id' = u1::text, 'last_activity desc last must be U1';
  ASSERT v::text NOT LIKE '%v1:ip%' AND v::text NOT LIKE '%v1:dev%', 'list must never expose HMAC';
  ASSERT v::text NOT LIKE '%hmac"%', 'list must not have hmac keys';

  -- Row content U1.
  SELECT r INTO d FROM jsonb_array_elements(v->'rows') r WHERE r->>'user_id' = u1::text;
  ASSERT d->>'full_name' = 'Анна Иванова', 'U1 full_name';
  ASSERT d->>'email' = 'anna.listener@mail.ru', 'U1 email from auth.users';
  ASSERT (d->>'rating_count')::int = 2, 'U1 rating_count = rated products = 2';
  ASSERT (d->>'average')::numeric = 4.5, 'U1 average uses CURRENT stars (5 + 4 edited)';
  ASSERT (d->>'last_activity_at')::timestamptz = '2026-10-05T11:00:00Z', 'U1 last activity = edit time';
  ASSERT (d->>'first_rated_at')::timestamptz = '2026-10-02T11:00:00Z', 'U1 first rated';

  -- Blank full_name is reported honestly as NULL.
  SELECT r INTO d FROM jsonb_array_elements(v->'rows') r WHERE r->>'user_id' = u2::text;
  ASSERT d->'full_name' = 'null'::jsonb, 'U2 blank name must be null';

  -- Excluded-only listener: listed, average NULL, test flag.
  SELECT r INTO d FROM jsonb_array_elements(v->'rows') r WHERE r->>'user_id' = u3::text;
  ASSERT d->'average' = 'null'::jsonb, 'U3 excluded-only average must be null';
  ASSERT (d->>'excluded_count')::int = 1 AND (d->>'active_count')::int = 0, 'U3 counts';
  ASSERT (d->>'is_test')::boolean, 'U3 is test account';

  -- Sorts.
  v := public.admin_ratings_listeners(NULL, 'rating_count', 'desc');
  ASSERT v->'rows'->0->>'user_id' = u1::text, 'rating_count desc first U1';
  ASSERT v->'rows'->1->>'user_id' = u2::text, 'tie broken by user_id asc';
  v := public.admin_ratings_listeners(NULL, 'average', 'desc');
  ASSERT v->'rows'->0->>'user_id' = u2::text AND v->'rows'->2->>'user_id' = u3::text, 'average desc nulls last';
  v := public.admin_ratings_listeners(NULL, 'registered_at', 'asc');
  ASSERT v->'rows'->0->>'user_id' = u1::text AND v->'rows'->2->>'user_id' = u3::text, 'registered asc';
  v := public.admin_ratings_listeners(NULL, 'bogus; drop table x', 'sideways');
  ASSERT v->>'sort' = 'last_activity' AND v->>'sort_dir' = 'desc', 'unknown sort falls back';

  -- Search: email, name, literal LIKE metacharacters, uuid.
  v := public.admin_ratings_listeners('ANNA');
  ASSERT (v->>'total')::int = 1 AND v->'rows'->0->>'user_id' = u1::text, 'email search case-insensitive';
  v := public.admin_ratings_listeners('Иванова');
  ASSERT (v->>'total')::int = 1, 'name search';
  v := public.admin_ratings_listeners('_');
  ASSERT (v->>'total')::int = 1 AND v->'rows'->0->>'user_id' = u2::text, 'underscore is literal';
  v := public.admin_ratings_listeners('%');
  ASSERT (v->>'total')::int = 0, 'percent is literal';
  v := public.admin_ratings_listeners(u3::text);
  ASSERT (v->>'total')::int = 1 AND v->'rows'->0->>'user_id' = u3::text, 'exact uuid search';
  v := public.admin_ratings_listeners('norating');
  ASSERT (v->>'total')::int = 0, 'listener without ratings is not listed';

  -- Pagination caps.
  v := public.admin_ratings_listeners(NULL, 'last_activity', 'desc', 1, 1);
  ASSERT jsonb_array_length(v->'rows') = 1 AND v->'rows'->0->>'user_id' = u2::text, 'page 2 of size 1';
  v := public.admin_ratings_listeners(NULL, 'last_activity', 'desc', 100000, -5);
  ASSERT (v->>'limit')::int = 100 AND (v->>'offset')::int = 0, 'limit capped at 100, offset >= 0';

  -- Detail.
  d := public.admin_ratings_listener_detail(u1);
  ASSERT (d->>'found')::boolean, 'U1 found';
  ASSERT (d->>'rating_total')::int = 2 AND (d->>'event_total')::int = 3, 'U1 totals';
  ASSERT d->'ratings'->0->>'title' = 'Музыка Б', 'ratings newest first-rating first';
  ASSERT (d->'ratings'->0->>'stars')::int = 4, 'current stars after edit';
  ASSERT d->'ratings'->1->>'href' = '/practice/avtor-odin/praktika-a', 'product link';
  ASSERT (d->'ratings'->1->>'real_listened_ms')::bigint = 600000, 'listen ms';
  ASSERT d->'events'->0->>'event_kind' = 'changed' AND (d->'events'->0->>'old_stars')::int = 3, 'edit event';
  ASSERT (d->'signals'->>'shared_ip_other_accounts')::int = 1, 'U1 shares IP signal with 1 other account';
  ASSERT (d->'signals'->>'shared_device_other_accounts')::int = 1, 'U1 shares device signal with 1 other account';
  ASSERT (d->'signals'->>'fast_registration_paths')::int = 0, 'U1 no fast path';
  ASSERT d::text NOT LIKE '%v1:ip%' AND d::text NOT LIKE '%v1:dev%', 'detail must never expose HMAC';

  d := public.admin_ratings_listener_detail(u2);
  ASSERT (d->'signals'->>'fast_registration_paths')::int = 1, 'U2 registration→eligible→rating < 10 min';
  ASSERT d->'profile'->'full_name' = 'null'::jsonb, 'U2 no name';

  d := public.admin_ratings_listener_detail(u4);
  ASSERT (d->>'found')::boolean AND jsonb_array_length(d->'ratings') = 0, 'U4 found, no ratings';

  d := public.admin_ratings_listener_detail('dddddddd-0000-4000-8000-000000000000');
  ASSERT NOT (d->>'found')::boolean, 'unknown user not found';
  d := public.admin_ratings_listener_detail(NULL);
  ASSERT NOT (d->>'found')::boolean, 'null user not found';
END
$$;

-- Read-only: functions are STABLE and must not change rows.
DO $$
DECLARE n_before int; n_after int;
BEGIN
  SELECT count(*) INTO n_before FROM public.practice_ratings WHERE excluded_at IS NULL;
  PERFORM public.admin_ratings_listeners();
  PERFORM public.admin_ratings_listener_detail('c0000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO n_after FROM public.practice_ratings WHERE excluded_at IS NULL;
  ASSERT n_before = n_after, 'RPCs must not change ratings';
END
$$;

-- Privileges: anon / authenticated must not execute.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.admin_ratings_listeners();
    RAISE EXCEPTION 'authenticated must not execute admin_ratings_listeners';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_ratings_listener_detail('c0000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'authenticated must not execute admin_ratings_listener_detail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.admin_ratings_listeners();
    RAISE EXCEPTION 'anon must not execute admin_ratings_listeners';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  PERFORM public.admin_ratings_listeners();
  PERFORM public.admin_ratings_listener_detail('c0000000-0000-4000-8000-000000000001');
  RESET ROLE;
END
$$;

SELECT 'admin_ratings_listeners_smoke: PASS' AS result;

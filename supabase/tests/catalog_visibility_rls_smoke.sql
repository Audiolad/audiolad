-- Catalog visibility MVP: sync + selected_users RLS smoke.
-- Intended for isolated Postgres with prior migrations applied.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'practices'
      AND column_name = 'catalog_visibility'
  ) THEN
    RAISE EXCEPTION 'catalog_visibility column missing';
  END IF;
END;
$$;

-- Raw UUID add RPC is rate-limited like the exact lookup RPC.
DO $$
DECLARE
  v_add text;
BEGIN
  SELECT pg_get_functiondef(
    'public.add_practice_visibility_user(uuid,uuid)'::regprocedure
  )
  INTO v_add;

  IF v_add IS NULL
     OR v_add NOT LIKE '%pg_advisory_xact_lock%'
     OR v_add NOT LIKE '%practice_visibility_lookup_attempts%'
     OR v_add NOT LIKE '%v_recent >= 20%' THEN
    RAISE EXCEPTION 'add visibility user must rate-limit raw UUID probes';
  END IF;
END;
$$;

-- Public playlist_items must not disclose selected/unlisted practice UUIDs.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid)
  INTO v_def
  FROM pg_policy
  WHERE polname = 'Anyone can select public playlist items'
    AND polrelid = 'public.playlist_items'::regclass;

  IF v_def IS NULL
     OR v_def NOT LIKE '%catalog_visibility%'
     OR v_def NOT LIKE '%listed%' THEN
    RAISE EXCEPTION 'public playlist_items policy must be listed-only: %', v_def;
  END IF;
END;
$$;

-- Sync: listed flag cannot drift from catalog_visibility.
DO $$
DECLARE
  v_listed boolean;
BEGIN
  UPDATE public.practices
  SET catalog_visibility = 'unlisted'
  WHERE id IN (SELECT id FROM public.practices LIMIT 0);

  SELECT convalidated
  INTO v_listed
  FROM pg_constraint
  WHERE conname = 'practices_catalog_visibility_listed_sync_check';

  IF v_listed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'listed sync check is not validated';
  END IF;
END;
$$;

-- Public policy must not expose selected_users.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid)
  INTO v_def
  FROM pg_policy
  WHERE polname = 'Public can read published practices'
    AND polrelid = 'public.practices'::regclass;

  IF v_def IS NULL OR v_def NOT LIKE '%listed%' OR v_def LIKE '%selected_users%' THEN
    RAISE EXCEPTION 'public practices policy must be listed/unlisted only: %', v_def;
  END IF;
END;
$$;

-- Allowlist writes are not granted to authenticated clients.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.practice_visibility_users', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must not INSERT practice_visibility_users';
  END IF;

  IF has_table_privilege('authenticated', 'public.practice_visibility_users', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not UPDATE practice_visibility_users';
  END IF;

  IF has_table_privilege('authenticated', 'public.practice_visibility_users', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must not DELETE practice_visibility_users';
  END IF;
END;
$$;

-- RLS helper EXECUTE: authenticated yes, anon no.
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.is_practice_author_member(uuid,uuid)',
    'execute'
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'authenticated must EXECUTE is_practice_author_member';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.is_practice_author_member(uuid,uuid)',
    'execute'
  ) IS TRUE THEN
    RAISE EXCEPTION 'anon must not EXECUTE is_practice_author_member';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.can_current_viewer_read_practice(uuid)',
    'execute'
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'authenticated must EXECUTE can_current_viewer_read_practice';
  END IF;
END;
$$;

-- Featured public read must not be USING (true).
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid)
  INTO v_def
  FROM pg_policy
  WHERE polname = 'Public can read author featured products'
    AND polrelid = 'public.author_featured_products'::regclass;

  IF v_def IS NULL OR v_def NOT LIKE '%listed%' OR v_def LIKE '%USING (true)%' THEN
    RAISE EXCEPTION 'featured public policy must hide selected product_id: %', v_def;
  END IF;
END;
$$;

-- Public quick offer / promo helpers must not treat selected as public.
DO $$
DECLARE
  v_quick text;
  v_promo text;
  v_eligible text;
BEGIN
  SELECT pg_get_functiondef('public.get_public_quick_offer(text)'::regprocedure)
  INTO v_quick;

  IF v_quick IS NULL OR v_quick NOT LIKE '%catalog_visibility = ''listed''%' THEN
    RAISE EXCEPTION 'get_public_quick_offer must require listed visibility';
  END IF;

  SELECT pg_get_functiondef(
    'public.is_practice_promo_page_eligible(text,boolean,boolean,boolean,text)'::regprocedure
  )
  INTO v_eligible;

  IF v_eligible IS NULL OR v_eligible NOT LIKE '%selected_users%' THEN
    RAISE EXCEPTION 'promo eligibility must mention selected_users exclusion';
  END IF;

  SELECT pg_get_functiondef('public.get_public_promo_page(text,text)'::regprocedure)
  INTO v_promo;

  IF v_promo IS NULL OR v_promo NOT LIKE '%can_current_viewer_read_practice%' THEN
    RAISE EXCEPTION 'get_public_promo_page must be viewer-aware for selected_users';
  END IF;
END;
$$;

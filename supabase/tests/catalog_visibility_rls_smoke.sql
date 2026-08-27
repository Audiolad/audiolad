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

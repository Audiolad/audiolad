-- Grant persistence after allowlist removal — copy/isolated DB only.
--
-- Run through scripts/catalog-visibility-grant-persistence.mjs. This fixture
-- deliberately has no psql :variables inside DO $$ blocks: psql does not
-- interpolate variable syntax in dollar-quoted PL/pgSQL bodies.
--
-- The runner requires a privileged connection because it inserts the admin
-- entitlement before switching to the authenticated role for RLS assertions.
\set ON_ERROR_STOP on
\echo before_grant
BEGIN;

-- Preconditions: an untouched listed product, expected accounts, no preexisting
-- grant/allowlist state, and the non-recursive allowlist author policy (204).
DO $$
DECLARE
  v_policy text;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.practices
    WHERE id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
      AND author_id = '3f840bf3-e5e4-4d42-a4ad-db7010861e1d'::uuid
      AND catalog_visibility = 'listed'
      AND is_catalog_listed IS TRUE
  ) THEN
    RAISE EXCEPTION 'product is missing, owned by another author, or not listed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '3f840bf3-e5e4-4d42-a4ad-db7010861e1d'::uuid
  ) OR NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid
  ) THEN
    RAISE EXCEPTION 'author or test user is missing from auth.users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_practices
    WHERE user_id = '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid
      AND practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
  ) OR EXISTS (
    SELECT 1 FROM public.practice_visibility_users
    WHERE user_id = '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid
      AND practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
  ) THEN
    RAISE EXCEPTION 'test target is dirty: existing grant or allowlist row';
  END IF;

  SELECT pg_get_expr(polqual, polrelid)
  INTO v_policy
  FROM pg_policy
  WHERE polname = 'Author members can view practice visibility rows'
    AND polrelid = 'public.practice_visibility_users'::regclass;

  IF v_policy IS NULL OR v_policy NOT LIKE '%is_practice_author_member%' THEN
    RAISE EXCEPTION 'allowlist author policy is not the 204 DEFINER helper policy';
  END IF;
END;
$$;

UPDATE public.practices
SET catalog_visibility = 'selected_users'
WHERE id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.practices
    WHERE id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
      AND catalog_visibility = 'selected_users'
      AND is_catalog_listed IS FALSE
  ) THEN
    RAISE EXCEPTION 'selected_users sync did not set is_catalog_listed=false';
  END IF;
END;
$$;

INSERT INTO public.practice_visibility_users (practice_id, user_id, created_by)
VALUES (
  '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid,
  '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid,
  '3f840bf3-e5e4-4d42-a4ad-db7010861e1d'::uuid
);

-- Allowlisted authenticated user can read product and its public child metadata.
SELECT set_config(
  'request.jwt.claim.sub',
  '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"0a7c0b20-2057-4503-a685-b7ed9ed1bd3b","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
  v_can_read boolean;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.practices
  WHERE id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'before grant: selected product unreadable'; END IF;

  SELECT count(*) INTO v_count
  FROM public.audio_items
  WHERE practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid;
  IF v_count <> 10 THEN RAISE EXCEPTION 'before grant: expected 10 audio items, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.practice_topics
  WHERE practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid;
  IF v_count <> 3 THEN RAISE EXCEPTION 'before grant: expected 3 topics, got %', v_count; END IF;

  SELECT public.can_current_viewer_read_practice(
    '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
  ) INTO v_can_read;
  IF v_can_read IS DISTINCT FROM true THEN RAISE EXCEPTION 'before grant: helper denied allowlisted user'; END IF;
END;
$$;

RESET ROLE;

-- Privileged connection creates an entitlement; authenticated clients never do.
INSERT INTO public.user_practices (user_id, practice_id, access_source)
VALUES (
  '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid,
  '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid,
  'admin'
);

\echo after_grant
DELETE FROM public.practice_visibility_users
WHERE practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
  AND user_id = '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid;

\echo after_allowlist_removal
SELECT set_config(
  'request.jwt.claim.sub',
  '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"0a7c0b20-2057-4503-a685-b7ed9ed1bd3b","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
  v_can_read boolean;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.practices
  WHERE id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'after removal: entitled product unreadable'; END IF;

  SELECT count(*) INTO v_count
  FROM public.audio_items
  WHERE practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid;
  IF v_count <> 10 THEN RAISE EXCEPTION 'after removal: expected 10 audio items, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.practice_topics
  WHERE practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid;
  IF v_count <> 3 THEN RAISE EXCEPTION 'after removal: expected 3 topics, got %', v_count; END IF;

  SELECT public.can_current_viewer_read_practice(
    '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
  ) INTO v_can_read;
  IF v_can_read IS DISTINCT FROM true THEN RAISE EXCEPTION 'after removal: helper denied entitlement'; END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.practice_visibility_users
    WHERE practice_id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
      AND user_id = '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid
  ) THEN RAISE EXCEPTION 'after removal: allowlist row remains'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.author_members
    WHERE author_id = '3f840bf3-e5e4-4d42-a4ad-db7010861e1d'::uuid
      AND user_id = '0a7c0b20-2057-4503-a685-b7ed9ed1bd3b'::uuid
  ) THEN RAISE EXCEPTION 'after removal: test user is an author member'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.practices
    WHERE id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
      AND catalog_visibility = 'selected_users'
      AND is_catalog_listed IS FALSE
  ) THEN RAISE EXCEPTION 'after removal: product visibility changed'; END IF;
END;
$$;

ROLLBACK;

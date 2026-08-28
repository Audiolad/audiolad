-- Read-only cleanup verification for catalog_visibility_grant_persistence_copy.
-- Executed in a new connection after the transaction fixture ends or errors.
\set ON_ERROR_STOP on
\echo after_rollback

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.practices
    WHERE id = '5fb00fbb-d66b-4c95-b993-04d4344b8d0b'::uuid
      AND catalog_visibility = 'listed'
      AND is_catalog_listed IS TRUE
  ) THEN
    RAISE EXCEPTION 'rollback verification failed: product is not listed';
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
    RAISE EXCEPTION 'rollback verification failed: grant or allowlist row remains';
  END IF;
END;
$$;

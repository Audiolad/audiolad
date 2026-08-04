BEGIN;

-- ---------------------------------------------------------------------------
-- remove_library_practice
--
-- Removes a user-initiated library save (free_claim only).
-- Never deletes purchase/gift/subscription/program/admin/starter entitlements.
-- user_id always taken from auth.uid(); client cannot target another user.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_library_practice(p_practice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_row public.user_practices%ROWTYPE;
  v_practice_slug text;
  v_deleted_count integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_id IS NULL THEN
    RAISE EXCEPTION 'practice_id_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT up.*
  INTO v_row
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_library'
      USING ERRCODE = 'P0002';
  END IF;

  -- v1: only manual free_claim saves are removable.
  -- starter is a platform signup grant, not a user save — never delete here.
  IF v_row.access_source IS DISTINCT FROM 'free_claim' THEN
    RAISE EXCEPTION 'not_removable'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.slug
  INTO v_practice_slug
  FROM public.practices AS p
  WHERE p.id = p_practice_id;

  DELETE FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = p_practice_id
    AND up.access_source = 'free_claim';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION 'not_removable'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'practice_id', p_practice_id,
    'practice_slug', COALESCE(v_practice_slug, ''),
    'removed', true,
    'in_library', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_library_practice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_library_practice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_library_practice(uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_library_practice(uuid) IS
  'audiolad:library-remove:v1; deletes own free_claim library save only; auth.uid(); never removes purchase/gift/subscription/program/admin/starter; does not touch playlists/progress';

DO $$
BEGIN
  IF to_regprocedure('public.remove_library_practice(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: remove_library_practice was not created';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.remove_library_practice(uuid)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must have EXECUTE on remove_library_practice';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.remove_library_practice(uuid)',
    'EXECUTE'
  ) IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not have EXECUTE on remove_library_practice';
  END IF;
END;
$$;

COMMIT;

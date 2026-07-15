BEGIN;

-- ---------------------------------------------------------------------------
-- claim_free_practice
--
-- Idempotent library claim for published catalog-listed free practices.
-- Uses auth.uid(); does not downgrade existing access_source values.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.claim_free_practice(p_practice_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_inserted_count integer;
  v_access_source text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_slug IS NULL OR btrim(p_practice_slug) = '' THEN
    RAISE EXCEPTION 'practice_slug_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.slug = btrim(p_practice_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_catalog_listed IS NOT TRUE THEN
    RAISE EXCEPTION 'practice_not_listed'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_free IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'practice_not_free'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.price IS NOT NULL AND v_practice.price > 0 THEN
    RAISE EXCEPTION 'practice_not_free'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_user_id, v_practice.id, 'free_claim')
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT up.access_source
  INTO v_access_source
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = v_practice.id
    AND (up.expires_at IS NULL OR up.expires_at > now());

  IF v_access_source IS NULL THEN
    RAISE EXCEPTION 'library_row_missing'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'practice_id', v_practice.id,
    'practice_slug', v_practice.slug,
    'inserted', v_inserted_count = 1,
    'access_source', v_access_source,
    'in_library', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_free_practice(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_free_practice(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_free_practice(text) TO authenticated;

COMMENT ON FUNCTION public.claim_free_practice(text) IS
  'audiolad:library-claim:v1; grants free_claim for published catalog-listed free zero-price practices; user_id from auth.uid(); idempotent via user_practices unique; never downgrades existing access_source';

-- ---------------------------------------------------------------------------
-- Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.claim_free_practice(text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: claim_free_practice was not created';
  END IF;

  IF has_function_privilege('authenticated', 'public.claim_free_practice(text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: authenticated must have EXECUTE on claim_free_practice';
  END IF;

  IF has_function_privilege('anon', 'public.claim_free_practice(text)', 'EXECUTE') IS TRUE THEN
    RAISE EXCEPTION 'Post-check failed: anon must not have EXECUTE on claim_free_practice';
  END IF;
END;
$$;

COMMIT;

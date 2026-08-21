BEGIN;

-- Replace single-arg claim with id + slug aware version

DROP FUNCTION IF EXISTS public.claim_promo_practice(text);

CREATE OR REPLACE FUNCTION public.claim_promo_practice(
  p_practice_slug text DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL
)
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

  IF p_practice_id IS NOT NULL THEN
    SELECT p.*
    INTO v_practice
    FROM public.practices AS p
    WHERE p.id = p_practice_id;
  ELSIF p_practice_slug IS NOT NULL AND btrim(p_practice_slug) <> '' THEN
    SELECT p.*
    INTO v_practice
    FROM public.practices AS p
    WHERE p.slug = btrim(p_practice_slug);
  ELSE
    RAISE EXCEPTION 'practice_identifier_required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_practice.guest_access_enabled IS TRUE
    OR (
      v_practice.is_free IS TRUE
      AND v_practice.is_catalog_listed IS NOT FALSE
    )
  ) THEN
    RAISE EXCEPTION 'practice_not_promo_eligible'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_practices (user_id, practice_id, access_source, metadata)
  VALUES (
    v_user_id,
    v_practice.id,
    CASE
      WHEN v_practice.is_free IS TRUE THEN 'free_claim'
      ELSE 'gift'
    END,
    jsonb_build_object('promo_claim', true)
  )
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

REVOKE ALL ON FUNCTION public.claim_promo_practice(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_promo_practice(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_promo_practice(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.claim_promo_practice(text, uuid) IS
  'audiolad:promo-claim:v2; claim by practice_id or slug; guest_access_enabled or free catalog-listed; idempotent';

COMMIT;

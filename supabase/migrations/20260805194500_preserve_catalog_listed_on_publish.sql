-- Preserve author-selected visibility (is_catalog_listed) on publish/approve.
-- Previously approve_and_publish_practice forced listed=true for non-starters,
-- and publish_audio_product forced listed=true always — wiping «По ссылке».

CREATE OR REPLACE FUNCTION public.publish_audio_product(
  p_practice_id uuid,
  p_published_at timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_access text;
  v_bypass boolean;
  v_first_path text;
  v_seconds bigint;
  v_minutes integer;
  v_from_status text;
  v_from_moderation text;
  v_starter boolean;
  v_catalog_listed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF v_practice.status NOT IN ('draft', 'unpublished', 'published') THEN
    RAISE EXCEPTION 'invalid_status_for_publish' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members
    WHERE author_id = v_practice.author_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT access_status, COALESCE(can_bypass_product_moderation, false)
  INTO v_access, v_bypass
  FROM public.authors
  WHERE id = v_practice.author_id;

  IF NOT public.author_access_allows_content_mutations(v_access) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked' USING ERRCODE = '42501';
  END IF;
  IF NOT public.author_access_allows_paid_products(v_access)
     AND (NOT COALESCE(v_practice.is_free, false) OR COALESCE(v_practice.price, 0) > 0) THEN
    RAISE EXCEPTION 'paid_products_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF v_practice.moderation_status IS DISTINCT FROM 'approved' AND NOT v_bypass THEN
    RAISE EXCEPTION 'moderation_required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_practice_moderation_ready(p_practice_id);

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  SELECT audio_path INTO v_first_path
  FROM public.audio_items
  WHERE practice_id = p_practice_id
    AND NULLIF(btrim(audio_path), '') IS NOT NULL
  ORDER BY position
  LIMIT 1;

  SELECT COALESCE(sum(duration_seconds), 0) INTO v_seconds
  FROM public.audio_items
  WHERE practice_id = p_practice_id
    AND NULLIF(btrim(audio_path), '') IS NOT NULL;

  v_minutes := CASE
    WHEN v_seconds > 0 THEN GREATEST(1, ceil(v_seconds::numeric / 60)::integer)
    ELSE NULL
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.starter_practices
    WHERE practice_id = p_practice_id
      AND is_active
  ) INTO v_starter;

  -- Keep author choice; starters stay unlisted.
  v_catalog_listed := CASE
    WHEN v_starter THEN false
    ELSE COALESCE(v_practice.is_catalog_listed, true)
  END;

  PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
  PERFORM set_config('audiolad.allow_moderated_content_update', 'on', true);

  UPDATE public.audio_items
  SET status = 'published', updated_at = now()
  WHERE practice_id = p_practice_id;

  UPDATE public.practices
  SET
    status = 'published',
    is_catalog_listed = v_catalog_listed,
    published_at = COALESCE(published_at, p_published_at),
    audio_url = v_first_path,
    duration_minutes = v_minutes,
    updated_at = now()
  WHERE id = p_practice_id
  RETURNING * INTO v_practice;

  IF v_from_status = 'unpublished' AND v_from_moderation = 'approved' THEN
    PERFORM public.log_practice_moderation_event(
      v_practice.id,
      v_practice.author_id,
      'republished',
      'unpublished',
      'published',
      'approved',
      'approved',
      NULL,
      auth.uid(),
      'author',
      v_practice.moderation_attempt,
      jsonb_build_object('source', 'publish_audio_product')
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.publish_audio_product(uuid, timestamptz) IS
  'audiolad:publish-audio-product:v9; preserves is_catalog_listed; starters stay unlisted';

CREATE OR REPLACE FUNCTION public.approve_and_publish_practice(p_practice_id uuid)
RETURNS public.practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_from_status text;
  v_from_moderation text;
  v_first_path text;
  v_seconds bigint;
  v_minutes integer;
  v_starter boolean;
  v_catalog_listed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF v_practice.moderation_status IS DISTINCT FROM 'submitted'
     OR v_practice.status NOT IN ('draft', 'unpublished') THEN
    RAISE EXCEPTION 'moderation_state_changed' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_practice_moderation_ready(p_practice_id);

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  SELECT audio_path INTO v_first_path
  FROM public.audio_items
  WHERE practice_id = p_practice_id
    AND NULLIF(btrim(audio_path), '') IS NOT NULL
  ORDER BY position
  LIMIT 1;

  SELECT COALESCE(sum(duration_seconds), 0) INTO v_seconds
  FROM public.audio_items
  WHERE practice_id = p_practice_id
    AND NULLIF(btrim(audio_path), '') IS NOT NULL;

  v_minutes := CASE
    WHEN v_seconds > 0 THEN GREATEST(1, ceil(v_seconds::numeric / 60)::integer)
    ELSE NULL
  END;

  SELECT EXISTS (
    SELECT 1
    FROM public.starter_practices
    WHERE practice_id = p_practice_id
      AND is_active
  ) INTO v_starter;

  -- Preserve author visibility choice; starters remain unlisted.
  v_catalog_listed := CASE
    WHEN v_starter THEN false
    ELSE COALESCE(v_practice.is_catalog_listed, true)
  END;

  PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);
  PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
  PERFORM set_config('audiolad.allow_moderated_content_update', 'on', true);

  UPDATE public.audio_items
  SET status = 'published', updated_at = now()
  WHERE practice_id = p_practice_id;

  UPDATE public.practices
  SET
    moderation_status = 'approved',
    moderation_review_comment = NULL,
    status = 'published',
    is_catalog_listed = v_catalog_listed,
    published_at = COALESCE(published_at, now()),
    audio_url = v_first_path,
    duration_minutes = v_minutes,
    updated_at = now()
  WHERE id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'approved_and_published',
    v_from_status,
    'published',
    v_from_moderation,
    'approved',
    NULL,
    auth.uid(),
    'admin',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'approve_and_publish_practice')
  );

  RETURN v_practice;
END;
$$;

COMMENT ON FUNCTION public.approve_and_publish_practice(uuid) IS
  'audiolad:approve-and-publish-practice:v2; preserves is_catalog_listed; starters stay unlisted';

REVOKE ALL ON FUNCTION public.publish_audio_product(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_audio_product(uuid, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_and_publish_practice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_and_publish_practice(uuid) TO authenticated;

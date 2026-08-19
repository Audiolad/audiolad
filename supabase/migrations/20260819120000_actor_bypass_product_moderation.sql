-- Staff (author_products.moderate) can publish/edit their own products
-- without the author-workspace can_bypass_product_moderation flag.
-- Does not seed any author UUID. Regular authors stay on the queue.

BEGIN;

CREATE OR REPLACE FUNCTION public.actor_can_bypass_product_moderation(
  p_author_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.author_can_bypass_product_moderation(p_author_id)
      OR public.has_platform_permission(auth.uid(), 'author_products.moderate');
$$;

REVOKE ALL ON FUNCTION public.actor_can_bypass_product_moderation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actor_can_bypass_product_moderation(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.actor_can_bypass_product_moderation(uuid) IS
  'audiolad:actor-bypass-product-moderation:v1; author flag OR acting user has author_products.moderate';

-- Latest publish_audio_product is v9 (preserve catalog listed). Keep that
-- behavior and switch the bypass check to the actor-aware helper.
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

  SELECT access_status
  INTO v_access
  FROM public.authors
  WHERE id = v_practice.author_id;

  v_bypass := public.actor_can_bypass_product_moderation(v_practice.author_id);

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
  'audiolad:publish-audio-product:v10; preserves is_catalog_listed; actor or author bypass';

REVOKE ALL ON FUNCTION public.publish_audio_product(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_audio_product(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_practices_publication_moderation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allow_publish text := current_setting('audiolad.allow_practice_publish', true);
  v_allow_moderation text := current_setting('audiolad.allow_practice_moderation_update', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND v_allow_publish IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'publication_requires_rpc'
        USING ERRCODE = '42501', DETAIL = 'Published products must be created through a trusted publication RPC.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     AND v_allow_moderation IS DISTINCT FROM 'on'
     AND NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'moderation_status_locked'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    IF v_allow_publish IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'publication_requires_rpc' USING ERRCODE = '42501';
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.moderation_status IS DISTINCT FROM 'approved'
       AND NOT public.actor_can_bypass_product_moderation(NEW.author_id) THEN
      RAISE EXCEPTION 'moderation_required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_audio_items_published_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid := COALESCE(NEW.practice_id, OLD.practice_id);
  v_status text;
  v_moderation_status text;
  v_author_id uuid;
  v_error text;
BEGIN
  SELECT status, moderation_status, author_id
  INTO v_status, v_moderation_status, v_author_id
  FROM public.practices WHERE id = v_practice_id;

  -- Staff / author-flag bypass may add or update tracks on a live product
  -- without unpublishing. Submitted queue items stay locked.
  IF public.actor_can_bypass_product_moderation(v_author_id)
     AND v_moderation_status IS DISTINCT FROM 'submitted' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF current_setting('audiolad.allow_moderated_content_update', true) = 'on'
     OR current_setting('audiolad.allow_practice_publish', true) = 'on'
     OR NOT (
       v_status = 'published'
       OR v_moderation_status = 'submitted'
       OR (v_status = 'unpublished' AND v_moderation_status = 'approved')
     ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  v_error := CASE
    WHEN v_status = 'published' THEN 'published_content_immutable'
    WHEN v_moderation_status = 'submitted' THEN 'practice_under_moderation'
    ELSE 'approved_content_locked'
  END;
  RAISE EXCEPTION '%', v_error
    USING ERRCODE = 'P0001',
      DETAIL = 'Withdraw or enter editing mode before changing audio.';
END;
$$;

COMMIT;

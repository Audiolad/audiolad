BEGIN;

-- ---------------------------------------------------------------------------
-- Author product moderation MVP — gates and RPCs (part 2/2)
--
-- Source contracts: tip 15ec4b11 migrations 20260730141000–20260730145000,
-- adapted onto current main/prod publish_audio_product semantics
-- (commercial access checks + topics readiness via assert_practice_moderation_ready).
--
-- Does NOT port email/outbox (20260730146000).
-- Does NOT alter sale-lock triggers or canonical sales.
-- RPC returns: practices rows (or void for publish_audio_product), not jsonb wrappers.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Bypass helper
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.author_can_bypass_product_moderation(
  p_author_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT a.can_bypass_product_moderation
      FROM public.authors AS a
      WHERE a.id = p_author_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.author_can_bypass_product_moderation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.author_can_bypass_product_moderation(uuid)
  TO authenticated, service_role;

-- ===========================================================================
-- Event log + withdraw
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.log_practice_moderation_event(
  p_practice_id uuid,
  p_author_id uuid,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_from_moderation_status text,
  p_to_moderation_status text,
  p_comment text,
  p_actor_user_id uuid,
  p_actor_type text,
  p_attempt integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.practice_moderation_events (
    practice_id,
    author_id,
    action,
    from_status,
    to_status,
    from_moderation_status,
    to_moderation_status,
    comment,
    actor_user_id,
    actor_type,
    attempt,
    metadata,
    created_at
  )
  VALUES (
    p_practice_id,
    p_author_id,
    p_action,
    p_from_status,
    p_to_status,
    p_from_moderation_status,
    p_to_moderation_status,
    NULLIF(btrim(COALESCE(p_comment, '')), ''),
    p_actor_user_id,
    p_actor_type,
    p_attempt,
    COALESCE(p_metadata, '{}'::jsonb),
    clock_timestamp()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_practice_moderation_event(
  uuid, uuid, text, text, text, text, text, text, uuid, text, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_practice_moderation_event(
  uuid, uuid, text, text, text, text, text, text, uuid, text, integer, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.withdraw_practice_from_moderation(
  p_practice_id uuid
)
RETURNS public.practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_from_moderation text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = v_practice.author_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_practice.moderation_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'invalid_moderation_status_for_withdraw'
      USING ERRCODE = 'P0001';
  END IF;

  v_from_moderation := v_practice.moderation_status;

  PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);

  UPDATE public.practices AS p
  SET
    moderation_status = 'not_submitted',
    moderation_submitted_at = NULL,
    updated_at = now()
  WHERE p.id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'submission_withdrawn',
    v_practice.status,
    v_practice.status,
    v_from_moderation,
    'not_submitted',
    NULL,
    auth.uid(),
    'author',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'withdraw_practice_from_moderation')
  );

  RETURN v_practice;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_practice_from_moderation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_practice_from_moderation(uuid) TO authenticated;

-- ===========================================================================
-- Admin request changes
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.request_practice_changes(
  p_practice_id uuid,
  p_comment text
)
RETURNS public.practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_from_status text;
  v_from_moderation text;
  v_comment text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_platform_permission(auth.uid(), 'author_products.moderate') THEN
    RAISE EXCEPTION 'permission_denied'
      USING ERRCODE = '42501';
  END IF;

  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');

  IF v_comment IS NULL OR char_length(v_comment) < 10 THEN
    RAISE EXCEPTION 'moderation_comment_required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_comment) > 3000 THEN
    RAISE EXCEPTION 'moderation_comment_too_long'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_practice.moderation_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'moderation_state_changed'
      USING ERRCODE = 'P0001',
        DETAIL = 'Product is no longer awaiting moderation.';
  END IF;

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);

  UPDATE public.practices AS p
  SET
    moderation_status = 'changes_requested',
    moderation_review_comment = v_comment,
    moderation_submitted_at = NULL,
    updated_at = now()
  WHERE p.id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'changes_requested',
    v_from_status,
    v_practice.status,
    v_from_moderation,
    'changes_requested',
    v_comment,
    auth.uid(),
    'admin',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'request_practice_changes')
  );

  RETURN v_practice;
END;
$$;

REVOKE ALL ON FUNCTION public.request_practice_changes(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_practice_changes(uuid, text) TO authenticated;

-- ===========================================================================
-- Lifecycle: paid-purchase helper, unpublish, start editing
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.practice_has_paid_purchase(
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_practice_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders AS o
      WHERE o.practice_id = p_practice_id
        AND o.status = 'paid'
    );
$$;

REVOKE ALL ON FUNCTION public.practice_has_paid_purchase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_has_paid_purchase(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unpublish_approved_practice(
  p_practice_id uuid
)
RETURNS public.practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_from_status text;
  v_from_moderation text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = v_practice.author_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'permission_denied'
      USING ERRCODE = '42501';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'lifecycle_state_changed'
      USING ERRCODE = 'P0001',
        DETAIL = 'Product is not published.';
  END IF;

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  UPDATE public.practices AS p
  SET
    status = 'unpublished',
    is_catalog_listed = false,
    updated_at = now()
  WHERE p.id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'unpublished',
    v_from_status,
    'unpublished',
    v_from_moderation,
    v_practice.moderation_status,
    NULL,
    auth.uid(),
    'author',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'unpublish_approved_practice')
  );

  RETURN v_practice;
END;
$$;

REVOKE ALL ON FUNCTION public.unpublish_approved_practice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpublish_approved_practice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unpublish_audio_product(
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.unpublish_approved_practice(p_practice_id);
END;
$$;

COMMENT ON FUNCTION public.unpublish_audio_product(uuid) IS
  'audiolad:unpublish-audio-product:v3; wraps unpublish_approved_practice';

CREATE OR REPLACE FUNCTION public.start_practice_editing(
  p_practice_id uuid
)
RETURNS public.practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_from_status text;
  v_from_moderation text;
  v_can_bypass boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = v_practice.author_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'permission_denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(a.can_bypass_product_moderation, false)
  INTO v_can_bypass
  FROM public.authors AS a
  WHERE a.id = v_practice.author_id;

  IF NOT (
    (
      v_practice.status = 'published'
      AND v_practice.moderation_status = 'approved'
    )
    OR (
      v_practice.status = 'unpublished'
      AND v_practice.moderation_status = 'approved'
    )
    OR (
      v_practice.status = 'published'
      AND v_can_bypass
    )
  ) THEN
    RAISE EXCEPTION 'lifecycle_state_changed'
      USING ERRCODE = 'P0001',
        DETAIL = 'Editing mode requires published/unpublished approved (or published bypass).';
  END IF;

  v_from_status := v_practice.status;
  v_from_moderation := v_practice.moderation_status;

  PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);

  UPDATE public.practices AS p
  SET
    status = 'unpublished',
    is_catalog_listed = false,
    moderation_status = 'not_submitted',
    moderation_review_comment = NULL,
    moderation_submitted_at = NULL,
    updated_at = now()
  WHERE p.id = p_practice_id
  RETURNING * INTO v_practice;

  PERFORM public.log_practice_moderation_event(
    v_practice.id,
    v_practice.author_id,
    'edit_mode_started',
    v_from_status,
    'unpublished',
    v_from_moderation,
    'not_submitted',
    NULL,
    auth.uid(),
    'author',
    v_practice.moderation_attempt,
    jsonb_build_object('source', 'start_practice_editing')
  );

  RETURN v_practice;
END;
$$;

REVOKE ALL ON FUNCTION public.start_practice_editing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_practice_editing(uuid) TO authenticated;

-- ===========================================================================
-- Hardened readiness, publication/content guards, submit, soft-delete,
-- publish (moderation-gated), approve-and-publish
-- (from tip 20260730145000; publish keeps commercial access checks)
-- ===========================================================================

-- Security hardening for the product moderation lifecycle.
-- This migration intentionally supersedes guards/RPCs from 20260730141000-144000.

CREATE OR REPLACE FUNCTION public.assert_practice_moderation_ready(p_practice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_access_status text;
BEGIN
  SELECT * INTO v_practice
  FROM public.practices
  WHERE id = p_practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  SELECT access_status INTO v_access_status
  FROM public.authors
  WHERE id = v_practice.author_id;
  IF NOT FOUND OR NOT public.author_access_allows_content_mutations(v_access_status) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_title';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.description, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_description';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.slug, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'slug_required';
  END IF;
  IF v_practice.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_slug';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.cover_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_cover';
  END IF;
  IF COALESCE(v_practice.currency, '') <> 'RUB' THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_currency';
  END IF;
  IF v_practice.product_kind NOT IN ('practice', 'music') THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_product_kind';
  END IF;
  IF NULLIF(btrim(COALESCE(v_practice.format, '')), '') IS NULL
     OR (v_practice.product_kind = 'practice' AND btrim(v_practice.format) = 'Другое')
     OR (v_practice.product_kind = 'music' AND btrim(v_practice.format) <> 'Музыка') THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_format';
  END IF;
  IF v_practice.product_kind = 'music'
     AND v_practice.music_usage_permission NOT IN ('listen_only', 'platform_reuse_allowed') THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'music_permission_required';
  END IF;
  IF (COALESCE(v_practice.is_free, false) AND COALESCE(v_practice.price, 0) <> 0)
     OR (NOT COALESCE(v_practice.is_free, false) AND COALESCE(v_practice.price, 0) <= 0) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'invalid_price';
  END IF;
  IF NOT COALESCE(v_practice.is_free, false)
     AND NOT public.author_access_allows_paid_products(v_access_status) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'commercial_eligibility_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.practice_topics pt
    JOIN public.topics t ON t.id = pt.topic_id
    WHERE pt.practice_id = p_practice_id AND t.is_active
  ) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'topic_min_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audio_items WHERE practice_id = p_practice_id) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'missing_audio';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.audio_items
    WHERE practice_id = p_practice_id
      AND (
        NULLIF(btrim(COALESCE(title, '')), '') IS NULL
        OR NULLIF(btrim(COALESCE(audio_path, '')), '') IS NULL
        OR COALESCE(duration_seconds, 0) <= 0
      )
  ) THEN
    RAISE EXCEPTION 'product_not_ready' USING ERRCODE = '22023', DETAIL = 'incomplete_audio';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_practice_moderation_ready(uuid)
  FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.assert_practice_moderation_ready(uuid) IS
  'audiolad:internal-moderation-readiness:v1; SECURITY DEFINER helper for trusted lifecycle RPCs only';

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
       AND NOT public.author_can_bypass_product_moderation(NEW.author_id) THEN
      RAISE EXCEPTION 'moderation_required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practices_publication_moderation_trigger ON public.practices;
CREATE TRIGGER guard_practices_publication_moderation_trigger
  BEFORE INSERT OR UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practices_publication_moderation();

CREATE OR REPLACE FUNCTION public.guard_practices_moderated_content_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_error text;
BEGIN
  IF current_setting('audiolad.allow_moderated_content_update', true) = 'on'
     OR NOT (
       OLD.moderation_status = 'submitted'
       OR (OLD.status = 'unpublished' AND OLD.moderation_status = 'approved')
     ) THEN
    RETURN NEW;
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.subtitle IS DISTINCT FROM OLD.subtitle
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.format IS DISTINCT FROM OLD.format
     OR NEW.product_kind IS DISTINCT FROM OLD.product_kind
     OR NEW.music_usage_permission IS DISTINCT FROM OLD.music_usage_permission
     OR NEW.price IS DISTINCT FROM OLD.price
     OR NEW.is_free IS DISTINCT FROM OLD.is_free
     OR NEW.cover_url IS DISTINCT FROM OLD.cover_url
     OR NEW.cover_image IS DISTINCT FROM OLD.cover_image
     OR NEW.use_shared_cover IS DISTINCT FROM OLD.use_shared_cover
     OR NEW.listening_notice_enabled IS DISTINCT FROM OLD.listening_notice_enabled
     OR NEW.listening_notice_title IS DISTINCT FROM OLD.listening_notice_title
     OR NEW.listening_notice_text IS DISTINCT FROM OLD.listening_notice_text
     OR NEW.guest_access_enabled IS DISTINCT FROM OLD.guest_access_enabled
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.audio_url IS DISTINCT FROM OLD.audio_url
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
    v_error := CASE
      WHEN OLD.moderation_status = 'submitted' THEN 'practice_under_moderation'
      ELSE 'approved_content_locked'
    END;
    RAISE EXCEPTION '%', v_error
      USING ERRCODE = 'P0001',
        DETAIL = 'Withdraw or enter editing mode before changing moderated content.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practices_moderated_content_immutable_trigger ON public.practices;
CREATE TRIGGER guard_practices_moderated_content_immutable_trigger
  BEFORE UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practices_moderated_content_immutable();

CREATE OR REPLACE FUNCTION public.guard_audio_items_published_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid := COALESCE(NEW.practice_id, OLD.practice_id);
  v_status text;
  v_moderation_status text;
  v_error text;
BEGIN
  SELECT status, moderation_status INTO v_status, v_moderation_status
  FROM public.practices WHERE id = v_practice_id;
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

CREATE OR REPLACE FUNCTION public.guard_practice_topics_moderated_content_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid := COALESCE(NEW.practice_id, OLD.practice_id);
  v_status text;
  v_moderation_status text;
  v_error text;
BEGIN
  SELECT status, moderation_status INTO v_status, v_moderation_status
  FROM public.practices WHERE id = v_practice_id;
  IF current_setting('audiolad.allow_moderated_content_update', true) = 'on'
     OR NOT (
       v_moderation_status = 'submitted'
       OR (v_status = 'unpublished' AND v_moderation_status = 'approved')
     ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  v_error := CASE
    WHEN v_moderation_status = 'submitted' THEN 'practice_under_moderation'
    ELSE 'approved_content_locked'
  END;
  RAISE EXCEPTION '%', v_error
    USING ERRCODE = 'P0001',
      DETAIL = 'Withdraw or enter editing mode before changing topics.';
END;
$$;

DROP TRIGGER IF EXISTS guard_practice_topics_moderated_content_immutable_trigger ON public.practice_topics;
CREATE TRIGGER guard_practice_topics_moderated_content_immutable_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.practice_topics
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_topics_moderated_content_immutable();

CREATE OR REPLACE FUNCTION public.guard_practices_deletion_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
      OR NEW.deletion_reason IS DISTINCT FROM OLD.deletion_reason)
     AND current_setting('audiolad.allow_practice_soft_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'deletion_metadata_locked'
      USING ERRCODE = '42501',
        DETAIL = 'Deletion metadata may only be changed by soft_delete_practice.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practices_deletion_metadata_trigger ON public.practices;
CREATE TRIGGER guard_practices_deletion_metadata_trigger
  BEFORE UPDATE ON public.practices
  FOR EACH ROW EXECUTE FUNCTION public.guard_practices_deletion_metadata();

CREATE OR REPLACE FUNCTION public.submit_practice_for_moderation(p_practice_id uuid)
RETURNS public.practices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_practice public.practices%ROWTYPE; v_access_status text; v_from text; v_attempt integer; v_action text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_practice FROM public.practices WHERE id = p_practice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_practice.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_members WHERE author_id = v_practice.author_id AND user_id = auth.uid() AND role IN ('owner','editor')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT access_status INTO v_access_status FROM public.authors WHERE id = v_practice.author_id;
  IF NOT public.author_access_allows_content_mutations(v_access_status) THEN RAISE EXCEPTION 'author_content_mutations_blocked' USING ERRCODE = '42501'; END IF;
  IF v_practice.status NOT IN ('draft','unpublished') THEN RAISE EXCEPTION 'invalid_status_for_submit' USING ERRCODE = 'P0001'; END IF;
  IF v_practice.moderation_status NOT IN ('not_submitted','changes_requested') THEN RAISE EXCEPTION 'invalid_moderation_status_for_submit' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.assert_practice_moderation_ready(p_practice_id);
  v_from := v_practice.moderation_status; v_attempt := COALESCE(v_practice.moderation_attempt, 0) + 1;
  v_action := CASE WHEN v_attempt = 1 THEN 'submitted' ELSE 'resubmitted' END;
  PERFORM set_config('audiolad.allow_practice_moderation_update', 'on', true);
  UPDATE public.practices SET moderation_status='submitted', moderation_submitted_at=now(), moderation_attempt=v_attempt, moderation_review_comment=NULL, updated_at=now()
  WHERE id=p_practice_id RETURNING * INTO v_practice;
  PERFORM public.log_practice_moderation_event(v_practice.id,v_practice.author_id,v_action,v_practice.status,v_practice.status,v_from,'submitted',NULL,auth.uid(),'author',v_attempt,jsonb_build_object('source','submit_practice_for_moderation'));
  RETURN v_practice;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_practice(p_practice_id uuid, p_deletion_reason text DEFAULT NULL)
RETURNS public.practices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_practice public.practices%ROWTYPE; v_reason text; v_from_status text; v_from_moderation text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_practice FROM public.practices WHERE id=p_practice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_practice.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_members WHERE author_id=v_practice.author_id AND user_id=auth.uid() AND role IN ('owner','editor')) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
  IF public.practice_has_paid_purchase(p_practice_id) THEN RAISE EXCEPTION 'paid_purchase_exists' USING ERRCODE='P0001'; END IF;
  v_reason := NULLIF(btrim(COALESCE(p_deletion_reason,'')),'');
  IF v_reason IS NOT NULL AND char_length(v_reason)>3000 THEN RAISE EXCEPTION 'deletion_reason_too_long' USING ERRCODE='22023'; END IF;
  v_reason := COALESCE(v_reason,'author_soft_delete'); v_from_status:=v_practice.status; v_from_moderation:=v_practice.moderation_status;
  PERFORM set_config('audiolad.allow_practice_moderation_update','on',true);
  PERFORM set_config('audiolad.allow_practice_soft_delete','on',true);
  UPDATE public.practices SET status=CASE WHEN status='published' THEN 'unpublished' ELSE status END, deleted_at=now(), deleted_by=auth.uid(), deletion_reason=v_reason, is_catalog_listed=false, moderation_submitted_at=NULL, updated_at=now()
  WHERE id=p_practice_id RETURNING * INTO v_practice;
  PERFORM public.log_practice_moderation_event(v_practice.id,v_practice.author_id,'deleted',v_from_status,v_practice.status,v_from_moderation,v_practice.moderation_status,v_reason,auth.uid(),'author',v_practice.moderation_attempt,jsonb_build_object('source','soft_delete_practice'));
  RETURN v_practice;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_audio_product(p_practice_id uuid, p_published_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_practice public.practices%ROWTYPE; v_access text; v_bypass boolean; v_first_path text; v_seconds bigint; v_minutes integer; v_from_status text; v_from_moderation text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_practice FROM public.practices WHERE id=p_practice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'practice_not_found' USING ERRCODE='P0002'; END IF;
  IF v_practice.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'practice_deleted' USING ERRCODE='P0001'; END IF;
  IF v_practice.status NOT IN ('draft','unpublished','published') THEN RAISE EXCEPTION 'invalid_status_for_publish' USING ERRCODE='P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.author_members WHERE author_id=v_practice.author_id AND user_id=auth.uid() AND role IN ('owner','editor')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT access_status, COALESCE(can_bypass_product_moderation,false) INTO v_access,v_bypass FROM public.authors WHERE id=v_practice.author_id;
  IF NOT public.author_access_allows_content_mutations(v_access) THEN RAISE EXCEPTION 'author_content_mutations_blocked' USING ERRCODE='42501'; END IF;
  IF NOT public.author_access_allows_paid_products(v_access) AND (NOT COALESCE(v_practice.is_free,false) OR COALESCE(v_practice.price,0)>0) THEN RAISE EXCEPTION 'paid_products_not_allowed' USING ERRCODE='42501'; END IF;
  IF v_practice.moderation_status IS DISTINCT FROM 'approved' AND NOT v_bypass THEN RAISE EXCEPTION 'moderation_required' USING ERRCODE='42501'; END IF;
  PERFORM public.assert_practice_moderation_ready(p_practice_id);
  v_from_status:=v_practice.status; v_from_moderation:=v_practice.moderation_status;
  SELECT audio_path INTO v_first_path FROM public.audio_items WHERE practice_id=p_practice_id AND NULLIF(btrim(audio_path),'') IS NOT NULL ORDER BY position LIMIT 1;
  SELECT COALESCE(sum(duration_seconds),0) INTO v_seconds FROM public.audio_items WHERE practice_id=p_practice_id AND NULLIF(btrim(audio_path),'') IS NOT NULL;
  v_minutes:=CASE WHEN v_seconds>0 THEN GREATEST(1,ceil(v_seconds::numeric/60)::integer) ELSE NULL END;
  PERFORM set_config('audiolad.allow_practice_publish','on',true);
  PERFORM set_config('audiolad.allow_moderated_content_update','on',true);
  UPDATE public.audio_items SET status='published',updated_at=now() WHERE practice_id=p_practice_id;
  UPDATE public.practices SET status='published',is_catalog_listed=true,published_at=COALESCE(published_at,p_published_at),audio_url=v_first_path,duration_minutes=v_minutes,updated_at=now() WHERE id=p_practice_id RETURNING * INTO v_practice;
  IF v_from_status='unpublished' AND v_from_moderation='approved' THEN
    PERFORM public.log_practice_moderation_event(v_practice.id,v_practice.author_id,'republished','unpublished','published','approved','approved',NULL,auth.uid(),'author',v_practice.moderation_attempt,jsonb_build_object('source','publish_audio_product'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_and_publish_practice(p_practice_id uuid)
RETURNS public.practices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_practice public.practices%ROWTYPE; v_from_status text; v_from_moderation text; v_first_path text; v_seconds bigint; v_minutes integer; v_starter boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_platform_permission(auth.uid(),'author_products.moderate') THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_practice FROM public.practices WHERE id=p_practice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'practice_not_found' USING ERRCODE='P0002'; END IF;
  IF v_practice.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'practice_deleted' USING ERRCODE='P0001'; END IF;
  IF v_practice.moderation_status IS DISTINCT FROM 'submitted' OR v_practice.status NOT IN ('draft','unpublished') THEN RAISE EXCEPTION 'moderation_state_changed' USING ERRCODE='P0001'; END IF;
  PERFORM public.assert_practice_moderation_ready(p_practice_id);
  v_from_status:=v_practice.status; v_from_moderation:=v_practice.moderation_status;
  SELECT audio_path INTO v_first_path FROM public.audio_items WHERE practice_id=p_practice_id AND NULLIF(btrim(audio_path),'') IS NOT NULL ORDER BY position LIMIT 1;
  SELECT COALESCE(sum(duration_seconds),0) INTO v_seconds FROM public.audio_items WHERE practice_id=p_practice_id AND NULLIF(btrim(audio_path),'') IS NOT NULL;
  v_minutes:=CASE WHEN v_seconds>0 THEN GREATEST(1,ceil(v_seconds::numeric/60)::integer) ELSE NULL END;
  SELECT EXISTS(SELECT 1 FROM public.starter_practices WHERE practice_id=p_practice_id AND is_active) INTO v_starter;
  PERFORM set_config('audiolad.allow_practice_moderation_update','on',true);
  PERFORM set_config('audiolad.allow_practice_publish','on',true);
  PERFORM set_config('audiolad.allow_moderated_content_update','on',true);
  UPDATE public.audio_items SET status='published',updated_at=now() WHERE practice_id=p_practice_id;
  UPDATE public.practices SET moderation_status='approved',moderation_review_comment=NULL,status='published',is_catalog_listed=NOT v_starter,published_at=COALESCE(published_at,now()),audio_url=v_first_path,duration_minutes=v_minutes,updated_at=now() WHERE id=p_practice_id RETURNING * INTO v_practice;
  PERFORM public.log_practice_moderation_event(v_practice.id,v_practice.author_id,'approved_and_published',v_from_status,'published',v_from_moderation,'approved',NULL,auth.uid(),'admin',v_practice.moderation_attempt,jsonb_build_object('source','approve_and_publish_practice'));
  RETURN v_practice;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_practice_for_moderation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_for_moderation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_practice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_practice(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.publish_audio_product(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_audio_product(uuid, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_and_publish_practice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_and_publish_practice(uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_audio_product(uuid, timestamptz) IS
  'audiolad:publish-audio-product:v8; trusted readiness guard plus moderation lifecycle';


-- Explicit grants for lifecycle / withdraw / request-changes RPCs
REVOKE ALL ON FUNCTION public.withdraw_practice_from_moderation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_practice_from_moderation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_practice_changes(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_practice_changes(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.unpublish_approved_practice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpublish_approved_practice(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.start_practice_editing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_practice_editing(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.practice_has_paid_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_has_paid_purchase(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.author_can_bypass_product_moderation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_can_bypass_product_moderation(uuid) TO authenticated;

COMMIT;

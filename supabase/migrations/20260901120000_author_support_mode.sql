BEGIN;

-- ---------------------------------------------------------------------------
-- Platform-owner author support sessions + append-only audit.
-- Does not add the owner to author_members and does not swap auth.uid().
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  acting_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  acting_author_id uuid NOT NULL REFERENCES public.authors (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  last_seen_at timestamptz NULL,
  CONSTRAINT author_support_sessions_ttl_check
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS author_support_sessions_actor_active_idx
  ON public.author_support_sessions (actor_user_id, revoked_at, expires_at DESC);

CREATE INDEX IF NOT EXISTS author_support_sessions_target_idx
  ON public.author_support_sessions (acting_user_id, acting_author_id);

COMMENT ON TABLE public.author_support_sessions IS
  'Server-side platform-owner accompaniment sessions. Opaque token hash only; never store the raw cookie token.';

CREATE TABLE IF NOT EXISTS public.author_support_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NOT NULL,
  acting_user_id uuid NOT NULL,
  acting_author_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS author_support_audit_events_created_at_idx
  ON public.author_support_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS author_support_audit_events_actor_idx
  ON public.author_support_audit_events (actor_user_id, created_at DESC);

COMMENT ON TABLE public.author_support_audit_events IS
  'Append-only audit for author support mode. No passwords, tokens, keys, or payment secrets.';

ALTER TABLE public.author_support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_support_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_support_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.author_support_sessions FROM anon;
REVOKE ALL ON TABLE public.author_support_sessions FROM authenticated;
GRANT ALL ON TABLE public.author_support_sessions TO service_role;

REVOKE ALL ON TABLE public.author_support_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.author_support_audit_events FROM anon;
REVOKE ALL ON TABLE public.author_support_audit_events FROM authenticated;
GRANT ALL ON TABLE public.author_support_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.author_support_session_allows(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.author_support_sessions AS s
    WHERE s.actor_user_id = auth.uid()
      AND s.acting_author_id = p_author_id
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND public.is_platform_owner(s.actor_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.author_members AS m
        WHERE m.author_id = s.acting_author_id
          AND m.user_id = s.acting_user_id
          AND m.role IN ('owner', 'editor')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.author_support_session_allows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_support_session_allows(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.author_members_can_mutate(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.author_members AS m
        WHERE m.author_id = p_author_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'editor')
      )
      OR public.author_support_session_allows(p_author_id)
    );
$$;

REVOKE ALL ON FUNCTION public.author_members_can_mutate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_members_can_mutate(uuid)
  TO authenticated, service_role;

-- In support mode the platform owner's author_products.moderate must not
-- become a bypass for the target author.
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
      OR (
        NOT public.author_support_session_allows(p_author_id)
        AND public.has_platform_permission(auth.uid(), 'author_products.moderate')
      );
$$;

COMMENT ON FUNCTION public.actor_can_bypass_product_moderation(uuid) IS
  'audiolad:actor-bypass-product-moderation:v2; author flag OR staff perm, never staff perm in support mode';

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
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
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
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_practice.moderation_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'invalid_moderation_status_for_withdraw' USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'lifecycle_state_changed' USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_practice.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'practice_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(a.can_bypass_product_moderation, false)
  INTO v_can_bypass
  FROM public.authors AS a
  WHERE a.id = v_practice.author_id;

  IF NOT (
    (v_practice.status = 'published' AND v_practice.moderation_status = 'approved')
    OR (v_practice.status = 'unpublished' AND v_practice.moderation_status = 'approved')
    OR (v_practice.status = 'published' AND v_can_bypass)
  ) THEN
    RAISE EXCEPTION 'lifecycle_state_changed' USING ERRCODE = 'P0001';
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
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
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
  IF NOT public.author_members_can_mutate(v_practice.author_id) THEN
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
  'audiolad:publish-audio-product:v11; support-session membership; actor bypass excludes support mode';

DO $$
BEGIN
  IF to_regclass('public.author_support_sessions') IS NULL THEN
    RAISE EXCEPTION 'author_support_sessions missing';
  END IF;
  IF to_regclass('public.author_support_audit_events') IS NULL THEN
    RAISE EXCEPTION 'author_support_audit_events missing';
  END IF;
END
$$;

COMMIT;

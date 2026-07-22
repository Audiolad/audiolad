BEGIN;

-- ---------------------------------------------------------------------------
-- Slug helpers for author workspace provisioning
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.slugify_author_display_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_input text := lower(btrim(coalesce(p_name, '')));
  v_output text;
BEGIN
  v_input := translate(
    v_input,
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    'abvgdeejzijklmnoprstufhccss_y_eua'
  );

  v_output := regexp_replace(v_input, '[^a-z0-9]+', '-', 'g');
  v_output := regexp_replace(v_output, '(^-+|-+$)', '', 'g');
  v_output := regexp_replace(v_output, '-{2,}', '-', 'g');

  IF v_output IS NULL OR char_length(v_output) < 2 THEN
    v_output := 'author';
  END IF;

  RETURN left(v_output, 80);
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_unique_author_slug(p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_base text := public.slugify_author_display_name(p_name);
  v_candidate text := v_base;
  v_suffix integer := 2;
BEGIN
  WHILE EXISTS (
    SELECT 1
    FROM public.authors AS a
    WHERE a.slug = v_candidate
  ) LOOP
    v_candidate := v_base || '-' || v_suffix::text;
    v_suffix := v_suffix + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.slugify_author_display_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_unique_author_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.slugify_author_display_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_unique_author_slug(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Internal journal helpers (SECURITY DEFINER, no client EXECUTE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_author_application_status_event(
  p_application_id uuid,
  p_from_status text,
  p_to_status text,
  p_changed_by uuid,
  p_staff_comment text DEFAULT NULL,
  p_applicant_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.author_application_status_events (
    application_id,
    from_status,
    to_status,
    changed_by,
    staff_comment,
    applicant_comment
  ) VALUES (
    p_application_id,
    p_from_status,
    p_to_status,
    p_changed_by,
    NULLIF(btrim(p_staff_comment), ''),
    NULLIF(btrim(p_applicant_comment), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_author_access_status_event(
  p_author_id uuid,
  p_from_status text,
  p_to_status text,
  p_changed_by uuid,
  p_reason text DEFAULT NULL,
  p_application_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.author_access_status_events (
    author_id,
    application_id,
    from_status,
    to_status,
    changed_by,
    reason
  ) VALUES (
    p_author_id,
    p_application_id,
    p_from_status,
    p_to_status,
    p_changed_by,
    NULLIF(btrim(p_reason), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_author_application_status_event(uuid, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_author_access_status_event(uuid, text, text, uuid, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Application workflow RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_author_application_status(
  p_application_id uuid,
  p_new_status text,
  p_staff_comment text DEFAULT NULL,
  p_applicant_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.author_applications%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_row
  FROM public.author_applications AS aa
  WHERE aa.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = p_new_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'application_id', v_row.id,
      'status', v_row.status
    );
  END IF;

  UPDATE public.author_applications AS aa
  SET
    status = p_new_status,
    admin_note = COALESCE(NULLIF(btrim(p_staff_comment), ''), aa.admin_note),
    review_comment = COALESCE(NULLIF(btrim(p_applicant_comment), ''), aa.review_comment),
    reviewed_at = now(),
    reviewed_by = v_actor,
    updated_at = now()
  WHERE aa.id = p_application_id;

  PERFORM public.log_author_application_status_event(
    p_application_id,
    v_row.status,
    p_new_status,
    v_actor,
    p_staff_comment,
    p_applicant_comment
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'application_id', p_application_id,
    'status', p_new_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.take_author_application_in_review(
  p_application_id uuid,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.author_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.author_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'submitted' THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN public.transition_author_application_status(
    p_application_id,
    'in_review',
    p_staff_comment,
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_author_application_changes(
  p_application_id uuid,
  p_applicant_comment text,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.author_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_applicant_comment), '') IS NULL THEN
    RAISE EXCEPTION 'applicant_comment_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.author_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'in_review' THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN public.transition_author_application_status(
    p_application_id,
    'needs_changes',
    p_staff_comment,
    p_applicant_comment
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.return_author_application_to_review(
  p_application_id uuid,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.author_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.author_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'needs_changes' THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN public.transition_author_application_status(
    p_application_id,
    'in_review',
    p_staff_comment,
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_author_application(
  p_application_id uuid,
  p_applicant_comment text,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.author_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_applicant_comment), '') IS NULL THEN
    RAISE EXCEPTION 'applicant_comment_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.author_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status NOT IN ('submitted', 'in_review', 'needs_changes') THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN public.transition_author_application_status(
    p_application_id,
    'rejected',
    p_staff_comment,
    p_applicant_comment
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_author_application(
  p_application_id uuid,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.author_applications%ROWTYPE;
  v_author_id uuid;
  v_author_slug text;
  v_from_access text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_row
  FROM public.author_applications AS aa
  WHERE aa.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'approved' AND v_row.author_id IS NOT NULL THEN
    SELECT a.slug
    INTO v_author_slug
    FROM public.authors AS a
    WHERE a.id = v_row.author_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'application_id', v_row.id,
      'author_id', v_row.author_id,
      'author_slug', v_author_slug
    );
  END IF;

  IF v_row.status NOT IN ('submitted', 'in_review', 'needs_changes') THEN
    RAISE EXCEPTION 'application_not_approvable'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = v_row.user_id
  ) THEN
    RAISE EXCEPTION 'application_user_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_author_slug := public.allocate_unique_author_slug(v_row.display_name);

  INSERT INTO public.authors (
    name,
    slug,
    author_type,
    access_status
  ) VALUES (
    btrim(v_row.display_name),
    v_author_slug,
    'person',
    'free'
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.author_members (
    author_id,
    user_id,
    role
  ) VALUES (
    v_author_id,
    v_row.user_id,
    'owner'
  )
  ON CONFLICT (author_id, user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = now();

  UPDATE public.author_applications AS aa
  SET
    status = 'approved',
    author_id = v_author_id,
    approved_at = now(),
    approved_by = v_actor,
    reviewed_at = now(),
    reviewed_by = v_actor,
    admin_note = COALESCE(NULLIF(btrim(p_staff_comment), ''), aa.admin_note),
    updated_at = now()
  WHERE aa.id = p_application_id;

  PERFORM public.log_author_application_status_event(
    p_application_id,
    v_row.status,
    'approved',
    v_actor,
    p_staff_comment,
    NULL
  );

  PERFORM public.log_author_access_status_event(
    v_author_id,
    NULL,
    'free',
    v_actor,
    p_staff_comment,
    p_application_id
  );

  UPDATE public.authors AS a
  SET
    access_status_changed_at = now(),
    access_status_changed_by = v_actor
  WHERE a.id = v_author_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'application_id', p_application_id,
    'author_id', v_author_id,
    'author_slug', v_author_slug
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_author_access(
  p_author_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.authors%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_row
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.access_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'author_id', v_row.id,
      'access_status', v_row.access_status
    );
  END IF;

  IF v_row.access_status NOT IN ('free', 'commercial_pending', 'commercial') THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.authors AS a
  SET
    access_status = 'suspended',
    access_status_changed_at = now(),
    access_status_changed_by = v_actor
  WHERE a.id = p_author_id;

  PERFORM public.log_author_access_status_event(
    p_author_id,
    v_row.access_status,
    'suspended',
    v_actor,
    p_reason,
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'author_id', p_author_id,
    'access_status', 'suspended'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_author_access(
  p_author_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.authors%ROWTYPE;
  v_restore_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_row
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.access_status <> 'suspended' THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  SELECT e.from_status
  INTO v_restore_status
  FROM public.author_access_status_events AS e
  WHERE e.author_id = p_author_id
    AND e.to_status = 'suspended'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_restore_status IS NULL
    OR v_restore_status NOT IN ('free', 'commercial_pending', 'commercial') THEN
    v_restore_status := 'free';
  END IF;

  UPDATE public.authors AS a
  SET
    access_status = v_restore_status,
    access_status_changed_at = now(),
    access_status_changed_by = v_actor
  WHERE a.id = p_author_id;

  PERFORM public.log_author_access_status_event(
    p_author_id,
    'suspended',
    v_restore_status,
    v_actor,
    p_reason,
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'author_id', p_author_id,
    'access_status', v_restore_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_author_application_status(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_author_application_in_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_author_application_changes(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_author_application_to_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_author_application(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_author_application(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suspend_author_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_author_access(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.take_author_application_in_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_author_application_changes(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.return_author_application_to_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_author_application(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_author_application(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_author_access(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_author_access(uuid, text) TO authenticated, service_role;

COMMIT;

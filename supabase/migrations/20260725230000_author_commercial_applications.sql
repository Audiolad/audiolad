-- Commercial status applications for existing author workspaces.
-- Separate from author_applications (become-author onboarding).
-- DO NOT apply to production without explicit approval.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_commercial_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE RESTRICT,

  created_by uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'draft',

  planned_products text NOT NULL DEFAULT '',
  topics text NOT NULL DEFAULT '',
  format_plan text NOT NULL DEFAULT '',
  rights_confirmation boolean NOT NULL DEFAULT false,
  team_comment text NULL,

  submitted_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  review_comment text NULL,
  admin_note text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_commercial_applications_status_check
    CHECK (status IN (
      'draft',
      'submitted',
      'in_review',
      'needs_changes',
      'approved',
      'rejected',
      'withdrawn'
    )),
  CONSTRAINT author_commercial_applications_planned_products_len_check
    CHECK (char_length(planned_products) <= 4000),
  CONSTRAINT author_commercial_applications_topics_len_check
    CHECK (char_length(topics) <= 2000),
  CONSTRAINT author_commercial_applications_format_plan_len_check
    CHECK (char_length(format_plan) <= 2000),
  CONSTRAINT author_commercial_applications_team_comment_len_check
    CHECK (team_comment IS NULL OR char_length(team_comment) <= 4000),
  CONSTRAINT author_commercial_applications_review_comment_len_check
    CHECK (review_comment IS NULL OR char_length(review_comment) <= 4000),
  CONSTRAINT author_commercial_applications_admin_note_len_check
    CHECK (admin_note IS NULL OR char_length(admin_note) <= 3000)
);

COMMENT ON TABLE public.author_commercial_applications IS
  'Commercial-tier applications for existing author workspaces. Distinct from become-author author_applications.';

CREATE INDEX IF NOT EXISTS author_commercial_applications_author_id_idx
  ON public.author_commercial_applications (author_id);

CREATE INDEX IF NOT EXISTS author_commercial_applications_status_submitted_at_idx
  ON public.author_commercial_applications (status, submitted_at DESC NULLS LAST);

-- One non-withdrawn commercial application per author workspace.
CREATE UNIQUE INDEX IF NOT EXISTS author_commercial_applications_author_non_withdrawn_unique_idx
  ON public.author_commercial_applications (author_id)
  WHERE status <> 'withdrawn';

CREATE TABLE IF NOT EXISTS public.author_commercial_application_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL
    REFERENCES public.author_commercial_applications (id) ON DELETE CASCADE,
  from_status text NULL,
  to_status text NOT NULL,
  changed_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  staff_comment text NULL,
  applicant_comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS author_commercial_application_status_events_app_idx
  ON public.author_commercial_application_status_events (application_id, created_at DESC);

-- Optional link from access events to commercial applications.
ALTER TABLE public.author_access_status_events
  ADD COLUMN IF NOT EXISTS commercial_application_id uuid
    REFERENCES public.author_commercial_applications (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS author_access_status_events_commercial_application_id_idx
  ON public.author_access_status_events (commercial_application_id)
  WHERE commercial_application_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. updated_at + membership helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_author_commercial_applications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_author_commercial_applications_updated_at
  ON public.author_commercial_applications;

CREATE TRIGGER set_author_commercial_applications_updated_at
  BEFORE UPDATE ON public.author_commercial_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_author_commercial_applications_updated_at();

CREATE OR REPLACE FUNCTION public.assert_author_commercial_application_member(
  p_author_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = p_author_id
      AND am.user_id = p_user_id
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_author_commercial_application_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_author_commercial_application_member(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_author_commercial_application_member(uuid, uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. Event logging + access sync helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_author_commercial_application_status_event(
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
  INSERT INTO public.author_commercial_application_status_events (
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

REVOKE ALL ON FUNCTION public.log_author_commercial_application_status_event(uuid, text, text, uuid, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_author_access_status_for_commercial_application(
  p_author_id uuid,
  p_new_status text,
  p_changed_by uuid,
  p_reason text,
  p_commercial_application_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from text;
BEGIN
  IF p_new_status NOT IN ('free', 'commercial_pending', 'commercial') THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  SELECT a.access_status
  INTO v_from
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_from = p_new_status THEN
    RETURN v_from;
  END IF;

  IF v_from IN ('suspended', 'terminated') THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.authors
  SET
    access_status = p_new_status,
    updated_at = now()
  WHERE id = p_author_id;

  INSERT INTO public.author_access_status_events (
    author_id,
    application_id,
    commercial_application_id,
    from_status,
    to_status,
    changed_by,
    reason
  ) VALUES (
    p_author_id,
    NULL,
    p_commercial_application_id,
    v_from,
    p_new_status,
    p_changed_by,
    NULLIF(btrim(p_reason), '')
  );

  RETURN p_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_author_access_status_for_commercial_application(uuid, text, uuid, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Author-facing RPCs (draft + submit)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_author_commercial_application_draft(
  p_author_id uuid,
  p_planned_products text,
  p_topics text,
  p_format_plan text,
  p_rights_confirmation boolean,
  p_team_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_access text;
  v_row public.author_commercial_applications%ROWTYPE;
  v_planned text := btrim(coalesce(p_planned_products, ''));
  v_topics text := btrim(coalesce(p_topics, ''));
  v_format text := btrim(coalesce(p_format_plan, ''));
  v_team text := NULLIF(btrim(coalesce(p_team_comment, '')), '');
BEGIN
  PERFORM public.assert_author_commercial_application_member(p_author_id, v_actor);

  SELECT a.access_status INTO v_access
  FROM public.authors AS a
  WHERE a.id = p_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_access = 'commercial' THEN
    RAISE EXCEPTION 'commercial_application_not_needed' USING ERRCODE = '22023';
  END IF;

  IF v_access IN ('suspended', 'terminated') THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications AS aca
  WHERE aca.author_id = p_author_id
    AND aca.status <> 'withdrawn'
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.status NOT IN ('draft', 'needs_changes') THEN
      RAISE EXCEPTION 'commercial_application_not_editable' USING ERRCODE = '22023';
    END IF;

    UPDATE public.author_commercial_applications
    SET
      planned_products = v_planned,
      topics = v_topics,
      format_plan = v_format,
      rights_confirmation = coalesce(p_rights_confirmation, false),
      team_comment = v_team,
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    IF v_access = 'commercial_pending' THEN
      -- Legacy pending without a row: do not open unbounded new submissions.
      RAISE EXCEPTION 'commercial_application_legacy_pending' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.author_commercial_applications (
      author_id,
      created_by,
      status,
      planned_products,
      topics,
      format_plan,
      rights_confirmation,
      team_comment
    ) VALUES (
      p_author_id,
      v_actor,
      'draft',
      v_planned,
      v_topics,
      v_format,
      coalesce(p_rights_confirmation, false),
      v_team
    )
    RETURNING * INTO v_row;

    PERFORM public.log_author_commercial_application_status_event(
      v_row.id,
      NULL,
      'draft',
      v_actor,
      NULL,
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'application_id', v_row.id,
    'status', v_row.status,
    'access_status', v_access
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_author_commercial_application(
  p_author_id uuid,
  p_planned_products text,
  p_topics text,
  p_format_plan text,
  p_rights_confirmation boolean,
  p_team_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_access text;
  v_row public.author_commercial_applications%ROWTYPE;
  v_from_status text;
  v_planned text := btrim(coalesce(p_planned_products, ''));
  v_topics text := btrim(coalesce(p_topics, ''));
  v_format text := btrim(coalesce(p_format_plan, ''));
  v_team text := NULLIF(btrim(coalesce(p_team_comment, '')), '');
  v_new_access text;
BEGIN
  PERFORM public.assert_author_commercial_application_member(p_author_id, v_actor);

  IF char_length(v_planned) < 20 THEN
    RAISE EXCEPTION 'commercial_application_invalid_planned_products' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_topics) < 2 THEN
    RAISE EXCEPTION 'commercial_application_invalid_topics' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_format) < 2 THEN
    RAISE EXCEPTION 'commercial_application_invalid_format_plan' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_rights_confirmation, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commercial_application_rights_required' USING ERRCODE = '22023';
  END IF;

  SELECT a.access_status INTO v_access
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_access = 'commercial' THEN
    RAISE EXCEPTION 'commercial_application_not_needed' USING ERRCODE = '22023';
  END IF;

  IF v_access IN ('suspended', 'terminated') THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications AS aca
  WHERE aca.author_id = p_author_id
    AND aca.status <> 'withdrawn'
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.status NOT IN ('draft', 'needs_changes') THEN
      RAISE EXCEPTION 'commercial_application_already_active' USING ERRCODE = '22023';
    END IF;

    v_from_status := v_row.status;

    UPDATE public.author_commercial_applications
    SET
      status = 'submitted',
      planned_products = v_planned,
      topics = v_topics,
      format_plan = v_format,
      rights_confirmation = true,
      team_comment = v_team,
      submitted_at = coalesce(submitted_at, now()),
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    IF v_access = 'commercial_pending' THEN
      RAISE EXCEPTION 'commercial_application_legacy_pending' USING ERRCODE = '22023';
    END IF;

    v_from_status := NULL;

    INSERT INTO public.author_commercial_applications (
      author_id,
      created_by,
      status,
      planned_products,
      topics,
      format_plan,
      rights_confirmation,
      team_comment,
      submitted_at
    ) VALUES (
      p_author_id,
      v_actor,
      'submitted',
      v_planned,
      v_topics,
      v_format,
      true,
      v_team,
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  PERFORM public.log_author_commercial_application_status_event(
    v_row.id,
    v_from_status,
    'submitted',
    v_actor,
    NULL,
    NULL
  );

  v_new_access := public.set_author_access_status_for_commercial_application(
    p_author_id,
    'commercial_pending',
    v_actor,
    'commercial_application_submitted',
    v_row.id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'application_id', v_row.id,
    'status', v_row.status,
    'access_status', v_new_access
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_author_commercial_application_draft(uuid, text, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_author_commercial_application(uuid, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_author_commercial_application_draft(uuid, text, text, text, boolean, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_author_commercial_application(uuid, text, text, text, boolean, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Staff RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_author_commercial_application_status(
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
  v_row public.author_commercial_applications%ROWTYPE;
  v_from_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = p_new_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'application_id', v_row.id,
      'status', v_row.status,
      'author_id', v_row.author_id
    );
  END IF;

  v_from_status := v_row.status;

  UPDATE public.author_commercial_applications
  SET
    status = p_new_status,
    admin_note = COALESCE(NULLIF(btrim(p_staff_comment), ''), admin_note),
    review_comment = COALESCE(NULLIF(btrim(p_applicant_comment), ''), review_comment),
    reviewed_at = now(),
    reviewed_by = v_actor,
    updated_at = now()
  WHERE id = p_application_id
  RETURNING * INTO v_row;

  PERFORM public.log_author_commercial_application_status_event(
    p_application_id,
    v_from_status,
    p_new_status,
    v_actor,
    p_staff_comment,
    p_applicant_comment
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'application_id', p_application_id,
    'status', p_new_status,
    'author_id', v_row.author_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.take_author_commercial_application_in_review(
  p_application_id uuid,
  p_staff_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.author_commercial_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'submitted' THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN public.transition_author_commercial_application_status(
    p_application_id,
    'in_review',
    p_staff_comment,
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_author_commercial_application_changes(
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
  v_row public.author_commercial_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_applicant_comment), '') IS NULL THEN
    RAISE EXCEPTION 'applicant_comment_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'in_review' THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN public.transition_author_commercial_application_status(
    p_application_id,
    'needs_changes',
    p_staff_comment,
    p_applicant_comment
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_author_commercial_application(
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
  v_row public.author_commercial_applications%ROWTYPE;
  v_transition jsonb;
  v_access text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status NOT IN ('submitted', 'in_review', 'needs_changes') THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_transition := public.transition_author_commercial_application_status(
    p_application_id,
    'approved',
    p_staff_comment,
    NULL
  );

  v_access := public.set_author_access_status_for_commercial_application(
    v_row.author_id,
    'commercial',
    v_actor,
    'commercial_application_approved',
    p_application_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', coalesce((v_transition ->> 'idempotent')::boolean, false),
    'application_id', p_application_id,
    'author_id', v_row.author_id,
    'status', 'approved',
    'access_status', v_access
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_author_commercial_application(
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
  v_actor uuid := auth.uid();
  v_row public.author_commercial_applications%ROWTYPE;
  v_transition jsonb;
  v_access text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_applicant_comment), '') IS NULL THEN
    RAISE EXCEPTION 'applicant_comment_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status NOT IN ('submitted', 'in_review', 'needs_changes') THEN
    RAISE EXCEPTION 'application_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_transition := public.transition_author_commercial_application_status(
    p_application_id,
    'rejected',
    p_staff_comment,
    p_applicant_comment
  );

  v_access := public.set_author_access_status_for_commercial_application(
    v_row.author_id,
    'free',
    v_actor,
    'commercial_application_rejected',
    p_application_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', coalesce((v_transition ->> 'idempotent')::boolean, false),
    'application_id', p_application_id,
    'author_id', v_row.author_id,
    'status', 'rejected',
    'access_status', v_access
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_author_commercial_application_status(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_author_commercial_application_in_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_author_commercial_application_changes(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_author_commercial_application(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_author_commercial_application(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.take_author_commercial_application_in_review(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_author_commercial_application_changes(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_author_commercial_application(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_author_commercial_application(uuid, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_author_commercial_application(
  p_author_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_platform_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = p_author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_author_commercial_application(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_author_commercial_application(uuid)
  TO authenticated, service_role;

ALTER TABLE public.author_commercial_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_commercial_application_status_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_commercial_applications FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.author_commercial_application_status_events FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.author_commercial_applications TO authenticated;
GRANT ALL ON TABLE public.author_commercial_applications TO service_role;
GRANT SELECT ON TABLE public.author_commercial_application_status_events TO authenticated;
GRANT ALL ON TABLE public.author_commercial_application_status_events TO service_role;

DROP POLICY IF EXISTS author_commercial_applications_select_member
  ON public.author_commercial_applications;
CREATE POLICY author_commercial_applications_select_member
  ON public.author_commercial_applications
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_author_commercial_application(
      author_commercial_applications.author_id
    )
  );

DROP POLICY IF EXISTS author_commercial_application_status_events_select_staff
  ON public.author_commercial_application_status_events;
CREATE POLICY author_commercial_application_status_events_select_staff
  ON public.author_commercial_application_status_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_commercial_applications AS aca
      WHERE aca.id = author_commercial_application_status_events.application_id
        AND public.can_access_author_commercial_application(aca.author_id)
    )
  );

-- No direct INSERT/UPDATE/DELETE for authenticated — writes go through RPCs.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.author_commercial_applications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.author_commercial_application_status_events FROM authenticated;

COMMIT;

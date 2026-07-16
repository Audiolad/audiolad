BEGIN;

-- ---------------------------------------------------------------------------
-- Admin panel foundation: platform_owner role + staff access to applications
-- Extends existing profiles.role model (listener, platform_admin).
-- Does not change author workspace roles in author_members.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_owner(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS pr
    WHERE pr.id = p_user_id
      AND pr.role = 'platform_owner'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_platform_owner(uuid) IS
  'Returns true when profiles.role = platform_owner for the given user.';

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS pr
    WHERE pr.id = p_user_id
      AND pr.role IN ('platform_owner', 'platform_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_platform_staff(uuid) IS
  'Returns true for platform_owner or platform_admin. Used for admin panel access.';

-- Owner account: upgrade platform_admin → platform_owner when present.
DO $$
DECLARE
  v_user_id uuid;
  v_user_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_user_count
  FROM auth.users AS u
  WHERE lower(u.email) = lower('1@audiolad.ru');

  IF v_user_count = 1 THEN
    SELECT u.id
    INTO v_user_id
    FROM auth.users AS u
    WHERE lower(u.email) = lower('1@audiolad.ru')
    ORDER BY u.id
    LIMIT 1;
  END IF;

  IF v_user_count = 1 AND v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'platform_owner'
    WHERE id = v_user_id
      AND role IN ('listener', 'platform_admin');
  ELSE
    RAISE NOTICE 'platform_owner_role_skipped: expected exactly one user for platform owner email, found %', v_user_count;
  END IF;
END;
$$;

-- Internal admin-only note (not shown to applicants).
ALTER TABLE public.author_applications
  ADD COLUMN IF NOT EXISTS admin_note text NULL;

ALTER TABLE public.author_applications
  DROP CONSTRAINT IF EXISTS author_applications_admin_note_length_check;

ALTER TABLE public.author_applications
  ADD CONSTRAINT author_applications_admin_note_length_check
  CHECK (
    admin_note IS NULL
    OR char_length(admin_note) <= 3000
  );

COMMENT ON COLUMN public.author_applications.admin_note IS
  'Internal platform staff note. Not visible to applicants.';

-- Allow platform staff to bypass user-facing application guards.
CREATE OR REPLACE FUNCTION public.guard_author_applications_user_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_platform_staff(auth.uid()) THEN
    IF NEW.reviewed_at IS NULL
      AND NEW.status IN ('in_review', 'approved', 'rejected', 'needs_changes')
      AND NEW.status IS DISTINCT FROM OLD.status
    THEN
      NEW.reviewed_at := now();
    END IF;

    IF NEW.reviewed_by IS NULL
      AND NEW.status IS DISTINCT FROM OLD.status
      AND NEW.status IN ('in_review', 'approved', 'rejected', 'needs_changes')
    THEN
      NEW.reviewed_by := auth.uid();
    END IF;

    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'author_application_user_id_immutable';
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    RAISE EXCEPTION 'author_application_reviewed_by_forbidden';
  END IF;

  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'author_application_reviewed_at_forbidden';
  END IF;

  IF NEW.review_comment IS DISTINCT FROM OLD.review_comment THEN
    RAISE EXCEPTION 'author_application_review_comment_forbidden';
  END IF;

  IF NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
    RAISE EXCEPTION 'author_application_admin_note_forbidden';
  END IF;

  IF NEW.status IN ('in_review', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'author_application_status_forbidden';
  END IF;

  IF OLD.status NOT IN ('draft', 'needs_changes') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'author_application_status_locked';
    END IF;

    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'author_application_not_editable';
    END IF;
  END IF;

  IF NEW.status = 'submitted' AND OLD.status NOT IN ('draft', 'needs_changes') THEN
    RAISE EXCEPTION 'author_application_invalid_submit_transition';
  END IF;

  IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- RLS: platform staff can read and update all author applications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_applications'
      AND policyname = 'Platform staff can select author applications'
  ) THEN
    CREATE POLICY "Platform staff can select author applications"
      ON public.author_applications
      FOR SELECT
      TO authenticated
      USING (public.is_platform_staff(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_applications'
      AND policyname = 'Platform staff can update author applications'
  ) THEN
    CREATE POLICY "Platform staff can update author applications"
      ON public.author_applications
      FOR UPDATE
      TO authenticated
      USING (public.is_platform_staff(auth.uid()))
      WITH CHECK (public.is_platform_staff(auth.uid()));
  END IF;
END;
$$;

COMMIT;

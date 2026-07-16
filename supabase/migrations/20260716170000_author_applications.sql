BEGIN;

-- ---------------------------------------------------------------------------
-- Author applications: listener → author onboarding requests
-- Admin review and workspace provisioning happen outside this migration.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'draft',

  display_name text NOT NULL,
  contact text NULL,
  direction text NOT NULL,
  experience text NULL,
  about text NOT NULL,
  planned_content text NOT NULL,
  links text NULL,
  has_ready_materials boolean NOT NULL DEFAULT false,
  consent_personal_data boolean NOT NULL DEFAULT false,

  submitted_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users (id),
  review_comment text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_applications_status_check
    CHECK (
      status IN (
        'draft',
        'submitted',
        'in_review',
        'needs_changes',
        'approved',
        'rejected',
        'withdrawn'
      )
    ),

  CONSTRAINT author_applications_display_name_length_check
    CHECK (
      char_length(btrim(display_name)) >= 2
      AND char_length(display_name) <= 100
    ),

  CONSTRAINT author_applications_direction_length_check
    CHECK (
      char_length(btrim(direction)) >= 3
      AND char_length(direction) <= 200
    ),

  CONSTRAINT author_applications_about_length_check
    CHECK (
      char_length(btrim(about)) >= 20
      AND char_length(about) <= 3000
    ),

  CONSTRAINT author_applications_planned_content_length_check
    CHECK (
      char_length(btrim(planned_content)) >= 20
      AND char_length(planned_content) <= 3000
    ),

  CONSTRAINT author_applications_experience_length_check
    CHECK (
      experience IS NULL
      OR char_length(experience) <= 3000
    ),

  CONSTRAINT author_applications_links_length_check
    CHECK (
      links IS NULL
      OR char_length(links) <= 2000
    ),

  CONSTRAINT author_applications_contact_length_check
    CHECK (
      contact IS NULL
      OR char_length(contact) <= 300
    ),

  CONSTRAINT author_applications_consent_required_on_submit_check
    CHECK (
      status IN ('draft', 'withdrawn')
      OR consent_personal_data = true
    )
);

CREATE INDEX IF NOT EXISTS author_applications_user_id_idx
  ON public.author_applications (user_id);

CREATE INDEX IF NOT EXISTS author_applications_status_submitted_at_idx
  ON public.author_applications (status, submitted_at DESC NULLS LAST);

-- One non-withdrawn application per user (rejected blocks re-application).
CREATE UNIQUE INDEX IF NOT EXISTS author_applications_user_non_withdrawn_unique_idx
  ON public.author_applications (user_id)
  WHERE status <> 'withdrawn';

COMMENT ON TABLE public.author_applications IS
  'Author onboarding applications. Approval does not auto-create authors/author_members.';

COMMENT ON COLUMN public.author_applications.status IS
  'draft|submitted|in_review|needs_changes|approved|rejected|withdrawn';

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_author_applications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_applications_set_updated_at ON public.author_applications;

CREATE TRIGGER author_applications_set_updated_at
  BEFORE UPDATE ON public.author_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_author_applications_updated_at();

-- ---------------------------------------------------------------------------
-- Block authenticated users from self-approving or editing admin fields
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_author_applications_user_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS author_applications_guard_user_update ON public.author_applications;

CREATE TRIGGER author_applications_guard_user_update
  BEFORE UPDATE ON public.author_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_author_applications_user_update();

CREATE OR REPLACE FUNCTION public.guard_author_applications_user_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'author_application_user_id_mismatch';
  END IF;

  IF NEW.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'author_application_invalid_initial_status';
  END IF;

  IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_comment IS NOT NULL THEN
    RAISE EXCEPTION 'author_application_admin_fields_forbidden';
  END IF;

  IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_applications_guard_user_insert ON public.author_applications;

CREATE TRIGGER author_applications_guard_user_insert
  BEFORE INSERT ON public.author_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_author_applications_user_insert();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.author_applications FROM PUBLIC;
REVOKE ALL ON TABLE public.author_applications FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.author_applications TO authenticated;
GRANT ALL ON TABLE public.author_applications TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_applications'
      AND policyname = 'Users can select own author applications'
  ) THEN
    CREATE POLICY "Users can select own author applications"
      ON public.author_applications
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_applications'
      AND policyname = 'Users can insert own author applications'
  ) THEN
    CREATE POLICY "Users can insert own author applications"
      ON public.author_applications
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'author_applications'
      AND policyname = 'Users can update own author applications'
  ) THEN
    CREATE POLICY "Users can update own author applications"
      ON public.author_applications
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END;
$$;

COMMIT;

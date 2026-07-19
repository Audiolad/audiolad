BEGIN;

-- ---------------------------------------------------------------------------
-- Author applications: separate contact email and additional contact details
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_applications
  ADD COLUMN IF NOT EXISTS contact_email text NULL;

ALTER TABLE public.author_applications
  RENAME COLUMN contact TO contact_details;

ALTER TABLE public.author_applications
  DROP CONSTRAINT IF EXISTS author_applications_contact_length_check;

ALTER TABLE public.author_applications
  ADD CONSTRAINT author_applications_contact_details_length_check
    CHECK (
      contact_details IS NULL
      OR char_length(contact_details) <= 300
    );

ALTER TABLE public.author_applications
  ADD CONSTRAINT author_applications_contact_email_length_check
    CHECK (
      contact_email IS NULL
      OR char_length(contact_email) <= 320
    );

COMMENT ON COLUMN public.author_applications.contact_email IS
  'Email confirmed by the applicant in the author application form.';

COMMENT ON COLUMN public.author_applications.contact_details IS
  'Phone, MAX, or other secondary contact method from the application form.';

-- Optional contact email on profile (separate from auth login email).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email text NULL;

COMMENT ON COLUMN public.profiles.contact_email IS
  'User-provided contact email (e.g. from author application). Not the auth login.';

-- ---------------------------------------------------------------------------
-- Allow contact-only updates while application is submitted or in review
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

  IF OLD.status IN ('submitted', 'in_review') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'author_application_status_locked';
    END IF;

    IF NEW IS DISTINCT FROM OLD THEN
      IF (
        NEW.display_name IS NOT DISTINCT FROM OLD.display_name
        AND NEW.direction IS NOT DISTINCT FROM OLD.direction
        AND NEW.about IS NOT DISTINCT FROM OLD.about
        AND NEW.experience IS NOT DISTINCT FROM OLD.experience
        AND NEW.planned_content IS NOT DISTINCT FROM OLD.planned_content
        AND NEW.links IS NOT DISTINCT FROM OLD.links
        AND NEW.has_ready_materials IS NOT DISTINCT FROM OLD.has_ready_materials
        AND NEW.wants_training IS NOT DISTINCT FROM OLD.wants_training
        AND NEW.interested_in_school IS NOT DISTINCT FROM OLD.interested_in_school
        AND NEW.consent_personal_data IS NOT DISTINCT FROM OLD.consent_personal_data
        AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at
        AND (
          NEW.contact_email IS DISTINCT FROM OLD.contact_email
          OR NEW.contact_details IS DISTINCT FROM OLD.contact_details
        )
      ) THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'author_application_not_editable';
    END IF;

    RETURN NEW;
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

COMMIT;

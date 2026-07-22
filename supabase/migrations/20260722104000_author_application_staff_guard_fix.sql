BEGIN;

-- Platform staff workflow RPCs run as SECURITY DEFINER but retain auth.uid() from the
-- admin session. Allow staff transitions without tripping applicant edit guards.

CREATE OR REPLACE FUNCTION public.guard_author_applications_user_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_staff(auth.uid()) THEN
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

  RETURN NEW;
END;
$$;

COMMIT;

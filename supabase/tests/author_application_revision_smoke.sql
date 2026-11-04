-- Disposable smoke for 20270219120000_author_application_revision.sql. Rolls back.
\set ON_ERROR_STOP on
BEGIN;
-- Minimal Auth fixture in CI compile lacks these GoTrue columns (rolled back with the smoke).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  v_staff uuid := gen_random_uuid();
  v_applicant uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_app uuid;
  v_status text;
  v_fields text[];
  v_count integer;
  v_changed_by uuid;
BEGIN
  IF has_function_privilege('authenticated', 'public.log_author_application_resubmission()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.log_author_application_resubmission()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_author_application_revision_fields()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.guard_author_application_revision_fields()', 'EXECUTE') THEN
    RAISE EXCEPTION 'privilege: resubmission logger must not be callable by clients';
  END IF;

  INSERT INTO auth.users (id) VALUES (v_staff), (v_applicant), (v_other);
  INSERT INTO public.profiles (id) VALUES (v_staff), (v_applicant), (v_other)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.platform_user_roles (user_id, role_code) VALUES (v_staff, 'owner');

  INSERT INTO public.author_applications (
    user_id, display_name, direction, about, planned_content, status, consent_personal_data
  )
  VALUES (
    v_applicant,
    'Анна Смоук',
    'Медитации',
    'Веду практики дыхания и сна уже несколько лет.',
    'Курс коротких практик для спокойного вечера.',
    'submitted',
    true
  )
  RETURNING id INTO v_app;

  -- Staff: «Отправить на доработку» = take in review + request changes + fields.
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM public.take_author_application_in_review(v_app, NULL);
  PERFORM public.request_author_application_changes(v_app, 'Поправьте рассказ о себе', NULL);
  UPDATE public.author_applications
  SET revision_fields = ARRAY['display_name', 'contact_details']
  WHERE id = v_app;

  SELECT status, revision_fields INTO v_status, v_fields
  FROM public.author_applications WHERE id = v_app;
  IF v_status <> 'needs_changes' OR v_fields IS DISTINCT FROM ARRAY['display_name', 'contact_details'] THEN
    RAISE EXCEPTION 'staff revision not stored: % %', v_status, v_fields;
  END IF;

  BEGIN
    UPDATE public.author_applications
    SET revision_fields = ARRAY['links']
    WHERE id = v_app;
    RAISE EXCEPTION 'unknown revision field accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Applicant cannot change the reviewer's field list.
  PERFORM set_config('request.jwt.claim.sub', v_applicant::text, true);
  BEGIN
    UPDATE public.author_applications
    SET revision_fields = NULL
    WHERE id = v_app;
    RAISE EXCEPTION 'applicant changed revision_fields';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%author_application_revision_fields_forbidden%' THEN
        RAISE;
      END IF;
  END;

  -- Applicant resubmits: status back to submitted and the history records it.
  -- The project name (display_name) stays editable while needs_changes.
  UPDATE public.author_applications
  SET display_name = 'Тихая гавань',
      about = 'Новый рассказ о себе',
      status = 'submitted',
      submitted_at = now()
  WHERE id = v_app;

  IF (SELECT display_name FROM public.author_applications WHERE id = v_app)
     IS DISTINCT FROM 'Тихая гавань' THEN
    RAISE EXCEPTION 'project name not updated on resubmission';
  END IF;

  SELECT count(*), max(changed_by::text)::uuid INTO v_count, v_changed_by
  FROM public.author_application_status_events
  WHERE application_id = v_app
    AND from_status = 'needs_changes'
    AND to_status = 'submitted';
  IF v_count <> 1 OR v_changed_by IS DISTINCT FROM v_applicant THEN
    RAISE EXCEPTION 'resubmission event: count=% changed_by=%', v_count, v_changed_by;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.author_application_status_events
  WHERE application_id = v_app
    AND to_status = 'needs_changes'
    AND applicant_comment = 'Поправьте рассказ о себе';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'needs_changes event with comment missing: %', v_count;
  END IF;

  -- Updates that do not leave needs_changes do not log a resubmission.
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM public.take_author_application_in_review(v_app, NULL);
  SELECT count(*) INTO v_count
  FROM public.author_application_status_events
  WHERE application_id = v_app AND from_status = 'needs_changes' AND to_status = 'submitted';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'extra resubmission events: %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  RAISE NOTICE 'author_application_revision_smoke: ok';
END;
$$;

ROLLBACK;

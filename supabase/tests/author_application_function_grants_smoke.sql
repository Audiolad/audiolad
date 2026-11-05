-- Disposable smoke for 20270222120000_author_application_function_grants.sql. Rolls back.
-- Runs the staff review flow and the applicant resubmission trigger under the
-- client role (authenticated) to prove the tightened privileges keep them working.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

DO $$
DECLARE
  v_staff uuid := gen_random_uuid();
  v_applicant uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_app uuid;
  v_app2 uuid;
  v_status text;
BEGIN
  IF has_function_privilege('anon', 'public.guard_author_applications_user_update()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_author_applications_user_update()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.transition_author_application_status(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transition_author_application_status(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.approve_author_application(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privilege: author application internals must not be callable by clients';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.approve_author_application(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.take_author_application_in_review(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.request_author_application_changes(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.reject_author_application(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privilege: admin review RPCs must stay callable by the staff session';
  END IF;

  INSERT INTO auth.users (id) VALUES (v_staff), (v_applicant), (v_other);
  INSERT INTO public.profiles (id) VALUES (v_staff), (v_applicant), (v_other)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.platform_user_roles (user_id, role_code) VALUES (v_staff, 'owner');

  INSERT INTO public.author_applications (
    user_id, display_name, direction, about, planned_content, status, consent_personal_data
  )
  VALUES
    (v_applicant, 'Анна Смоук', 'Медитации', 'Веду практики дыхания и сна уже несколько лет.',
     'Курс коротких практик для спокойного вечера.', 'submitted', true)
  RETURNING id INTO v_app;
  INSERT INTO public.author_applications (
    user_id, display_name, direction, about, planned_content, status, consent_personal_data
  )
  VALUES
    (v_other, 'Борис Смоук', 'Сон', 'Пишу сказки на ночь для взрослых.',
     'Цикл вечерних историй.', 'submitted', true)
  RETURNING id INTO v_app2;

  -- Staff session (role authenticated): send for revision, then reject another.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM public.take_author_application_in_review(v_app, NULL);
  PERFORM public.request_author_application_changes(v_app, 'Поправьте рассказ о себе', NULL);
  PERFORM public.take_author_application_in_review(v_app2, NULL);
  PERFORM public.reject_author_application(v_app2, 'Не подходит', NULL);
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_status FROM public.author_applications WHERE id = v_app;
  IF v_status <> 'needs_changes' THEN
    RAISE EXCEPTION 'staff revision under authenticated failed: %', v_status;
  END IF;
  SELECT status INTO v_status FROM public.author_applications WHERE id = v_app2;
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'staff reject under authenticated failed: %', v_status;
  END IF;

  -- The update guard trigger still fires for the applicant (no EXECUTE needed).
  PERFORM set_config('request.jwt.claim.sub', v_applicant::text, true);
  BEGIN
    UPDATE public.author_applications SET status = 'approved' WHERE id = v_app;
    RAISE EXCEPTION 'guard trigger did not block applicant self-approval';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%guard trigger did not block%' THEN
        RAISE;
      END IF;
  END;

  -- Clients cannot call the internal transition helper directly.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.transition_author_application_status(v_app, 'approved', NULL, NULL);
    RAISE EXCEPTION 'authenticated called transition helper';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  -- Approval stays callable by authenticated; a non-staff caller is refused in the body.
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  BEGIN
    PERFORM public.approve_author_application(v_app, NULL);
    RAISE EXCEPTION 'non-staff approved an application';
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN
      IF SQLERRM LIKE '%permission denied for function%' OR SQLERRM LIKE '%non-staff approved%' THEN
        RAISE;
      END IF;
  END;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.approve_author_application(v_app, NULL);
    RAISE EXCEPTION 'anon called approval';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  RAISE NOTICE 'author_application_function_grants_smoke: ok';
END;
$$;

ROLLBACK;

-- Tighten function privileges for author application review.
-- * guard_author_applications_user_update() is a trigger function: triggers
--   do not need EXECUTE for the session role, so no client role needs it.
-- * transition_author_application_status(...) is an internal SECURITY DEFINER
--   helper called only from other SECURITY DEFINER review functions owned by
--   postgres (take in review / request changes / return / reject).
-- * approve_author_application(uuid, text) is called by the admin server
--   action through the signed-in staff session (role authenticated) and by
--   service_role; anon never needs it.
-- Rollback: supabase/rollbacks/20270222120000_author_application_function_grants.rollback.sql
BEGIN;
SET LOCAL lock_timeout = '3s';

REVOKE ALL ON FUNCTION public.guard_author_applications_user_update()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.transition_author_application_status(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.approve_author_application(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_author_application(uuid, text)
  TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.guard_author_applications_user_update()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_author_applications_user_update()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.transition_author_application_status(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transition_author_application_status(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.approve_author_application(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'author_application_function_grants_postcheck_failed: client role still has EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.approve_author_application(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.approve_author_application(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'author_application_function_grants_postcheck_failed: approval lost EXECUTE';
  END IF;
END
$$;

COMMIT;

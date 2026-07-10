BEGIN;

CREATE OR REPLACE FUNCTION public.grant_active_starter_practices(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  SELECT
    p_user_id,
    sp.practice_id,
    'starter'
  FROM public.starter_practices AS sp
  INNER JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE sp.is_active = true
    AND p.status = 'published'
    AND p.is_free = true
    AND p.price = 0
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM authenticated;

COMMENT ON FUNCTION public.grant_active_starter_practices(uuid) IS
  'audiolad:starter-grant:v1; grants active published free zero-price starter practices; idempotent; returns inserted row count';

COMMIT;

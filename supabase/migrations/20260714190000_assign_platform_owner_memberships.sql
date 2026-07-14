-- Assign platform owner memberships when the official account exists.
-- Idempotent. No transaction wrapper (managed externally).

DO $$
DECLARE
  v_user_count integer;
  v_user_id uuid;
BEGIN
  SELECT count(*)
  INTO v_user_count
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim('1@audiolad.ru'));

  IF v_user_count <> 1 THEN
    RAISE NOTICE 'owner_membership_skipped: expected exactly one user for platform owner email, found %', v_user_count;
    RETURN;
  END IF;

  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim('1@audiolad.ru'))
  LIMIT 1;

  INSERT INTO public.author_members (author_id, user_id, role)
  SELECT a.id, v_user_id, 'owner'
  FROM public.authors AS a
  WHERE a.slug IN ('sergey-petrov', 'zoya-petrova', 'sergey-and-zoya')
  ON CONFLICT (author_id, user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = now();
END;
$$;

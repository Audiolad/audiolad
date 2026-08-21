BEGIN;

-- First manually granted author-project entitlement (Premium-shaped override).
-- Lookup account by email, persist max projects on profiles.id (auth user id).
-- Idempotent: re-apply does not create authors, does not change ownership,
-- and does not touch practices/meditations.

DO $$
DECLARE
  v_email text := public.normalize_contact_email('olganevska@yandex.ru');
  v_user_id uuid;
  v_owned integer;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'invalid_entitlement_email';
  END IF;

  SELECT candidate.user_id
  INTO v_user_id
  FROM (
    SELECT p.id AS user_id, 1 AS src_rank
    FROM public.profiles AS p
    WHERE public.normalize_contact_email(p.email) = v_email

    UNION ALL

    SELECT u.id AS user_id, 2 AS src_rank
    FROM auth.users AS u
    WHERE public.normalize_contact_email(u.email) = v_email

    UNION ALL

    SELECT ec.user_id, 3 AS src_rank
    FROM public.email_contacts AS ec
    WHERE ec.normalized_email = v_email
      AND ec.status = 'active'
      AND ec.user_id IS NOT NULL
  ) AS candidate
  ORDER BY candidate.src_rank
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE
      'olganevska@yandex.ru not found; author_project_limit_override not applied';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_user_id
  ) THEN
    RAISE NOTICE
      'profile % missing for olganevska@yandex.ru; entitlement skipped',
      v_user_id;
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_owned
  FROM public.author_members AS am
  WHERE am.user_id = v_user_id
    AND am.role = 'owner';

  UPDATE public.profiles
  SET author_project_limit_override = 5
  WHERE id = v_user_id
    AND author_project_limit_override IS DISTINCT FROM 5;

  RAISE NOTICE
    'granted author_project_limit_override=5 to olganevska@yandex.ru (%) owned_projects=%',
    v_user_id,
    v_owned;
END;
$$;

COMMIT;

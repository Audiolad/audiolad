-- auth.admin.deleteUser fails while analytics_first_touches.user_id is
-- ON DELETE SET NULL: the rewrite sets user_id to NULL and violates
-- analytics_first_touches_subject_shape_check
-- (subject_type = 'user' requires user_id IS NOT NULL).
--
-- Replace that FK with ON DELETE CASCADE so the user-level first-touch row
-- is removed with the auth user. Anonymous rows keep user_id NULL and are
-- not children of this FK. Does not change the shape check or any row data.
-- Idempotent: drops whatever user_id FK is present (repo default name is
-- analytics_first_touches_user_id_fkey) and re-adds the named CASCADE FK.

DO $$
DECLARE
  v_names text[];
  v_constraint text;
  v_del "char";
BEGIN
  SELECT COALESCE(array_agg(c.conname), ARRAY[]::text[])
  INTO v_names
  FROM pg_constraint AS c
  JOIN pg_attribute AS a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
   AND NOT a.attisdropped
  WHERE c.conrelid = 'public.analytics_first_touches'::regclass
    AND c.contype = 'f'
    AND a.attname = 'user_id';

  FOREACH v_constraint IN ARRAY v_names
  LOOP
    EXECUTE format(
      'ALTER TABLE public.analytics_first_touches DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;

  ALTER TABLE public.analytics_first_touches
    ADD CONSTRAINT analytics_first_touches_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE;

  SELECT c.confdeltype
  INTO v_del
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.analytics_first_touches'::regclass
    AND c.conname = 'analytics_first_touches_user_id_fkey';

  IF v_del IS DISTINCT FROM 'c' THEN
    RAISE EXCEPTION 'analytics_first_touches_user_id_fkey must be ON DELETE CASCADE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    WHERE c.conrelid = 'public.analytics_first_touches'::regclass
      AND c.conname = 'analytics_first_touches_subject_shape_check'
      AND c.contype = 'c'
  ) THEN
    RAISE EXCEPTION 'analytics_first_touches_subject_shape_check missing';
  END IF;
END
$$;

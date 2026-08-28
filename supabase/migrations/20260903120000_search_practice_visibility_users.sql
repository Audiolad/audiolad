-- Allowlist identity search for selected_users authors.
-- Fail-closed: only practice authors/editors. Search resolves user_id only.
-- Email match is exact-only. Does not write user_practices.
-- Does not change catalog_visibility or grants.

BEGIN;

CREATE OR REPLACE FUNCTION public.mask_practice_visibility_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_at integer;
  v_local text;
  v_domain text;
BEGIN
  v_email := btrim(COALESCE(p_email, ''));
  v_at := position('@' IN v_email);

  IF v_at <= 1 OR v_at >= char_length(v_email) THEN
    RETURN NULL;
  END IF;

  v_local := substr(v_email, 1, v_at - 1);
  v_domain := substr(v_email, v_at + 1);

  IF v_local = '' OR v_domain = '' OR position('@' IN v_domain) > 0 THEN
    RETURN NULL;
  END IF;

  IF char_length(v_local) <= 1 THEN
    RETURN '***@' || v_domain;
  END IF;

  IF char_length(v_local) = 2 THEN
    RETURN left(v_local, 1) || '***@' || v_domain;
  END IF;

  IF char_length(v_local) <= 4 THEN
    RETURN left(v_local, 1) || '***' || right(v_local, 1) || '@' || v_domain;
  END IF;

  RETURN left(v_local, 2) || '***' || right(v_local, 2) || '@' || v_domain;
END;
$$;

COMMENT ON FUNCTION public.mask_practice_visibility_email(text) IS
  'audiolad:visibility-mask:v1; privacy-safe email mask; never returns the full local-part';

REVOKE ALL ON FUNCTION public.mask_practice_visibility_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mask_practice_visibility_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.mask_practice_visibility_email(text) FROM authenticated;

-- Draft-only reshape: replace the unmerged append-only attempts table
-- with one row per searching author (bounded by actor count, not keystrokes).
DO $$
BEGIN
  IF to_regclass('public.practice_visibility_search_attempts') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'practice_visibility_search_attempts'
         AND column_name = 'attempted_at'
     )
  THEN
    DROP TABLE public.practice_visibility_search_attempts;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.practice_visibility_search_attempts (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0)
);

ALTER TABLE public.practice_visibility_search_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_visibility_search_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_visibility_search_attempts FROM anon;
REVOKE ALL ON TABLE public.practice_visibility_search_attempts FROM authenticated;
GRANT ALL ON TABLE public.practice_visibility_search_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.search_practice_visibility_users(
  p_practice_id uuid,
  p_query text
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  first_name text,
  last_name text,
  masked_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_query text;
  v_uuid uuid;
  v_is_email boolean;
  v_window timestamptz;
  v_count integer;
  v_tokens text[];
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF to_regprocedure('public.actor_can_manage_practice_as_author(uuid)') IS NOT NULL THEN
    IF NOT public.actor_can_manage_practice_as_author(p_practice_id) THEN
      RAISE EXCEPTION 'not_authorized'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_practice_author_member(p_practice_id, v_actor) THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  v_query := lower(btrim(COALESCE(p_query, '')));

  -- Queries shorter than 2 characters must not scan profiles.
  IF char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  IF char_length(v_query) > 120 THEN
    v_query := left(v_query, 120);
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('practice_visibility_search'),
    hashtext(v_actor::text)
  );

  SELECT a.window_started_at, a.attempt_count
  INTO v_window, v_count
  FROM public.practice_visibility_search_attempts AS a
  WHERE a.user_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.practice_visibility_search_attempts (
      user_id,
      window_started_at,
      attempt_count
    )
    VALUES (v_actor, now(), 1);
  ELSIF v_window <= now() - interval '1 minute' THEN
    UPDATE public.practice_visibility_search_attempts
    SET
      window_started_at = now(),
      attempt_count = 1
    WHERE user_id = v_actor;
  ELSIF v_count >= 60 THEN
    RAISE EXCEPTION 'rate_limited'
      USING ERRCODE = 'P0001';
  ELSE
    UPDATE public.practice_visibility_search_attempts
    SET attempt_count = attempt_count + 1
    WHERE user_id = v_actor;
  END IF;

  BEGIN
    v_uuid := v_query::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_uuid := NULL;
  END;

  v_is_email := position('@' IN v_query) > 0 AND v_query NOT LIKE '% %';
  v_tokens := regexp_split_to_array(v_query, '\s+');

  RETURN QUERY
  SELECT
    matched.user_id,
    matched.display_name,
    NULLIF(split_part(matched.display_name, ' ', 1), '') AS first_name,
    NULLIF(
      NULLIF(btrim(substr(matched.display_name, strpos(matched.display_name, ' '))), ''),
      matched.display_name
    ) AS last_name,
    matched.masked_email
  FROM (
    SELECT
      pr.id AS user_id,
      COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь') AS display_name,
      public.mask_practice_visibility_email(pr.email) AS masked_email
    FROM public.profiles AS pr
    WHERE
      (
        v_uuid IS NOT NULL
        AND pr.id = v_uuid
      )
      OR (
        v_uuid IS NULL
        AND v_is_email
        AND pr.email IS NOT NULL
        AND lower(btrim(pr.email)) = v_query
      )
      OR (
        v_uuid IS NULL
        AND NOT v_is_email
        AND pr.full_name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(v_tokens) AS token(value)
          WHERE token.value <> ''
            AND strpos(lower(pr.full_name), token.value) = 0
        )
      )
    LIMIT 10
  ) AS matched;

  IF v_uuid IS NULL AND v_is_email THEN
    RETURN QUERY
    SELECT
      au.id AS user_id,
      COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь') AS display_name,
      NULLIF(split_part(COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь'), ' ', 1), ''),
      NULLIF(
        NULLIF(
          btrim(substr(
            COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь'),
            strpos(COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь'), ' ')
          )),
          ''
        ),
        COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь')
      ),
      public.mask_practice_visibility_email(COALESCE(pr.email, au.email))
    FROM auth.users AS au
    LEFT JOIN public.profiles AS pr
      ON pr.id = au.id
    WHERE lower(btrim(au.email)) = v_query
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS existing
        WHERE existing.id = au.id
          AND existing.email IS NOT NULL
          AND lower(btrim(existing.email)) = v_query
      )
    LIMIT 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.search_practice_visibility_users(uuid, text) IS
  'audiolad:visibility-search:v2; author-only name/exact-email/uuid allowlist lookup; masked email; never writes user_practices';

REVOKE ALL ON FUNCTION public.search_practice_visibility_users(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_practice_visibility_users(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_practice_visibility_users(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.list_practice_visibility_users(uuid);

CREATE FUNCTION public.list_practice_visibility_users(
  p_practice_id uuid
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  first_name text,
  last_name text,
  masked_email text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF to_regprocedure('public.actor_can_manage_practice_as_author(uuid)') IS NOT NULL THEN
    IF NOT public.actor_can_manage_practice_as_author(p_practice_id) THEN
      RAISE EXCEPTION 'not_authorized'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_practice_author_member(p_practice_id, v_user_id) THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.user_id,
    COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь') AS display_name,
    NULLIF(
      split_part(COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь'), ' ', 1),
      ''
    ) AS first_name,
    NULLIF(
      NULLIF(
        btrim(substr(
          COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь'),
          strpos(COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь'), ' ')
        )),
        ''
      ),
      COALESCE(NULLIF(btrim(pr.full_name), ''), 'Пользователь')
    ) AS last_name,
    public.mask_practice_visibility_email(pr.email) AS masked_email,
    v.created_at
  FROM public.practice_visibility_users AS v
  LEFT JOIN public.profiles AS pr
    ON pr.id = v.user_id
  WHERE v.practice_id = p_practice_id
  ORDER BY v.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.list_practice_visibility_users(uuid) IS
  'audiolad:visibility-list:v2; author-only allowlist rows with masked email; never writes user_practices';

REVOKE ALL ON FUNCTION public.list_practice_visibility_users(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_practice_visibility_users(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_practice_visibility_users(uuid) TO authenticated;

-- Support-mode wrappers must match the restamped list/search return types.
-- list_practice_visibility_users now returns first_name/last_name/masked_email,
-- so the older 3-column wrapper from 20260901130000 must be replaced.
DROP FUNCTION IF EXISTS public.list_practice_visibility_users_with_support_proof(text, uuid);

CREATE FUNCTION public.list_practice_visibility_users_with_support_proof(
  p_token_hash text,
  p_practice_id uuid
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  first_name text,
  last_name text,
  masked_email text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  RETURN QUERY
  SELECT *
  FROM public.list_practice_visibility_users(p_practice_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_practice_visibility_users_with_support_proof(
  p_token_hash text,
  p_practice_id uuid,
  p_query text
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  first_name text,
  last_name text,
  masked_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_author_support_session_proof(p_token_hash);
  RETURN QUERY
  SELECT *
  FROM public.search_practice_visibility_users(p_practice_id, p_query);
END;
$$;

REVOKE ALL ON FUNCTION public.list_practice_visibility_users_with_support_proof(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_practice_visibility_users_with_support_proof(text, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.search_practice_visibility_users_with_support_proof(text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_practice_visibility_users_with_support_proof(text, uuid, text)
  TO authenticated;

COMMIT;

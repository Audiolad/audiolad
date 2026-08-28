-- Allowlist identity search for selected_users authors.
-- Fail-closed: only practice authors/editors. Search resolves user_id only.
-- Does not write user_practices. Does not change catalog_visibility or grants.

BEGIN;

CREATE TABLE IF NOT EXISTS public.practice_visibility_search_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_visibility_search_attempts_user_idx
  ON public.practice_visibility_search_attempts (user_id, attempted_at DESC);

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
  v_recent integer;
  v_tokens text[];
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_practice_author_member(p_practice_id, v_actor) THEN
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

  SELECT count(*)
  INTO v_recent
  FROM public.practice_visibility_search_attempts AS a
  WHERE a.user_id = v_actor
    AND a.attempted_at > now() - interval '1 minute';

  IF v_recent >= 60 THEN
    RAISE EXCEPTION 'rate_limited'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.practice_visibility_search_attempts (user_id)
  VALUES (v_actor);

  BEGIN
    v_uuid := v_query::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_uuid := NULL;
  END;

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
      CASE
        WHEN pr.email IS NULL OR position('@' IN pr.email) <= 1 THEN NULL
        ELSE left(btrim(pr.email), 1) || '***' || substring(btrim(pr.email) FROM position('@' IN btrim(pr.email)))
      END AS masked_email
    FROM public.profiles AS pr
    WHERE
      (
        v_uuid IS NOT NULL
        AND pr.id = v_uuid
      )
      OR (
        v_uuid IS NULL
        AND (
          (
            pr.email IS NOT NULL
            AND strpos(lower(btrim(pr.email)), v_query) > 0
          )
          OR (
            pr.full_name IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM unnest(v_tokens) AS token(value)
              WHERE token.value <> ''
                AND strpos(lower(pr.full_name), token.value) = 0
            )
          )
        )
      )
    LIMIT 10
  ) AS matched;

  IF v_uuid IS NULL
     AND position('@' IN v_query) > 1
     AND NOT v_query LIKE '% %'
  THEN
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
      CASE
        WHEN au.email IS NULL OR position('@' IN au.email) <= 1 THEN NULL
        ELSE left(btrim(au.email), 1) || '***' || substring(btrim(au.email) FROM position('@' IN btrim(au.email)))
      END
    FROM auth.users AS au
    LEFT JOIN public.profiles AS pr
      ON pr.id = au.id
    WHERE lower(btrim(au.email)) = v_query
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS existing
        WHERE existing.id = au.id
          AND (
            existing.email IS NOT NULL
            AND strpos(lower(btrim(existing.email)), v_query) > 0
          )
      )
    LIMIT 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.search_practice_visibility_users(uuid, text) IS
  'audiolad:visibility-search:v1; author-only name/email/uuid allowlist lookup; returns masked email; never writes user_practices';

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

  IF NOT public.is_practice_author_member(p_practice_id, v_user_id) THEN
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
    CASE
      WHEN pr.email IS NULL OR position('@' IN pr.email) <= 1 THEN NULL
      ELSE left(btrim(pr.email), 1) || '***' || substring(btrim(pr.email) FROM position('@' IN btrim(pr.email)))
    END AS masked_email,
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

COMMIT;

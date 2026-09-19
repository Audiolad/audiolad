-- Author space slug history + safe rename / empty-space delete.
-- History stores old_slug -> author_id; resolve current slug from authors.

BEGIN;

CREATE TABLE IF NOT EXISTS public.author_slug_redirects (
  old_slug text PRIMARY KEY,
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT author_slug_redirects_old_slug_format_check
    CHECK (old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE INDEX IF NOT EXISTS author_slug_redirects_author_id_idx
  ON public.author_slug_redirects (author_id);

COMMENT ON TABLE public.author_slug_redirects IS
  'Historical author public slugs. Lookup old_slug -> author_id, then redirect to current authors.slug.';

ALTER TABLE public.author_slug_redirects ENABLE ROW LEVEL SECURITY;

-- No direct public SELECT: history is exposed only via resolve_author_slug_redirect.
DROP POLICY IF EXISTS author_slug_redirects_public_select ON public.author_slug_redirects;

REVOKE ALL ON TABLE public.author_slug_redirects FROM PUBLIC;
REVOKE ALL ON TABLE public.author_slug_redirects FROM anon, authenticated;
GRANT ALL ON TABLE public.author_slug_redirects TO service_role;

-- Current slug must not collide with another author's historical slug.
CREATE OR REPLACE FUNCTION public.enforce_author_slug_namespace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.author_slug_redirects AS r
    WHERE r.old_slug = NEW.slug
      AND r.author_id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'slug_taken'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_authors_slug_namespace ON public.authors;
CREATE TRIGGER trg_authors_slug_namespace
  BEFORE INSERT OR UPDATE OF slug ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_author_slug_namespace();

-- Skip historical slugs when auto-allocating.
CREATE OR REPLACE FUNCTION public.allocate_unique_author_slug(p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_base text := public.slugify_author_display_name(p_name);
  v_candidate text := v_base;
  v_suffix integer := 2;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.authors AS a WHERE a.slug = v_candidate
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.author_slug_redirects AS r WHERE r.old_slug = v_candidate
    );
    v_candidate := v_base || '-' || v_suffix::text;
    v_suffix := v_suffix + 1;
  END LOOP;
  RETURN v_candidate;
END;
$$;


-- Transactional namespace lock shared by rename + create so current/history
-- cannot race across concurrent sessions for the same normalized slug.
CREATE OR REPLACE FUNCTION public.acquire_author_slug_namespace_lock(p_slug text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug text := lower(btrim(coalesce(p_slug, '')));
BEGIN
  IF v_slug = '' THEN
    RAISE EXCEPTION 'slug_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('author_slug_namespace:' || v_slug, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.author_space_has_published_practice(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.author_id = p_author_id
      AND p.status = 'published'
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.author_space_has_finance_history(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.author_ledger_entries AS e WHERE e.author_id = p_author_id
    )
    OR EXISTS (
      SELECT 1 FROM public.author_payouts AS pay WHERE pay.author_id = p_author_id
    )
    OR EXISTS (
      SELECT 1 FROM public.orders AS o WHERE o.author_id_snapshot = p_author_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.author_appreciation_payment_intents AS i
      WHERE i.author_id = p_author_id
    );
$$;

CREATE OR REPLACE FUNCTION public.author_space_delete_blockers(p_author_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_blockers text[] := ARRAY[]::text[];
BEGIN
  -- Any practice row (including soft-deleted) blocks hard delete: FK is SET NULL,
  -- and soft-deleted rows still occupy author_id.
  IF EXISTS (SELECT 1 FROM public.practices AS p WHERE p.author_id = p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_practices');
  END IF;

  IF public.author_space_has_finance_history(p_author_id) THEN
    v_blockers := array_append(v_blockers, 'has_finance');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.author_commercial_applications AS a WHERE a.author_id = p_author_id
  ) THEN
    v_blockers := array_append(v_blockers, 'has_commercial_application');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.author_payout_profiles AS p WHERE p.author_id = p_author_id
  ) THEN
    v_blockers := array_append(v_blockers, 'has_payout_profile');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.author_terms_acceptances AS t WHERE t.author_id = p_author_id
  ) THEN
    v_blockers := array_append(v_blockers, 'has_terms_acceptance');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.personal_materials AS m WHERE m.author_id = p_author_id
  ) THEN
    v_blockers := array_append(v_blockers, 'has_personal_materials');
  END IF;

  -- Optional tables: nest IF so the planner never resolves missing relations.
  IF to_regclass('public.studio_projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.studio_projects AS s WHERE s.author_id = p_author_id) THEN
      v_blockers := array_append(v_blockers, 'has_studio_project');
    END IF;
  END IF;

  IF to_regclass('public.audiobook_projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.audiobook_projects AS b WHERE b.author_id = p_author_id) THEN
      v_blockers := array_append(v_blockers, 'has_audiobook_project');
    END IF;
  END IF;

  IF to_regclass('public.practice_moderation_email_outbox') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.practice_moderation_email_outbox AS o WHERE o.author_id = p_author_id
    ) THEN
      v_blockers := array_append(v_blockers, 'has_moderation_outbox');
    END IF;
  END IF;

  RETURN v_blockers;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_change_author_slug(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'forbidden');
  END IF;

  v_is_admin := public.has_platform_permission(v_uid, 'authors.manage');

  SELECT EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.author_id = p_author_id
      AND m.user_id = v_uid
      AND m.role = 'owner'
  ) INTO v_is_owner;

  IF v_is_admin THEN
    RETURN jsonb_build_object('allowed', true, 'code', 'ok', 'as_admin', true);
  END IF;

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'forbidden');
  END IF;

  IF public.author_space_has_published_practice(p_author_id) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'slug_change_locked_published');
  END IF;

  IF public.author_space_has_finance_history(p_author_id) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'slug_change_locked_finance');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'ok', 'as_admin', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_delete_author_space(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_blockers text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'forbidden');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.author_id = p_author_id
      AND m.user_id = v_uid
      AND m.role = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'forbidden');
  END IF;

  v_blockers := public.author_space_delete_blockers(p_author_id);
  IF coalesce(array_length(v_blockers, 1), 0) > 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'delete_blocked',
      'blockers', to_jsonb(v_blockers)
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.change_author_slug(
  p_author_id uuid,
  p_new_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_eligibility jsonb;
  v_old_slug text;
  v_new_slug text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;

  v_new_slug := lower(btrim(coalesce(p_new_slug, '')));

  IF v_new_slug = '' OR v_new_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     OR char_length(v_new_slug) < 2 OR char_length(v_new_slug) > 80 THEN
    RAISE EXCEPTION 'slug_invalid' USING ERRCODE = '22023';
  END IF;

  -- Serialize namespace claims for the destination slug before reading/writing.
  PERFORM public.acquire_author_slug_namespace_lock(v_new_slug);

  SELECT a.slug, a.name
  INTO v_old_slug, v_name
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_eligibility := public.can_change_author_slug(p_author_id);
  IF coalesce((v_eligibility ->> 'allowed')::boolean, false) IS NOT TRUE THEN
    IF (v_eligibility ->> 'code') IN (
      'slug_change_locked_published',
      'slug_change_locked_finance'
    ) THEN
      RAISE EXCEPTION 'slug_change_locked' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_new_slug = v_old_slug THEN
    RETURN jsonb_build_object(
      'ok', true,
      'noop', true,
      'author_id', p_author_id,
      'slug', v_old_slug,
      'previous_slug', v_old_slug
    );
  END IF;

  -- Also lock the slug leaving current→history so concurrent create cannot steal it.
  PERFORM public.acquire_author_slug_namespace_lock(v_old_slug);

  -- Reclaim own historical slug.
  DELETE FROM public.author_slug_redirects AS r
  WHERE r.old_slug = v_new_slug
    AND r.author_id = p_author_id;

  IF EXISTS (
    SELECT 1 FROM public.authors AS a
    WHERE a.slug = v_new_slug AND a.id IS DISTINCT FROM p_author_id
  ) OR EXISTS (
    SELECT 1 FROM public.author_slug_redirects AS r
    WHERE r.old_slug = v_new_slug AND r.author_id IS DISTINCT FROM p_author_id
  ) THEN
    RAISE EXCEPTION 'slug_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.author_slug_redirects (old_slug, author_id, created_by)
  VALUES (v_old_slug, p_author_id, v_uid)
  ON CONFLICT (old_slug) DO UPDATE
    SET author_id = EXCLUDED.author_id,
        created_at = now(),
        created_by = EXCLUDED.created_by;

  BEGIN
    UPDATE public.authors AS a
    SET slug = v_new_slug,
        updated_at = now()
    WHERE a.id = p_author_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'slug_taken' USING ERRCODE = '23505';
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'noop', false,
    'author_id', p_author_id,
    'slug', v_new_slug,
    'previous_slug', v_old_slug,
    'name', v_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_empty_author_space(p_author_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_name text;
  v_blockers text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT a.slug, a.name
  INTO v_slug, v_name
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS m
    WHERE m.author_id = p_author_id
      AND m.user_id = v_uid
      AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_blockers := public.author_space_delete_blockers(p_author_id);
  IF coalesce(array_length(v_blockers, 1), 0) > 0 THEN
    RAISE EXCEPTION 'delete_blocked'
      USING ERRCODE = 'P0001',
            DETAIL = array_to_string(v_blockers, ',');
  END IF;

  DELETE FROM public.authors AS a WHERE a.id = p_author_id;

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', p_author_id,
    'slug', v_slug,
    'name', v_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_author_slug_redirect(p_old_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text := lower(btrim(coalesce(p_old_slug, '')));
  v_author_id uuid;
  v_current text;
BEGIN
  IF v_slug = '' THEN
    RETURN NULL;
  END IF;

  SELECT r.author_id INTO v_author_id
  FROM public.author_slug_redirects AS r
  WHERE r.old_slug = v_slug;

  IF v_author_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.slug INTO v_current
  FROM public.authors AS a
  WHERE a.id = v_author_id;

  IF v_current IS NULL OR v_current = v_slug THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'author_id', v_author_id,
    'current_slug', v_current,
    'old_slug', v_slug
  );
END;
$$;

-- Patch latest create_author_project: reject slugs present in redirect history.
CREATE OR REPLACE FUNCTION public.create_author_project(
  p_name text,
  p_slug text DEFAULT NULL,
  p_short_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug_input text := nullif(btrim(coalesce(p_slug, '')), '');
  v_slug text;
  v_description text := nullif(btrim(coalesce(p_short_description, '')), '');
  v_limit integer;
  v_unlimited boolean;
  v_purchased integer;
  v_used integer;
  v_author_id uuid;
  v_base integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'invalid_project_name' USING ERRCODE = '22023';
  END IF;

  IF v_description IS NOT NULL AND char_length(v_description) > 280 THEN
    RAISE EXCEPTION 'invalid_project_description' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT
    coalesce(p.author_projects_unlimited, false),
    coalesce(p.author_project_slots_purchased, 0),
    CASE
      WHEN p.author_project_limit_override IS NOT NULL
           AND p.author_project_limit_override >= 1
        THEN p.author_project_limit_override
      WHEN coalesce(p.author_premium_enabled, false) THEN 3
      ELSE 1
    END
  INTO v_unlimited, v_purchased, v_base
  FROM public.profiles AS p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_unlimited IS NULL THEN
    v_unlimited := false;
  END IF;
  IF v_base IS NULL THEN
    v_base := 1;
  END IF;
  IF v_purchased IS NULL OR v_purchased < 0 THEN
    v_purchased := 0;
  END IF;

  v_limit := v_base + v_purchased;

  SELECT count(*)::integer
  INTO v_used
  FROM public.author_members AS am
  WHERE am.user_id = v_user_id
    AND am.role = 'owner';

  IF NOT v_unlimited AND v_used >= v_limit THEN
    RAISE EXCEPTION 'author_project_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF v_slug_input IS NOT NULL THEN
    v_slug := public.slugify_author_display_name(v_slug_input);
    IF v_slug IS NULL OR char_length(v_slug) < 2 THEN
      RAISE EXCEPTION 'invalid_project_slug' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_slug := public.allocate_unique_author_slug(v_name);
  END IF;

  -- Shared transactional namespace lock with change_author_slug.
  PERFORM public.acquire_author_slug_namespace_lock(v_slug);

  IF EXISTS (SELECT 1 FROM public.authors AS a WHERE a.slug = v_slug)
     OR EXISTS (SELECT 1 FROM public.author_slug_redirects AS r WHERE r.old_slug = v_slug) THEN
    RAISE EXCEPTION 'project_slug_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.authors (
    name, slug, author_type, access_status, short_bio, description
  ) VALUES (
    v_name, v_slug, 'project', 'free', v_description, v_description
  )
  RETURNING id INTO v_author_id;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, v_user_id, 'owner');

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_author_id,
    'slug', v_slug,
    'name', v_name,
    'used', v_used + 1,
    'limit', CASE WHEN v_unlimited THEN NULL ELSE v_limit END,
    'unlimited', v_unlimited
  );
END;
$$;

-- Internal helpers: not callable via PostgREST (no PUBLIC EXECUTE).
REVOKE ALL ON FUNCTION public.enforce_author_slug_namespace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_unique_author_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_space_has_published_practice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_space_has_finance_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_space_delete_blockers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_author_slug_namespace_lock(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.can_change_author_slug(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_delete_author_space(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_author_slug(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_empty_author_space(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_author_slug_redirect(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_author_project(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_change_author_slug(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_author_space(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_author_slug(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_empty_author_space(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_author_slug_redirect(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_author_project(text, text, text) TO authenticated;

COMMIT;

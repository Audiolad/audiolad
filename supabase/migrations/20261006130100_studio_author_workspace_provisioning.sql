BEGIN;

-- Platform-only provisioner for a Studio author workspace. The function body
-- executes as one transaction, so the workspace, owner membership, and audit
-- row either all commit or all roll back.
CREATE OR REPLACE FUNCTION public.provision_studio_author_workspace(
  p_name text,
  p_slug text,
  p_owner_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := btrim(coalesce(p_slug, ''));
  v_owner_email text;
  v_author_id uuid;
  v_constraint_name text;
BEGIN
  IF v_actor_user_id IS NULL
    OR NOT public.has_platform_permission(v_actor_user_id, 'authors.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_studio_name' USING ERRCODE = '22023';
  END IF;

  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(v_slug) < 2 THEN
    RAISE EXCEPTION 'invalid_studio_slug' USING ERRCODE = '22023';
  END IF;

  SELECT u.email
  INTO v_owner_email
  FROM auth.users AS u
  WHERE u.id = p_owner_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_user_not_found' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    INSERT INTO public.authors (name, slug, author_type, access_status)
    VALUES (v_name, v_slug, 'studio', 'free')
    RETURNING id INTO v_author_id;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'authors_slug_key' THEN
        RAISE EXCEPTION 'studio_slug_taken' USING ERRCODE = '23505';
      END IF;
      RAISE;
  END;

  INSERT INTO public.author_members (author_id, user_id, role)
  VALUES (v_author_id, p_owner_user_id, 'owner');

  INSERT INTO public.admin_operation_log (
    operation,
    actor_user_id,
    target_auth_user_id,
    target_email_hash,
    counts,
    status
  ) VALUES (
    'studio_author_workspace_provisioned',
    v_actor_user_id,
    p_owner_user_id,
    CASE
      WHEN nullif(btrim(v_owner_email), '') IS NULL THEN 'studio_author_workspace'
      ELSE encode(digest(lower(btrim(v_owner_email)), 'sha256'), 'hex')
    END,
    jsonb_build_object(
      'author_id', v_author_id,
      'slug', v_slug,
      'author_type', 'studio',
      'owner_user_id', p_owner_user_id
    ),
    'success'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'author_id', v_author_id,
    'slug', v_slug,
    'name', v_name,
    'owner_user_id', p_owner_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_studio_author_workspace(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_studio_author_workspace(text, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.provision_studio_author_workspace(text, text, uuid) IS
  'Platform authors.manage-only atomic Studio workspace provisioner: author, owner membership, and audit row.';

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- Normalize email helper (matches app policy: trim + lower domain)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_contact_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT
    CASE
      WHEN p_email IS NULL OR btrim(p_email) = '' THEN NULL
      WHEN position('@' IN btrim(p_email)) <= 1 THEN NULL
      WHEN position('@' IN btrim(p_email)) <> length(btrim(p_email)) - position('@' IN reverse(btrim(p_email))) + 1 THEN NULL
      ELSE
        split_part(btrim(p_email), '@', 1)
        || '@'
        || lower(split_part(btrim(p_email), '@', 2))
    END;
$$;

REVOKE ALL ON FUNCTION public.normalize_contact_email(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Idempotent contact + default preferences sync
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_email_contact_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_email text;
  v_normalized_email text;
  v_contact_id uuid;
  v_confirmed_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'sync_email_contact_for_user: user_id is required';
  END IF;

  SELECT
    u.email,
    u.email_confirmed_at
  INTO v_auth_email, v_confirmed_at
  FROM auth.users AS u
  WHERE u.id = p_user_id;

  IF NOT FOUND OR v_auth_email IS NULL OR btrim(v_auth_email) = '' THEN
    RETURN NULL;
  END IF;

  v_normalized_email := public.normalize_contact_email(v_auth_email);

  IF v_normalized_email IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ec.id
  INTO v_contact_id
  FROM public.email_contacts AS ec
  WHERE ec.user_id = p_user_id
    AND ec.status = 'active'
  LIMIT 1;

  IF v_contact_id IS NOT NULL THEN
    UPDATE public.email_contacts
    SET
      email = v_auth_email,
      normalized_email = v_normalized_email,
      email_verified_at = COALESCE(v_confirmed_at, email_verified_at),
      last_seen_at = now(),
      updated_at = now()
    WHERE id = v_contact_id;

    UPDATE public.profiles
    SET email = v_auth_email
    WHERE id = p_user_id
      AND (email IS DISTINCT FROM v_auth_email);

    INSERT INTO public.email_preferences (
      contact_id,
      user_id
    )
    VALUES (v_contact_id, p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN v_contact_id;
  END IF;

  SELECT ec.id
  INTO v_contact_id
  FROM public.email_contacts AS ec
  WHERE ec.normalized_email = v_normalized_email
    AND ec.status = 'active'
  LIMIT 1;

  IF v_contact_id IS NOT NULL THEN
    UPDATE public.email_contacts
    SET
      user_id = p_user_id,
      email = v_auth_email,
      normalized_email = v_normalized_email,
      contact_type = 'registered_user',
      source = COALESCE(source, 'signup'),
      email_verified_at = COALESCE(v_confirmed_at, email_verified_at),
      last_seen_at = now(),
      updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    INSERT INTO public.email_contacts (
      user_id,
      email,
      normalized_email,
      contact_type,
      status,
      source,
      email_verified_at,
      last_seen_at
    )
    VALUES (
      p_user_id,
      v_auth_email,
      v_normalized_email,
      'registered_user',
      'active',
      'signup',
      v_confirmed_at,
      now()
    )
    RETURNING id INTO v_contact_id;
  END IF;

  UPDATE public.profiles
  SET email = v_auth_email
  WHERE id = p_user_id
    AND (email IS DISTINCT FROM v_auth_email);

  INSERT INTO public.email_preferences (
    contact_id,
    user_id
  )
  VALUES (v_contact_id, p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_contact_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_email_contact_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_email_contact_for_user(uuid) TO service_role;

COMMENT ON FUNCTION public.sync_email_contact_for_user(uuid) IS
  'Idempotent signup sync: email_contacts + default email_preferences for a user.';

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_email_contact_on_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.sync_email_contact_for_user(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_email_contact_on_insert ON public.profiles;
CREATE TRIGGER profiles_sync_email_contact_on_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_contact_on_profile_insert();

-- ---------------------------------------------------------------------------
-- Marketing consent on signup (append-only, idempotent for signup source)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_listener_marketing_consent_signup(
  p_text_version text,
  p_source text DEFAULT 'signup_checkbox'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_contact_id uuid;
  v_existing uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_text_version IS NULL OR btrim(p_text_version) = '' THEN
    RAISE EXCEPTION 'invalid_text_version';
  END IF;

  v_contact_id := public.sync_email_contact_for_user(v_user_id);

  IF v_contact_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT ec.id
  INTO v_existing
  FROM public.email_consents AS ec
  WHERE ec.contact_id = v_contact_id
    AND ec.purpose = 'listener_marketing'
    AND ec.source = COALESCE(p_source, 'signup_checkbox')
    AND ec.text_version = p_text_version
    AND ec.status = 'granted'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.email_preferences
    SET
      listener_marketing = true,
      listener_recommendations = true,
      platform_news = true,
      updated_at = now()
    WHERE user_id = v_user_id;

    RETURN false;
  END IF;

  INSERT INTO public.email_consents (
    contact_id,
    user_id,
    purpose,
    status,
    legal_basis,
    text_version,
    source,
    granted_at
  )
  VALUES (
    v_contact_id,
    v_user_id,
    'listener_marketing',
    'granted',
    'consent',
    p_text_version,
    COALESCE(p_source, 'signup_checkbox'),
    now()
  );

  UPDATE public.email_preferences
  SET
    listener_marketing = true,
    listener_recommendations = true,
    platform_news = true,
    updated_at = now()
  WHERE user_id = v_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_listener_marketing_consent_signup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_listener_marketing_consent_signup(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reconciliation (service role / manual only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reconcile_email_contacts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user record;
  v_count integer := 0;
BEGIN
  FOR v_user IN
    SELECT p.id
    FROM public.profiles AS p
    LEFT JOIN public.email_contacts AS ec
      ON ec.user_id = p.id
     AND ec.status = 'active'
    WHERE ec.id IS NULL
  LOOP
    PERFORM public.sync_email_contact_for_user(v_user.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_email_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_email_contacts() TO service_role;

-- ---------------------------------------------------------------------------
-- handle_new_user: populate profiles.full_name from auth metadata
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  grant_function_comment text;
  expected_grant_contract constant text :=
    'audiolad:starter-grant:v1; grants active published free zero-price starter practices; idempotent; returns inserted row count';
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_meta jsonb;
BEGIN
  SELECT obj_description(
    'public.grant_active_starter_practices(uuid)'::regprocedure,
    'pg_proc'
  )
  INTO grant_function_comment;

  IF grant_function_comment IS DISTINCT FROM expected_grant_contract THEN
    RAISE EXCEPTION 'Required starter grant function contract version v1 is not installed';
  END IF;

  v_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  v_first_name := NULLIF(btrim(v_meta->>'first_name'), '');
  v_last_name := NULLIF(btrim(v_meta->>'last_name'), '');
  v_full_name := NULLIF(btrim(v_meta->>'full_name'), '');

  IF v_full_name IS NULL AND (v_first_name IS NOT NULL OR v_last_name IS NOT NULL) THEN
    v_full_name := btrim(concat_ws(' ', v_first_name, v_last_name));
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    'listener'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  PERFORM public.grant_active_starter_practices(NEW.id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'audiolad:new-user:v1; creates listener profile with full_name, grants starter library using audiolad:starter-grant:v1';

COMMIT;

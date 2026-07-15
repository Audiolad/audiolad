-- Personal materials foundation (P1).
-- Idempotent where practical. DO NOT apply to production without explicit approval.
--
-- Scope:
--   - personal_materials
--   - personal_material_author_notes (author-only internal notes)
--   - personal_material_progress
--   - private bucket personal-materials (service-role access only)
--   - RLS: author SELECT on base tables; owner reads via SECURITY DEFINER RPC only
--   - RPC: create, update draft, activate, revoke, rotate, soft delete, claim,
--          owner read/list, progress upsert/get

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Internal helpers (not granted to clients)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.personal_materials_normalize_optional_text(
  p_text text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(btrim(p_text), '');
$$;

CREATE OR REPLACE FUNCTION public.personal_materials_assert_author_access(
  p_author_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = p_author_id
      AND am.user_id = p_user_id
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.personal_materials_normalize_optional_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.personal_materials_assert_author_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.personal_materials_assert_author_access(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.personal_materials_assert_author_access(uuid, uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 1. personal_materials
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personal_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE RESTRICT,

  created_by uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,

  material_type text NOT NULL DEFAULT 'diagnostic',
  title text NULL,

  client_first_name text NOT NULL,
  client_last_name text NOT NULL,
  material_date date NOT NULL,

  description text NULL,
  personal_recommendation text NULL,

  audio_path text NULL,
  audio_original_filename text NULL,
  audio_mime_type text NULL,
  audio_size_bytes bigint NULL,
  duration_seconds integer NULL,

  pdf_path text NULL,
  pdf_original_filename text NULL,
  pdf_mime_type text NULL,
  pdf_size_bytes bigint NULL,

  status text NOT NULL DEFAULT 'draft',

  access_token_hash bytea NULL,
  guest_access_enabled boolean NOT NULL DEFAULT false,
  token_created_at timestamptz NULL,
  expires_at timestamptz NULL,

  claimed_by_user_id uuid NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  claimed_at timestamptz NULL,

  first_opened_at timestamptz NULL,
  first_audio_started_at timestamptz NULL,

  revoked_at timestamptz NULL,
  deleted_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT personal_materials_material_type_check
    CHECK (
      material_type IN (
        'diagnostic',
        'audio_review',
        'personal_meditation',
        'recommendation',
        'consultation_material',
        'homework',
        'personal_music',
        'other'
      )
    ),

  CONSTRAINT personal_materials_status_check
    CHECK (status IN ('draft', 'active', 'revoked', 'deleted')),

  CONSTRAINT personal_materials_client_first_name_not_blank_check
    CHECK (btrim(client_first_name) <> ''),

  CONSTRAINT personal_materials_client_last_name_not_blank_check
    CHECK (btrim(client_last_name) <> ''),

  CONSTRAINT personal_materials_audio_size_bytes_non_negative_check
    CHECK (audio_size_bytes IS NULL OR audio_size_bytes >= 0),

  CONSTRAINT personal_materials_pdf_size_bytes_non_negative_check
    CHECK (pdf_size_bytes IS NULL OR pdf_size_bytes >= 0),

  CONSTRAINT personal_materials_duration_seconds_positive_check
    CHECK (duration_seconds IS NULL OR duration_seconds > 0),

  CONSTRAINT personal_materials_claimed_consistency_check
    CHECK (
      (claimed_by_user_id IS NULL AND claimed_at IS NULL)
      OR (claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL)
    ),

  CONSTRAINT personal_materials_revoked_consistency_check
    CHECK (
      status <> 'revoked'
      OR revoked_at IS NOT NULL
    ),

  CONSTRAINT personal_materials_deleted_consistency_check
    CHECK (
      status <> 'deleted'
      OR deleted_at IS NOT NULL
    ),

  CONSTRAINT personal_materials_active_token_check
    CHECK (
      status <> 'active'
      OR access_token_hash IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS personal_materials_access_token_hash_unique_idx
  ON public.personal_materials (access_token_hash)
  WHERE access_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS personal_materials_author_created_idx
  ON public.personal_materials (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS personal_materials_claimed_user_created_idx
  ON public.personal_materials (claimed_by_user_id, created_at DESC)
  WHERE claimed_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS personal_materials_status_idx
  ON public.personal_materials (status);

COMMENT ON TABLE public.personal_materials IS
  'Private personal materials (diagnostics and future 1:1 author-to-client deliveries). Never part of public catalog. Author display name lives in authors, not duplicated here.';

COMMENT ON COLUMN public.personal_materials.title IS
  'Optional custom title. UI fallback (e.g. "Персональная диагностика") is computed client-side, not stored automatically.';

COMMENT ON COLUMN public.personal_materials.access_token_hash IS
  'SHA-256 hash of the guest access token. Raw token is never stored. Preserved after soft delete for audit and hash reuse prevention.';

COMMENT ON COLUMN public.personal_materials.guest_access_enabled IS
  'When false, guest URL access is blocked. Set to false after successful claim and on revoke/delete.';

-- ---------------------------------------------------------------------------
-- 2. personal_material_author_notes (author-only; never exposed to clients)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personal_material_author_notes (
  personal_material_id uuid PRIMARY KEY
    REFERENCES public.personal_materials (id) ON DELETE CASCADE,

  author_notes text NULL,

  updated_by uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,

  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.personal_material_author_notes IS
  'Internal author-only notes. Never returned to claimed owners or guest APIs.';

-- ---------------------------------------------------------------------------
-- 3. personal_material_progress
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personal_material_progress (
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,

  personal_material_id uuid NOT NULL
    REFERENCES public.personal_materials (id) ON DELETE CASCADE,

  position_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, personal_material_id),

  CONSTRAINT personal_material_progress_position_non_negative_check
    CHECK (position_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS personal_material_progress_material_idx
  ON public.personal_material_progress (personal_material_id);

COMMENT ON TABLE public.personal_material_progress IS
  'Per-user playback progress for claimed personal materials only. Guest progress before claim stays in localStorage.';

-- ---------------------------------------------------------------------------
-- 4. create_personal_material
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_personal_material(
  p_author_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_material_date date,
  p_material_type text DEFAULT 'diagnostic',
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_personal_recommendation text DEFAULT NULL,
  p_author_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_material_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  PERFORM public.personal_materials_assert_author_access(p_author_id, v_user_id);

  IF p_material_type IS NULL OR p_material_type NOT IN (
    'diagnostic',
    'audio_review',
    'personal_meditation',
    'recommendation',
    'consultation_material',
    'homework',
    'personal_music',
    'other'
  ) THEN
    RAISE EXCEPTION 'invalid_material_type'
      USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(p_client_first_name, '')) = ''
     OR btrim(COALESCE(p_client_last_name, '')) = ''
     OR p_material_date IS NULL THEN
    RAISE EXCEPTION 'invalid_client_fields'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.personal_materials (
    author_id,
    created_by,
    material_type,
    title,
    client_first_name,
    client_last_name,
    material_date,
    description,
    personal_recommendation,
    status,
    guest_access_enabled
  )
  VALUES (
    p_author_id,
    v_user_id,
    p_material_type,
    public.personal_materials_normalize_optional_text(p_title),
    btrim(p_client_first_name),
    btrim(p_client_last_name),
    p_material_date,
    public.personal_materials_normalize_optional_text(p_description),
    public.personal_materials_normalize_optional_text(p_personal_recommendation),
    'draft',
    false
  )
  RETURNING id INTO v_material_id;

  IF public.personal_materials_normalize_optional_text(p_author_notes) IS NOT NULL THEN
    INSERT INTO public.personal_material_author_notes (
      personal_material_id,
      author_notes,
      updated_by
    )
    VALUES (
      v_material_id,
      public.personal_materials_normalize_optional_text(p_author_notes),
      v_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'material_id', v_material_id,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_personal_material(uuid, text, text, date, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_personal_material(uuid, text, text, date, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_personal_material(uuid, text, text, date, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_personal_material(uuid, text, text, date, text, text, text, text, text) IS
  'audiolad:personal-material-create:v1; draft only; created_by = auth.uid(); no token';

-- ---------------------------------------------------------------------------
-- 5. update_personal_material_draft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_personal_material_draft(
  p_material_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_material_date date,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_personal_recommendation text DEFAULT NULL,
  p_author_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
  v_user_id uuid;
  v_normalized_notes text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, v_user_id);

  IF v_material.status <> 'draft' THEN
    RAISE EXCEPTION 'material_not_editable'
      USING ERRCODE = '22023';
  END IF;

  IF btrim(COALESCE(p_client_first_name, '')) = ''
     OR btrim(COALESCE(p_client_last_name, '')) = ''
     OR p_material_date IS NULL THEN
    RAISE EXCEPTION 'invalid_client_fields'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    client_first_name = btrim(p_client_first_name),
    client_last_name = btrim(p_client_last_name),
    material_date = p_material_date,
    title = public.personal_materials_normalize_optional_text(p_title),
    description = public.personal_materials_normalize_optional_text(p_description),
    personal_recommendation = public.personal_materials_normalize_optional_text(p_personal_recommendation),
    updated_at = now()
  WHERE pm.id = p_material_id;

  v_normalized_notes := public.personal_materials_normalize_optional_text(p_author_notes);

  IF v_normalized_notes IS NULL THEN
    DELETE FROM public.personal_material_author_notes AS n
    WHERE n.personal_material_id = p_material_id;
  ELSE
    INSERT INTO public.personal_material_author_notes (
      personal_material_id,
      author_notes,
      updated_by
    )
    VALUES (
      p_material_id,
      v_normalized_notes,
      v_user_id
    )
    ON CONFLICT (personal_material_id) DO UPDATE
    SET
      author_notes = EXCLUDED.author_notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_personal_material_draft(uuid, text, text, date, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_personal_material_draft(uuid, text, text, date, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_personal_material_draft(uuid, text, text, date, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_personal_material_draft(uuid, text, text, date, text, text, text, text) IS
  'audiolad:personal-material-update-draft:v1; draft only; protected fields immutable';

-- ---------------------------------------------------------------------------
-- 6. activate_personal_material
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activate_personal_material(
  p_material_id uuid,
  p_access_token_hash bytea
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_access_token_hash IS NULL OR octet_length(p_access_token_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid_token_hash'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, auth.uid());

  IF v_material.status = 'deleted' THEN
    RAISE EXCEPTION 'material_deleted'
      USING ERRCODE = 'P0002';
  END IF;

  IF btrim(v_material.client_first_name) = ''
     OR btrim(v_material.client_last_name) = ''
     OR v_material.material_date IS NULL
     OR v_material.material_type IS NULL
     OR v_material.audio_path IS NULL
     OR btrim(v_material.audio_path) = ''
     OR v_material.duration_seconds IS NULL
     OR v_material.duration_seconds <= 0 THEN
    RAISE EXCEPTION 'material_not_ready'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    access_token_hash = p_access_token_hash,
    guest_access_enabled = true,
    token_created_at = now(),
    status = 'active',
    revoked_at = NULL,
    deleted_at = NULL,
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_personal_material(uuid, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_personal_material(uuid, bytea) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_personal_material(uuid, bytea) TO authenticated;

COMMENT ON FUNCTION public.activate_personal_material(uuid, bytea) IS
  'audiolad:personal-material-activate:v1; title optional; stores SHA-256 token hash only';

-- ---------------------------------------------------------------------------
-- 7. rotate_personal_material_access_token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rotate_personal_material_access_token(
  p_material_id uuid,
  p_new_access_token_hash bytea,
  p_enable_guest_access boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
  v_enable_guest boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_new_access_token_hash IS NULL OR octet_length(p_new_access_token_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid_token_hash'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, auth.uid());

  IF v_material.status = 'deleted' THEN
    RAISE EXCEPTION 'material_deleted'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_material.claimed_by_user_id IS NOT NULL AND p_enable_guest_access IS TRUE THEN
    RAISE EXCEPTION 'guest_access_not_allowed_for_claimed_material'
      USING ERRCODE = '22023';
  END IF;

  v_enable_guest := COALESCE(p_enable_guest_access, false);

  IF v_material.claimed_by_user_id IS NOT NULL THEN
    v_enable_guest := false;
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    access_token_hash = p_new_access_token_hash,
    token_created_at = now(),
    guest_access_enabled = v_enable_guest,
    status = CASE
      WHEN pm.status = 'revoked' THEN 'active'
      ELSE pm.status
    END,
    revoked_at = NULL,
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'guest_access_enabled', v_enable_guest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_personal_material_access_token(uuid, bytea, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_personal_material_access_token(uuid, bytea, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rotate_personal_material_access_token(uuid, bytea, boolean) TO authenticated;

COMMENT ON FUNCTION public.rotate_personal_material_access_token(uuid, bytea, boolean) IS
  'audiolad:personal-material-rotate-token:v1; forbidden for deleted materials';

-- ---------------------------------------------------------------------------
-- 8. revoke_personal_material
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_personal_material(
  p_material_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, auth.uid());

  IF v_material.status = 'deleted' THEN
    RETURN jsonb_build_object(
      'material_id', p_material_id,
      'status', 'deleted',
      'idempotent', true
    );
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    status = 'revoked',
    guest_access_enabled = false,
    revoked_at = COALESCE(pm.revoked_at, now()),
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', 'revoked'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_personal_material(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_personal_material(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_personal_material(uuid) TO authenticated;

COMMENT ON FUNCTION public.revoke_personal_material(uuid) IS
  'audiolad:personal-material-revoke:v1; disables guest URL access; claimed owner access preserved';

-- ---------------------------------------------------------------------------
-- 9. soft_delete_personal_material
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_personal_material(
  p_material_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.personal_materials_assert_author_access(v_material.author_id, auth.uid());

  IF v_material.status = 'deleted' THEN
    RETURN jsonb_build_object(
      'material_id', p_material_id,
      'status', 'deleted',
      'idempotent', true
    );
  END IF;

  UPDATE public.personal_materials AS pm
  SET
    status = 'deleted',
    deleted_at = COALESCE(pm.deleted_at, now()),
    guest_access_enabled = false,
    updated_at = now()
  WHERE pm.id = p_material_id;

  RETURN jsonb_build_object(
    'material_id', p_material_id,
    'status', 'deleted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_personal_material(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_personal_material(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_personal_material(uuid) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_personal_material(uuid) IS
  'audiolad:personal-material-soft-delete:v1; preserves access_token_hash for audit; does not delete storage files';

-- ---------------------------------------------------------------------------
-- 10. claim_personal_material
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_personal_material(
  p_access_token_hash bytea
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_material public.personal_materials%ROWTYPE;
  v_user_id uuid;
  v_starter_grants integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_access_token_hash IS NULL OR octet_length(p_access_token_hash) <> 32 THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.access_token_hash = p_access_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_material.status <> 'active' THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_material.deleted_at IS NOT NULL OR v_material.status = 'deleted' THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_material.revoked_at IS NOT NULL OR v_material.status = 'revoked' THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_material.expires_at IS NOT NULL AND v_material.expires_at <= now() THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_material.claimed_by_user_id IS NOT NULL
     AND v_material.claimed_by_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_material.guest_access_enabled
     AND v_material.claimed_by_user_id IS NULL THEN
    RAISE EXCEPTION 'material_unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_material.claimed_by_user_id IS NULL THEN
    UPDATE public.personal_materials AS pm
    SET
      claimed_by_user_id = v_user_id,
      claimed_at = now(),
      guest_access_enabled = false,
      updated_at = now()
    WHERE pm.id = v_material.id;
  ELSE
    UPDATE public.personal_materials AS pm
    SET
      guest_access_enabled = false,
      updated_at = now()
    WHERE pm.id = v_material.id;
  END IF;

  v_starter_grants := public.grant_active_starter_practices(v_user_id);

  RETURN jsonb_build_object(
    'material_id', v_material.id,
    'claimed', true,
    'starter_grants_inserted', v_starter_grants
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_personal_material(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_personal_material(bytea) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_personal_material(bytea) TO authenticated;

COMMENT ON FUNCTION public.claim_personal_material(bytea) IS
  'audiolad:personal-material-claim:v1; binds material to auth.uid(); disables guest access; idempotent starter grants';

-- ---------------------------------------------------------------------------
-- 11. Owner read RPCs (safe field subset; no storage paths or token hash)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_claimed_personal_material(
  p_material_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_material public.personal_materials%ROWTYPE;
  v_author public.authors%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_material
  FROM public.personal_materials AS pm
  WHERE pm.id = p_material_id;

  IF NOT FOUND
     OR v_material.claimed_by_user_id IS DISTINCT FROM v_user_id
     OR v_material.status = 'deleted' THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_author
  FROM public.authors AS a
  WHERE a.id = v_material.author_id;

  RETURN jsonb_build_object(
    'id', v_material.id,
    'author_id', v_material.author_id,
    'author_name', v_author.name,
    'author_slug', v_author.slug,
    'material_type', v_material.material_type,
    'title', v_material.title,
    'client_first_name', v_material.client_first_name,
    'client_last_name', v_material.client_last_name,
    'material_date', v_material.material_date,
    'description', v_material.description,
    'personal_recommendation', v_material.personal_recommendation,
    'has_audio', v_material.audio_path IS NOT NULL,
    'has_pdf', v_material.pdf_path IS NOT NULL,
    'duration_seconds', v_material.duration_seconds,
    'audio_original_filename', v_material.audio_original_filename,
    'pdf_original_filename', v_material.pdf_original_filename,
    'status', v_material.status,
    'claimed_at', v_material.claimed_at,
    'created_at', v_material.created_at,
    'updated_at', v_material.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_claimed_personal_material(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_claimed_personal_material(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_claimed_personal_material(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_claimed_personal_material(uuid) IS
  'audiolad:personal-material-owner-read:v1; safe DTO for /my-materials/{id}; author name from authors table';

CREATE OR REPLACE FUNCTION public.list_claimed_personal_materials()
RETURNS jsonb
LANGUAGE plpgsql
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

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', pm.id,
          'author_id', pm.author_id,
          'author_name', a.name,
          'material_type', pm.material_type,
          'title', pm.title,
          'client_first_name', pm.client_first_name,
          'client_last_name', pm.client_last_name,
          'material_date', pm.material_date,
          'duration_seconds', pm.duration_seconds,
          'has_audio', pm.audio_path IS NOT NULL,
          'has_pdf', pm.pdf_path IS NOT NULL,
          'status', pm.status,
          'claimed_at', pm.claimed_at,
          'created_at', pm.created_at
        ) AS row_data
        FROM public.personal_materials AS pm
        INNER JOIN public.authors AS a ON a.id = pm.author_id
        WHERE pm.claimed_by_user_id = v_user_id
          AND pm.status <> 'deleted'
      ) AS rows
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_claimed_personal_materials() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_claimed_personal_materials() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_claimed_personal_materials() TO authenticated;

COMMENT ON FUNCTION public.list_claimed_personal_materials() IS
  'audiolad:personal-material-owner-list:v1; safe summary for /my-materials; uses material UUID not secret token';

-- ---------------------------------------------------------------------------
-- 12. Progress RPCs (owner cannot SELECT base personal_materials for policy checks)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_personal_material_progress(
  p_material_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_progress public.personal_material_progress%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.personal_materials AS pm
    WHERE pm.id = p_material_id
      AND pm.claimed_by_user_id = v_user_id
      AND pm.status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.personal_material_progress AS p
  WHERE p.user_id = v_user_id
    AND p.personal_material_id = p_material_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'personal_material_id', p_material_id,
      'position_seconds', 0,
      'completed', false
    );
  END IF;

  RETURN jsonb_build_object(
    'personal_material_id', v_progress.personal_material_id,
    'position_seconds', v_progress.position_seconds,
    'completed', v_progress.completed,
    'updated_at', v_progress.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_personal_material_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_personal_material_progress(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_personal_material_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_personal_material_progress(
  p_material_id uuid,
  p_position_seconds integer,
  p_completed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
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

  IF p_position_seconds IS NULL OR p_position_seconds < 0 THEN
    RAISE EXCEPTION 'invalid_position'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.personal_materials AS pm
    WHERE pm.id = p_material_id
      AND pm.claimed_by_user_id = v_user_id
      AND pm.status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.personal_material_progress (
    user_id,
    personal_material_id,
    position_seconds,
    completed,
    updated_at
  )
  VALUES (
    v_user_id,
    p_material_id,
    p_position_seconds,
    COALESCE(p_completed, false),
    now()
  )
  ON CONFLICT (user_id, personal_material_id) DO UPDATE
  SET
    position_seconds = EXCLUDED.position_seconds,
    completed = EXCLUDED.completed,
    updated_at = now();

  RETURN jsonb_build_object(
    'personal_material_id', p_material_id,
    'position_seconds', p_position_seconds,
    'completed', COALESCE(p_completed, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_personal_material_progress(uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_personal_material_progress(uuid, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_personal_material_progress(uuid, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.upsert_personal_material_progress(uuid, integer, boolean) IS
  'audiolad:personal-material-progress-upsert:v1; guest progress migrated from localStorage after claim';

-- ---------------------------------------------------------------------------
-- 13. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.personal_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_material_author_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_material_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_materials'
      AND policyname = 'Author members can read own personal materials'
  ) THEN
    CREATE POLICY "Author members can read own personal materials"
      ON public.personal_materials
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.author_members AS am
          WHERE am.author_id = personal_materials.author_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_material_author_notes'
      AND policyname = 'Author members can read own personal material notes'
  ) THEN
    CREATE POLICY "Author members can read own personal material notes"
      ON public.personal_material_author_notes
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.personal_materials AS pm
          INNER JOIN public.author_members AS am
            ON am.author_id = pm.author_id
          WHERE pm.id = personal_material_author_notes.personal_material_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_material_progress'
      AND policyname = 'Owners can read own personal material progress'
  ) THEN
    CREATE POLICY "Owners can read own personal material progress"
      ON public.personal_material_progress
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.personal_materials FROM PUBLIC;
REVOKE ALL ON TABLE public.personal_material_author_notes FROM PUBLIC;
REVOKE ALL ON TABLE public.personal_material_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.personal_materials FROM anon;
REVOKE ALL ON TABLE public.personal_material_author_notes FROM anon;
REVOKE ALL ON TABLE public.personal_material_progress FROM anon;

-- Author members: SELECT only on base tables. No INSERT/UPDATE/DELETE for authenticated.
GRANT SELECT ON TABLE public.personal_materials TO authenticated;
GRANT SELECT ON TABLE public.personal_material_author_notes TO authenticated;
GRANT SELECT ON TABLE public.personal_material_progress TO authenticated;

GRANT ALL ON TABLE public.personal_materials TO service_role;
GRANT ALL ON TABLE public.personal_material_author_notes TO service_role;
GRANT ALL ON TABLE public.personal_material_progress TO service_role;

-- Claimed owners: no direct SELECT on personal_materials or author_notes.
-- All owner reads go through get_claimed_personal_material / list_claimed_personal_materials RPC.
-- Progress writes go through upsert_personal_material_progress RPC.

-- ---------------------------------------------------------------------------
-- 14. Storage bucket personal-materials (private, service-role only)
-- Bucket file_size_limit 50 MiB; PDF upload validated server-side at 20 MiB.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'personal-materials'
  ) THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'personal-materials',
      'personal-materials',
      false,
      52428800,
      ARRAY['audio/mpeg', 'application/pdf']::text[]
    );
  END IF;
END;
$$;

-- No anon/authenticated storage policies: future uploads/downloads via service role API only.

COMMIT;

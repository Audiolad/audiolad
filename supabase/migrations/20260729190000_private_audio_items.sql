-- Private listener audio items (MVP manual upload).
-- Never part of catalog / practices / personal_materials.
-- Storage bucket is private; no anon/authenticated storage policies.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. private_audio_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.private_audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,

  source_type text NOT NULL DEFAULT 'manual_upload',

  title text NOT NULL,
  author_text text NULL,

  audio_path text NOT NULL,
  audio_mime_type text NOT NULL,
  audio_size_bytes bigint NOT NULL,
  duration_seconds integer NULL,
  original_filename text NULL,

  cover_path text NULL,

  rights_accepted_at timestamptz NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT private_audio_items_source_type_check
    CHECK (source_type IN ('manual_upload')),

  CONSTRAINT private_audio_items_title_not_blank_check
    CHECK (btrim(title) <> ''),

  CONSTRAINT private_audio_items_audio_size_bytes_positive_check
    CHECK (audio_size_bytes > 0),

  CONSTRAINT private_audio_items_duration_seconds_positive_check
    CHECK (duration_seconds IS NULL OR duration_seconds > 0),

  CONSTRAINT private_audio_items_audio_mime_type_check
    CHECK (audio_mime_type = 'audio/mpeg')
);

CREATE INDEX IF NOT EXISTS private_audio_items_owner_created_idx
  ON public.private_audio_items (owner_user_id, created_at DESC);

COMMENT ON TABLE public.private_audio_items IS
  'Listener-owned private audio (manual upload MVP). Never catalog-listed. Paths live in private-audio-items bucket.';

COMMENT ON COLUMN public.private_audio_items.source_type IS
  'Private content source discriminator. MVP: manual_upload only; future sources may extend the check.';

COMMENT ON COLUMN public.private_audio_items.author_text IS
  'Free-text author or source label entered by the listener. Not an authors FK.';

-- ---------------------------------------------------------------------------
-- 2. private_audio_item_progress
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.private_audio_item_progress (
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,

  private_audio_item_id uuid NOT NULL
    REFERENCES public.private_audio_items (id) ON DELETE CASCADE,

  position_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, private_audio_item_id),

  CONSTRAINT private_audio_item_progress_position_non_negative_check
    CHECK (position_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS private_audio_item_progress_item_idx
  ON public.private_audio_item_progress (private_audio_item_id);

COMMENT ON TABLE public.private_audio_item_progress IS
  'Per-owner playback progress for private_audio_items. Upsert never regresses position or completed.';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.private_audio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_audio_item_progress ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.private_audio_items FROM PUBLIC;
REVOKE ALL ON TABLE public.private_audio_items FROM anon;
REVOKE ALL ON TABLE public.private_audio_item_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.private_audio_item_progress FROM anon;

-- Authenticated: SELECT own rows only. Mutations go through server API + service role
-- so owner_user_id cannot be forged via client INSERT/UPDATE.
GRANT SELECT ON TABLE public.private_audio_items TO authenticated;
GRANT SELECT ON TABLE public.private_audio_item_progress TO authenticated;

GRANT ALL ON TABLE public.private_audio_items TO service_role;
GRANT ALL ON TABLE public.private_audio_item_progress TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'private_audio_items'
      AND policyname = 'Owners can select own private audio items'
  ) THEN
    CREATE POLICY "Owners can select own private audio items"
      ON public.private_audio_items
      FOR SELECT
      TO authenticated
      USING (owner_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'private_audio_item_progress'
      AND policyname = 'Owners can select own private audio progress'
  ) THEN
    CREATE POLICY "Owners can select own private audio progress"
      ON public.private_audio_item_progress
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Progress RPCs (no-regress, ownership-gated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_private_audio_item_progress(
  p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_progress public.private_audio_item_progress%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.private_audio_items AS i
    WHERE i.id = p_item_id
      AND i.owner_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.private_audio_item_progress AS p
  WHERE p.user_id = v_user_id
    AND p.private_audio_item_id = p_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'private_audio_item_id', p_item_id,
      'position_seconds', 0,
      'completed', false
    );
  END IF;

  RETURN jsonb_build_object(
    'private_audio_item_id', v_progress.private_audio_item_id,
    'position_seconds', v_progress.position_seconds,
    'completed', v_progress.completed,
    'updated_at', v_progress.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_private_audio_item_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_private_audio_item_progress(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_private_audio_item_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_private_audio_item_progress(
  p_item_id uuid,
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
  v_row public.private_audio_item_progress%ROWTYPE;
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
    FROM public.private_audio_items AS i
    WHERE i.id = p_item_id
      AND i.owner_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.private_audio_item_progress (
    user_id,
    private_audio_item_id,
    position_seconds,
    completed,
    updated_at
  )
  VALUES (
    v_user_id,
    p_item_id,
    p_position_seconds,
    COALESCE(p_completed, false),
    now()
  )
  ON CONFLICT (user_id, private_audio_item_id) DO UPDATE
  SET
    position_seconds = GREATEST(
      public.private_audio_item_progress.position_seconds,
      EXCLUDED.position_seconds
    ),
    completed = public.private_audio_item_progress.completed OR EXCLUDED.completed,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'private_audio_item_id', v_row.private_audio_item_id,
    'position_seconds', v_row.position_seconds,
    'completed', v_row.completed,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_private_audio_item_progress(uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_private_audio_item_progress(uuid, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_private_audio_item_progress(uuid, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.upsert_private_audio_item_progress(uuid, integer, boolean) IS
  'audiolad:private-audio-progress-upsert:v1; ownership-gated; never regresses position or completed.';

-- ---------------------------------------------------------------------------
-- 5. Storage bucket private-audio-items (private, service-role only)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'private-audio-items'
  ) THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'private-audio-items',
      'private-audio-items',
      false,
      52428800,
      ARRAY[
        'audio/mpeg',
        'image/jpeg',
        'image/png',
        'image/webp'
      ]::text[]
    );
  END IF;
END;
$$;

-- No anon/authenticated storage policies: uploads/downloads via service-role API only.

COMMIT;

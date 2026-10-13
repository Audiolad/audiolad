-- Core task 1313c2b7: register a fully completed album music passport in the
-- shared passport registry at the moment it is completed and saved, not at the
-- moment the product is published.
-- Expand-only. No backfill. No rewrite of existing rows.
--
-- The registry is internal storage. A registration row is NOT permission to
-- show the passport to listeners, to use it in public recommendations or in
-- AudioLad Business. External consumers must additionally apply the product's
-- visibility (status/published/catalog listing), rights and Business
-- connection/admission rules at read time.

CREATE TABLE IF NOT EXISTS public.music_passport_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_passport_id uuid NOT NULL UNIQUE
    REFERENCES public.music_album_passports (id) ON DELETE RESTRICT,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE RESTRICT,
  album_passport_version integer NOT NULL,
  aggregation_version text NOT NULL,
  analyzer_version text NOT NULL,
  passport_completed_at timestamptz NOT NULL,
  practice_status_at_registration text NULL,
  practice_published_at_registration timestamptz NULL,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT music_passport_registrations_version_positive
    CHECK (album_passport_version >= 1)
);

COMMENT ON TABLE public.music_passport_registrations IS
  'audiolad:music-passport; one row per completed album passport version, written when the passport is completed and saved, independent of publication. Internal only: consumers must apply visibility, rights and Business admission before any external use.';

CREATE INDEX IF NOT EXISTS music_passport_registrations_practice_idx
  ON public.music_passport_registrations (practice_id, album_passport_version DESC);

CREATE OR REPLACE FUNCTION public.music_passport_registrations_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'music_passport_registration_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_passport_registrations_immutable_biud
  ON public.music_passport_registrations;
CREATE TRIGGER music_passport_registrations_immutable_biud
  BEFORE UPDATE OR DELETE ON public.music_passport_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.music_passport_registrations_immutable();

REVOKE ALL ON FUNCTION public.music_passport_registrations_immutable() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.music_passport_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.music_passport_registrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.music_passport_registrations TO service_role, postgres;

-- Idempotent: repeated calls, restarts and retries return the existing row and
-- never create a duplicate. Only completed album passports can be registered.
CREATE OR REPLACE FUNCTION public.register_music_album_passport(
  p_album_passport_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_album public.music_album_passports%ROWTYPE;
  v_existing public.music_passport_registrations%ROWTYPE;
  v_status text;
  v_published timestamptz;
  v_row public.music_passport_registrations%ROWTYPE;
BEGIN
  IF p_album_passport_id IS NULL THEN
    RAISE EXCEPTION 'album_passport_registration_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_album
  FROM public.music_album_passports
  WHERE id = p_album_passport_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'album_passport_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_album.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'album_passport_not_completed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.music_passport_registrations
  WHERE album_passport_id = p_album_passport_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'registration_id', v_existing.id,
      'registered_at', v_existing.registered_at,
      'created', false
    );
  END IF;

  SELECT status, published_at INTO v_status, v_published
  FROM public.practices
  WHERE id = v_album.practice_id;

  INSERT INTO public.music_passport_registrations (
    album_passport_id,
    practice_id,
    album_passport_version,
    aggregation_version,
    analyzer_version,
    passport_completed_at,
    practice_status_at_registration,
    practice_published_at_registration
  ) VALUES (
    v_album.id,
    v_album.practice_id,
    v_album.version,
    v_album.aggregation_version,
    v_album.analyzer_version,
    v_album.aggregated_at,
    v_status,
    v_published
  )
  ON CONFLICT (album_passport_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.music_passport_registrations
    WHERE album_passport_id = p_album_passport_id;
    RETURN jsonb_build_object(
      'registration_id', v_row.id,
      'registered_at', v_row.registered_at,
      'created', false
    );
  END IF;

  RETURN jsonb_build_object(
    'registration_id', v_row.id,
    'registered_at', v_row.registered_at,
    'created', true
  );
END;
$$;

COMMENT ON FUNCTION public.register_music_album_passport(uuid) IS
  'audiolad:music-passport; register a completed album passport version once. Repeated calls return the existing registration. Independent of publication. service_role only.';

REVOKE ALL ON FUNCTION public.register_music_album_passport(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_music_album_passport(uuid) TO service_role, postgres;

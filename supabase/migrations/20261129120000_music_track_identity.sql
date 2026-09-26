BEGIN;

-- Stable identity layer for music tracks.
-- audio_items.id remains the canonical UUID/FK. music_track_code is a
-- human-readable, immutable code for support, analytics, passports and B2B use.

CREATE SEQUENCE IF NOT EXISTS public.music_track_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO CYCLE;

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS music_track_code text NULL;

ALTER TABLE public.audio_items
  DROP CONSTRAINT IF EXISTS audio_items_music_track_code_check;

ALTER TABLE public.audio_items
  ADD CONSTRAINT audio_items_music_track_code_check
  CHECK (
    music_track_code IS NULL
    OR music_track_code ~ '^AL-T-[0-9]{9}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS audio_items_music_track_code_uidx
  ON public.audio_items (music_track_code)
  WHERE music_track_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_music_track_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT 'AL-T-' || lpad(nextval('public.music_track_code_seq')::text, 9, '0');
$$;

REVOKE ALL ON FUNCTION public.next_music_track_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_music_track_code() TO service_role;

-- Existing music tracks get identities immediately, including already-published
-- catalog tracks. Draft/unpublished music rows are included as well so the
-- identity model is consistent before the future music-passport layer arrives.
UPDATE public.audio_items AS item
SET music_track_code = public.next_music_track_code(),
    updated_at = now()
FROM public.practices AS practice
WHERE practice.id = item.practice_id
  AND practice.product_kind = 'music'
  AND item.music_track_code IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_music_track_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_kind text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.music_track_code IS NOT NULL
    AND NEW.music_track_code IS DISTINCT FROM OLD.music_track_code THEN
    RAISE EXCEPTION 'music_track_code_immutable' USING ERRCODE = '55000';
  END IF;

  SELECT product_kind
  INTO v_product_kind
  FROM public.practices
  WHERE id = NEW.practice_id;

  IF v_product_kind = 'music' AND NEW.music_track_code IS NULL THEN
    NEW.music_track_code := public.next_music_track_code();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_music_track_identity_trigger ON public.audio_items;
CREATE TRIGGER ensure_music_track_identity_trigger
  BEFORE INSERT OR UPDATE OF practice_id, music_track_code
  ON public.audio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_music_track_identity();

-- Defensive path for a product whose kind is changed to music after audio rows
-- already exist. Normal music creation sets product_kind before tracks are added,
-- but this keeps the invariant true for administrative/legacy flows too.
CREATE OR REPLACE FUNCTION public.backfill_music_track_identity_on_kind_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.product_kind = 'music'
    AND OLD.product_kind IS DISTINCT FROM NEW.product_kind THEN
    UPDATE public.audio_items
    SET music_track_code = public.next_music_track_code(),
        updated_at = now()
    WHERE practice_id = NEW.id
      AND music_track_code IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS backfill_music_track_identity_on_kind_change_trigger
  ON public.practices;
CREATE TRIGGER backfill_music_track_identity_on_kind_change_trigger
  AFTER UPDATE OF product_kind
  ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_music_track_identity_on_kind_change();

COMMENT ON COLUMN public.audio_items.music_track_code IS
  'Immutable human-readable Audiolad music track identifier. Canonical relational identity remains audio_items.id.';

COMMENT ON SEQUENCE public.music_track_code_seq IS
  'Monotonic issuer for Audiolad music track codes formatted as AL-T-#########.';

COMMIT;

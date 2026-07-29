BEGIN;

-- ---------------------------------------------------------------------------
-- Music product kind on unified audio products (practices).
-- Additive, backward-compatible: existing rows → product_kind = 'practice'.
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS product_kind text;

UPDATE public.practices
SET product_kind = 'practice'
WHERE product_kind IS NULL;

ALTER TABLE public.practices
  ALTER COLUMN product_kind SET DEFAULT 'practice',
  ALTER COLUMN product_kind SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_product_kind_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_product_kind_check
      CHECK (product_kind IN ('practice', 'music'));
  END IF;
END;
$$;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS music_usage_permission text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_music_usage_permission_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_music_usage_permission_check
      CHECK (
        (
          product_kind = 'practice'
          AND music_usage_permission IS NULL
        )
        OR (
          product_kind = 'music'
          AND (
            music_usage_permission IS NULL
            OR music_usage_permission IN (
              'listen_only',
              'platform_reuse_allowed'
            )
          )
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.practices.product_kind IS
  'audiolad:product-kind:v1; practice | music. Immutable after first publish (published_at set).';

COMMENT ON COLUMN public.practices.music_usage_permission IS
  'audiolad:music-usage-permission:v1; NULL for practice; listen_only | platform_reuse_allowed for music (required at publish).';

CREATE INDEX IF NOT EXISTS practices_product_kind_idx
  ON public.practices (product_kind);

-- Block product_kind changes after the product was published at least once.
CREATE OR REPLACE FUNCTION public.guard_practices_product_kind_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.published_at IS NOT NULL
     AND NEW.product_kind IS DISTINCT FROM OLD.product_kind THEN
    RAISE EXCEPTION 'PRODUCT_KIND_LOCKED_AFTER_PUBLISH'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practices_product_kind_immutable_trigger
  ON public.practices;

CREATE TRIGGER guard_practices_product_kind_immutable_trigger
  BEFORE UPDATE ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_practices_product_kind_immutable();

COMMIT;

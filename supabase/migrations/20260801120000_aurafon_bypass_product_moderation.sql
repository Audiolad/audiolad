BEGIN;

-- ---------------------------------------------------------------------------
-- Платформенный проект Аурофон — публикация без внешней модерации.
--
-- Stable author workspace UUID only (slug/name are documentation).
-- Does not clear existing bypass flags on other platform projects.
-- Idempotent: re-applying keeps can_bypass_product_moderation = true.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'authors'
      AND column_name = 'can_bypass_product_moderation'
  ) THEN
    UPDATE public.authors
    SET can_bypass_product_moderation = true
    WHERE id = '59c7e5b8-eae4-4394-82fb-b815a10be6c2'::uuid;
    -- Аурафон / aurafon (documentation only)
  END IF;
END $$;

COMMIT;

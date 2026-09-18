-- Disable NEW Studio FREE configurations; grandfather existing FREE rows as-is.
-- No UNIQUE(author_id), no per-author counts, no UPDATEs of practices/entitlements/orders.
-- Safe to apply with any number of existing FREE duplicates.

CREATE OR REPLACE FUNCTION public.practice_is_effective_studio_free(
  p_deleted_at timestamptz,
  p_music_usage_permission text,
  p_studio_music_pricing_mode text,
  p_is_free boolean,
  p_price numeric
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Comparisons must never yield NULL: PL/pgSQL `IF NOT NULL` does not early-return
  -- and would incorrectly reject listen-only / unset-permission free music drafts.
  SELECT (
    p_deleted_at IS NULL
    AND p_music_usage_permission IS NOT DISTINCT FROM 'platform_reuse_allowed'
    AND (
      p_studio_music_pricing_mode IS NOT DISTINCT FROM 'free'
      OR (
        p_studio_music_pricing_mode IS NULL
        AND (
          COALESCE(p_is_free, false) IS TRUE
          OR p_price IS NULL
          OR COALESCE(p_price, 0) <= 0
        )
      )
    )
  );
$$;

COMMENT ON FUNCTION public.practice_is_effective_studio_free(timestamptz, text, text, boolean, numeric) IS
  'audiolad:studio-effective-free:v1; true when a practices row is an active FREE Studio music configuration (explicit free or legacy NULL+listener-free)';

CREATE OR REPLACE FUNCTION public.guard_practices_no_new_studio_free()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_free boolean := false;
  v_new_free boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_free := COALESCE(public.practice_is_effective_studio_free(
      OLD.deleted_at,
      OLD.music_usage_permission,
      OLD.studio_music_pricing_mode,
      OLD.is_free,
      OLD.price
    ), false);
  END IF;

  v_new_free := COALESCE(public.practice_is_effective_studio_free(
    NEW.deleted_at,
    NEW.music_usage_permission,
    NEW.studio_music_pricing_mode,
    NEW.is_free,
    NEW.price
  ), false);

  -- Not becoming / staying FREE: always OK (includes FREE→PAID and soft-delete).
  IF NOT v_new_free THEN
    RETURN NEW;
  END IF;

  -- Continuous grandfathered FREE on the same author_id.
  IF TG_OP = 'UPDATE'
     AND v_old_free
     AND OLD.author_id IS NOT DISTINCT FROM NEW.author_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'studio_new_free_disabled'
    USING ERRCODE = 'P0001',
      DETAIL = 'New FREE Studio music configurations are disabled; existing FREE rows remain grandfathered.';
END;
$$;

COMMENT ON FUNCTION public.guard_practices_no_new_studio_free() IS
  'audiolad:studio-no-new-free:v1; BEFORE INSERT/UPDATE guard — reject NEW FREE Studio states; allow grandfathered FREE continuations';

DROP TRIGGER IF EXISTS practices_no_new_studio_free_trg ON public.practices;

CREATE TRIGGER practices_no_new_studio_free_trg
  BEFORE INSERT OR UPDATE OF
    deleted_at,
    author_id,
    music_usage_permission,
    studio_music_pricing_mode,
    is_free,
    price
  ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_practices_no_new_studio_free();

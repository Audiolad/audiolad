-- Studio buyer license terms v1.1 snapshot for NEW grants only.
-- Historical orders/entitlements with studio-license-v1.0 remain immutable.
-- Does NOT UPDATE existing rows.

CREATE OR REPLACE FUNCTION public.create_studio_music_order(
  p_practice_id uuid, p_idempotency_key uuid, p_expected_amount_minor bigint DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid, practice_id uuid, practice_slug text, status text, amount_minor bigint,
  currency text, order_kind text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_author_id uuid; v_legacy record;
BEGIN
  SELECT author_id INTO v_author_id FROM public.practices WHERE id = p_practice_id;
  IF NOT public.author_has_accepted_current_terms(v_author_id) THEN
    RAISE EXCEPTION 'studio_author_terms_not_accepted' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_legacy
  FROM public.create_studio_music_order_legal_legacy(
    p_practice_id, p_idempotency_key, p_expected_amount_minor
  );
  UPDATE public.orders SET
    studio_license_terms_version = coalesce(studio_license_terms_version, 'studio-license-v1.1'),
    studio_license_terms_hash = coalesce(studio_license_terms_hash, '036269bf83b4ba8b453604f7a2aeb9de6c0dc9528beb60e4ce76e16fb335846c')
  WHERE id = v_legacy.order_id;
  RETURN QUERY
    SELECT o.id, o.practice_id, o.practice_slug_snapshot, o.status, o.amount_minor,
      o.currency, o.order_kind, o.created_at
    FROM public.orders o
    WHERE o.id = v_legacy.order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.freeze_studio_entitlement_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.grant_source = 'purchase' AND NEW.order_id IS NOT NULL THEN
    SELECT studio_license_terms_version, studio_license_terms_hash
      INTO NEW.license_terms_version, NEW.license_terms_hash
      FROM public.orders WHERE id = NEW.order_id;
  ELSIF NEW.grant_source = 'free' THEN
    NEW.license_terms_version := 'studio-license-v1.1';
    NEW.license_terms_hash := '036269bf83b4ba8b453604f7a2aeb9de6c0dc9528beb60e4ce76e16fb335846c';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint) IS
  'audiolad:studio-music-order:v1.1-terms; wraps legal_legacy and freezes studio-license-v1.1 hash on NEW null snapshots only (coalesce). Does not rewrite historical v1.0 order snapshots.';

COMMENT ON FUNCTION public.freeze_studio_entitlement_terms() IS
  'audiolad:studio-music-entitlement-terms:v1.1; purchase inherits order snapshot; NEW free grants freeze studio-license-v1.1. No UPDATE of existing entitlements.';

REVOKE ALL ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint) TO authenticated;

BEGIN;

-- Legal foundation v1.2. Forward-only: preserves all historical author
-- acceptances and legacy order/entitlement rows.
UPDATE public.author_terms_versions
SET is_current = false
WHERE document_key = 'author-terms' AND is_current IS TRUE;

INSERT INTO public.author_terms_versions (
  id, version, title, published_at, effective_at, content_hash, document_key, is_current
) VALUES (
  '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902',
  '1.2',
  'Авторские условия сотрудничества платформы «АудиоЛад»',
  '2026-09-13T00:00:00+03:00',
  '2026-09-13T00:00:00+03:00',
  'e42a0121cdcd2f3203207a3897368b7364f47ff108fc8738b1148260f2fb0102',
  'author-terms',
  true
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS studio_license_terms_version text NULL,
  ADD COLUMN IF NOT EXISTS studio_license_terms_hash text NULL;

ALTER TABLE public.studio_music_entitlements
  ADD COLUMN IF NOT EXISTS license_terms_version text NULL,
  ADD COLUMN IF NOT EXISTS license_terms_hash text NULL;

CREATE OR REPLACE FUNCTION public.author_has_accepted_current_terms(p_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_author_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.author_terms_acceptances a
    JOIN public.author_terms_versions v ON v.id = a.terms_version_id
    WHERE a.author_id = p_author_id AND v.document_key = 'author-terms' AND v.is_current
  );
$$;

ALTER FUNCTION public.create_studio_music_order(uuid, uuid, bigint)
  RENAME TO create_studio_music_order_legal_legacy;
ALTER FUNCTION public.acquire_free_studio_music(uuid)
  RENAME TO acquire_free_studio_music_legal_legacy;

CREATE OR REPLACE FUNCTION public.create_studio_music_order(
  p_practice_id uuid, p_idempotency_key uuid, p_expected_amount_minor bigint DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid, practice_id uuid, practice_slug text, status text, amount_minor bigint,
  currency text, order_kind text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_author_id uuid;
BEGIN
  SELECT author_id INTO v_author_id FROM public.practices WHERE id = p_practice_id;
  IF NOT public.author_has_accepted_current_terms(v_author_id) THEN
    RAISE EXCEPTION 'studio_author_terms_not_accepted' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.create_studio_music_order_legal_legacy(
    p_practice_id, p_idempotency_key, p_expected_amount_minor
  );
  UPDATE public.orders SET
    studio_license_terms_version = coalesce(studio_license_terms_version, 'studio-license-v1.0'),
    studio_license_terms_hash = coalesce(studio_license_terms_hash, '40b6e783a0b94692cd4e8bfffa8e70bd6b15c24c13f00d821bcb38d3a5e26b7b')
  WHERE idempotency_key = p_idempotency_key::text;
  RETURN QUERY
    SELECT o.id, o.practice_id, o.practice_slug_snapshot, o.status, o.amount_minor,
      o.currency, o.order_kind, o.created_at
    FROM public.orders o
    WHERE o.idempotency_key = p_idempotency_key::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_free_studio_music(p_practice_id uuid)
RETURNS TABLE (
  entitlement_id uuid, practice_id uuid, grant_source text, order_id uuid,
  inserted boolean, granted_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_author_id uuid;
BEGIN
  SELECT author_id INTO v_author_id FROM public.practices WHERE id = p_practice_id;
  IF NOT public.author_has_accepted_current_terms(v_author_id) THEN
    RAISE EXCEPTION 'studio_author_terms_not_accepted' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT * FROM public.acquire_free_studio_music_legal_legacy(p_practice_id);
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
    NEW.license_terms_version := 'studio-license-v1.0';
    NEW.license_terms_hash := '40b6e783a0b94692cd4e8bfffa8e70bd6b15c24c13f00d821bcb38d3a5e26b7b';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS studio_music_entitlements_freeze_terms ON public.studio_music_entitlements;
CREATE TRIGGER studio_music_entitlements_freeze_terms
  BEFORE INSERT ON public.studio_music_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.freeze_studio_entitlement_terms();

REVOKE ALL ON FUNCTION public.author_has_accepted_current_terms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.author_has_accepted_current_terms(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_studio_music_order(uuid, uuid, bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.acquire_free_studio_music(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_free_studio_music(uuid) TO authenticated;

COMMIT;

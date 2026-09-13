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
  '8984e194ba6f3c1ed6c7bd5d92e8c1ff4a3c858e440633844423fa370fb005ee',
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

-- ACLs survive ALTER FUNCTION ... RENAME. The renamed functions are internal
-- helpers only; granting them would bypass the current-author-terms gate.
REVOKE ALL ON FUNCTION public.create_studio_music_order_legal_legacy(uuid, uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_studio_music_order_legal_legacy(uuid, uuid, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.create_studio_music_order_legal_legacy(uuid, uuid, bigint) FROM authenticated;
REVOKE ALL ON FUNCTION public.acquire_free_studio_music_legal_legacy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_free_studio_music_legal_legacy(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.acquire_free_studio_music_legal_legacy(uuid) FROM authenticated;

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
    studio_license_terms_version = coalesce(studio_license_terms_version, 'studio-license-v1.0'),
    studio_license_terms_hash = coalesce(studio_license_terms_hash, '319b96448b058d959e682d47c87745b906b58b8d17996e5278f44b26800014dd')
  WHERE id = v_legacy.order_id;
  RETURN QUERY
    SELECT o.id, o.practice_id, o.practice_slug_snapshot, o.status, o.amount_minor,
      o.currency, o.order_kind, o.created_at
    FROM public.orders o
    WHERE o.id = v_legacy.order_id;
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
    NEW.license_terms_hash := '319b96448b058d959e682d47c87745b906b58b8d17996e5278f44b26800014dd';
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

DO $$
BEGIN
  IF has_function_privilege('PUBLIC', 'public.create_studio_music_order_legal_legacy(uuid,uuid,bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_studio_music_order_legal_legacy(uuid,uuid,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_studio_music_order_legal_legacy(uuid,uuid,bigint)', 'EXECUTE')
     OR has_function_privilege('PUBLIC', 'public.acquire_free_studio_music_legal_legacy(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.acquire_free_studio_music_legal_legacy(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.acquire_free_studio_music_legal_legacy(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: legacy Studio RPC must not be executable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_studio_music_order(uuid,uuid,bigint)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.acquire_free_studio_music(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-check failed: wrapped Studio RPC must be executable by authenticated';
  END IF;
END
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Business offer, edition 5 of 19.11.2026 (t1620u / t1621u).
-- Additive seed: one new row in business_offer_editions. Editions 1–4 and every
-- acceptance of them stay as they are. Edition 4 text:
-- docs/business/public/archive/business-offer-v4-2026-11-19.md.
--
-- Edition 5 wording: incidental background of the catalog in photos and videos
-- shot inside the venue for the venue's own social networks and marketing
-- (annex 1 p. 4); the RAO/VOIS position is tied to the closed catalog
-- «АудиоЛад Кофейня» (p. 1.3, annex 1 p. 2 and p. 10, annex 4 sample);
-- recovered court and defence costs are transferred to AudioLad in full
-- (annex 3 p. 4.4); incidental sounds are not a client breach, but court defence
-- and the guarantee cover only catalog claims; for any claim AudioLad prepares
-- a pre-court reply and a statement from the play log (annex 3 p. 3.1, 5.3, 5.4). Hash = sha256 of docs/business/public/business-offer.md
-- (edition 5).
--
-- The same migration also extends the annex 1 («b2b-terms») whitelist in
-- record_business_offer_edition_acceptance and accept_business_offer with
-- r9-2026-11-19 (updated standalone licensing terms). Editions r8 and r6.1
-- stay accepted. No existing acceptance row is changed.
--
-- Deploy order: this migration first, then the application that shows edition 5.
-- The old application keeps asking for edition 4, which stays valid, so applying
-- early is harmless. Owners who accepted edition 4 accept edition 5 once per
-- account in the cabinet before their next payment; access and music are not
-- affected. There is no mass mailing.
--
-- This file is a database migration. Do not apply in production without
-- Sergey's explicit approval.
--
-- Rollback (deploy the previous application first; acceptance rows of edition 5
-- reference this row, so remove them only with Sergey's confirmation):
--   BEGIN;
--   DELETE FROM public.business_offer_edition_acceptances
--     WHERE document_key = 'business-offer' AND document_version = 'offer-v5-2026-11-19';
--   DELETE FROM public.business_offer_editions
--     WHERE document_key = 'business-offer' AND document_version = 'offer-v5-2026-11-19';
--   -- Restore the previous annex whitelist only with Sergey's confirmation
--   -- (r9 acceptances may already exist).
--   COMMIT;
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO public.business_offer_editions (document_key, document_version, content_hash, published_on)
VALUES (
  'business-offer',
  'offer-v5-2026-11-19',
  '909fcb8881f2e49cacf5f9e9ec85dce7dec9163a0a0c5c0c727cb48c452e031b',
  DATE '2026-11-19'
)
ON CONFLICT (document_key, document_version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v5-2026-11-19'
      AND content_hash = '909fcb8881f2e49cacf5f9e9ec85dce7dec9163a0a0c5c0c727cb48c452e031b'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition 5 seed missing or hash differs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v4-2026-11-19'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition 4 must stay';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_business_offer_edition_acceptance(
  p_user_id uuid,
  p_document_version text,
  p_content_hash text,
  p_annex_version text,
  p_annex_hash text,
  p_source text,
  p_document_key text DEFAULT 'business-offer'
)
RETURNS TABLE (
  document_key text,
  document_version text,
  content_hash text,
  accepted_at timestamptz,
  already_accepted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version text := btrim(coalesce(p_document_version, ''));
  v_hash text := lower(btrim(coalesce(p_content_hash, '')));
  v_annex_version text := btrim(coalesce(p_annex_version, ''));
  v_annex_hash text := lower(btrim(coalesce(p_annex_hash, '')));
  v_row public.business_offer_edition_acceptances%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF coalesce(p_source, '') NOT IN ('guest_start', 'cabinet') THEN
    RAISE EXCEPTION 'offer_source_unknown' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions AS e
    WHERE e.document_key = p_document_key
      AND e.document_version = v_version
      AND e.content_hash = v_hash
  ) THEN
    RAISE EXCEPTION 'offer_document_unknown'
      USING ERRCODE = '22023',
            HINT = 'https://business.audiolad.ru/documents/business-offer';
  END IF;

  -- Annex 1 must be one of the published b2b-terms editions (same whitelist
  -- as accept_business_offer in 20270205130000).
  IF NOT (
    (v_annex_version = 'r9-2026-11-19'
      AND v_annex_hash = '22508fe0609bc9278b2513b36b6c9a1f24789776524bb4b80f4613005861dc29')
    OR (v_annex_version = 'r8-2026-10-18'
      AND v_annex_hash = '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a')
    OR (v_annex_version = 'r6.1-2026-10-18'
      AND v_annex_hash = 'a3e74c3a6b06bd6c8e29ecc6e832984a7a2f7f5af75c44252c7ba1a85c98bc88')
  ) THEN
    RAISE EXCEPTION 'offer_document_unknown'
      USING ERRCODE = '22023',
            HINT = 'https://business.audiolad.ru/documents/b2b-terms';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_organization_members AS m
    WHERE m.user_id = p_user_id AND m.role = 'owner'
  ) AND (
    p_source <> 'guest_start'
    OR EXISTS (
      SELECT 1 FROM public.business_organization_members AS m
      WHERE m.user_id = p_user_id
    )
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = p_user_id AND coalesce(u.is_anonymous, false) = false
    )
  ) THEN
    RAISE EXCEPTION 'not_organization_owner'
      USING ERRCODE = '42501',
            HINT = 'https://business.audiolad.ru/onboarding';
  END IF;

  INSERT INTO public.business_offer_edition_acceptances AS a (
    user_id, document_key, document_version, content_hash, source
  ) VALUES (
    p_user_id, p_document_key, v_version, v_hash, p_source
  )
  ON CONFLICT ON CONSTRAINT business_offer_edition_acceptances_pkey DO NOTHING
  RETURNING a.* INTO v_row;
  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT a.* INTO v_row
    FROM public.business_offer_edition_acceptances AS a
    WHERE a.user_id = p_user_id
      AND a.document_key = p_document_key
      AND a.document_version = v_version;
  END IF;

  INSERT INTO public.business_offer_acceptances AS b (
    user_id, document_key, document_version, content_hash, accepted_by_user_id
  ) VALUES (
    p_user_id, 'b2b-terms', v_annex_version, v_annex_hash, p_user_id
  )
  ON CONFLICT ON CONSTRAINT business_offer_acceptances_pkey DO NOTHING;

  document_key := v_row.document_key;
  document_version := v_row.document_version;
  content_hash := v_row.content_hash;
  accepted_at := v_row.accepted_at;
  already_accepted := NOT v_inserted;
  RETURN NEXT;
END;
$$;


REVOKE ALL ON FUNCTION public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text)
  TO service_role;


CREATE OR REPLACE FUNCTION public.accept_business_offer(
  p_document_key text,
  p_document_version text,
  p_content_hash text
)
RETURNS TABLE (
  user_id uuid,
  document_key text,
  document_version text,
  content_hash text,
  accepted_at timestamptz,
  already_accepted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.business_offer_acceptances%ROWTYPE;
  v_version text := btrim(coalesce(p_document_version, ''));
  v_hash text := lower(btrim(coalesce(p_content_hash, '')));
  v_known boolean;
BEGIN
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_organization_members AS m
    WHERE m.user_id = v_user_id
      AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_organization_owner'
      USING ERRCODE = '42501',
            HINT = 'https://business.audiolad.ru/onboarding';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.business_offer_acceptances AS a
  WHERE a.user_id = v_user_id;

  IF FOUND THEN
    user_id := v_existing.user_id;
    document_key := v_existing.document_key;
    document_version := v_existing.document_version;
    content_hash := v_existing.content_hash;
    accepted_at := v_existing.accepted_at;
    already_accepted := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_known := p_document_key = 'b2b-terms' AND (
    (
      v_version = 'r9-2026-11-19'
      AND v_hash = '22508fe0609bc9278b2513b36b6c9a1f24789776524bb4b80f4613005861dc29'
    )
    OR (
      v_version = 'r8-2026-10-18'
      AND v_hash = '0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a'
    )
    OR (
      v_version = 'r6.1-2026-10-18'
      AND v_hash = 'a3e74c3a6b06bd6c8e29ecc6e832984a7a2f7f5af75c44252c7ba1a85c98bc88'
    )
  );

  IF NOT v_known THEN
    RAISE EXCEPTION 'offer_document_unknown'
      USING ERRCODE = '22023',
            HINT = 'https://business.audiolad.ru/documents/b2b-terms';
  END IF;

  INSERT INTO public.business_offer_acceptances (
    user_id,
    document_key,
    document_version,
    content_hash,
    accepted_by_user_id
  ) VALUES (
    v_user_id,
    'b2b-terms',
    v_version,
    v_hash,
    v_user_id
  )
  RETURNING * INTO v_existing;

  user_id := v_existing.user_id;
  document_key := v_existing.document_key;
  document_version := v_existing.document_version;
  content_hash := v_existing.content_hash;
  accepted_at := v_existing.accepted_at;
  already_accepted := false;
  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
    INTO v_existing
    FROM public.business_offer_acceptances AS a
    WHERE a.user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    user_id := v_existing.user_id;
    document_key := v_existing.document_key;
    document_version := v_existing.document_version;
    content_hash := v_existing.content_hash;
    accepted_at := v_existing.accepted_at;
    already_accepted := true;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_business_offer(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_business_offer(text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.accept_business_offer(text, text, text) IS
  'audiolad:business-subscription; one B2B offer acceptance per owner account. A second call returns the stored row. Support mode cannot accept.';

CREATE OR REPLACE FUNCTION public.business_offer_acceptance_for_caller()
RETURNS TABLE (
  user_id uuid,
  document_key text,
  document_version text,
  content_hash text,
  accepted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.user_id, a.document_key, a.document_version, a.content_hash, a.accepted_at
  FROM public.business_offer_acceptances AS a
  WHERE a.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.business_offer_acceptance_for_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_offer_acceptance_for_caller() TO authenticated, service_role;

COMMENT ON FUNCTION public.business_offer_acceptance_for_caller() IS
  'audiolad:business-subscription; the caller reads only their own account acceptance.';


-- Не переопределяем create_business_subscription_order и
-- apply_business_subscription_for_order: актуальные тела (партнёрская цена,
-- несколько заведений, гостевой аккаунт без email) заданы более поздними
-- миграциями 20270217–20270302. Повторная подстановка старой версии
-- (только 79 900 копеек, обязательный email) сломала бы зачисление оплаты.

COMMIT;

-- ---------------------------------------------------------------------------
-- Business offer, edition 4 of 19.11.2026 (t1595u / t1597u).
-- Additive only: one new seed row in business_offer_editions. No table, function
-- or existing row is changed; editions 1–3 and every acceptance of them stay as
-- they are. Edition 3 text: docs/business/public/archive/business-offer-v3-2026-11-18.md.
--
-- Edition 4 is wording only: the defined term «Точка» is renamed to «Заведение»
-- with the same definition; grammar around the term is updated. Legal meaning
-- is unchanged. Hash = sha256 of docs/business/public/business-offer.md (edition 4).
--
-- Deploy order: this migration first, then the application that shows edition 4.
-- The old application keeps asking for edition 3, which stays valid, so applying
-- early is harmless. Owners who accepted edition 3 accept edition 4 once per
-- account in the cabinet before their next payment; access and music are not
-- affected. There is no mass mailing.
--
-- Rollback (deploy the previous application first; acceptance rows of edition 4
-- reference this row, so remove them only with Sergey's confirmation):
--   BEGIN;
--   DELETE FROM public.business_offer_edition_acceptances
--     WHERE document_key = 'business-offer' AND document_version = 'offer-v4-2026-11-19';
--   DELETE FROM public.business_offer_editions
--     WHERE document_key = 'business-offer' AND document_version = 'offer-v4-2026-11-19';
--   COMMIT;
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO public.business_offer_editions (document_key, document_version, content_hash, published_on)
VALUES (
  'business-offer',
  'offer-v4-2026-11-19',
  '7c0b04b353f6030aff22c2f12ff53a1e95a32c36f83d4dd2e467bf32eb7981b3',
  DATE '2026-11-19'
)
ON CONFLICT (document_key, document_version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v4-2026-11-19'
      AND content_hash = '7c0b04b353f6030aff22c2f12ff53a1e95a32c36f83d4dd2e467bf32eb7981b3'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition 4 seed missing or hash differs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v3-2026-11-18'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition 3 must stay';
  END IF;
END;
$$;

COMMIT;

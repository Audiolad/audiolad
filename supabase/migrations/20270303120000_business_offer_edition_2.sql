-- ---------------------------------------------------------------------------
-- Business offer, edition 2 of 09.11.2026 (task 8142d69a).
-- NOT APPLIED. Applying after backup is Sergey's Human Gate.
-- Additive only: one new seed row in business_offer_editions. No table, function
-- or existing row is changed; edition 1 (offer-v1-2026-11-04) and every acceptance
-- of it stay as they are. Edition 1 text: docs/business/public/archive/business-offer-v1-2026-11-04.md.
--
-- Edition 2 changes section 4 only: the price per point is the current tariff
-- shown in the cabinet before payment, special offers and personal codes.
-- Hash = sha256 of docs/business/public/business-offer.md (edition 2).
--
-- Deploy order: this migration first, then the application that shows edition 2.
-- The old application keeps asking for edition 1, which stays valid, so applying
-- early is harmless. Owners who accepted edition 1 accept edition 2 once per account
-- in the cabinet before their next payment; access and music are not affected.
--
-- Rollback (deploy the previous application first; acceptance rows of edition 2
-- reference this row, so remove them only with Sergey's confirmation):
--   BEGIN;
--   DELETE FROM public.business_offer_edition_acceptances
--     WHERE document_key = 'business-offer' AND document_version = 'offer-v2-2026-11-09';
--   DELETE FROM public.business_offer_editions
--     WHERE document_key = 'business-offer' AND document_version = 'offer-v2-2026-11-09';
--   COMMIT;
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO public.business_offer_editions (document_key, document_version, content_hash, published_on)
VALUES (
  'business-offer',
  'offer-v2-2026-11-09',
  'fb57866ccb90a333fd240bfcb2b3c85bacf12e8751bac1bbfab8946c6930105b',
  DATE '2026-11-09'
)
ON CONFLICT (document_key, document_version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v2-2026-11-09'
      AND content_hash = 'fb57866ccb90a333fd240bfcb2b3c85bacf12e8751bac1bbfab8946c6930105b'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition 2 seed missing or hash differs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v1-2026-11-04'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition 1 must stay';
  END IF;
END;
$$;

COMMIT;

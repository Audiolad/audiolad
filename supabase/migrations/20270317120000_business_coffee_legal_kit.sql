-- ---------------------------------------------------------------------------
-- «АудиоЛад Кофейня»: legal kit (t1591u, Sergey 19.11.2026, approved with a prod backup first).
-- Additive only. No existing row, function or policy is changed.
--
-- 1. business_organizations: the Client's ИНН and the registry data looked up by it
--    (name, ОГРН/ОГРНИП, registration date). The owner types only the ИНН (offer red. 3, section 3).
-- 2. business_venue_certificates: one certificate per point (annex 2). A new row is issued when the
--    snapshot changes (new access period, address, ИНН, accepted edition); the previous row is marked
--    superseded. Service role only: no RLS policy for anon/authenticated. Numbers ALK-YYYY-NNNNNN,
--    000001 is the fictional sample, so the sequence starts at 2.
-- 3. business_offer_editions: seed of edition 3 (offer-v3-2026-11-18) = sha256 of
--    docs/business/public/business-offer.md (offer + annexes 1–4). Editions 1 and 2 and their
--    acceptances stay. Owners accept edition 3 once per account in the cabinet; music is not gated.
--
-- Rollback (deploy the previous application first; certificate rows and edition-3 acceptances are
-- legal records – remove them only with Sergey's confirmation):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.issue_business_venue_certificate(uuid, uuid, text, jsonb, timestamptz, timestamptz, text, text, timestamptz);
--   DROP TABLE IF EXISTS public.business_venue_certificates;
--   DROP SEQUENCE IF EXISTS public.business_venue_certificate_seq;
--   ALTER TABLE public.business_organizations
--     DROP COLUMN IF EXISTS legal_inn, DROP COLUMN IF EXISTS legal_kind, DROP COLUMN IF EXISTS legal_name,
--     DROP COLUMN IF EXISTS legal_full_name, DROP COLUMN IF EXISTS legal_ogrn,
--     DROP COLUMN IF EXISTS legal_registered_on, DROP COLUMN IF EXISTS legal_checked_at,
--     DROP COLUMN IF EXISTS legal_inactive_at;
--   DELETE FROM public.business_offer_edition_acceptances WHERE document_key = 'business-offer' AND document_version = 'offer-v3-2026-11-18';
--   DELETE FROM public.business_offer_editions WHERE document_key = 'business-offer' AND document_version = 'offer-v3-2026-11-18';
--   COMMIT;
-- ---------------------------------------------------------------------------
BEGIN;

ALTER TABLE public.business_organizations
  ADD COLUMN IF NOT EXISTS legal_inn text,
  ADD COLUMN IF NOT EXISTS legal_kind text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS legal_full_name text,
  ADD COLUMN IF NOT EXISTS legal_ogrn text,
  ADD COLUMN IF NOT EXISTS legal_registered_on date,
  ADD COLUMN IF NOT EXISTS legal_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_inactive_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_organizations_legal_identity_check') THEN
    ALTER TABLE public.business_organizations
      ADD CONSTRAINT business_organizations_legal_identity_check CHECK (
        (legal_inn IS NULL AND legal_kind IS NULL AND legal_name IS NULL AND legal_ogrn IS NULL)
        OR (
          legal_kind = 'ul' AND legal_inn ~ '^[0-9]{10}$' AND legal_ogrn ~ '^[0-9]{13}$'
          AND length(btrim(legal_name)) > 0 AND legal_checked_at IS NOT NULL
        )
        OR (
          legal_kind = 'ip' AND legal_inn ~ '^[0-9]{12}$' AND legal_ogrn ~ '^[0-9]{15}$'
          AND length(btrim(legal_name)) > 0 AND legal_checked_at IS NOT NULL
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.business_organizations.legal_inn IS
  'audiolad:coffee-legal-kit; Client ИНН typed by the owner (checksum-valid). Name/ОГРН come from the ФНС registry by this ИНН.';
COMMENT ON COLUMN public.business_organizations.legal_inactive_at IS
  'audiolad:coffee-legal-kit; set when a registry re-check finds the ИНН terminated or gone: no certificate is issued or shown as valid.';

CREATE SEQUENCE IF NOT EXISTS public.business_venue_certificate_seq START WITH 2 MINVALUE 1;

CREATE TABLE IF NOT EXISTS public.business_venue_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE CHECK (number ~ '^ALK-[0-9]{4}-[0-9]{6}$'),
  location_id uuid NOT NULL REFERENCES public.business_locations(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  period_kind text NOT NULL CHECK (period_kind IN ('gift', 'subscription')),
  period_start timestamptz,
  period_end timestamptz NOT NULL,
  offer_version text NOT NULL,
  offer_accepted_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.business_venue_certificates(id),
  revoked_at timestamptz,
  revoked_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS business_venue_certificates_current_uidx
  ON public.business_venue_certificates (location_id)
  WHERE superseded_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS business_venue_certificates_location_idx
  ON public.business_venue_certificates (location_id, issued_at DESC);

ALTER TABLE public.business_venue_certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_venue_certificates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_venue_certificates TO service_role;
REVOKE ALL ON SEQUENCE public.business_venue_certificate_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.business_venue_certificate_seq TO service_role;

COMMENT ON TABLE public.business_venue_certificates IS
  'audiolad:coffee-legal-kit; certificate per point (offer red. 3, annex 2). Public check: audiolad.ru/b/coffee/legal/sertifikat/<number>. Never deleted; superseded or revoked.';

-- Issues the point certificate for this snapshot, or returns the current one when nothing changed.
-- Atomic per location (row lock), so two parallel page views never issue two numbers.
CREATE OR REPLACE FUNCTION public.issue_business_venue_certificate(
  p_location_id uuid,
  p_organization_id uuid,
  p_snapshot_hash text,
  p_snapshot jsonb,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_period_kind text,
  p_offer_version text,
  p_offer_accepted_at timestamptz
)
RETURNS TABLE (id uuid, number text, issued_at timestamptz, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.business_venue_certificates%ROWTYPE;
  v_new_id uuid;
  v_number text;
BEGIN
  PERFORM 1 FROM public.business_locations l
    WHERE l.id = p_location_id AND l.organization_id = p_organization_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'certificate_location_unknown' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current FROM public.business_venue_certificates c
    WHERE c.location_id = p_location_id AND c.superseded_at IS NULL AND c.revoked_at IS NULL;

  IF FOUND AND v_current.snapshot_hash = p_snapshot_hash THEN
    RETURN QUERY SELECT v_current.id, v_current.number, v_current.issued_at, false;
    RETURN;
  END IF;

  v_number := 'ALK-' || to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY') || '-'
    || lpad(nextval('public.business_venue_certificate_seq')::text, 6, '0');

  IF v_current.id IS NOT NULL THEN
    UPDATE public.business_venue_certificates SET superseded_at = now() WHERE business_venue_certificates.id = v_current.id;
  END IF;

  INSERT INTO public.business_venue_certificates (
    number, location_id, organization_id, snapshot, snapshot_hash, period_kind, period_start, period_end,
    offer_version, offer_accepted_at
  ) VALUES (
    v_number, p_location_id, p_organization_id, p_snapshot, p_snapshot_hash, p_period_kind, p_period_start, p_period_end,
    p_offer_version, p_offer_accepted_at
  ) RETURNING business_venue_certificates.id INTO v_new_id;

  IF v_current.id IS NOT NULL THEN
    UPDATE public.business_venue_certificates SET superseded_by = v_new_id WHERE business_venue_certificates.id = v_current.id;
  END IF;

  RETURN QUERY SELECT v_new_id, v_number, now(), true;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_business_venue_certificate(uuid, uuid, text, jsonb, timestamptz, timestamptz, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_business_venue_certificate(uuid, uuid, text, jsonb, timestamptz, timestamptz, text, text, timestamptz) TO service_role;

INSERT INTO public.business_offer_editions (document_key, document_version, content_hash, published_on)
VALUES (
  'business-offer',
  'offer-v3-2026-11-18',
  '154ddc75986187a1f8f2af3c929f7abfb1ecadca45de691b88955a8b3bc14955',
  DATE '2026-11-18'
)
ON CONFLICT (document_key, document_version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v3-2026-11-18'
      AND content_hash = '154ddc75986187a1f8f2af3c929f7abfb1ecadca45de691b88955a8b3bc14955'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition 3 seed missing or hash differs';
  END IF;
  IF (SELECT count(*) FROM public.business_offer_editions WHERE document_key = 'business-offer'
      AND document_version IN ('offer-v1-2026-11-04', 'offer-v2-2026-11-09')) <> 2 THEN
    RAISE EXCEPTION 'Post-check failed: editions 1 and 2 must stay';
  END IF;
END;
$$;

COMMIT;

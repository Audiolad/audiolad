-- ---------------------------------------------------------------------------
-- Business offer editions (Stage 1C, Sergey 2026-11-04).
-- NOT APPLIED. Applying after backup is Sergey's Human Gate.
-- Additive only: two new tables, three new functions. No existing function,
-- table or row is changed.
--
-- The owner accepts the account-level договор-оферта «АудиоЛад Бизнес»
-- (/documents/business-offer) once per edition: at the gift start (checkbox,
-- server-side via service_role) or in the cabinet («Принять условия»).
-- One row per account and edition covers every point of that owner. The same
-- edition is never asked twice; a new edition needs a new seed row below.
-- Accepting the offer also records annex 1 («b2b-terms», current flag edition)
-- in business_offer_acceptances, so create_business_subscription_order keeps
-- working unchanged. That legacy row is never overwritten.
--
-- Deploy order: this migration first, then the application. The old app does
-- not call the new functions, so applying early is harmless.
--
-- Rollback (run only if this migration is the latest change and Sergey
-- confirms the acceptance rows may go; deploy the previous app first):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.business_offer_edition_acceptances_for_caller();
--   DROP FUNCTION IF EXISTS public.accept_business_offer_edition(text, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text);
--   DROP TABLE IF EXISTS public.business_offer_edition_acceptances;
--   DROP TABLE IF EXISTS public.business_offer_editions;
--   COMMIT;
-- Rows written into business_offer_acceptances by the new functions are valid
-- annex acceptances and stay after rollback.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.business_offer_editions (
  document_key text NOT NULL,
  document_version text NOT NULL,
  content_hash text NOT NULL,
  published_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_key, document_version),
  CONSTRAINT business_offer_editions_key_check CHECK (document_key = 'business-offer'),
  CONSTRAINT business_offer_editions_version_check
    CHECK (char_length(btrim(document_version)) BETWEEN 1 AND 80),
  CONSTRAINT business_offer_editions_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE public.business_offer_editions IS
  'audiolad:business-offer; published editions of the account-level Business offer. Hash = sha256 of docs/business/public/business-offer.md.';

ALTER TABLE public.business_offer_editions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_offer_editions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_offer_editions TO service_role;

INSERT INTO public.business_offer_editions (document_key, document_version, content_hash, published_on)
VALUES (
  'business-offer',
  'offer-v1-2026-11-04',
  '9d4046f36c20f5702697eac0af26de1c3579c6929c61d8ac4441c0b39617c7dc',
  DATE '2026-11-04'
)
ON CONFLICT (document_key, document_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.business_offer_edition_acceptances (
  user_id uuid NOT NULL,
  document_key text NOT NULL,
  document_version text NOT NULL,
  content_hash text NOT NULL,
  source text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_key, document_version),
  CONSTRAINT business_offer_edition_acceptances_edition_fk
    FOREIGN KEY (document_key, document_version)
    REFERENCES public.business_offer_editions (document_key, document_version),
  CONSTRAINT business_offer_edition_acceptances_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_offer_edition_acceptances_source_check CHECK (source IN ('guest_start', 'cabinet'))
);

COMMENT ON TABLE public.business_offer_edition_acceptances IS
  'audiolad:business-offer; one acceptance per owner account and offer edition. Covers every point of that owner. No location_id and no player_id.';

ALTER TABLE public.business_offer_edition_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_offer_edition_acceptances FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_offer_edition_acceptances TO service_role;

-- Internal writer. service_role only (guest start runs server-side after the
-- guest bootstrap made the caller an owner). Idempotent: returns the stored row.
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
    (v_annex_version = 'r8-2026-10-18'
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

COMMENT ON FUNCTION public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text) IS
  'audiolad:business-offer; service_role only. Records one offer edition acceptance per owner account (idempotent) and the annex 1 row in business_offer_acceptances when missing.';

-- Cabinet «Принять условия». The caller accepts for their own account only.
CREATE OR REPLACE FUNCTION public.accept_business_offer_edition(
  p_document_key text,
  p_document_version text,
  p_content_hash text,
  p_annex_version text,
  p_annex_hash text
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
  v_user_id uuid := auth.uid();
BEGIN
  IF public.business_consent_caller_in_support_mode() THEN
    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF coalesce(p_document_key, '') <> 'business-offer' THEN
    RAISE EXCEPTION 'offer_document_unknown'
      USING ERRCODE = '22023',
            HINT = 'https://business.audiolad.ru/documents/business-offer';
  END IF;

  RETURN QUERY
  SELECT r.document_key, r.document_version, r.content_hash, r.accepted_at, r.already_accepted
  FROM public.record_business_offer_edition_acceptance(
    v_user_id, p_document_version, p_content_hash, p_annex_version, p_annex_hash, 'cabinet', 'business-offer'
  ) AS r;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_business_offer_edition(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_business_offer_edition(text, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.accept_business_offer_edition(text, text, text, text, text) IS
  'audiolad:business-offer; owner accepts the shown offer edition once for the whole account. A second call returns the stored row. Support mode cannot accept.';

CREATE OR REPLACE FUNCTION public.business_offer_edition_acceptances_for_caller()
RETURNS TABLE (
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
  SELECT a.document_key, a.document_version, a.content_hash, a.accepted_at
  FROM public.business_offer_edition_acceptances AS a
  WHERE a.user_id = auth.uid()
  ORDER BY a.accepted_at DESC;
$$;

REVOKE ALL ON FUNCTION public.business_offer_edition_acceptances_for_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_offer_edition_acceptances_for_caller() TO authenticated, service_role;

COMMENT ON FUNCTION public.business_offer_edition_acceptances_for_caller() IS
  'audiolad:business-offer; the caller reads only their own offer edition acceptances.';

DO $$
BEGIN
  IF to_regprocedure('public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text)') IS NULL
     OR to_regprocedure('public.accept_business_offer_edition(text, text, text, text, text)') IS NULL
     OR to_regprocedure('public.business_offer_edition_acceptances_for_caller()') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: business offer edition functions missing';
  END IF;
  IF has_function_privilege('anon', 'public.accept_business_offer_edition(text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_business_offer_edition_acceptance(uuid, text, text, text, text, text, text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.business_offer_edition_acceptances', 'INSERT')
     OR has_table_privilege('anon', 'public.business_offer_edition_acceptances', 'SELECT')
     OR has_table_privilege('authenticated', 'public.business_offer_editions', 'INSERT') THEN
    RAISE EXCEPTION 'Post-check failed: business offer edition privileges';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_offer_editions
    WHERE document_key = 'business-offer' AND document_version = 'offer-v1-2026-11-04'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: offer edition seed missing';
  END IF;
END;
$$;

COMMIT;

-- t1633u / t1634u: номер сертификата больше не «АЛК-год-последовательность»
-- (звучит как «алкаш» и выдаёт, сколько заведений уже подключено).
--
-- Нужно подтверждение Сергея перед выкладкой на прод.
--
-- Что делает эта миграция (аддитивно, ряды не переписывает):
--   * расширяет CHECK: старый ALK-YYYY-NNNNNN и новый AL-483271;
--   * случайный уникальный 6-значный номер в issue_business_venue_certificate
--     (retry при столкновении; общий для всех отраслей);
--   * уникальность по 6-значной части; таблица синонимов для старых URL/QR;
--   * резерв 483271 – вымышленный образец на /b/coffee/legal/sertifikat.
--
-- Существующие ряды ALK-2026-000002 / 000003 эта миграция НЕ меняет.
-- Переназначение на случайный номер – отдельный шаг
-- 20270404120100_business_certificate_number_al_reassign.sql (тоже только с согласия Сергея).
--
-- Откат этой миграции (с подтверждением Сергея):
--   DROP INDEX IF EXISTS public.business_venue_certificates_serial_uidx;
--   DROP TABLE IF EXISTS public.business_venue_certificate_aliases;
--   DROP TABLE IF EXISTS public.business_certificate_reserved_serials;
--   DROP FUNCTION IF EXISTS public.business_certificate_serial(text);
--   ALTER TABLE public.business_venue_certificates
--     DROP CONSTRAINT IF EXISTS business_venue_certificates_number_check;
--   ALTER TABLE public.business_venue_certificates
--     ADD CONSTRAINT business_venue_certificates_number_check
--     CHECK (number ~ '^ALK-[0-9]{4}-[0-9]{6}$');
--   Затем вернуть тело issue_business_venue_certificate из
--   20270317120000_business_coffee_legal_kit.sql (генерация ALK-YYYY-NNNNNN).
--   Новые ряды с номером AL-… перед откатом CHECK нужно снять или переименовать.

CREATE OR REPLACE FUNCTION public.business_certificate_serial(p_number text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_number ~ '^AL-[0-9]{6}$' THEN substring(p_number from 4)
    WHEN p_number ~ '^ALK-[0-9]{4}-[0-9]{6}$' THEN substring(p_number from 10)
    ELSE NULL
  END;
$$;

ALTER TABLE public.business_venue_certificates
  DROP CONSTRAINT IF EXISTS business_venue_certificates_number_check;

ALTER TABLE public.business_venue_certificates
  ADD CONSTRAINT business_venue_certificates_number_check
  CHECK (number ~ '^(ALK-[0-9]{4}-[0-9]{6}|AL-[0-9]{6})$');

CREATE UNIQUE INDEX IF NOT EXISTS business_venue_certificates_serial_uidx
  ON public.business_venue_certificates (public.business_certificate_serial(number));

CREATE TABLE IF NOT EXISTS public.business_venue_certificate_aliases (
  alias text PRIMARY KEY CHECK (alias ~ '^(ALK-[0-9]{4}-[0-9]{6}|AL-[0-9]{6})$'),
  certificate_id uuid NOT NULL REFERENCES public.business_venue_certificates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS business_venue_certificate_aliases_certificate_idx
  ON public.business_venue_certificate_aliases (certificate_id);

ALTER TABLE public.business_venue_certificate_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_venue_certificate_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_venue_certificate_aliases TO service_role;

COMMENT ON TABLE public.business_venue_certificate_aliases IS
  'audiolad:certificate-number-al; old ALK-YYYY-NNNNNN URLs/QR keep resolving after a number is reassigned.';

CREATE TABLE IF NOT EXISTS public.business_certificate_reserved_serials (
  serial text PRIMARY KEY CHECK (serial ~ '^[0-9]{6}$'),
  reason text NOT NULL
);

ALTER TABLE public.business_certificate_reserved_serials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_certificate_reserved_serials FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.business_certificate_reserved_serials TO service_role;

INSERT INTO public.business_certificate_reserved_serials (serial, reason)
VALUES ('483271', 'public sample certificate on /b/coffee/legal/sertifikat')
ON CONFLICT (serial) DO NOTHING;

-- Случайный уникальный AL-NNNNNN, retry при столкновении. Последовательность
-- business_venue_certificate_seq больше не используется для новых номеров
-- и не удаляется (безопасный откат).
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
  v_serial text;
  v_attempt int;
BEGIN
  PERFORM 1 FROM public.business_locations l
    WHERE l.id = p_location_id AND l.organization_id = p_organization_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'certificate_location_unknown' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_venue_certificates c
    WHERE c.location_id = p_location_id AND c.revoked_at IS NOT NULL AND c.superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION 'certificate_revoked' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current FROM public.business_venue_certificates c
    WHERE c.location_id = p_location_id AND c.superseded_at IS NULL AND c.revoked_at IS NULL;

  IF FOUND AND v_current.snapshot_hash = p_snapshot_hash THEN
    RETURN QUERY SELECT v_current.id, v_current.number, v_current.issued_at, false;
    RETURN;
  END IF;

  IF v_current.id IS NOT NULL THEN
    UPDATE public.business_venue_certificates SET superseded_at = now() WHERE business_venue_certificates.id = v_current.id;
  END IF;

  FOR v_attempt IN 1..64 LOOP
    v_serial := lpad((floor(random() * 1000000)::int)::text, 6, '0');
    IF EXISTS (SELECT 1 FROM public.business_certificate_reserved_serials r WHERE r.serial = v_serial) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.business_venue_certificates c
      WHERE public.business_certificate_serial(c.number) = v_serial
    ) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.business_venue_certificate_aliases a
      WHERE a.alias = 'AL-' || v_serial
    ) THEN
      CONTINUE;
    END IF;
    v_number := 'AL-' || v_serial;

    BEGIN
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
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      v_number := NULL;
      v_new_id := NULL;
      CONTINUE;
    END;
  END LOOP;

  IF v_current.id IS NOT NULL THEN
    UPDATE public.business_venue_certificates
      SET superseded_at = NULL, superseded_by = NULL
      WHERE business_venue_certificates.id = v_current.id;
  END IF;
  RAISE EXCEPTION 'certificate_number_exhausted' USING ERRCODE = '23505';
END;
$$;

COMMENT ON FUNCTION public.issue_business_venue_certificate(uuid, uuid, text, jsonb, timestamptz, timestamptz, text, text, timestamptz) IS
  'audiolad:certificate-number-al; issues AL-NNNNNN, a random unique 6-digit number, retrying on collision. Does not reveal how many venues are served.';

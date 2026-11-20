-- t1634u: ПЕРЕНАЗНАЧЕНИЕ существующих номеров ALK-YYYY-NNNNNN на случайный AL-NNNNNN.
--
-- НУЖНО ОТДЕЛЬНОЕ ПОДТВЕРЖДЕНИЕ СЕРГЕЯ. Это шаг с записью в существующие ряды.
-- Без него старые сертификаты 000002/000003 на печати покажут «АудиоЛад № 000 002»
-- (и по-прежнему выдадут последовательность). С этим шагом они получают случайный
-- номер, а старые URL и QR ALK-2026-000002 / 000003 открывают тот же сертификат
-- через таблицу синонимов.
--
-- Идемпотентно: обрабатывает только ряды, у которых number ещё в формате ALK-….
--
-- Откат (с подтверждением Сергея):
--   UPDATE public.business_venue_certificates c
--     SET number = a.alias
--     FROM public.business_venue_certificate_aliases a
--     WHERE a.certificate_id = c.id
--       AND a.alias ~ '^ALK-[0-9]{4}-[0-9]{6}$'
--       AND c.number ~ '^AL-[0-9]{6}$';
--   DELETE FROM public.business_venue_certificate_aliases
--     WHERE alias ~ '^ALK-[0-9]{4}-[0-9]{6}$';

DO $$
DECLARE
  r record;
  v_serial text;
  v_number text;
  v_attempt int;
BEGIN
  FOR r IN
    SELECT id, number
    FROM public.business_venue_certificates
    WHERE number ~ '^ALK-[0-9]{4}-[0-9]{6}$'
    FOR UPDATE
  LOOP
    v_number := NULL;
    FOR v_attempt IN 1..64 LOOP
      v_serial := lpad((floor(random() * 1000000)::int)::text, 6, '0');
      IF EXISTS (SELECT 1 FROM public.business_certificate_reserved_serials s WHERE s.serial = v_serial) THEN
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
      EXIT;
    END LOOP;

    IF v_number IS NULL THEN
      RAISE EXCEPTION 'certificate_number_exhausted_reassign' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.business_venue_certificate_aliases (alias, certificate_id)
    VALUES (r.number, r.id)
    ON CONFLICT (alias) DO NOTHING;

    UPDATE public.business_venue_certificates
      SET number = v_number
      WHERE id = r.id;
  END LOOP;
END;
$$;

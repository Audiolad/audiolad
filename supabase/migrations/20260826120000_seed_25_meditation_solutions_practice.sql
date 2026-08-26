BEGIN;

-- Paid practice + personal 20-minute 499 ₽ offer for the
-- /p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy landing.
-- Idempotent: safe to re-run. Unlisted in catalog; checkout uses slug.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.authors
    WHERE id = '50ee125c-8951-4ac6-819a-3f6b11150008'
  ) THEN
    RAISE EXCEPTION 'Author sergey-and-zoya is required before seeding 25-meditation-solutions';
  END IF;
END;
$$;

INSERT INTO public.practices (
  id,
  author_id,
  title,
  slug,
  description,
  format,
  duration_minutes,
  price,
  is_free,
  cover_url,
  audio_url,
  status,
  published_at,
  is_catalog_listed,
  product_kind
)
VALUES (
  'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
  '50ee125c-8951-4ac6-819a-3f6b11150008',
  '25 готовых решений для создания своих медитаций',
  '25-meditation-solutions',
  'Как создать свою медитацию с нуля: выбрать тему, написать текст для медитации, записать медитацию самостоятельно, добавить музыку и получить готовый MP3.',
  'Аудиопрактика',
  NULL,
  4999,
  false,
  '/products/25-meditation-solutions/hero.jpg',
  NULL,
  'published',
  now(),
  false,
  'practice'
)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  format = EXCLUDED.format,
  price = EXCLUDED.price,
  is_free = EXCLUDED.is_free,
  status = EXCLUDED.status,
  published_at = COALESCE(public.practices.published_at, EXCLUDED.published_at),
  is_catalog_listed = EXCLUDED.is_catalog_listed,
  product_kind = EXCLUDED.product_kind,
  cover_url = EXCLUDED.cover_url;

INSERT INTO public.practice_price_promotions (
  id,
  practice_id,
  name,
  promotion_type,
  sale_price,
  duration_seconds,
  is_active,
  start_token
)
VALUES (
  'c8d2f5b1-3e6a-4f9c-8d4b-7a2e9f3b5c81',
  'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
  '20 минут 499',
  'personal_countdown',
  499,
  1200,
  true,
  '25medsol20m499a1b2c3d4e5f67890'
)
ON CONFLICT (id) DO UPDATE
SET
  sale_price = EXCLUDED.sale_price,
  duration_seconds = EXCLUDED.duration_seconds,
  is_active = EXCLUDED.is_active,
  promotion_type = EXCLUDED.promotion_type,
  name = EXCLUDED.name;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.practices
    WHERE id = 'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70'
      AND slug = '25-meditation-solutions'
      AND status = 'published'
      AND is_free = false
      AND price = 4999
      AND is_catalog_listed = false
  ) THEN
    RAISE EXCEPTION 'Post-check failed: 25-meditation-solutions practice was not seeded correctly';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practice_price_promotions
    WHERE id = 'c8d2f5b1-3e6a-4f9c-8d4b-7a2e9f3b5c81'
      AND practice_id = 'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70'
      AND promotion_type = 'personal_countdown'
      AND sale_price = 499
      AND duration_seconds = 1200
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Post-check failed: 25-meditation-solutions promotion was not seeded correctly';
  END IF;
END;
$$;

COMMIT;

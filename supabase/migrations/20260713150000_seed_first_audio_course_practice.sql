BEGIN;

-- Paid practice for the /first-audio-course landing (990 RUB).
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.authors
    WHERE id = '50ee125c-8951-4ac6-819a-3f6b11150008'
  ) THEN
    RAISE EXCEPTION 'Author sergey-and-zoya is required before seeding first-audio-course';
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
  status
)
VALUES (
  'a8f4c2e1-9b3d-4f6a-8c7e-1d2f3a4b5c6d',
  '50ee125c-8951-4ac6-819a-3f6b11150008',
  'Как эксперту превратить знания в свой первый цифровой аудиопродукт',
  'first-audio-course',
  'Пошаговое аудиоруководство для экспертов, которые хотят превратить свой опыт в понятный цифровой продукт и начать продавать его онлайн.',
  'Аудиолекция',
  60,
  990,
  false,
  NULL,
  NULL,
  'published'
)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  format = EXCLUDED.format,
  duration_minutes = EXCLUDED.duration_minutes,
  price = EXCLUDED.price,
  is_free = EXCLUDED.is_free,
  status = EXCLUDED.status;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.practices
    WHERE slug = 'first-audio-course'
      AND status = 'published'
      AND is_free = false
      AND price = 990
  ) THEN
    RAISE EXCEPTION 'Post-check failed: first-audio-course practice was not seeded correctly';
  END IF;
END;
$$;

COMMIT;

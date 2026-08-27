BEGIN;

-- Extra Product Gallery slides for 25-meditation-solutions.
-- Cover stays on practices.cover_url (hero.jpg) and is the first PDP slide.
-- These 26 rows are item-01…item-25 + bonus-26 (27 slides with cover).
-- Idempotent on slide id. Does not change practice price or listing flags.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.practices
    WHERE id = 'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70'
      AND slug = '25-meditation-solutions'
  ) THEN
    RAISE EXCEPTION 'Practice 25-meditation-solutions is required before seeding its gallery';
  END IF;
END;
$$;

INSERT INTO public.publication_gallery_slides (
  id,
  publication_id,
  image_url,
  image_manifest,
  position,
  alt
)
VALUES
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0101',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-01.jpg',
    '{}'::jsonb,
    0,
    'Как сделать медитацию: пошаговый план от идеи до готового MP3 · PDF + аудио'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0102',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-02.jpg',
    '{}'::jsonb,
    1,
    'Как создать свою медитацию: 50 готовых тем · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0103',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-03.jpg',
    '{}'::jsonb,
    2,
    'Текст для медитации: готовая структура из 7 частей · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0104',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-04.jpg',
    '{}'::jsonb,
    3,
    'Как написать текст для медитации: пошаговый конструктор · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0105',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-05.jpg',
    '{}'::jsonb,
    4,
    'Паспорт будущей медитации: готовый шаблон · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0106',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-06.jpg',
    '{}'::jsonb,
    5,
    '20 готовых начал для текста медитации · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0107',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-07.jpg',
    '{}'::jsonb,
    6,
    'Как записать медитацию самостоятельно · Аудио'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0108',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-08.jpg',
    '{}'::jsonb,
    7,
    'Как записать медитацию голосом · Аудио'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0109',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-09.jpg',
    '{}'::jsonb,
    8,
    'Как записать медитацию с музыкой · Аудио'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0110',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-10.jpg',
    '{}'::jsonb,
    9,
    'Музыка для записи медитаций: как выбрать правильный фон · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0111',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-11.jpg',
    '{}'::jsonb,
    10,
    '10 красивых способов завершить медитацию · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0112',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-12.jpg',
    '{}'::jsonb,
    11,
    'Как создать и записать свою медитацию в Студии АудиоЛад · Аудио + PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0113',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-13.jpg',
    '{}'::jsonb,
    12,
    '30 готовых названий для медитаций · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0114',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-14.jpg',
    '{}'::jsonb,
    13,
    'Формула сильной темы для медитации · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0115',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-15.jpg',
    '{}'::jsonb,
    14,
    'Аффирмации для медитации: готовые формулы и примеры · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0116',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-16.jpg',
    '{}'::jsonb,
    15,
    'Конструктор основной части медитации · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0117',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-17.jpg',
    '{}'::jsonb,
    16,
    'Медитация «из точки А в точку Б»: готовая формула результата · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0118',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-18.jpg',
    '{}'::jsonb,
    17,
    '10 форматов медитаций и аудиопрактик, которые можно создавать · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0119',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-19.jpg',
    '{}'::jsonb,
    18,
    '15 способов быстро расслабить человека в начале медитации · Аудио + PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0120',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-20.jpg',
    '{}'::jsonb,
    19,
    'Конструктор визуализации для медитации · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0121',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-21.jpg',
    '{}'::jsonb,
    20,
    'Как подготовить голос к записи медитации за 5 минут · Аудио'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0122',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-22.jpg',
    '{}'::jsonb,
    21,
    '5 вариантов голоса и интонации для разных медитаций · Аудио'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0123',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-23.jpg',
    '{}'::jsonb,
    22,
    'Как записать чистый голос для медитации · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0124',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-24.jpg',
    '{}'::jsonb,
    23,
    'Голос и музыка в медитации: формула правильного баланса · Аудио'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0125',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/item-25.jpg',
    '{}'::jsonb,
    24,
    'Как из одной медитации создать серию из 7 аудиопрактик · PDF'
  ),
  (
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0126',
    'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70',
    '/products/25-meditation-solutions/bonus-26.jpg',
    '{}'::jsonb,
    25,
    'Как использовать медитации и аудиопрактики для привлечения клиентов · PDF + аудио'
  )
ON CONFLICT (id) DO UPDATE
SET
  publication_id = EXCLUDED.publication_id,
  image_url = EXCLUDED.image_url,
  image_manifest = EXCLUDED.image_manifest,
  position = EXCLUDED.position,
  alt = EXCLUDED.alt
WHERE public.publication_gallery_slides.publication_id = 'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70';

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.publication_gallery_slides
    WHERE publication_id = 'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70'
      AND id IN (
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0101',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0102',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0103',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0104',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0105',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0106',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0107',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0108',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0109',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0110',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0111',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0112',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0113',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0114',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0115',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0116',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0117',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0118',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0119',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0120',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0121',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0122',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0123',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0124',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0125',
        'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a0126'
      )
  ) <> 26 THEN
    RAISE EXCEPTION 'Post-check failed: 25-meditation-solutions gallery was not seeded correctly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.publication_gallery_slides
    WHERE publication_id = 'b7c1e4a0-2d5f-4e8b-9c3a-6f1d8e2a4b70'
      AND image_url LIKE '%/hero.jpg'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: cover hero.jpg must not be a gallery row';
  END IF;
END;
$$;

COMMIT;

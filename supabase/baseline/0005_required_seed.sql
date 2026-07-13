-- BASELINE FOR EMPTY DATABASES ONLY.
-- DO NOT APPLY TO THE EXISTING PRODUCTION DATABASE.
--
-- Minimal system seed required for starter library and catalog compatibility.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING / conditional inserts).
-- Does NOT contain user data, auth users, or storage file contents.
--
-- Why this seed exists:
--   1. grant_active_starter_practices() reads starter_practices + practices
--   2. Existing data-migrations expect 3 starter slugs
--   3. Catalog and practice pages expect published practices with authors
--
-- UUIDs are fixed to match production identifiers for reproducibility.
-- Audio file itself is NOT seeded; audio_url path is set for elixir-molodosti only.

BEGIN;

-- ---------------------------------------------------------------------------
-- Author (required for practices.author_id FK and nested author selects)
-- ---------------------------------------------------------------------------

INSERT INTO public.authors (
  id,
  name,
  slug,
  description,
  avatar_url
)
VALUES (
  '50ee125c-8951-4ac6-819a-3f6b11150008',
  'Сергей и Зоя',
  'sergey-and-zoya',
  'Медитации, энергопрактики и программы для внутренней гармонии.',
  NULL
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Practices (5 published cards; 3 free starters + 2 paid catalog entries)
-- ---------------------------------------------------------------------------

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
VALUES
  (
    'c3d63131-3ef4-4dbb-8888-0a5085a456b5',
    '50ee125c-8951-4ac6-819a-3f6b11150008',
    'Эликсир Молодости',
    'elixir-molodosti',
    'Активация жизненной энергии и внутреннего омоложения.',
    'Медитация',
    18,
    0,
    true,
    NULL,
    'practices/c3d63131-3ef4-4dbb-8888-0a5085a456b5/audio.mp3',
    'published'
  ),
  (
    '9b30e602-d6ff-416e-b6a9-8f926bd0e8b7',
    '50ee125c-8951-4ac6-819a-3f6b11150008',
    'Ключ к Изобилию',
    'klyuch-k-izobiliyu',
    'Настройка на поток денег, возможностей и благополучия.',
    'Энергопрактика',
    21,
    0,
    true,
    NULL,
    NULL,
    'published'
  ),
  (
    '41f31832-e9e2-4e22-bb05-729bbc57c815',
    '50ee125c-8951-4ac6-819a-3f6b11150008',
    'Код Притяжения',
    'kod-prityazheniya',
    'Привлечение любви, гармоничных отношений и душевной близости.',
    'Медитация',
    15,
    0,
    true,
    NULL,
    NULL,
    'published'
  ),
  (
    '5b046f95-32da-46b0-9e80-5cd271c17c36',
    '50ee125c-8951-4ac6-819a-3f6b11150008',
    'Мои личные границы',
    'personal-boundaries',
    'Практика для внутренней свободы, уверенности и спокойной защиты своего пространства.',
    'Энергопрактика',
    17,
    199,
    false,
    NULL,
    NULL,
    'published'
  ),
  (
    '4f84d32f-1238-4918-9554-4e3fb21488b5',
    '50ee125c-8951-4ac6-819a-3f6b11150008',
    'Сила Женственности',
    'sila-zhenstvennosti',
    'Медитация для раскрытия мягкости, принятия и внутренней силы.',
    'Медитация',
    16,
    199,
    false,
    NULL,
    NULL,
    'published'
  )
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Starter bundle (3 free published practices required at registration)
-- ---------------------------------------------------------------------------

INSERT INTO public.starter_practices (
  practice_id,
  sort_order,
  is_active
)
SELECT p.id, v.sort_order, true
FROM (
  VALUES
    ('elixir-molodosti', 1),
    ('klyuch-k-izobiliyu', 2),
    ('kod-prityazheniya', 3)
) AS v(slug, sort_order)
INNER JOIN public.practices AS p ON p.slug = v.slug
ON CONFLICT (practice_id) DO NOTHING;

COMMIT;

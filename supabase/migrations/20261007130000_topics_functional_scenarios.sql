BEGIN;

-- Incremental platform topics for functional listening scenarios and wishes.
-- The platform topic dictionary remains the canonical source. Existing topic
-- rows and product assignments are deliberately left unchanged.

INSERT INTO public.topics (
  key,
  slug,
  title,
  description,
  sort_order,
  is_active,
  show_on_home
)
VALUES
  ('rest', 'rest', 'Отдых', NULL, 160, true, true),
  ('relax', 'relax', 'Релакс', NULL, 170, true, true),
  ('work', 'work', 'Работа', NULL, 180, true, true),
  ('concentration', 'concentration', 'Концентрация', NULL, 190, true, true),
  ('study', 'study', 'Учёба', NULL, 200, true, true),
  ('creativity', 'creativity', 'Творчество', NULL, 210, true, true),
  ('sport', 'sport', 'Спорт', NULL, 220, true, true),
  ('desires', 'desires', 'Желания', NULL, 230, true, true)
ON CONFLICT (key) DO NOTHING;

COMMIT;

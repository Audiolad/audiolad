-- Rename joint author workspace display name (idempotent).
-- Does not change id, slug, or any related records.

UPDATE public.authors
SET name = 'Сергей и Зоя'
WHERE slug = 'sergey-and-zoya'
  AND name IS DISTINCT FROM 'Сергей и Зоя';

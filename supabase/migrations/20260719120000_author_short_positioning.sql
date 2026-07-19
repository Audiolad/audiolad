-- Короткое позиционирование автора для публичной шапки страницы.
ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS short_positioning text NULL;

COMMENT ON COLUMN public.authors.short_positioning IS
  'Короткое позиционирование автора (до 100 символов), отображается под именем на публичной странице.';

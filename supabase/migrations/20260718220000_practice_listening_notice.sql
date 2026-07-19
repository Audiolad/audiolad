-- Per-product "before listening" notice on public product and listen pages.
-- Idempotent: ADD COLUMN IF NOT EXISTS with safe defaults for existing rows.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS listening_notice_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS listening_notice_title text NOT NULL DEFAULT 'Перед прослушиванием',
  ADD COLUMN IF NOT EXISTS listening_notice_text text NOT NULL DEFAULT $notice$
Выберите спокойное и безопасное место для прослушивания.

Не включайте практику во время управления транспортом или работы, требующей постоянной концентрации.$notice$;

COMMENT ON COLUMN public.practices.listening_notice_enabled IS
  'When true, show the pre-listening notice card on public product/listen pages.';

COMMENT ON COLUMN public.practices.listening_notice_title IS
  'Title for the pre-listening notice card (default: Перед прослушиванием).';

COMMENT ON COLUMN public.practices.listening_notice_text IS
  'Body text for the pre-listening notice card; paragraphs preserved via newline characters.';

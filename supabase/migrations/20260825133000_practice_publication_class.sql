BEGIN;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS publication_class text NULL;

ALTER TABLE public.practices
  DROP CONSTRAINT IF EXISTS practices_publication_class_check;

ALTER TABLE public.practices
  ADD CONSTRAINT practices_publication_class_check
  CHECK (
    publication_class IS NULL
    OR publication_class IN ('practice', 'course', 'audiobook', 'release', 'post')
  );

COMMENT ON COLUMN public.practices.publication_class IS
  'audiolad:publication-class:v1; nullable Phase 1 class. NULL = legacy row; product_kind remains the shadow. No backfill.';

COMMIT;

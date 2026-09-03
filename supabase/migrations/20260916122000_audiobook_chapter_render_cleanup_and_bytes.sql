BEGIN;

ALTER TABLE public.audiobook_chapter_render_jobs
  ADD COLUMN IF NOT EXISTS output_size_bytes bigint NULL;

ALTER TABLE public.audiobook_chapter_render_jobs
  DROP CONSTRAINT IF EXISTS audiobook_chapter_render_output_check;
ALTER TABLE public.audiobook_chapter_render_jobs
  ADD CONSTRAINT audiobook_chapter_render_output_check CHECK (
    (status = 'completed' AND output_storage_path IS NOT NULL AND output_size_bytes > 0 AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND output_storage_path IS NULL AND output_size_bytes IS NULL)
  );

ALTER TABLE public.audiobook_chapter_render_jobs
  DROP CONSTRAINT IF EXISTS audiobook_chapter_render_jobs_project_id_fkey,
  ADD CONSTRAINT audiobook_chapter_render_jobs_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.audiobook_projects(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS audiobook_chapter_render_jobs_chapter_id_fkey,
  ADD CONSTRAINT audiobook_chapter_render_jobs_chapter_id_fkey
    FOREIGN KEY (chapter_id) REFERENCES public.audiobook_chapters(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.delete_audiobook_chapter_render_jobs_for_fragment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.audiobook_chapter_render_jobs
  WHERE chapter_id = OLD.chapter_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audiobook_fragments_delete_render_jobs
  ON public.audiobook_fragments;
CREATE TRIGGER audiobook_fragments_delete_render_jobs
AFTER DELETE ON public.audiobook_fragments
FOR EACH ROW EXECUTE FUNCTION public.delete_audiobook_chapter_render_jobs_for_fragment();

COMMIT;

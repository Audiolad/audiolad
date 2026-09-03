BEGIN;

CREATE OR REPLACE FUNCTION public.lock_audiobook_chapter_render_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fragment_snapshot IS DISTINCT FROM OLD.fragment_snapshot
    OR NEW.snapshot_sha256 IS DISTINCT FROM OLD.snapshot_sha256
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.chapter_id IS DISTINCT FROM OLD.chapter_id
    OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'audiobook_chapter_render_snapshot_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audiobook_chapter_render_snapshot_immutable
BEFORE UPDATE ON public.audiobook_chapter_render_jobs
FOR EACH ROW EXECUTE FUNCTION public.lock_audiobook_chapter_render_snapshot();

COMMIT;

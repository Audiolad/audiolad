BEGIN;

-- ---------------------------------------------------------------------------
-- Phase 2A PR1: Course Content Foundation
--
-- Course → Lesson → LessonBlock. No Section / Module in this phase.
-- publication_id = practices.id. Parent must be publication_class = 'course'
-- (explicit course only; legacy NULL+practice stays practice).
--
-- Access is never granted by the presence of a lesson / block / file / CTA
-- row. Future learner API must resolve the parent course, then
-- canAccessCourseContent (user_practices entitlement / author member /
-- platform admin), then read via server + service role. No GET-by-lesson-id
-- without a parent check. This migration does not add learner endpoints.
--
-- No backfill. No UPDATE of practices. No publication_class changes.
-- audio_items are not auto-migrated into lessons.
-- course_completion_ctas is independent of practices.promo_*.
-- Storage: private bucket publication-files (not personal-materials,
-- not practice-audio, not public). MPEG-style private: no public SELECT.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. course_lessons
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  publication_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  title text NOT NULL,
  position integer NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_lessons_position_check
    CHECK (position >= 0),

  CONSTRAINT course_lessons_title_check
    CHECK (char_length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS course_lessons_publication_position_idx
  ON public.course_lessons (publication_id, position, id);

COMMENT ON TABLE public.course_lessons IS
  'Phase 2A course lessons. Parent must be practices.publication_class = course. Presence of a row never grants read. No Section. No 30-lesson cap. No lesson_1 names. No backfill from audio_items.';

COMMENT ON COLUMN public.course_lessons.publication_id IS
  'Course publication id = practices.id. Trigger rejects non-course parents.';

COMMENT ON COLUMN public.course_lessons.position IS
  'Display order, 0-based. No upper cap in Phase 2A.';

-- ===========================================================================
-- 2. publication_files (created before blocks so file-block trigger can join)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.publication_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  publication_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  storage_path text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  original_name text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT publication_files_mime_check
    CHECK (mime = 'application/pdf'),

  CONSTRAINT publication_files_size_bytes_check
    CHECK (size_bytes > 0 AND size_bytes <= 20971520),

  CONSTRAINT publication_files_storage_path_check
    CHECK (char_length(btrim(storage_path)) > 0),

  CONSTRAINT publication_files_original_name_check
    CHECK (char_length(btrim(original_name)) > 0)
);

CREATE INDEX IF NOT EXISTS publication_files_publication_id_idx
  ON public.publication_files (publication_id, id);

COMMENT ON TABLE public.publication_files IS
  'Private publication files (Phase 2A: PDF only). Bucket publication-files. No public URL column. Presence of a row never grants read. Parent must be publication_class = course.';

COMMENT ON COLUMN public.publication_files.storage_path IS
  'Object path in private bucket publication-files. Never a public URL.';

COMMENT ON COLUMN public.publication_files.mime IS
  'Phase 2A restricted to application/pdf. Column name stays generic.';

-- ===========================================================================
-- 3. course_lesson_blocks
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.course_lesson_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.course_lessons (id)
    ON DELETE CASCADE,

  type text NOT NULL,
  position integer NOT NULL,
  asset_id uuid NULL,
  payload jsonb NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_lesson_blocks_type_check
    CHECK (type IN ('audio', 'text', 'file')),

  CONSTRAINT course_lesson_blocks_position_check
    CHECK (position >= 0),

  CONSTRAINT course_lesson_blocks_text_semantics_check
    CHECK (
      type <> 'text'
      OR (
        asset_id IS NULL
        AND payload IS NOT NULL
        AND jsonb_typeof(payload -> 'text') = 'string'
      )
    ),

  CONSTRAINT course_lesson_blocks_audio_semantics_check
    CHECK (
      type <> 'audio'
      OR (
        asset_id IS NOT NULL
        AND (
          payload IS NULL
          OR jsonb_typeof(payload) = 'object'
        )
      )
    ),

  CONSTRAINT course_lesson_blocks_file_semantics_check
    CHECK (
      type <> 'file'
      OR (
        asset_id IS NOT NULL
        AND (
          payload IS NULL
          OR jsonb_typeof(payload) = 'object'
        )
      )
    )
);

CREATE INDEX IF NOT EXISTS course_lesson_blocks_lesson_position_idx
  ON public.course_lesson_blocks (lesson_id, position, id);

COMMENT ON TABLE public.course_lesson_blocks IS
  'Lesson blocks: audio | text | file. Presence of a row never grants read. audio.asset_id is an audio_items.id of the same course. file.asset_id is a publication_files.id. text has no asset. No binary in payload. audio_items are not auto-created.';

COMMENT ON COLUMN public.course_lesson_blocks.asset_id IS
  'Polymorphic: audio → audio_items.id, file → publication_files.id, text → NULL. Enforced by trigger, not a single FK.';

COMMENT ON COLUMN public.course_lesson_blocks.payload IS
  'text: { text: string }. audio: optional metadata only, never binary. file: optional filename/mime/size display copy.';

-- ===========================================================================
-- 4. course_completion_ctas (1:1 with course, not a lesson block, not promo_*)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.course_completion_ctas (
  publication_id uuid PRIMARY KEY
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  title text NULL,
  description text NULL,
  button_text text NULL,
  url text NULL,
  enabled boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.course_completion_ctas IS
  'Optional 1:1 completion CTA for a course. Independent of practices.promo_*. Not a lesson block. Parent must be publication_class = course. Presence never grants read.';

-- ===========================================================================
-- 5. updated_at triggers
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_course_lessons_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_lessons_set_updated_at
  ON public.course_lessons;
CREATE TRIGGER course_lessons_set_updated_at
  BEFORE UPDATE ON public.course_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.set_course_lessons_updated_at();

CREATE OR REPLACE FUNCTION public.set_course_lesson_blocks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_lesson_blocks_set_updated_at
  ON public.course_lesson_blocks;
CREATE TRIGGER course_lesson_blocks_set_updated_at
  BEFORE UPDATE ON public.course_lesson_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_course_lesson_blocks_updated_at();

CREATE OR REPLACE FUNCTION public.set_publication_files_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS publication_files_set_updated_at
  ON public.publication_files;
CREATE TRIGGER publication_files_set_updated_at
  BEFORE UPDATE ON public.publication_files
  FOR EACH ROW
  EXECUTE FUNCTION public.set_publication_files_updated_at();

CREATE OR REPLACE FUNCTION public.set_course_completion_ctas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_completion_ctas_set_updated_at
  ON public.course_completion_ctas;
CREATE TRIGGER course_completion_ctas_set_updated_at
  BEFORE UPDATE ON public.course_completion_ctas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_course_completion_ctas_updated_at();

-- ===========================================================================
-- 6. Parent must be explicit publication_class = 'course'
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.enforce_course_content_parent_is_course()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_class text;
  parent_id uuid;
BEGIN
  parent_id := NEW.publication_id;

  SELECT p.publication_class
    INTO parent_class
  FROM public.practices AS p
  WHERE p.id = parent_id;

  IF parent_class IS DISTINCT FROM 'course' THEN
    RAISE EXCEPTION 'course_content_parent_must_be_course'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_course_content_parent_is_course() IS
  'Rejects course_lessons / publication_files / course_completion_ctas unless practices.publication_class is the explicit value course. Legacy NULL+practice is not a course.';

DROP TRIGGER IF EXISTS course_lessons_parent_must_be_course
  ON public.course_lessons;
CREATE TRIGGER course_lessons_parent_must_be_course
  BEFORE INSERT OR UPDATE OF publication_id ON public.course_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_course_content_parent_is_course();

DROP TRIGGER IF EXISTS publication_files_parent_must_be_course
  ON public.publication_files;
CREATE TRIGGER publication_files_parent_must_be_course
  BEFORE INSERT OR UPDATE OF publication_id ON public.publication_files
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_course_content_parent_is_course();

DROP TRIGGER IF EXISTS course_completion_ctas_parent_must_be_course
  ON public.course_completion_ctas;
CREATE TRIGGER course_completion_ctas_parent_must_be_course
  BEFORE INSERT OR UPDATE OF publication_id ON public.course_completion_ctas
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_course_content_parent_is_course();

-- ===========================================================================
-- 7. Block asset identity (audio_items / publication_files same course)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.enforce_course_lesson_block_asset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lesson_publication_id uuid;
  audio_practice_id uuid;
  file_publication_id uuid;
BEGIN
  SELECT l.publication_id
    INTO lesson_publication_id
  FROM public.course_lessons AS l
  WHERE l.id = NEW.lesson_id;

  IF lesson_publication_id IS NULL THEN
    RAISE EXCEPTION 'course_lesson_block_lesson_missing'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.type = 'audio' THEN
    SELECT ai.practice_id
      INTO audio_practice_id
    FROM public.audio_items AS ai
    WHERE ai.id = NEW.asset_id;

    IF audio_practice_id IS NULL
       OR audio_practice_id IS DISTINCT FROM lesson_publication_id THEN
      RAISE EXCEPTION 'course_lesson_block_audio_publication_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.type = 'file' THEN
    SELECT pf.publication_id
      INTO file_publication_id
    FROM public.publication_files AS pf
    WHERE pf.id = NEW.asset_id;

    IF file_publication_id IS NULL
       OR file_publication_id IS DISTINCT FROM lesson_publication_id THEN
      RAISE EXCEPTION 'course_lesson_block_file_publication_mismatch'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_course_lesson_block_asset() IS
  'audio.asset_id must be audio_items.id with practice_id = lesson.publication_id. file.asset_id must be publication_files.id of the same course. Does not create audio_items.';

DROP TRIGGER IF EXISTS course_lesson_blocks_enforce_asset
  ON public.course_lesson_blocks;
CREATE TRIGGER course_lesson_blocks_enforce_asset
  BEFORE INSERT OR UPDATE OF lesson_id, type, asset_id ON public.course_lesson_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_course_lesson_block_asset();

-- ===========================================================================
-- 8. RLS — no public SELECT, no learner SELECT, author CRUD, service_role ALL
--
-- Authenticated GRANT exists so author-member policies can fire. There is
-- no policy that lets a learner SELECT by entitlement. Learner reads must
-- go through server + service role after canAccessCourseContent.
-- ===========================================================================

ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lesson_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_completion_ctas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.course_lessons FROM PUBLIC;
REVOKE ALL ON TABLE public.course_lessons FROM anon;
REVOKE ALL ON TABLE public.course_lessons FROM authenticated;

REVOKE ALL ON TABLE public.course_lesson_blocks FROM PUBLIC;
REVOKE ALL ON TABLE public.course_lesson_blocks FROM anon;
REVOKE ALL ON TABLE public.course_lesson_blocks FROM authenticated;

REVOKE ALL ON TABLE public.publication_files FROM PUBLIC;
REVOKE ALL ON TABLE public.publication_files FROM anon;
REVOKE ALL ON TABLE public.publication_files FROM authenticated;

REVOKE ALL ON TABLE public.course_completion_ctas FROM PUBLIC;
REVOKE ALL ON TABLE public.course_completion_ctas FROM anon;
REVOKE ALL ON TABLE public.course_completion_ctas FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_lesson_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.publication_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_completion_ctas TO authenticated;

GRANT ALL ON TABLE public.course_lessons TO service_role;
GRANT ALL ON TABLE public.course_lesson_blocks TO service_role;
GRANT ALL ON TABLE public.publication_files TO service_role;
GRANT ALL ON TABLE public.course_completion_ctas TO service_role;

-- course_lessons author CRUD
DROP POLICY IF EXISTS "Author members can read course lessons"
  ON public.course_lessons;
CREATE POLICY "Author members can read course lessons"
  ON public.course_lessons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_lessons.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can insert course lessons"
  ON public.course_lessons;
CREATE POLICY "Author members can insert course lessons"
  ON public.course_lessons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_lessons.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can update course lessons"
  ON public.course_lessons;
CREATE POLICY "Author members can update course lessons"
  ON public.course_lessons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_lessons.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_lessons.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can delete course lessons"
  ON public.course_lessons;
CREATE POLICY "Author members can delete course lessons"
  ON public.course_lessons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_lessons.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

-- course_lesson_blocks author CRUD (via lesson → publication)
DROP POLICY IF EXISTS "Author members can read course lesson blocks"
  ON public.course_lesson_blocks;
CREATE POLICY "Author members can read course lesson blocks"
  ON public.course_lesson_blocks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_lessons AS l
      INNER JOIN public.practices AS p
        ON p.id = l.publication_id
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE l.id = course_lesson_blocks.lesson_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can insert course lesson blocks"
  ON public.course_lesson_blocks;
CREATE POLICY "Author members can insert course lesson blocks"
  ON public.course_lesson_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.course_lessons AS l
      INNER JOIN public.practices AS p
        ON p.id = l.publication_id
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE l.id = course_lesson_blocks.lesson_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can update course lesson blocks"
  ON public.course_lesson_blocks;
CREATE POLICY "Author members can update course lesson blocks"
  ON public.course_lesson_blocks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_lessons AS l
      INNER JOIN public.practices AS p
        ON p.id = l.publication_id
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE l.id = course_lesson_blocks.lesson_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.course_lessons AS l
      INNER JOIN public.practices AS p
        ON p.id = l.publication_id
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE l.id = course_lesson_blocks.lesson_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can delete course lesson blocks"
  ON public.course_lesson_blocks;
CREATE POLICY "Author members can delete course lesson blocks"
  ON public.course_lesson_blocks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_lessons AS l
      INNER JOIN public.practices AS p
        ON p.id = l.publication_id
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE l.id = course_lesson_blocks.lesson_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

-- publication_files author CRUD
DROP POLICY IF EXISTS "Author members can read publication files"
  ON public.publication_files;
CREATE POLICY "Author members can read publication files"
  ON public.publication_files
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_files.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can insert publication files"
  ON public.publication_files;
CREATE POLICY "Author members can insert publication files"
  ON public.publication_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_files.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can update publication files"
  ON public.publication_files;
CREATE POLICY "Author members can update publication files"
  ON public.publication_files
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_files.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_files.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can delete publication files"
  ON public.publication_files;
CREATE POLICY "Author members can delete publication files"
  ON public.publication_files
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = publication_files.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

-- course_completion_ctas author CRUD
DROP POLICY IF EXISTS "Author members can read course completion ctas"
  ON public.course_completion_ctas;
CREATE POLICY "Author members can read course completion ctas"
  ON public.course_completion_ctas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_completion_ctas.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can insert course completion ctas"
  ON public.course_completion_ctas;
CREATE POLICY "Author members can insert course completion ctas"
  ON public.course_completion_ctas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_completion_ctas.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can update course completion ctas"
  ON public.course_completion_ctas;
CREATE POLICY "Author members can update course completion ctas"
  ON public.course_completion_ctas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_completion_ctas.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_completion_ctas.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Author members can delete course completion ctas"
  ON public.course_completion_ctas;
CREATE POLICY "Author members can delete course completion ctas"
  ON public.course_completion_ctas
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.practices AS p
      INNER JOIN public.author_members AS am
        ON am.author_id = p.author_id
      WHERE p.id = course_completion_ctas.publication_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND p.deleted_at IS NULL
    )
  );

-- ===========================================================================
-- 9. Private storage bucket publication-files
-- MPEG-style private: no public SELECT, no anon/authenticated storage policies.
-- Uploads/downloads via service-role API after canAccessCourseContent.
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Required table storage.buckets does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'publication-files'
  ) THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'publication-files',
      'publication-files',
      false,
      20971520,
      ARRAY['application/pdf']::text[]
    );
  END IF;
END;
$$;

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- Author product moderation MVP — schema (part 1/2)
--
-- Consolidates the schema contracts from the fix/author-product-moderation-
-- security branch (tip migrations 20260730140000-20260730145000) for current
-- main/prod. Adapted for CURRENT prod state:
--   - practices.status currently has NO CHECK constraint and still contains
--     'archived' rows (retired here, backfilled to 'unpublished').
--   - Does NOT port the email/outbox schema (20260730146000).
--
-- RPCs / triggers that enforce moderation on publish/edit live in the
-- companion migration 20260731181000_practice_moderation_mvp_gates_and_rpcs.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. authors.can_bypass_product_moderation
-- ===========================================================================

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS can_bypass_product_moderation boolean;

UPDATE public.authors
SET can_bypass_product_moderation = false
WHERE can_bypass_product_moderation IS NULL;

ALTER TABLE public.authors
  ALTER COLUMN can_bypass_product_moderation SET DEFAULT false,
  ALTER COLUMN can_bypass_product_moderation SET NOT NULL;

COMMENT ON COLUMN public.authors.can_bypass_product_moderation IS
  'When true, members of this author workspace may publish without product moderation. Admin-managed only; never inferred from email/name/slug at runtime.';

-- Platform-owned workspaces by stable UUID (seed IDs). Slug is documentation only.
-- sergey-and-zoya, sergey-petrov, zoya-petrova — see 20260714180000 / 20260714190000.
UPDATE public.authors
SET can_bypass_product_moderation = true
WHERE id IN (
  '50ee125c-8951-4ac6-819a-3f6b11150008'::uuid, -- sergey-and-zoya
  '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c'::uuid, -- sergey-petrov
  '8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0'::uuid  -- zoya-petrova
);

-- ===========================================================================
-- 2. practices: moderation + soft delete columns
-- ===========================================================================

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS moderation_status text;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS moderation_attempt integer;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS moderation_submitted_at timestamptz;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS moderation_review_comment text;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS deletion_reason text;

-- ===========================================================================
-- 3. Data backfill BEFORE constraints
-- ===========================================================================

-- 3a. archived → unpublished (visible status becomes «Снят с публикации»).
-- 'archived' currently has no CHECK constraint on prod but is retired by this
-- migration; the sale-lock guard below stops allowing it going forward.
UPDATE public.practices
SET
  status = 'unpublished',
  is_catalog_listed = false,
  updated_at = now()
WHERE status = 'archived';

-- 3b. Normalize unexpected legacy statuses (defensive; expected count = 0)
UPDATE public.practices
SET
  status = CASE
    WHEN published_at IS NOT NULL THEN 'unpublished'
    ELSE 'draft'
  END,
  is_catalog_listed = false,
  updated_at = now()
WHERE status IS NULL
   OR status NOT IN ('draft', 'published', 'unpublished', 'archived');

-- 3c. moderation_status backfill
UPDATE public.practices
SET moderation_status = CASE
  WHEN status = 'published' THEN 'approved'
  WHEN status = 'draft' THEN 'not_submitted'
  WHEN status = 'unpublished' AND published_at IS NOT NULL THEN 'approved'
  WHEN status = 'unpublished' AND published_at IS NULL THEN 'not_submitted'
  ELSE 'not_submitted'
END
WHERE moderation_status IS NULL;

UPDATE public.practices
SET moderation_attempt = 0
WHERE moderation_attempt IS NULL;

-- ===========================================================================
-- 4. Defaults + NOT NULL + CHECK constraints
-- ===========================================================================

ALTER TABLE public.practices
  ALTER COLUMN moderation_status SET DEFAULT 'not_submitted',
  ALTER COLUMN moderation_status SET NOT NULL,
  ALTER COLUMN moderation_attempt SET DEFAULT 0,
  ALTER COLUMN moderation_attempt SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft';

-- status was nullable historically; lock after backfill
UPDATE public.practices
SET status = 'draft'
WHERE status IS NULL;

ALTER TABLE public.practices
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_status_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'unpublished'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_moderation_status_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_moderation_status_check
      CHECK (
        moderation_status = ANY (
          ARRAY[
            'not_submitted'::text,
            'submitted'::text,
            'changes_requested'::text,
            'approved'::text
          ]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_moderation_attempt_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_moderation_attempt_check
      CHECK (moderation_attempt >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_moderation_review_comment_length_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_moderation_review_comment_length_check
      CHECK (
        moderation_review_comment IS NULL
        OR char_length(moderation_review_comment) <= 3000
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_deletion_reason_length_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_deletion_reason_length_check
      CHECK (
        deletion_reason IS NULL
        OR char_length(deletion_reason) <= 3000
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.practices.moderation_status IS
  'Product moderation state. Visible author labels are derived with status.';
COMMENT ON COLUMN public.practices.moderation_attempt IS
  'Number of successful submit/resubmit attempts (increments on each submit).';
COMMENT ON COLUMN public.practices.moderation_submitted_at IS
  'Timestamp of the latest submit/resubmit to moderation.';
COMMENT ON COLUMN public.practices.moderation_review_comment IS
  'Latest moderator comment denormalized for author UI. Full history in practice_moderation_events.';
COMMENT ON COLUMN public.practices.deleted_at IS
  'Soft-delete timestamp. NULL = active. Storage files are retained in this release.';
COMMENT ON COLUMN public.practices.deleted_by IS
  'User who soft-deleted the practice (author member or admin).';
COMMENT ON COLUMN public.practices.deletion_reason IS
  'Optional soft-delete reason for service history.';

CREATE INDEX IF NOT EXISTS practices_moderation_queue_idx
  ON public.practices (moderation_status, moderation_submitted_at DESC NULLS LAST)
  WHERE deleted_at IS NULL
    AND moderation_status = ANY (ARRAY['submitted'::text, 'changes_requested'::text]);

CREATE INDEX IF NOT EXISTS practices_deleted_at_idx
  ON public.practices (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS practices_status_moderation_idx
  ON public.practices (status, moderation_status)
  WHERE deleted_at IS NULL;

-- ===========================================================================
-- 5. practice_moderation_events
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.practice_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE CASCADE,
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  from_moderation_status text NULL,
  to_moderation_status text NULL,
  comment text NULL,
  actor_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  attempt integer NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_moderation_events_action_check CHECK (
    action = ANY (
      ARRAY[
        'submitted'::text,
        'resubmitted'::text,
        'submission_withdrawn'::text,
        'changes_requested'::text,
        'approved_and_published'::text,
        'unpublished'::text,
        'republished'::text,
        'edit_mode_started'::text,
        'deleted'::text,
        'migration_backfill'::text
      ]
    )
  ),

  CONSTRAINT practice_moderation_events_actor_type_check CHECK (
    actor_type = ANY (ARRAY['author'::text, 'admin'::text, 'system'::text])
  ),

  CONSTRAINT practice_moderation_events_from_status_check CHECK (
    from_status IS NULL
    OR from_status = ANY (ARRAY['draft'::text, 'published'::text, 'unpublished'::text, 'archived'::text])
  ),

  CONSTRAINT practice_moderation_events_to_status_check CHECK (
    to_status IS NULL
    OR to_status = ANY (ARRAY['draft'::text, 'published'::text, 'unpublished'::text])
  ),

  CONSTRAINT practice_moderation_events_from_moderation_status_check CHECK (
    from_moderation_status IS NULL
    OR from_moderation_status = ANY (
      ARRAY[
        'not_submitted'::text,
        'submitted'::text,
        'changes_requested'::text,
        'approved'::text
      ]
    )
  ),

  CONSTRAINT practice_moderation_events_to_moderation_status_check CHECK (
    to_moderation_status IS NULL
    OR to_moderation_status = ANY (
      ARRAY[
        'not_submitted'::text,
        'submitted'::text,
        'changes_requested'::text,
        'approved'::text
      ]
    )
  ),

  CONSTRAINT practice_moderation_events_comment_length_check CHECK (
    comment IS NULL OR char_length(comment) <= 3000
  ),

  CONSTRAINT practice_moderation_events_attempt_check CHECK (
    attempt IS NULL OR attempt >= 0
  )
);

CREATE INDEX IF NOT EXISTS practice_moderation_events_practice_idx
  ON public.practice_moderation_events (practice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_moderation_events_author_idx
  ON public.practice_moderation_events (author_id, created_at DESC);

COMMENT ON TABLE public.practice_moderation_events IS
  'Append-only history of author product moderation and related lifecycle actions.';

-- One-time migration markers (idempotent: only when no events exist for practice)
INSERT INTO public.practice_moderation_events (
  practice_id,
  author_id,
  action,
  from_status,
  to_status,
  from_moderation_status,
  to_moderation_status,
  comment,
  actor_user_id,
  actor_type,
  attempt,
  metadata
)
SELECT
  p.id,
  p.author_id,
  'migration_backfill',
  NULL,
  p.status,
  NULL,
  p.moderation_status,
  'System migration backfill of moderation_status for existing products. Not a real moderation attempt.',
  NULL,
  'system',
  0,
  jsonb_build_object(
    'source', '20260731180000_practice_moderation_mvp_schema',
    'kind', 'migration_backfill',
    'published_at', p.published_at
  )
FROM public.practices AS p
WHERE p.author_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.practice_moderation_events AS e
    WHERE e.practice_id = p.id
      AND e.action = 'migration_backfill'
  );

-- ===========================================================================
-- 6. RLS for practice_moderation_events
-- ===========================================================================

ALTER TABLE public.practice_moderation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.practice_moderation_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.practice_moderation_events TO authenticated;
GRANT ALL ON TABLE public.practice_moderation_events TO service_role;

DROP POLICY IF EXISTS practice_moderation_events_select_member_or_staff
  ON public.practice_moderation_events;

CREATE POLICY practice_moderation_events_select_member_or_staff
  ON public.practice_moderation_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_permission(auth.uid(), 'author_products.moderate')
    OR EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = practice_moderation_events.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

-- Writes go through SECURITY DEFINER RPCs / service_role in the companion migration.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.practice_moderation_events FROM authenticated;

-- ===========================================================================
-- 7. Soft-delete visibility on existing public / entitlement SELECT policies
-- ===========================================================================

DROP POLICY IF EXISTS "Public can read published practices" ON public.practices;
CREATE POLICY "Public can read published practices"
  ON public.practices
  FOR SELECT
  TO public
  USING (
    status = 'published'
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "Entitled users can read entitled practices" ON public.practices;
CREATE POLICY "Entitled users can read entitled practices"
  ON public.practices
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_practices AS up
      WHERE up.practice_id = practices.id
        AND up.user_id = auth.uid()
        AND (up.expires_at IS NULL OR up.expires_at > now())
    )
  );

-- Author member SELECT remains unchanged (may still see soft-deleted rows for
-- service recovery). Application lists must filter deleted_at IS NULL.

-- ===========================================================================
-- 8. Retire archive paths that would violate practices_status_check
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.archive_audio_product(
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'archive_retired'
    USING ERRCODE = 'P0001',
      DETAIL = 'Status archived is retired. Use unpublish_audio_product instead.';
END;
$$;

COMMENT ON FUNCTION public.archive_audio_product(uuid) IS
  'audiolad:archive-audio-product:v2-retired; archived status removed — use unpublish_audio_product';

CREATE OR REPLACE FUNCTION public.restore_archived_audio_product(
  p_practice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'archive_retired'
    USING ERRCODE = 'P0001',
      DETAIL = 'Status archived is retired. Products were migrated to unpublished.';
END;
$$;

COMMENT ON FUNCTION public.restore_archived_audio_product(uuid) IS
  'audiolad:restore-archived-audio-product:v2-retired; archived status removed';

-- Sale-lock guard: drop archived from allowed demotion set (current prod
-- guard_practices_content_sale_lock also allowed 'archived'; this migration
-- retires that status entirely, matching the CHECK constraint above).
CREATE OR REPLACE FUNCTION public.guard_practices_content_sale_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.practice_is_content_locked_after_sale(OLD.id) THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.practice_is_content_locked_after_sale(NEW.id) THEN
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status IS DISTINCT FROM 'published'
         AND NEW.status IS DISTINCT FROM 'unpublished' THEN
        RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 9. Permission: author_products.moderate (owner + admin only)
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.platform_permissions') IS NULL THEN
    RAISE NOTICE 'platform_permissions missing — skip author_products.moderate seed';
    RETURN;
  END IF;

  INSERT INTO public.platform_permissions (code, description)
  VALUES (
    'author_products.moderate',
    'Review author audio products in the moderation queue and approve/request changes'
  )
  ON CONFLICT (code) DO NOTHING;

  -- owner gets all permissions via SELECT * pattern used historically;
  -- still grant explicitly for clarity and for environments where owner
  -- bundle is not re-synced automatically.
  INSERT INTO public.platform_role_permissions (role_code, permission_code)
  VALUES
    ('owner', 'author_products.moderate'),
    ('admin', 'author_products.moderate')
  ON CONFLICT DO NOTHING;

  -- Guard: editor/support/etc must NOT receive this permission in this migration.
  IF EXISTS (
    SELECT 1
    FROM public.platform_role_permissions
    WHERE permission_code = 'author_products.moderate'
      AND role_code NOT IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'author_products.moderate must be owner/admin only';
  END IF;
END;
$$;

COMMIT;

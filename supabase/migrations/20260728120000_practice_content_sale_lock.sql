BEGIN;

-- ---------------------------------------------------------------------------
-- Sale-lock: protect purchased practice content from hard delete / destructive
-- media mutations. Idempotent where practical.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.practice_is_content_locked_after_sale(
  p_practice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_practice_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_practices AS up
        WHERE up.practice_id = p_practice_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.orders AS o
        WHERE o.practice_id = p_practice_id
          AND o.status = 'paid'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.practice_is_content_locked_after_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_is_content_locked_after_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.practice_is_content_locked_after_sale(uuid) TO service_role;

COMMENT ON FUNCTION public.practice_is_content_locked_after_sale(uuid) IS
  'audiolad:practice-sale-lock:v1; true when practice has entitlements or paid orders';

-- ---------------------------------------------------------------------------
-- user_practices.practice_id: CASCADE → RESTRICT
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT c.conname
  INTO v_constraint
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.user_practices'::regclass
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%practice_id%practices%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.user_practices DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    WHERE c.conrelid = 'public.user_practices'::regclass
      AND c.conname = 'user_practices_practice_id_fkey'
  ) THEN
    ALTER TABLE public.user_practices
      ADD CONSTRAINT user_practices_practice_id_fkey
      FOREIGN KEY (practice_id)
      REFERENCES public.practices (id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- practices: block hard delete + draft demotion when sale-locked
-- ---------------------------------------------------------------------------

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
         AND NEW.status IS DISTINCT FROM 'unpublished'
         AND NEW.status IS DISTINCT FROM 'archived' THEN
        RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practices_content_sale_lock_trigger ON public.practices;

CREATE TRIGGER guard_practices_content_sale_lock_trigger
  BEFORE UPDATE OR DELETE ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_practices_content_sale_lock();

-- ---------------------------------------------------------------------------
-- audio_items: block destructive mutations when parent practice is sale-locked
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_audio_items_content_sale_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
  v_locked boolean;
BEGIN
  v_practice_id := COALESCE(NEW.practice_id, OLD.practice_id);
  v_locked := public.practice_is_content_locked_after_sale(v_practice_id);

  IF NOT v_locked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  -- Allow first fill (NULL → path). Block clear/replace of an existing path.
  IF NEW.audio_path IS DISTINCT FROM OLD.audio_path THEN
    IF NOT (
      OLD.audio_path IS NULL
      AND NEW.audio_path IS NOT NULL
      AND btrim(NEW.audio_path) <> ''
    ) THEN
      RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF OLD.status = 'published'
     AND NEW.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'PRODUCT_CONTENT_LOCKED_AFTER_SALE'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_audio_items_content_sale_lock_trigger ON public.audio_items;

CREATE TRIGGER guard_audio_items_content_sale_lock_trigger
  BEFORE UPDATE OR DELETE ON public.audio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_audio_items_content_sale_lock();

-- ---------------------------------------------------------------------------
-- Storage: authors cannot delete/overwrite practice-audio for sale-locked products
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Author members can delete practice audio" ON storage.objects;
DROP POLICY IF EXISTS "Author members can update practice audio" ON storage.objects;

CREATE POLICY "Author members can delete practice audio"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'practice-audio'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.practices AS pr
      INNER JOIN public.author_members AS am
        ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND NOT public.practice_is_content_locked_after_sale(pr.id)
    )
  );

CREATE POLICY "Author members can update practice audio"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'practice-audio'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.practices AS pr
      INNER JOIN public.author_members AS am
        ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND NOT public.practice_is_content_locked_after_sale(pr.id)
    )
  )
  WITH CHECK (
    bucket_id = 'practice-audio'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.practices AS pr
      INNER JOIN public.author_members AS am
        ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
        AND NOT public.practice_is_content_locked_after_sale(pr.id)
    )
  );

COMMIT;

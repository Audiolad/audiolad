BEGIN;

-- Break the practices ↔ practice_visibility_users RLS recursion:
-- the selected_users practices policy reads the allowlist, so the allowlist
-- author-read policy must not perform an invoker SELECT of practices.
-- is_practice_author_member is SECURITY DEFINER with a fixed search_path.
DROP POLICY IF EXISTS "Author members can view practice visibility rows"
  ON public.practice_visibility_users;

CREATE POLICY "Author members can view practice visibility rows"
  ON public.practice_visibility_users
  FOR SELECT
  TO authenticated
  USING (
    public.is_practice_author_member(
      practice_id,
      auth.uid()
    )
  );

COMMIT;

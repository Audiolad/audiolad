# practice-covers: server-only writes for product and track covers

Migration: `supabase/migrations/20270117120000_practice_covers_server_only_cover_writes.sql`

## What changes

Bucket `practice-covers` (public read). Policies on `storage.objects`:

| Policy | Before | After |
| --- | --- | --- |
| `Public can read practice covers` (SELECT, anon + authenticated) | kept | kept, unchanged |
| `Author members can upload practice covers` (INSERT, authenticated, any `practices/{id}/…`) | present | **dropped** |
| `Author members can update practice covers` (UPDATE, authenticated) | present | **dropped** |
| `Author members can delete practice covers` (DELETE, authenticated) | present | **dropped** |
| `Author members can upload practice gallery images` (INSERT, authenticated, `practices/{id}/gallery/{slide}/…`, owner/editor) | – | **new** |
| `Author members can delete practice gallery images` (DELETE, authenticated, same prefix) | – | **new** |

Product covers (`practices/{id}/variants/…`, legacy `practices/{id}/cover.{ext}`) and
track covers (`practices/{id}/track-covers/{audioId}/…`, legacy
`practices/{id}/track-covers/{audioId}.{ext}`) can now be written only by
`service_role`. The author routes do this after the access check and after the
cover profile check (1:1):

- `POST/DELETE /api/author/products/[id]/cover`
- `POST/DELETE /api/author/products/[id]/audio/[audioId]/cover`
- audio item removal (`DELETE /api/author/products/[id]/audio/[audioId]`,
  course builder cleanup) – legacy track cover files only.

The routes use `createPracticeCoverStorageClient()` from
`src/lib/author-products/cover-storage.ts`. Manifest cleanup with that client is
limited to the cover prefix of the authorised practice / audio item
(`cleanupCoverManifestWithinPrefix`), because manifests are stored in rows the
author can edit.

Gallery uploads keep using the user-scoped client (no upsert, so no UPDATE
policy is needed). No browser code writes to `practice-covers` directly; other
author uploads (audio, music masters, avatars, banners, contact icons, quick
offers, playlists, video export, evidence files) use other buckets and are not
affected.

## Deploy note

Production deploy applies pending migrations automatically
(see `docs/database-migration-safety.md`). Merging this change and deploying it
applies the policy change – this needs a separate approval.

Deploy order: the app code and the migration ship together. The new code works
with both the old and the new policies (service_role bypasses RLS). The
standard deploy (`deploy.sh`) applies pending migrations first and only then
switches traffic to the new app code. So for a short window between the
migration and the switch-over the old code is still live and its cover routes
(user-scoped client) cannot upload product/track covers. The window ends when
the new release is live; no extra step is needed.

## Verification after deploy (read-only)

```sql
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (policyname ILIKE '%practice covers%' OR policyname ILIKE '%practice gallery%')
ORDER BY policyname;
```

Expected: `Public can read practice covers` (SELECT) and the two gallery
policies (INSERT, DELETE). Then upload a product cover and a track cover in the
author dashboard and check that a non-square image is rejected.

## Rollback

Rollback restores the previous (broader) author write access, so use it only
if cover uploads break and the app cannot be fixed forward quickly. Apply in a
single transaction:

```sql
BEGIN;

DROP POLICY IF EXISTS "Author members can upload practice gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Author members can delete practice gallery images" ON storage.objects;

CREATE POLICY "Author members can upload practice covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'practice-covers'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.practices AS pr
      INNER JOIN public.author_members AS am ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Author members can update practice covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'practice-covers'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.practices AS pr
      INNER JOIN public.author_members AS am ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    bucket_id = 'practice-covers'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.practices AS pr
      INNER JOIN public.author_members AS am ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Author members can delete practice covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'practice-covers'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.practices AS pr
      INNER JOIN public.author_members AS am ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

COMMIT;
```

The app code does not need to be reverted for a policy rollback: the routes
keep working with service_role either way. The migration row in
`supabase_migrations.schema_migrations` stays; a later fix should be a new
migration.

## Tests

- `node scripts/practice-covers-storage-policy-sql-unit.mjs` – static checks and
  SQL smoke on a throwaway database (localhost scratch DB in CI, disposable
  initdb cluster locally): checks the old state, applies the migration twice,
  then checks editor / viewer / other author / anon / service_role access.
- `npx tsx scripts/practice-cover-storage-unit.mts` – prefix filter and
  route wiring.
- Both run in `npm run test:product-cover-square`.

# Studio Render Export v2

The Studio editor saves a revision, waits for `flushAndWait()`, and then queues
a private MP3 render. `GET /api/studio/projects/:id/render` is polled every five
seconds; only an author-workspace member can preview or download the completed
file. Render outputs are private `studio-renders` objects and never publish a
practice or audio item.

## Activation plan

1. Review and apply `20260812180000_studio_render_export_v2.sql` in the intended
   non-production/production change process. This task does not apply it.
2. Verify `ffmpeg`, `tsx`, `NEXT_PUBLIC_SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` in the worker environment.
3. Run `npm run run:studio-render-worker` once against a controlled queued job.
4. After observing a successful download, explicitly start the prepared but
   inactive `deploy/studio-render-worker.ecosystem.config.cjs` PM2 process.
5. Monitor failed jobs and expired leases; do not enable multiple workers
   without revisiting queue throughput and lease policy.

## Shared Studio audio sources and project duplication

Migration `supabase/migrations/20260912120000_studio_shared_asset_sources_and_duplicate_project.sql`
adds immutable physical source rows (`studio_asset_sources`) and makes existing
`studio_project_assets` rows project references. It backfills every existing
asset reference to a source with the same ID and storage path; it does not move,
rewrite, or delete existing Storage objects. A copied project receives new
project/reference IDs while its references point at the original immutable
source. Replacing audio creates a new source before updating the reference
(copy-on-write).

### Production runbook (do not run automatically)

1. Deploy this application revision to `/var/www/audiolad-clean`, but do not
   restart the production process yet.
2. Review and apply exactly
   `20260912120000_studio_shared_asset_sources_and_duplicate_project.sql` using
   the established production migration procedure.
3. Verify schema and backfill:

   ```sql
   SELECT count(*) AS missing_source_references
   FROM public.studio_project_assets WHERE source_id IS NULL;

   SELECT count(*) AS missing_sources
   FROM public.studio_project_assets AS ref
   LEFT JOIN public.studio_asset_sources AS source ON source.id = ref.source_id
   WHERE source.id IS NULL;

   SELECT source_id, count(*) AS active_references
   FROM public.studio_project_assets
   WHERE deleted_at IS NULL
   GROUP BY source_id;
   ```

   Both first two queries must return `0`. Investigate any active reference
   whose source has `deleted_at IS NOT NULL` before application deploy.
4. Run the Studio persistence, duplicate, asset lifecycle, guest-limit,
   security, and render snapshot checks against the non-production test target.
5. Deploy/restart the application only with separate production approval, then
   test A → duplicate B → delete A, replace B audio, and render B.

The migration is additive for data: application rollback can leave
`studio_asset_sources` and `source_id` in place. Do not attempt a destructive
database rollback; the previous application continues to read the retained
`studio_project_assets.storage_path` values.

### Disposable shared-assets verification VM

Use the official Supabase Docker stack pinned to `self-hosted/v0.8.0`. Its
gateway service is `api-gw` and the actual host-port variable is
`API_GW_HTTP_PORT` (not `API_PORT`). Bind it locally:

```bash
API_GW_HTTP_PORT=127.0.0.1:54321
SUPABASE_PUBLIC_URL=http://127.0.0.1:54321
API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1
```

Generate the stack's disposable keys with its verified
`utils/generate-keys.sh` and `utils/add-new-auth-keys.sh`; store them only in
the VM's ignored stack `.env`. After the application baseline immediately
before the shared-assets migration is installed, run:

```bash
export AUDIOLAD_TEST_DATABASE=1
export AUDIOLAD_STUDIO_PERSISTENCE_ISOLATED=1
export AUDIOLAD_STUDIO_TEST_STACK_DIR=/absolute/path/to/disposable/stack
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<disposable-publishable-key>
export SUPABASE_SERVICE_ROLE_KEY=<disposable-service-role-key>
npm run test:studio-shared-assets:isolated
```

The harness refuses a non-local URL, missing safety flags, production-like
stack paths, a missing pre-migration schema, or a missing migration file. It
creates synthetic legacy author/project/assets, uploads isolated bucket
objects, applies the checkout migration through the disposable Docker stack,
checks source backfill/reference integrity, duplicates through the application
API, verifies shared Storage survives original deletion, and checks autosave.
Reset the disposable stack (`docker compose down -v`) before a repeated
pre-migration/backfill run.

# Studio Render Export v2

The Studio editor saves a revision, waits for `flushAndWait()`, and then queues
a private MP3 render. `GET /api/studio/projects/:id/render` is polled every five
seconds; only an author-workspace member can preview or download the completed
file. Render outputs are private `studio-renders` objects and never publish a
practice or audio item.

## Activation plan

1. Review and apply `20260812180000_studio_render_export_v2.sql` in the intended
   non-production/production change process. This task does not apply it.
2. Review and apply `20260923120000_studio_render_job_lease_heartbeat.sql`
   **before** starting the long-lived worker (adds `lease_token`,
   `renew_studio_render_job_lease`, and `release_studio_render_job`).
3. Verify `ffmpeg` and `tsx`. A clean
   `pm2 start deploy/studio-render-worker.ecosystem.config.cjs` loads
   authoritative `.env.production` from the release cwd via Next.js
   `@next/env` (deploy already links `shared/.env.production`). Confirm
   conceptually that `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are present. Never print their values.
4. Confirm with `pm2 describe audiolad-studio-render-worker` that the running
   process is the long-lived consumer (`autorestart: true`, **no**
   `cron_restart`). Do not run the former one-shot cron worker alongside it.
5. After observing a successful download, start or restart
   `deploy/studio-render-worker.ecosystem.config.cjs` only with explicit
   production approval. This document does not start or restart PM2.
6. Monitor failed jobs and expired leases; do not enable multiple workers
   without revisiting queue throughput and lease policy.

## Production env bootstrap

The worker process is long-lived (`autorestart: true`, **no** `cron_restart`).
PM2 ecosystem `env` only sets `NODE_ENV=production`. Secrets are not stored in
the ecosystem file and must not be taken from a once-saved shell / `pm2 save`.

On ordinary start/restart the worker calls Next.js `loadEnvConfig` against
`cwd` (`/var/www/audiolad-deploy/current`). Deploy already creates:

```text
current/.env.production -> shared/.env.production
current/.env.local      -> shared/.env.production
```

That is the same production env bootstrap `next start` uses. After a reboot or
a fresh `pm2 start deploy/studio-render-worker.ecosystem.config.cjs` the
process therefore has `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` without an inherited dump. Worker logs report
boolean presence only (`studio_render_env_ready`) and redact secret values on
errors.

## Worker lifecycle (long-form)

The worker is a single long-lived queue consumer: it recovers stale leases,
claims at most one job, renders it, then keeps polling. Idle interval is 5s
(`STUDIO_RENDER_IDLE_INTERVAL_MS`). It does not busy-loop and does not exit
after a completed job.

Release self-refresh: on boot the process captures the resolved realpath of
its cwd plus `.deploy-commit` when present, and logs
`studio_render_worker_boot`. Before claiming a new job — and again immediately
after claim, before `executeJob` — it compares that boot identity with
`realpath(/var/www/audiolad-deploy/current)` and that path's `.deploy-commit`.
A PM2 `pm_cwd` string of `/current` is not treated as proof of the loaded
release. CURRENT → claim/execute normally. STALE → do not claim (or
`releaseJob` if already claimed); log `studio_render_release_mismatch`; exit 0
so PM2 `autorestart: true` respawns against the new release. UNKNOWN (cannot
read current identity) → do not claim; log
`studio_render_release_guard_unavailable`; idle-retry without exiting. If
`/current` changes while a claimed job is already executing, the worker does
not abort FFmpeg and does not call `requestShutdown()`; it finishes
complete/fail, then the next loop iteration sees STALE and clean-exits.
Production deploy updates web + the `/current` symlink and does not restart
this PM2 app. `OPS_STUDIO_WORKER_RECOVER` remains break-glass.

Lease: **1800s** on claim, renewed every **5 minutes** by
`renew_studio_render_job_lease` only while this process still owns
`lease_token`. Authoritative `false` is immediate ownership loss. A transient
RPC/network error is logged and retried after **15s** (`STUDIO_RENDER_HEARTBEAT_RETRY_MS`);
the job is abandoned only after confirmed loss or when the lease can no longer
be considered safely held (1800s minus a 60s safety margin). Do not replace
the heartbeat with a one-shot 5400s lease. Complete/fail updates also require
the current token; a worker that lost the lease must not mark the job
completed or overwrite the output object.

Graceful shutdown (SIGTERM/SIGINT): stop claiming; wait up to **90s**
(`STUDIO_RENDER_SHUTDOWN_DRAIN_MS`) for the in-flight FFmpeg job. After the
drain window the worker aborts the render signal (SIGTERM, then SIGKILL after
2s if needed), **awaits the child `close`**, cleans the workspace, and only
then calls `release_studio_render_job` (attempt_count decremented). Confirmed
lease loss uses the same abort path. A release-identity mismatch must not
arm this AbortController. A transient heartbeat error does not cancel
FFmpeg. PM2 `kill_timeout` is **120s**. Ordinary `/current` cutover no longer
sends SIGTERM to this worker; an in-flight render finishes on the boot
release, then the process clean-exits before the next claim. Waiting hours
for a hard drain is still unsafe if an operator sends SIGTERM (break-glass
recover, reboot, or manual stop).

## Shared Studio audio sources and project duplication

Migration `supabase/migrations/20260912120000_studio_shared_asset_sources_and_duplicate_project.sql`
adds immutable physical source rows (`studio_asset_sources`) and makes existing
`studio_project_assets` rows project references. It backfills every existing
asset reference to a source with the same ID and storage path; it does not move,
rewrite, or delete existing Storage objects. A copied project receives new
project/reference IDs while its references point at the original immutable
source. Replacing audio creates a new source before updating the reference
(copy-on-write). Additive migration
`20261002120000_studio_duplicate_project_upload_state_ready.sql` sets
`upload_state = 'ready'` on newly duplicated shared refs so
`listStudioAssets` can hydrate them. It also systemically marks live
shared reserved refs ready when the source is live and, if
`storage.objects` exists, the physical object is present. It does not
copy Storage objects and never updates `source_id = id` uploads.

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

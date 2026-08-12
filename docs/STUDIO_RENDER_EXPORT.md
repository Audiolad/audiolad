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
   inactive `deploy/studio-render-worker.ecosystem.cjs` PM2 process.
5. Monitor failed jobs and expired leases; do not enable multiple workers
   without revisiting queue throughput and lease policy.

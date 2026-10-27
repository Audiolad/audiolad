# AudioLad Business: individual track listening

Task: `96a75b7b-eeda-4f28-baec-13f23da2237e`.
UI: `/admin/business-track-review` (also linked from the admin menu).
Prepared in the working tree only. No commit, push, release, shared DB migration,
production connection, issue changes or author notifications.

## Implementation

- One row per published/listed music track, artist, album, duration, one status,
  optional internal reason, reviewer UUID/time, paginated history.
- Three mutually exclusive states: «Не проверен», «Допущен», «Не допущен».
  Missing rows mean unchecked. Admin session and DB permission checks require
  `admin_panel.access` + `author_products.moderate`; client table writes are revoked.
- Server-side filters/status counters and pagination (100 rows); next unchecked
  within the page, automatic selection after save, and a filtered unchecked mode
  with pagination to continue across the whole queue. Decisions persist in DB.
- One in-page audio element switches sources, supports seeking and stops after
  15/30 seconds from playback/seek position. It uses the existing verified stream /
  legacy signed-source resolver, metadata preload, and no download action.
- Atomic audited decisions, locked against concurrent replacement, stale audio
  version rejection. Changing source path/master/delivery pointer resets all
  decisions to unchecked, clears the current reason and appends a system event.
  Analyzer writes do not reset decisions.
- Business rights resolver preserves the existing legal and contract checks and
  adds a restricting sound/space gate. Workspace checks current manual admission
  outside its legal-decision cache. Workspace/SPA check the actual source again
  before signing. New/restored programme rows require sound/space admission;
  existing programme rows remain and are withheld by delivery checks.
- Guest coffee and onboarding demonstration sources also pass the fresh sound
  gate. Their existing free/preview access rules remain; these demos do not grant
  commercial-use rights. Public AudioLad catalogue/signing APIs are unchanged.

## Admission matrix integration

The album/artist matrix from task 28d2b5bb does not exist in this checkout.
`business_space_admissions(space_id,audio_item_id)` is the available final whitelist.
`business_sound_admitted_albums` is the private adapter: any whitelist entry from
an album admits the album's music tracks to the review queue. The exact track
must still have a whitelist entry for the playback space. Approving a sibling
does not invent an admission. Curated workspace author fallbacks cannot bypass
this requirement. When the matrix arrives, update this adapter and
`business_sound_track_allowed` together; no sound-review schema change is needed.

Current legal resolver calls have a location, but no explicit direction argument.
The overlay maps existing location categories to cafe/spa/retail/fitness; unknown
categories fail closed. Workspace additionally checks its explicitly selected
space; programme insertion checks `business_programs.kind`.

## Migration and identity contract

`supabase/migrations/20270201120000_business_track_sound_reviews.sql`:
new decision/history tables, private adapter view, admin RPCs, restrictive Business
resolver overlay, source replacement trigger and programme insertion guard.
No deletion/backfill or catalogue record/visibility changes. Reapplication is tested.
No existing rights implementation is discarded: it remains under
`resolve_business_track_eligibility_before_sound`, callable only by the owning
resolver. Apply only through the separately authorized deployment procedure.

Identity = source path + desired master asset UUID + active delivery asset UUID.
Existing immutable asset/path conventions must be preserved. Overwriting bytes
in place under an identical legacy path is not detected. A new delivery pointer
conservatively requires review even for a transcode of the same master.
Already issued signed URLs/offline cache bytes cannot be recalled by a status
change; new manifests and signing requests withhold rejected/unchecked sources.

## Validation

- `npm run test:business-track-sound-review`: unit and real mounted React tests,
  plus fresh local PostgreSQL migration/smoke tests. No external DB connection.
- SQL: migration applied twice; status constraint, RPC authorization, ACL/RLS policy
  definitions, filtered queue/defaults, legal UNKNOWN preserved, approved/rejected
  playback, space mismatch, missing sibling admission, programme insertion guard,
  audit, stale-save prevention, path/master/delivery replacement, analyzer survival,
  unchanged public catalogue rows, internal reason isolation.
- Sandbox prohibits Unix sockets. The SQL runner falls back to single-user mode,
  which bypasses row visibility enforcement. RLS policy/ACL assertions execute
  here; actual non-admin row invisibility assertions run automatically in its
  private-socket mode outside this restriction. Full RLS visibility is still a
  staging acceptance check.
- Mounted React: one status select per row, no status checkboxes, stream switching,
  seek-aware fragment stop, save payload, internal history. This uses the existing
  test DOM and local action doubles; it is not a live browser/DB acceptance run.
- Existing workspace, guest-coffee, SPA composition/manifest, rights and RBAC suites
  are run locally, using `node --import tsx` where the CLI's IPC socket is forbidden.
  Existing SQL suites use `AUDIOLAD_SKIP_ISOLATED_SQL=1` and never discover a shared DB.
- `npm run lint`: PASS, 0 errors / 111 pre-existing warnings; focused lint of changed
  TypeScript files: PASS without warnings.
- `npm run typecheck` with `NODE_OPTIONS=--max-old-space-size=3072`: PASS. The initial
  default heap was insufficient; no type errors remain.
- `platform-rbac-unit`, `admin-music-tracks-registry-unit`, `business-spa-admin-unit`,
  workspace trial, guest coffee, SPA manifest client/composition/manifest contracts,
  rights eligibility contracts and migration-version uniqueness: PASS. The RBAC
  suite's stale assertion was updated to the existing direction-aware helper;
  playlist production code was not changed.
- `npm run build` (Turbopack): did not finish the compile stage in this sandbox;
  stopped before trying `npm run build -- --webpack`. Webpack failed while parsing
  the empty output of its TypeScript `--showConfig` child. A direct `tsc --showConfig`
  produces valid JSON; reproducing the nested child invocation reports `EPERM`
  and loses stdout in this sandbox. Build completion is still required outside
  this restriction. Build commands used dummy localhost Supabase configuration.
- The migration-plan suite was stopped when its nested subprocess did not
  complete here. Migration version validation and the new SQL migration itself
  were verified separately. No external database was used.
- Live browser verification: unavailable (Playwright browser executable missing).
  No browser installation or dependency/lockfile change was performed.

## Changed files

- `package.json` (new test command; dependencies and lockfile unchanged).
- `src/app/(platform)/admin/business-track-review/{page.tsx,ReviewQueue.tsx,actions.ts}`.
- `src/lib/business/track-sound-review{.ts,.server.ts}`.
- `src/lib/admin/nav.ts`.
- `src/lib/business-workspace/{load.server.ts,sign.server.ts}`.
- `src/lib/business-app/{spa-pilot.ts,onboarding-preview.server.ts}`.
- `src/lib/business-app/guest-coffee/load.server.ts`.
- Migration above and `supabase/tests/business_track_sound_reviews_smoke.sql`.
- `scripts/business-track-sound-review-{unit.mts,mounted-unit.mts,isolated.py}`.
- `scripts/platform-rbac-unit.mjs` (new admin-route assertions; corrected a stale
  playlist-create assertion to follow the existing direction-aware helper).
- `docs/{DATABASE.md,ARCHITECTURE.md}` and this report.

Review diff with `git diff` for tracked files and `git diff --no-index /dev/null
<new-file>` for each new file. All task changes remain uncommitted.

## Acceptance continuation

Use a disposable staging database with the real prerequisite migrations, run the
SQL suite in private-socket mode, then check `/admin/business-track-review` with
an admin account and a non-admin account. Listen, seek, approve/reject, reload,
replace a file, rerun analysis and verify Business versus public playback.
Before any release, confirm real album/artist matrix availability, whitelist
coverage and location-category mapping. Initially every track is unchecked, so
Business output is intentionally empty until manual approval and space admission.

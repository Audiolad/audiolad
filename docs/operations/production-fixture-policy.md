# Production fixture policy — АудиоЛад

Operational rules for test/fixture data. Applies to all scripts that INSERT/UPDATE/DELETE
authors, practices, promotion campaigns, analytics events, or auth users.

## Hard rules

1. **Fixtures in production are forbidden without exception.**
2. **`ALLOW_PRODUCTION_TEST_FIXTURES=true` does not bypass writes.** It is deprecated and ignored for INSERT paths.
3. **Production is detected by multiple independent signals** (any match → hard fail before first write):
   - `/var/www/audiolad-deploy/current` or `PRODUCTION_SERVER` marker
   - Supabase URL/host `127.0.0.1:8000`, `audiolad.ru`, `*.audiolad.ru`
   - `docker exec supabase-db` (production postgres container on audiolad.ru)
   - Production connection string substrings (denylist in `scripts/lib/fixture-context.mjs`)
   - `AUDIOLAD_ENV=production`
4. **Ambiguous targets hard fail.** If the script cannot prove a safe non-production DB, it exits non-zero.

## Allowed environments

Data-creating scripts may run only when **all** are true:

```bash
export AUDIOLAD_TEST_DATABASE=1
# target must be allowlisted, e.g.:
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# optional for docker-based integration tests on staging VM:
export AUDIOLAD_TEST_DOCKER_CONTAINER=supabase-db-staging
```

Allowlisted Supabase hosts:

- `127.0.0.1:54321`
- `localhost:54321`

Allowlisted docker containers (explicit env required):

- `supabase-db-staging`
- `supabase-test-db`
- `audiolad-test-db`

**Not allowlisted:** `supabase-db` on production server, `127.0.0.1:8000`, `audiolad.ru`.

## Fixture visibility defaults

New test practices must be created as:

```text
status = draft
is_catalog_listed = false
published_at = null
guest_access_enabled = false
```

Publishing/catalog listing requires **additionally**:

```bash
export AUDIOLAD_FIXTURE_PUBLISH=1
```

…and still only on allowlisted staging/local targets. Production + publish flag → hard fail.

## Machine-readable markers (defence in depth)

Fixtures should set jsonb marker (existing columns, no migration required):

```json
{
  "_audiolad_fixture": {
    "test_fixture": true,
    "namespace": "script-name",
    "run_id": "8-char-id"
  }
}
```

Stored in:

- `practices.cover_image`
- `authors.avatar_image` (when needed)
- `analytics_events.payload`

Public queries (catalog, home, search, sitemap, author lists) exclude marker-bearing rows.

Test user emails use domain `@staging.audiolad.local` (convention, not sole guard).

## Cleanup requirements

Every data-creating script must:

1. Register UUIDs in `FixtureRegistry` immediately after INSERT.
2. Run cleanup in `finally` (via `runWithCleanup` or equivalent).
3. Handle `SIGINT` / `SIGTERM` (cleanup then non-zero exit).
4. Delete by UUID only — never by title/slug/LIKE.
5. Verify zero remaining registered IDs; exit non-zero if cleanup incomplete.
6. Log created/deleted IDs (no secrets).

**SIGKILL** cannot be handled — avoid `kill -9` on running fixture scripts.

## If fixtures leak to production

1. **Stop** the script/process.
2. **Do not** run broad DELETE by name pattern.
3. Collect UUID allowlist from script logs/registry.
4. Audit purchases/user data on affected IDs.
5. Backup allowlist rows, controlled DELETE by UUID (see cleanup runbook from 2026-07-20 incident).
6. Fix guard/cleanup before re-running tests.

## Implementation modules

| Module | Purpose |
|--------|---------|
| `scripts/lib/fixture-context.mjs` | Production/staging detection, `assertFixtureWritesAllowed()` |
| `scripts/lib/fixture-registry.mjs` | UUID registry, FK-ordered cleanup |
| `scripts/lib/fixture-marker.mjs` | Marker builders for scripts |
| `src/lib/fixtures/test-fixture-marker.ts` | Public query exclusion helpers |
| `scripts/lib/guard-production-fixtures.mjs` | Backward-compatible re-exports |

## Regression tests

```bash
node scripts/production-fixtures-guard-unit.mjs
node scripts/fixture-registry-unit.mjs
npx tsx scripts/test-fixture-marker-unit.mjs
```

Integration tests (`author-promotion-practice-change-integration.mjs`) skip when `AUDIOLAD_TEST_DATABASE` is unset; they hard-fail on production markers.

## Optional future migration

A dedicated `internal_metadata jsonb` on `practices` / `authors` would simplify marker queries and PostgREST filters. **Not applied to production** until explicitly approved. Current marker uses existing jsonb columns.

## Known limitation

The current no-migration implementation stores the machine-readable
`_audiolad_fixture` marker in existing jsonb image-manifest columns
(`practices.cover_image` and `authors.avatar_image`).

This is intentionally temporary to avoid an emergency production schema
migration during fixture-guard hardening.

Safety requirements:

- marker-only values must resolve to no image URL;
- they must never render as `[object Object]`;
- upload/crop/fallback logic must tolerate marker-only values;
- public routes must treat marked records as non-public.

Planned improvement: introduce a dedicated `internal_metadata jsonb` field after staging review and a separately approved production migration.

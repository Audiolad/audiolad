# Database migration safety

Automatic rollback concerns **the application only**.

The production database is **never rolled back automatically**.

## Production is self-hosted Supabase (Timeweb VPS)

Audiolad production is **self-hosted Supabase on a Timeweb VPS**, not Supabase Cloud.

- App URL: `https://audiolad.ru`
- Postgres container (default): `supabase-db` (override `AUDIOLAD_SUPABASE_DB_CONTAINER`)
- Pooler container: `supabase-pooler`
- Listeners: `127.0.0.1:5432` / `127.0.0.1:6543`
- Config lives at `/opt/supabase/docker` (do not edit production config from app deploys)
- Deploy target: `docker exec <container> psql -U postgres -d postgres`
- No Cloud dashboard. Do not pass a superuser URL to Next.js.
- `SUPABASE_DB_URL` is **not** required in application `.env.production`.

## Official apply mechanism (ordinary deploy)

After a successful **one-time baseline** (history already has rows), `deploy.sh` applies
pending `supabase/migrations/` files from the **candidate release directory** via
docker-exec. Not PostgREST, not `supabase db push`, not Cloud.

1. Preflight: docker available, container exists, status `running`, `select 1` works.
   Fail closed: `database_migration_target_unavailable`.
2. List local versions from `RELEASE_DIR/supabase/migrations` (**1 file = 1 version**).
3. List remote versions from `supabase_migrations.schema_migrations` via `docker exec psql`.
4. `pending = local - remote`. Holes (pending older than max remote) abort:
   `database_migration_history_drift`.
5. Apply each pending file exactly once:
   `docker exec -i <container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < file.sql`
   then `INSERT` the official history row (`ON CONFLICT DO NOTHING`).
6. Verify `pending=0`.
7. Then candidate start / Nginx cutover.

If `schema_migrations` schema/table is missing **or empty**, ordinary deploy aborts:
`database_migration_history_uninitialized`. That is the current production state
until the one-time baseline has been applied.

The stage runs from the candidate release directory (the target SHA extracted by
`git archive`), never from `/current`, never from a dirty `GIT_WORKDIR` tree.
It does not take an extra flock. Secrets in docker/psql output are redacted.

## One-time baseline (not hooked into deploy.sh)

Use the read-only audit, then the explicit baseline. Do **not** run `--apply`
until a backup exists. Do **not** execute historical SQL. Do **not** UPDATE Olga.

```bash
# Read-only audit (default: inject fixture / probe builder).
# On the VPS, set AUDIOLAD_MIGRATION_AUDIT_EXEC=1 to run SELECT probes.
bash deploy/scripts/audit-production-migrations.sh \
  --migrations-dir supabase/migrations \
  --out /tmp/audiolad-migration-audit.json

# Dry-run (default): zero mutations. Prints backup recommendation, DB identity,
# public-table fingerprint, and versions that WOULD be registered.
bash deploy/scripts/baseline-schema-migrations.sh \
  --dry-run \
  --from /tmp/audiolad-migration-audit.json

# Apply only after a real backup. Do not run this from a laptop checkout.
# bash deploy/scripts/baseline-schema-migrations.sh \
#   --apply --i-have-backup \
#   --from /tmp/audiolad-migration-audit.json
```

Recommended backup (print-only from the script; run it yourself on the VPS):

```bash
docker exec supabase-db pg_dump -U postgres -d postgres -Fc -f /tmp/audiolad-pre-baseline.dump
# or checkpoint the Docker volume used by /opt/supabase/docker
```

Baseline registers **PROVEN_APPLIED** versions only. It refuses
`REQUIRES_MANUAL_REVIEW`. It does not register `PROVEN_NOT_APPLIED`.
It creates the official table if missing:

```sql
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
```

`version` stays the primary key so a later `supabase migration list` remains compatible.

## Duplicate history

Several files originally shared a timestamp prefix. They were renamed so that
**1 file = 1 version**. See `deploy/migration-baseline/DUPLICATE_VERSION_MAPPING.md`.
`scripts/duplicate-migration-versions-unit.mjs` fails if any timestamp is reused.

## How to inspect history on the VPS

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"
```

Pending = local filename versions that are not remote rows. Deploy applies only
the suffix when it is strictly newer than `max(REMOTE)`.

## Normal deploy flow

If the migration stage fails, the candidate is never started.
`current` and Nginx stay on the old release.

Logs:

- database_migration_preflight_started
- database_migrations_pending=N (count only)
- database_migration_apply_started / database_migration_apply_succeeded
- database_migrations_pending_after=0
- or database_migration_failed plus a fail-closed code
  (`database_migration_target_unavailable`,
   `database_migration_history_uninitialized`,
   `database_migration_history_drift`)

## Drift

If any pending local version is older than max(remote), deploy aborts with
`database_migration_history_drift`. It does not repair history.

Do not repair blindly. Compare release migration files with
`supabase_migrations.schema_migrations`, then decide.

Empty or missing remote history is uninitialized and is also fail-closed.

## Schema change rules

1. Never edit the production schema outside migration files except a documented emergency.
2. Migrations must stay backward compatible with the old app (expand / contract).
3. Add new columns/tables first. Drop old columns only in a later release.
4. Destructive SQL needs a separate confirmation.
5. Take a backup before substantial migrations and before the one-time baseline.

Expand / contract:

1. Add a new nullable column.
2. Deploy code that reads and writes the new column.
3. Backfill.
4. Tighten nullability later.
5. Drop the old column in a still later release.

## App rollback after an applied migration

If docker-exec apply succeeded and a later deploy step fails, rollback restores the
old app against the new schema.

- Safe only when the migration was expand-only / backward compatible.
- There is no automatic database rollback.
- Do not run down-migrations in production.
- If the old app cannot run on the new schema, ship a forward-fix migration.

## What this change does not do

- Does not production-deploy.
- Does not apply migrations to production from this checkout.
- Does not `docker exec` against a real `supabase-db`.
- Does not run `baseline --apply`.
- Does not change Olga data. The Olga entitlement file is applied only when a
  future production deploy runs this stage against a remote history that already
  contains every older version, or when the live audit proves it is already applied
  and the baseline registers that version.

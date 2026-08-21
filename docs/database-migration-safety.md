# Database migration safety

Automatic rollback concerns **the application only**.

The production database is **never rolled back automatically**.

## Official apply mechanism (production deploy)

Audiolad applies `supabase/migrations/` during production deploy with the official
pinned Supabase CLI. Not PostgREST, not `psql`, not ad-hoc SQL.

- CLI pin: `supabase@2.115.0` via `npx --yes --package=supabase@2.115.0 supabase`
  (or `$RELEASE_DIR/node_modules/.bin/supabase` when that exact 2.115.0 binary exists).
- Never use `@latest`. Do not add `supabase` to `package.json`.
- Commands:
  - `supabase migration list --db-url "$SUPABASE_DB_URL"`
  - `supabase db push --db-url "$SUPABASE_DB_URL" --yes`
- History table: `supabase_migrations.schema_migrations`.
- The first `db push` against empty history would create that table and try to
  apply every local file. That is forbidden on live Audiolad. Deploy fails
  closed with `database_migration_history_uninitialized` and does not apply.

The stage runs from the candidate release directory (the target SHA extracted by
`git archive`), never from `/current`, never from a dirty `GIT_WORKDIR` tree.

## Secret

The only extra production secret is `SUPABASE_DB_URL` (percent-encoded Postgres
URL). Store it in:

`/var/www/audiolad-deploy/shared/.env.production`

- Never commit it.
- Never log it. Deploy redacts CLI stdout/stderr.
- Service-role (`SUPABASE_SERVICE_ROLE_KEY`) is not enough and must not be used
  to execute SQL via PostgREST.

## How to check `migration list`

On the deploy host, after the secret is present (do not print the URL):

```bash
npx --yes --package=supabase@2.115.0 supabase migration list --db-url "$SUPABASE_DB_URL"
```

The table columns are LOCAL | REMOTE | TIME (UTC):

- LOCAL = files in `supabase/migrations/`
- REMOTE = rows in `supabase_migrations.schema_migrations`

Pending = LOCAL versions that are not REMOTE. Deploy applies only that suffix
when it is strictly newer than `max(REMOTE)`.

## Normal deploy flow
If the migration stage fails, the candidate is never started.
current and Nginx stay on the old release.

Logs:

- database_migration_preflight_started
- database_migrations_pending=N (count only)
- database_migration_apply_started / database_migration_apply_succeeded
- database_migrations_pending_after=0
- or database_migration_failed plus a fail-closed code

## Drift

If any pending local version is older than max(remote), deploy aborts with
database_migration_history_drift. It does not repair history.

Do not repair blindly. Compare release migration files with
supabase_migrations.schema_migrations and supabase migration list, then decide.

Empty remote plus nonempty local is uninitialized history and is also fail-closed.

## Schema change rules

1. Never edit the production schema outside migration files.
2. Migrations must stay backward compatible with the old app (expand / contract).
3. Add new columns/tables first. Drop old columns only in a later release.
4. Destructive SQL needs a separate confirmation.
5. Take a backup before substantial migrations.

Expand / contract:

1. Add a new nullable column.
2. Deploy code that reads and writes the new column.
3. Backfill.
4. Tighten nullability later.
5. Drop the old column in a still later release.

## App rollback after an applied migration

If db push succeeded and a later deploy step fails, rollback restores the
old app against the new schema.

- Safe only when the migration was expand-only / backward compatible.
- There is no automatic database rollback.
- Do not run down-migrations in production.
- If the old app cannot run on the new schema, ship a forward-fix migration.

## What this change does not do

- Does not production-deploy.
- Does not apply migrations to production from this checkout.
- Does not change Olga data. The Olga entitlement file is applied only when a
  future production deploy runs this stage against a remote history that already
  contains every older version.

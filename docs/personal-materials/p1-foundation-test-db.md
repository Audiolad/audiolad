# Personal Materials P1 — isolated test database

## Purpose

Verify `20260715143000_personal_materials_foundation.sql` against an isolated PostgreSQL database without touching production.

## Test database

| Parameter | Value |
|-----------|-------|
| Database | `audiolad_personal_materials_test` |
| Docker container | `supabase-db` |
| Production database | `postgres` — **never used for writes** |

Schema is cloned **schema-only** (no production data) from `postgres`, then the P1 migration is applied.

## Required environment

```bash
export AUDIOLAD_TEST_DATABASE=1
export AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1
```

Optional override:

```bash
export AUDIOLAD_PERSONAL_MATERIALS_TEST_DB_NAME=audiolad_personal_materials_test
```

## Commands

From the clean worktree:

```bash
node scripts/personal-materials-p1-setup-test-db.mjs
node scripts/stage-p1-personal-materials-unit.mjs
node scripts/stage-p1-personal-materials-db.mjs
```

## Safety

- Setup reads production schema only (`pg_dump --schema-only`).
- All writes go to `audiolad_personal_materials_test`.
- DB test creates ephemeral auth users/materials and deletes them in `finally`.
- Scripts refuse `postgres` as target database.

## Idempotency

The migration uses `IF NOT EXISTS` / `CREATE OR REPLACE` where practical. Setup re-applies the migration once to confirm idempotent behavior.

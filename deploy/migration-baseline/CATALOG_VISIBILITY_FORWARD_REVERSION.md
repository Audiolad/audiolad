# Catalog visibility forward reversion

PR #138 merged visibility SQL as `20260830120100`–`20260830120400`.
Those stamps sit **between** already-applied production history
(`20260830120000` … `20260831120000`) and were **never stamped** on
production. `catalog_visibility` and `practice_visibility_users` are
absent there.

Official planner (`deploy/scripts/lib/database-migrations-plan.mjs`):

```
pending = local − remote
if any pending version < max(remote) → abort database_migration_history_drift
```

Copying 201–204 under new names **while leaving the old files in
`supabase/migrations/`** does not fix this: the old versions stay
pending and still abort.

This restamp **moves** the four files to forward versions greater than
both production latest applied (`20260831120000`) and max local on the
main this branch started from (`20260901120000`). Old files leave the
planner scan directory.

The planner was **not** changed. No aliases. Fail-closed drift stays.

## Mapping

| Old live filename (removed from `supabase/migrations/`) | New live filename | Action |
|---|---|---|
| `20260830120100_practice_catalog_visibility_modes.sql` | `20260902120100_practice_catalog_visibility_modes.sql` | FORWARD REVERSION |
| `20260830120200_create_practice_order_visibility.sql` | `20260902120200_create_practice_order_visibility.sql` | FORWARD REVERSION |
| `20260830120300_public_playlist_selected_visibility.sql` | `20260902120300_public_playlist_selected_visibility.sql` | FORWARD REVERSION |
| `20260830120400_fix_visibility_allowlist_author_policy.sql` | `20260902120400_fix_visibility_allowlist_author_policy.sql` | FORWARD REVERSION |

SQL content is unchanged (byte-identical to the archive). Dependency
order 201 → 202 → 203 → 204 is preserved as `20260902120100` →
`20260902120200` → `20260902120300` → `20260902120400`.

Archive (not scanned by the planner):

`deploy/migration-baseline/catalog-visibility-20260830/`

Left untouched:

- `20260830120000_personal_timer_promotion_copy.sql`
- `20260715170000_practice_catalog_visibility_and_entitlement_access.sql`

## Planner behavior (unchanged)

| Case | Setup | Result |
|---|---|---|
| A | Local version older than max remote and absent from DB history | `abort` / `database_migration_history_drift` (keep this) |
| B | DB-applied version whose file is missing from the repo | `pending = local − remote` only; extra remote does **not** abort |
| C | Renamed/re-versioned file (old gone, new present, new > max remote) | `apply` the new version; no hole |
| D | New version whose SQL already ran in another environment | Planner still `apply`s the new version. Needs **idempotent SQL**, not planner aliases. Planner has no aliases. |

## Three environments

### CASE 1 — production-like

- Old 201–204 not stamped
- Visibility schema absent
- Latest applied ≥ `20260831120000`

Repaired local files plan as `apply` of only the forward suffix
(`20260901120000` if still pending, plus `20260902120100`–`20400`).
No pending version < latest applied. No drift abort.

### CASE 2 — fresh DB

Installing from repo migrations creates the visibility schema **once**.
Old 201–204 are not live files, so they cannot double-create with the
new files.

### CASE 3 — already-applied old 201–204

New forward SQL is the same idempotent script (IF NOT EXISTS,
DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE, no
destructive product drops). Re-applying must not fail on duplicate
table/policy/function. Planner will still insert the **new** history
rows. Do not invent planner aliases.

## Later clone run (not executed by this PR)

This cloud checkout cannot reach a production-shaped clone. After a
named isolated copy exists, run:

```bash
# Fail-closed: refuses postgres / template0 / template1 / unnamed DBs.
# Never set AUDIOLAD_DEPLOY_OVERRIDE. Never apply to production.

# CASE 1 / CASE 2 — apply only live forward files (official planner/runner
# against the clone). Expected pending after a production-like remote
# whose max is 20260831120000:
#   20260901120000
#   20260902120100
#   20260902120200
#   20260902120300
#   20260902120400

# CASE 3 — objects/stamps from old 201–204 already present:
AUDIOLAD_VISIBILITY_REVERSION_DATABASE_URL='postgresql://…/audiolad_visibility_reversion_clone' \
AUDIOLAD_VISIBILITY_REVERSION_ALLOW_DB='audiolad_visibility_reversion_clone' \
AUDIOLAD_VISIBILITY_REVERSION_MODE='case3' \
  node scripts/catalog-visibility-forward-reversion-clone.mjs
```

Do not talk to production. Do not apply SQL by hand to any live database.

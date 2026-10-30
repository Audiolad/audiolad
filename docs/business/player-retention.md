# Business player history retention — PROPOSAL, awaiting Sergey's confirmation

**Proposed history retention: 400 days (400 × 24 hours). Sergey has not approved
this period or deletion. Deletion must remain disabled until he confirms.**
No production access, data cleanup, scheduling or migration application is part of
this change. Existing applied migrations remain unchanged.

## Reporting and data requirements

Repository audit for f381f92b:

- `business_player_listening_history` records intervals of confirmed audio advancement.
  Writers in `20261231160000_business_player_live_state.sql` and
  `20270122130000_business_venue_player_cafe_programs.sql` join confirmations within
  the last five minutes. No application report currently reads this table.
- `src/lib/business-app/load-owner-home-signals.ts` reads the latest business play
  from `playback_usage_facts`; `playback-facts-query.ts` reads that same canonical
  source for the “what played at T” report. Support diagnostics also use it.
- `src/lib/business-app/spa-admin.ts` and `spa-admin-report.ts` calculate per-track
  online/offline minutes from `business_playback_log.played_ms`.
- The history table is explicitly **not Proof of Play**. The royalty ledger and
  canonical usage facts have independent requirements; this cleanup touches neither.

400 days preserves a complete annual comparison window plus 35 days for delayed
operational reviews. It bounds raw interval growth without losing recent session
merging. This is a product proposal, not an assertion of a legal minimum. There
is no historical aggregate/archive added here. Future reports needing more than
400 days must establish an aggregate/export policy before deletion is enabled.
Removing intervals is irreversible and would limit future raw-history reports.

## Three independent lifecycles

- History: delete **only** `last_confirmed_at < cutoff`, where cutoff is server
  statement time minus `p_retention_days × 24` hours (default 400 days). Equality
  survives; `first_confirmed_at` is never a deletion criterion. A long session with a recent last confirmation survives.
- Heartbeat: proposal for a future separately approved cleanup is **stale only**,
  `last_seen_at < server time - 30 days`; never infer age from `claimed_at`.
  Active claims use a five-minute freshness window. Heartbeats are one upserted
  row per player, not an append-only stream; they do not grow with each ping.
  This implementation deletes **no heartbeats**, including stale ones. Keeping
  stale values preserves the owner's last-seen diagnostics until Sergey approves
  their removal. Any future deletion must lock and recheck last_seen_at against
  concurrent claim refreshes.
- Current playback state: **never cleaned up by retention**. One upserted row per
  player represents its last reported state, including long pauses and stopped
  devices. Age does not make that state a historical event. Neither this function
  nor the runner writes to playback state or heartbeat.

## Implementation and controls

`20270211120000_business_player_history_retention.sql` adds a B-tree index
`(last_confirmed_at, id)` and the service-role-only RPC
`cleanup_business_player_listening_history`. No data is deleted when it is applied.
Public, anonymous and authenticated execution are revoked. RPC defaults are
`p_enabled=false`, `p_delete_enabled=false`, batch size 500, maximum batches 20.
The optional `p_retention_days` integer defaults to 400; SQL rejects NULL or values
outside 30–3650 days. These bounds are configuration safeguards, not an approved
retention policy. Duration is exact hours, independent of timezone/DST.
SQL also validates batch hard limits (1–500 and 1–20). Disabled RPC calls do not
count or mutate history. Dry-run counts all candidates without row locks or deletes.

The one-shot `scripts/run-business-player-retention.mts` follows the existing
Studio guest cleanup pattern (tsx + Supabase service client + structured stdout).
No PM2 config, cron entry, endpoint or new scheduling mechanism is registered.
A future operator can schedule the one-shot after separate approval.

Flags accept only literal `true`:

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `BUSINESS_PLAYER_RETENTION_DAYS` | 400 | Integer 30–3650; overrides the proposed period |
| `BUSINESS_PLAYER_RETENTION_ENABLED` | off | Enables counting/RPC connection |
| `BUSINESS_PLAYER_RETENTION_DELETE_ENABLED` | off | Allows deletion when also enabled; requires Sergey's confirmation |

`BUSINESS_PLAYER_RETENTION_DEFAULT_DAYS = 400` is the named library default.
Invalid values (including empty strings, fractions or out-of-range values) fail
closed before any RPC, even when disabled. The runner logs the fixed validation
error without echoing the supplied value. Changing the period still needs owner
approval; configuration does not approve deletion or the proposed 400 days.

With both flags absent the runner logs zero counts and does not even create a
client. It needs no credentials in this mode:

```bash
node --import tsx scripts/run-business-player-retention.mts
```

For a dry-run on an approved **local/test** Supabase target, supply
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through the environment
(do not put their values into commands, reports or commits), then:

```bash
BUSINESS_PLAYER_RETENTION_ENABLED=true \
BUSINESS_PLAYER_RETENTION_DELETE_ENABLED=false \
node --import tsx scripts/run-business-player-retention.mts
```

Only after Sergey's decision, deletion is enabled by setting **both** flags to
`true`. To stop deletion while retaining monitoring, set DELETE_ENABLED=false.
To switch the job off entirely, set ENABLED=false or unset it and stop any future
external schedule. The kill switch applies to the next invocation; changing env
cannot cancel a transaction already running. A service-role holder can explicitly
call the RPC, so keep those credentials restricted to trusted maintenance.

Each successful run logs mode, cutoff, candidates, deleted and batches without
row identifiers. `candidates` is the initial count, not a guarantee that all will
be deleted: one run removes at most 10000 rows and skips locked rows. Repeat
bounded runs after review to drain a backlog. Each RPC is one transaction; batches
bound selection/statement work, not separate commits. Concurrent writers are
protected with `FOR UPDATE SKIP LOCKED`; deletion rechecks last_confirmed_at.
Errors fail the process with a generic structured error, without leaking secrets.
The client request timeout is 60 seconds; it is not a guaranteed DB cancellation.
A DB error rolls the entire RPC back; operators should recount after an ambiguous
network failure rather than assuming a particular deletion count.

## Verification and index evidence

```bash
npm run test:business-player-retention
npm test
npx tsc --noEmit
npx eslint src/lib/business-app/player-retention.ts scripts/run-business-player-retention.mts scripts/business-player-retention-unit.mts
```

The isolated test follows the existing single-user PostgreSQL test convention:
private temporary initdb cluster, no DB URLs, network sockets, Docker or live data.
Set `PG_BIN` if the PostgreSQL binaries are outside `/usr/lib/postgresql/17/bin`.
The test asserts the index definition is present in the new migration and executes
it twice against the original live-state table definitions with synthetic parent rows.
It tests exact-cutoff/±1 microsecond, old-first/recent-last confirmation, dry-run,
disabled RPC/runner, batch size and loop limits, cleanup/migration idempotency,
alternate retention and invalid values, permission restoration after deliberate
synthetic grant drift, and unchanged playback/active heartbeat rows.

Local PostgreSQL 17 EXPLAIN on a selective synthetic fixture (20000 fresh rows,
20 expired) uses, with default planner settings:

- Batch selection: `Limit → LockRows → Index Scan` using
  `business_player_listening_history_retention_idx`, with
  `Index Cond: last_confirmed_at < cutoff` and no sort.
- Count: `Aggregate → Index Only Scan` using the same index and condition.

The isolated test requires both plans to name the index. PostgreSQL can choose a
sequential scan for a large expired fraction; an index cannot force every plan.
The index uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS` before `BEGIN`; the
function and repeated privilege statements stay in the following transaction.
The official runner feeds files to psql without `--single-transaction` or an outer
BEGIN (`deploy/scripts/lib/self-hosted-db.sh:129–138`), called by
`deploy/scripts/lib/database-migrations.sh:149`; this follows the documented
stdin apply mechanism in `docs/database-migration-safety.md`. No new runner marker,
feature or migration file is needed. No earlier concurrent-index migration or
invalid-index repair convention was found. Concurrent creation permits normal
writes during the build; it can still wait on transactions and consume resources.

`IF NOT EXISTS` alone does not repair an invalid index after a failed concurrent
build. Before an authorized retry, an operator must check its definition and
validity (manual check only; not executed by this task):

```sql
SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i
WHERE i.indexrelid = to_regclass('public.business_player_listening_history_retention_idx');
```

No row means creation is still needed. An existing index must be valid/ready and
match `(last_confirmed_at, id)` on the history table. Otherwise stop the retry and
have an authorized DBA approve repair (for an invalid index, concurrent removal
and recreation outside a transaction). Do not treat an `IF NOT EXISTS` notice as
proof of a successful build. There is no automatic destructive repair here.

## Decisions and continuation

Sergey: confirm 400 days, whether future annual/custom reports need an archive,
and whether 30-day stale heartbeat removal is desirable. Then review a dry-run
on an authorized environment and approve deletion/scheduling separately. Continue
from that review; nothing in this task enables production deletion.

## Task validation record

- `npm run test:business-player-retention`: PASS, including real local PostgreSQL
  boundary tests and both EXPLAIN plans.
- ESLint on touched JS/TS files: PASS. `npm run lint`: PASS with 112 existing
  warnings, zero errors.
- `npx tsc --noEmit`: initially exhausted default Node heap; retried with
  `NODE_OPTIONS=--max-old-space-size=8192`, then failed on the existing
  `src/components/business-app/PointQrCode.tsx` import of `qrcode-generator`, absent
  from the available dependency installation. Targeted strict typecheck of all
  three new TS files: PASS.
- `npm test`: NOT GREEN. The new suite passes first; the existing
  `supabase-log-rotation-override-unit.mjs` then fails with
  `override must not declare environment`. Its test and Docker override are
  unchanged by this task. The sandbox also blocks tsx CLI IPC sockets; the retry
  used a temporary external npx adapter invoking `node --import tsx`.
- Migration version uniqueness: PASS. Planner pending-list/count assertions:
  PASS in a temporary diagnostic copy with the unrelated subprocess CLI checks
  omitted (those checks hang reading stdin in this sandbox). The original-source
  test was attempted and interrupted at that hang; no CLI success is claimed.
- `npm run build`: blocked by Turbopack refusing an external node_modules symlink.
  Reused an existing dependency installation; no install, lockfile change or
  dependency update was performed.
- No UI changed, so no browser scenario was exercised. The disabled one-shot was
  run manually and logged zero counts without a database connection.
- No commit, push, PR, production access or production operation was performed.

## Review fixes validation (2026-10-30)

The earlier validation record above belongs to the initial draft. For this revision,
`node --import tsx scripts/business-player-retention-unit.mts`: PASS.
Targeted `node_modules/.bin/eslint` and strict `node_modules/.bin/tsc --noEmit`
on the library, runner and unit file: PASS. Python harness syntax and
`git diff --check`: PASS. Direct `node scripts/database-migrations-plan-unit.mjs`
hangs in CLI subprocess checks (15-second timeout, exit 124); all remaining
planner assertions pass in a temporary diagnostic copy with only `testCliModes`
omitted. No full CLI planner success is claimed, and its repository file is
unchanged because the migration file set did not change. Full lint/build and
browser checks were not run: npm is unavailable, the shared node_modules symlink
blocks the existing build setup, and no UI changed.
SQL smoke and the isolated harness now cover the parameter and migration reapply,
including privilege restoration; they were not executed because this session
forbids database access. No production/DB/Supabase access, env-file reads, dependency
changes, scheduling, commit, push or deploy. Owner decisions remain pending:
400 days, archive yes/no, and removal of heartbeats older than 30 days.
Continue with coordinator diff review, then separately authorized isolated SQL
validation and the owner's policy decisions before any migration application.

#!/usr/bin/env python3
"""Fresh local single-user PostgreSQL; no DB URL, sockets, Docker or live data."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
def pg_bin():
    if os.environ.get('PG_BIN'):
        return Path(os.environ['PG_BIN'])
    # Prefer 17 (local convention); fall back to the newest installed server (CI runners).
    found = sorted(Path('/usr/lib/postgresql').glob('*/bin/postgres'),
                   key=lambda p: int(p.parent.parent.name) if p.parent.parent.name.isdigit() else 0)
    preferred = Path('/usr/lib/postgresql/17/bin')
    return preferred if (preferred / 'postgres').exists() or not found else found[-1].parent


pg = pg_bin()
original = (root / 'supabase/migrations/20261231160000_business_player_live_state.sql').read_text()
tables = original[original.index('CREATE TABLE'):original.index('ALTER TABLE')]
stub = ('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; '
        'CREATE SCHEMA supabase_migrations; '
        'CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY); '
        "INSERT INTO supabase_migrations.schema_migrations VALUES ('20270215120000');\n")
for table in ['business_players', 'business_organizations', 'business_locations', 'audio_items']:
    stub += f"CREATE TABLE public.{table} (id uuid PRIMARY KEY); INSERT INTO public.{table} VALUES ('00000000-0000-0000-0000-000000000001');\n"
migration = root / 'supabase/migrations/20270215120000_business_player_history_retention.sql'
smoke = root / 'supabase/tests/business_player_retention_smoke.sql'
rollback = root / 'supabase/rollbacks/20270215120000_business_player_history_retention.rollback.sql'
dry_run = root / 'docs/business/player-retention-dry-run.sql'
SIG = 'public.cleanup_business_player_listening_history(boolean,boolean,integer,integer,integer)'
# Enough fresh rows and a selective old tail to test the planner without disabling seqscan.
plan_sql = """
INSERT INTO public.business_player_listening_history
(player_id, organization_id, location_id, audio_item_id, first_confirmed_at, last_confirmed_at)
SELECT '00000000-0000-0000-0000-000000000001'::uuid,
       '00000000-0000-0000-0000-000000000001'::uuid,
       '00000000-0000-0000-0000-000000000001'::uuid,
       '00000000-0000-0000-0000-000000000001'::uuid,
       now() - interval '500 days',
       CASE WHEN i <= 20 THEN now() - interval '401 days' ELSE now() END
FROM generate_series(1,20000) i;
ANALYZE public.business_player_listening_history;
EXPLAIN (FORMAT JSON) SELECT h.id FROM public.business_player_listening_history h
WHERE h.last_confirmed_at < statement_timestamp() - 400 * 24 * interval '1 hour'
ORDER BY h.last_confirmed_at, h.id LIMIT 500 FOR UPDATE SKIP LOCKED;
EXPLAIN (FORMAT JSON) SELECT count(*) FROM public.business_player_listening_history h
WHERE h.last_confirmed_at < statement_timestamp() - 400 * 24 * interval '1 hour';
"""
# The documented read-only dry-run must count exactly what the RPC dry-run counts.
dry_select = next(line for line in dry_run.read_text().splitlines() if line.startswith('SELECT '))
dry_check = (
    'CREATE TEMP TABLE dry_run_result AS ' + dry_select.rstrip(';') + '; '
    "DO $$ DECLARE r record; d record; BEGIN "
    "SELECT * INTO r FROM public.cleanup_business_player_listening_history(true, false); "
    "SELECT * INTO d FROM dry_run_result; "
    "IF r.deleted <> 0 OR d.candidates <> r.candidates OR d.candidates <> 22 "
    "OR d.max_deleted_by_one_run <> 22 THEN RAISE EXCEPTION 'dry-run query mismatch'; END IF; "
    "IF (SELECT count(*) FROM public.business_player_listening_history) <> 20002 THEN "
    "RAISE EXCEPTION 'dry-run must not delete'; END IF; END $$;"
)
rollback_tx, rollback_rest = rollback.read_text().split('COMMIT;', 1)
# Each statement outside the rollback transaction is its own command (DROP INDEX CONCURRENTLY).
rollback_blocks = [rollback_tx + 'COMMIT;'] + [stmt.strip() + ';' for stmt in rollback_rest.split(';') if stmt.strip()]
after_rollback = (
    "DO $$ BEGIN "
    f"IF to_regprocedure('{SIG}') IS NOT NULL THEN RAISE EXCEPTION 'rollback left function'; END IF; "
    "IF to_regclass('public.business_player_listening_history_retention_idx') IS NOT NULL THEN "
    "RAISE EXCEPTION 'rollback left index'; END IF; "
    "IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20270215120000') THEN "
    "RAISE EXCEPTION 'rollback left migration row'; END IF; "
    "IF (SELECT count(*) FROM public.business_player_listening_history) <> 20002 "
    "OR (SELECT count(*) FROM public.business_player_device_heartbeat) <> 1 "
    "OR (SELECT count(*) FROM public.business_player_playback_state) <> 1 THEN "
    "RAISE EXCEPTION 'rollback must not touch data'; END IF; END $$;"
)
after_reapply = (
    "DO $$ BEGIN "
    f"IF NOT has_function_privilege('service_role', '{SIG}', 'EXECUTE') "
    f"OR has_function_privilege('anon', '{SIG}', 'EXECUTE') "
    f"OR has_function_privilege('authenticated', '{SIG}', 'EXECUTE') THEN RAISE EXCEPTION 'reapply rbac'; END IF; "
    "IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = "
    "'public.business_player_listening_history_retention_idx'::regclass AND indisvalid) THEN "
    "RAISE EXCEPTION 'reapply index'; END IF; END $$;"
    " SELECT 'business player retention rollback+reapply: PASS';"
)
with tempfile.TemporaryDirectory(prefix='audiolad-player-retention-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'],
                   check=True, capture_output=True)
    # Match the official psql stdin runner: concurrent index is its own command,
    # outside the function transaction. Reapply after privilege drift to verify
    # IF NOT EXISTS, CREATE OR REPLACE and repeated REVOKE/GRANT together.
    index_sql, function_sql = migration.read_text().split('\nBEGIN;', 1)
    migration_blocks = [index_sql, 'BEGIN;' + function_sql]
    privilege_drift = (
        'GRANT EXECUTE ON FUNCTION public.cleanup_business_player_listening_history'
        '(boolean,boolean,integer,integer,integer) TO PUBLIC, anon, authenticated; '
        'REVOKE EXECUTE ON FUNCTION public.cleanup_business_player_listening_history'
        '(boolean,boolean,integer,integer,integer) FROM service_role;'
    )
    blocks = [stub, tables, *migration_blocks, privilege_drift,
              *migration_blocks, smoke.read_text(), plan_sql, dry_check, dry_run.read_text(),
              *rollback_blocks, after_rollback, *migration_blocks, after_reapply]
    # Single-user mode consumes one SQL block per line.
    sql = '\n'.join(' '.join(line for line in block.splitlines()
                             if not line.lstrip().startswith('--')) for block in blocks) + '\n'
    result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'],
                            input=sql, text=True, capture_output=True)
    if (result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr
            or 'business player retention: PASS' not in result.stdout
            or 'business player retention rollback+reapply: PASS' not in result.stdout
            or result.stdout.count('business_player_listening_history_retention_idx') < 3):
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print('PostgreSQL retention: boundaries, dry-run, disabled, bounded batches, live rows, RBAC: PASS')
    print('EXPLAIN: retention_idx used for ordered batch selection, candidate count and documented dry-run (20 old / 20000 fresh rows): PASS')
    print('Dry-run query == RPC dry-run count, no deletes; rollback drops only RPC+index; reapply restores both: PASS')

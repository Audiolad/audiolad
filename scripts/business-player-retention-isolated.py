#!/usr/bin/env python3
"""Fresh local single-user PostgreSQL; no DB URL, sockets, Docker or live data."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/17/bin'))
original = (root / 'supabase/migrations/20261231160000_business_player_live_state.sql').read_text()
tables = original[original.index('CREATE TABLE'):original.index('ALTER TABLE')]
stub = 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;\n'
for table in ['business_players', 'business_organizations', 'business_locations', 'audio_items']:
    stub += f"CREATE TABLE public.{table} (id uuid PRIMARY KEY); INSERT INTO public.{table} VALUES ('00000000-0000-0000-0000-000000000001');\n"
migration = root / 'supabase/migrations/20270211120000_business_player_history_retention.sql'
smoke = root / 'supabase/tests/business_player_retention_smoke.sql'
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
WHERE h.last_confirmed_at < statement_timestamp() - interval '9600 hours'
ORDER BY h.last_confirmed_at, h.id LIMIT 500 FOR UPDATE SKIP LOCKED;
EXPLAIN (FORMAT JSON) SELECT count(*) FROM public.business_player_listening_history h
WHERE h.last_confirmed_at < statement_timestamp() - interval '9600 hours';
"""
with tempfile.TemporaryDirectory(prefix='audiolad-player-retention-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'],
                   check=True, capture_output=True)
    blocks = [stub, tables, migration.read_text(), smoke.read_text(), plan_sql]
    # Single-user mode consumes one SQL block per line.
    sql = '\n'.join(' '.join(line for line in block.splitlines()
                             if not line.lstrip().startswith('--')) for block in blocks) + '\n'
    result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'],
                            input=sql, text=True, capture_output=True)
    if (result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr
            or 'business player retention: PASS' not in result.stdout
            or result.stdout.count('business_player_listening_history_retention_idx') < 2):
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print('PostgreSQL retention: boundaries, dry-run, disabled, bounded batches, live rows, RBAC: PASS')
    print('EXPLAIN: retention_idx used for ordered batch selection and candidate count (20 old / 20000 fresh rows): PASS')

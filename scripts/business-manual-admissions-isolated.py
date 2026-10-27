#!/usr/bin/env python3
"""Test migration in a fresh single-user PostgreSQL in /tmp, without sockets or DB URLs."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/17/bin'))
with tempfile.TemporaryDirectory(prefix='audiolad-admissions-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'],
                   check=True, capture_output=True)
    files = ['scripts/lib/business-manual-admissions-stub.sql',
             'supabase/migrations/20270131120000_business_manual_admissions.sql',
             'supabase/tests/business_manual_admissions_smoke.sql']
    # Single-user backend reads a SQL block per line. No SQL comments survive joining.
    sql = '\n'.join(' '.join(line for line in (root / file).read_text().splitlines()
                             if not line.lstrip().startswith('--')) for file in files) + '\n'
    result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'],
                            input=sql, text=True, capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'business manual admissions: PASS' not in result.stdout:
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print('PostgreSQL: migration, inheritance, overrides, rights gate, analyzer isolation, bulk atomicity, RBAC, audit, filters – PASS')

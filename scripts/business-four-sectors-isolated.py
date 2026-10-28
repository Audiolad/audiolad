#!/usr/bin/env python3
"""Four sectors and artist hide, on a throwaway Postgres, after the admissions migration."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/16/bin'))
with tempfile.TemporaryDirectory(prefix='audiolad-sectors-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'],
                   check=True, capture_output=True)
    files = ['scripts/lib/business-manual-admissions-stub.sql',
             'supabase/migrations/20270131120000_business_manual_admissions.sql',
             'supabase/migrations/20270203120000_business_four_sectors_hide_artists.sql',
             'supabase/tests/business_four_sectors_smoke.sql']
    sql = '\n'.join(' '.join(line for line in (root / file).read_text().splitlines()
                             if not line.lstrip().startswith('--')) for file in files) + '\n'
    result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'],
                            input=sql, text=True, capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'business four sectors: PASS' not in result.stdout:
        print(result.stdout[-4000:])
        print(result.stderr[-4000:])
        raise SystemExit(1)
    print('PostgreSQL: four sectors, restaurant maps to cafe, cafe/spa eligibility, hide audit – PASS')

#!/usr/bin/env python3
"""Real A1/A2/pairing/commands/A3 functions in a new local single-user PG.
No network, URL, Docker, production cluster or credentials. Rights/catalog/paid
fixtures are deliberately small stubs; staging must exercise their full schema.
"""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/17/bin'))
if not (pg/'postgres').exists():
    found = sorted(Path('/usr/lib/postgresql').glob('*/bin/postgres'), key=lambda p: int(p.parent.parent.name))
    if not found:
        raise SystemExit('Install local PostgreSQL server binaries or set PG_BIN; no remote database is used.')
    pg = found[-1].parent
def migration(name):
    return (root / 'supabase/migrations' / name).read_text().split('COMMIT;')[0] + 'COMMIT;'
def function(sql, name):
    start = sql.index('CREATE OR REPLACE FUNCTION public.' + name + '(')
    return sql[start:sql.index('\n$$;', start)+4]

stubs = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE practices(id uuid PRIMARY KEY, product_kind text, author_id uuid);
CREATE TABLE audio_items(id uuid PRIMARY KEY, practice_id uuid, title text);
CREATE TABLE analytics_sessions(id uuid PRIMARY KEY, anonymous_id text);
CREATE FUNCTION admin_analytics_visitor_key(uuid,text,timestamptz) RETURNS text LANGUAGE sql AS $$ SELECT 'fixture'::text $$;
CREATE FUNCTION resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('decision', CASE WHEN current_setting('test.deny',true)='1' THEN 'UNKNOWN' ELSE 'ELIGIBLE' END) $$;
CREATE FUNCTION business_ensure_location_rights_context(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT $1 $$;
CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, order_kind text, status text);
CREATE TABLE business_subscription_periods(order_id uuid PRIMARY KEY, user_id uuid, opens_access boolean, amount_minor bigint, period_end timestamptz);
CREATE FUNCTION check_test(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;
"""
base_usage = (root/'supabase/migrations/20261127120000_playback_usage_facts.sql').read_text()
usage_tables = base_usage[base_usage.index('CREATE TABLE'):base_usage.index('CREATE OR REPLACE FUNCTION')]
a3 = (root/'supabase/migrations/20261203120000_business_playback_attribution.sql').read_text()
a3_schema = a3[a3.index('ALTER TABLE'):a3.index('-- Consumer analytics isolation')]
live = (root/'supabase/migrations/20261231160000_business_player_live_state.sql').read_text()
live_tables = live[live.index('CREATE TABLE'):live.index('ALTER TABLE')]
blocks = [stubs, migration('20261201120000_business_domain_core.sql'),
          migration('20261202120000_business_player_foundation.sql'), usage_tables, a3_schema,
          function(a3, 'apply_playback_usage_heartbeat'), live_tables,
          migration('20270205120000_business_location_sound_settings.sql'),
          migration('20270206120000_business_point_pairing.sql'),
          migration('20270208120000_business_point_pairing_4digit.sql'),
          migration('20270223120000_business_point_pairing_no_global_burn.sql'),
          migration('20270207120000_business_point_commands.sql'),
          migration('20270224120000_business_point_commands_ack_after_apply.sql'),
          migration('20270226120000_business_pilot_three_locations.sql'),
          migration('20270226130000_business_point_playback_attribution.sql'),
          (root/'supabase/tests/business_pilot_three_locations_smoke.sql').read_text()]
with tempfile.TemporaryDirectory(prefix='audiolad-three-points-') as tmp:
    data = Path(tmp)/'data'
    subprocess.run([str(pg/'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'], check=True, capture_output=True)
    sql = '\n'.join(' '.join(re.sub(r'--[^\n]*', '', block).splitlines()) for block in blocks)+'\n'
    result = subprocess.run([str(pg/'postgres'), '--single', '-D', str(data), 'postgres'], input=sql, text=True, capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'three-point pilot: PASS' not in result.stdout:
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print('three-point pilot: real A1/A2 activation, pairing, isolated state/heartbeat/commands/A3, RBAC, rights denial, payment binding, legacy credential: PASS')

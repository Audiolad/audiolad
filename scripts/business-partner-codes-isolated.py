#!/usr/bin/env python3
"""Partner codes (task 8142d69a) on top of the real Business billing functions in a new local PG.
Runs every earlier pilot/billing smoke first, then the partner-code smoke and a two-session race.
No network, URL, Docker, production cluster or credentials. Rights/catalog/paid
fixtures are deliberately small stubs; staging must exercise their full schema.
"""
from pathlib import Path
import os
import re
import subprocess
import tempfile
import time

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

def partner_migration_without_fulfill():
    # The payment webhook schema is not in these small fixtures: the late-confirmation branch of
    # fulfill_tochka_payment_transactional is covered by the post-apply real-compile smoke
    # (supabase/tests/business_partner_codes_fulfill_smoke.sql). Everything else runs here.
    sql = migration('20270302120000_business_partner_codes.sql')
    start = sql.index('-- 11. Bank confirmation of a replaced business link')
    marker = 'COMMENT ON FUNCTION public.fulfill_tochka_payment_transactional IS'
    end = sql.index("';\n", sql.index(marker)) + 2
    return sql[:start] + sql[end:]

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
          (root/'supabase/tests/business_pilot_three_locations_smoke.sql').read_text(),
          (root/'scripts/fixtures/business-shared-billing-schema.sql').read_text(),
          migration('20270226140000_business_shared_venue_renewal.sql'),
          (root/'supabase/tests/business_shared_venue_renewal_smoke.sql').read_text(),
          migration('20270227120000_business_venue_slots_systemic.sql'),
          (root/'supabase/tests/business_venue_slots_systemic_smoke.sql').read_text(),
          'ALTER TABLE orders ADD COLUMN updated_at timestamptz, ADD COLUMN cancelled_at timestamptz;',
          partner_migration_without_fulfill(),
          (root/'supabase/tests/business_partner_codes_smoke.sql').read_text()]
# t1338u: the 72-hour hold counted once per account (20270304120000).
window_once = migration('20270304120000_business_partner_code_window_once.sql')
window_smoke = (root/'supabase/tests/business_partner_code_window_once_smoke.sql').read_text()
backfill_fixture = (root/'supabase/tests/business_partner_code_window_once_backfill_fixture.sql').read_text()
# A late link: opened under the old rules, then its hold end moved before it (cannot be kept exactly).
late_link_fixture = """
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000002b1');
INSERT INTO business_offer_acceptances VALUES ('00000000-0000-4000-8000-0000000002b1');
INSERT INTO business_partner_codes(code, purpose) VALUES ('NNNNNNNNNNNN','custdev');
SET test.uid='00000000-0000-4000-8000-0000000002b1';
SELECT public.create_business_organization_with_location('N','Зал 1','cafe','RU','Europe/Moscow');
SELECT public.reserve_business_partner_code('NNNNNNNNNNNN');
SELECT * FROM public.create_business_subscription_order(gen_random_uuid(), 39900);
UPDATE business_partner_codes SET reserved_until=clock_timestamp()-interval '1 hour' WHERE code='NNNNNNNNNNNN';
"""

def must_stop(name, run_blocks, expected):
    with tempfile.TemporaryDirectory(prefix='audiolad-partner-codes-stop-') as tmp:
        data = Path(tmp)/'data'
        subprocess.run([str(pg/'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'], check=True, capture_output=True)
        sql = '\n'.join(' '.join(re.sub(r'--[^\n]*', '', block).splitlines()) for block in run_blocks)+'\n'
        sql += "ROLLBACK;\n"
        sql += "SELECT CASE WHEN to_regclass('public.business_partner_code_windows') IS NULL THEN 'window migration stopped: nothing applied' END;\n"
        result = subprocess.run([str(pg/'postgres'), '--single', '-D', str(data), 'postgres'], input=sql, text=True, capture_output=True)
        if expected not in result.stderr or 'window migration stopped: nothing applied' not in result.stdout:
            print(result.stdout[-3000:], result.stderr[-3000:])
            raise SystemExit(name + ': FAIL')
    print(name + ': PASS')

def single_user(data, run_blocks, markers):
    sql = '\n'.join(' '.join(re.sub(r'--[^\n]*', '', block).splitlines()) for block in run_blocks)+'\n'
    result = subprocess.run([str(pg/'postgres'), '--single', '-D', str(data), 'postgres'], input=sql, text=True, capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or any(m not in result.stdout for m in markers):
        print(result.stdout, result.stderr)
        raise SystemExit(1)

markers = ['three-point pilot: PASS', 'shared-venue billing: PASS', 'venue slots systemic: PASS', 'partner codes: PASS']
# Regression: the whole partner-code smoke also passes with the once-only window applied first.
with tempfile.TemporaryDirectory(prefix='audiolad-partner-codes-window-') as tmp:
    data = Path(tmp)/'data'
    subprocess.run([str(pg/'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'], check=True, capture_output=True)
    single_user(data, blocks[:-1] + [window_once, blocks[-1], window_smoke], markers + ['partner code window once: PASS'])
print('partner codes: full smoke with the once-only 72-hour window applied first: PASS')
must_stop('partner codes: window migration stops on two holds of one account with different ends',
          blocks + [backfill_fixture, window_once], 'Pre-check failed: an account holds partner codes with different ends')
must_stop('partner codes: window migration stops on an open link created after its hold end',
          blocks + [late_link_fixture, window_once], 'Pre-check failed: an open personal-price link was created after its hold end')

with tempfile.TemporaryDirectory(prefix='audiolad-partner-codes-') as tmp:
    data = Path(tmp)/'data'
    subprocess.run([str(pg/'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'], check=True, capture_output=True)
    # Production order: rows created under 20270302120000, then the window migration backfills them.
    single_user(data, blocks + [window_once, window_smoke], markers + ['partner code window once: PASS'])
    # Parallel redemption with two real sessions: exactly one owner gets the code.
    sock = Path(tmp)/'sock'; sock.mkdir()
    server = subprocess.Popen([str(pg/'postgres'), '-D', str(data), '-k', str(sock), '-c', 'listen_addresses=', '-p', '55433'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        psql = ['psql', '-h', str(sock), '-p', '55433', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qtA']
        for _ in range(50):
            if subprocess.run(psql + ['-c', 'SELECT 1'], capture_output=True).returncode == 0:
                break
            time.sleep(0.1)
        subprocess.run(psql + ['-c', "INSERT INTO business_partner_codes(code, purpose) VALUES ('KKKKMMMMNNNN', 'custdev')"], check=True, capture_output=True)
        race = "SET test.uid='%s'; BEGIN; SELECT public.reserve_business_partner_code('KKKK-MMMM-NNNN')->>'ok'; SELECT pg_sleep(0.4); COMMIT;"
        users = ['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d1']
        procs = [subprocess.Popen(psql + ['-c', race % uid], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for uid in users]
        outcomes = [proc.communicate(timeout=30) for proc in procs]
        wins = sum(1 for proc in procs if proc.returncode == 0)
        losers = [err for proc, (_, err) in zip(procs, outcomes) if proc.returncode != 0]
        held = subprocess.run(psql + ['-c', "SELECT count(*) FROM business_partner_codes WHERE code='KKKKMMMMNNNN' AND reserved_by_user_id IS NOT NULL"], check=True, capture_output=True, text=True).stdout.strip()
        windows = subprocess.run(psql + ['-c', "SELECT count(*) FROM business_partner_code_windows w JOIN business_partner_codes c ON c.id=w.code_id WHERE c.code='KKKKMMMMNNNN'"], check=True, capture_output=True, text=True).stdout.strip()
        if wins != 1 or len(losers) != 1 or 'partner_code_unavailable' not in losers[0] or held != '1' or windows != '1':
            print(outcomes)
            raise SystemExit('parallel redemption: FAIL')
    finally:
        server.terminate(); server.wait(timeout=30)
    print('partner codes: two parallel sessions, exactly one reservation and one 72-hour window: PASS')
    print('partner codes: 72 hours counted once per account from the first entry (repeat visits, payment link, re-reserve, another code and back, second owner, end with and without an open link, no new personal-price link after the end, existing holds kept exactly): PASS')
    print('partner codes: reservation, parallel redemption, one-time binding on first real payment, failed/cancelled/sandbox payments, delayed payment, no combining, venues added in the window, three periods at the personal price then the standard one, revoke with an open link and a late payment, a code over an open ordinary link, two owners, venue-less quote, an earlier 79900 payment then the code (window from the first code payment), 72-hour hold end in the quote: PASS')
    print('three-point pilot: real A1/A2 activation, pairing, isolated state/heartbeat/commands/A3, RBAC, rights denial, payment binding, legacy credential, shared billing/count/snapshot/idempotency, systemic slots for every organization with raisable cap: PASS')

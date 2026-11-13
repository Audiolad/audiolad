#!/usr/bin/env python3
"""Real migration + existing schedule guard/claim in a new local single-user PG.
No database URL, existing cluster, network, Docker or production access.
"""
from pathlib import Path
import os
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
    if (preferred / 'postgres').exists() or not found:
        return preferred
    return found[-1].parent

pg = pg_bin()
schedule = (root / 'supabase/migrations/20261210120000_practice_scheduled_publication.sql').read_text()
schedule = schedule[schedule.index('CREATE OR REPLACE FUNCTION public.practice_is_publicly_available'):schedule.index('CREATE INDEX IF NOT EXISTS practices_scheduled_publish_at_idx')]
claim = (root / 'supabase/migrations/20261212120000_scheduled_publish_notification_outbox.sql').read_text()
claim = claim[claim.index('CREATE FUNCTION public.claim_due_scheduled_practice_publications()'):claim.index('COMMENT ON FUNCTION public.claim_due_scheduled_practice_publications()')]
migration = (root / 'supabase/migrations/20270308120000_product_first_publication_dates.sql').read_text()
stubs = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.authors (id integer PRIMARY KEY, slug text);
INSERT INTO public.authors VALUES (1,'author');
CREATE TABLE public.practices (
 id integer PRIMARY KEY, author_id integer DEFAULT 1, slug text DEFAULT 'product',
 status text DEFAULT 'draft', created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now(), published_at timestamptz,
 scheduled_publish_at timestamptz, deleted_at timestamptz,
 catalog_visibility text DEFAULT 'listed', is_catalog_listed boolean DEFAULT true,
 title text, product_kind text, publication_class text
);
CREATE TABLE public.practice_moderation_events (
 practice_id integer, from_status text, action text, created_at timestamptz
);
CREATE TABLE public.scheduled_publish_notification_outbox (
 practice_id integer PRIMARY KEY, author_id integer, practice_slug text,
 author_slug text, catalog_visibility text, is_catalog_listed boolean,
 published_at timestamptz, prior_public_count integer
);
CREATE FUNCTION public.check_test(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;
-- Fixtures precede the existing schedule guard to model old database history.
INSERT INTO public.practices(id,status,created_at,published_at) VALUES
 (1,'published','2020-01-01','2020-02-01'),
 (2,'published','2020-01-01','2020-01-01'),
 (3,'unpublished',NULL,'2020-01-01'),
 (4,'draft','2020-01-01',NULL),
 (5,'unpublished','2020-01-01','2020-02-01'),
 (6,'draft','2020-01-01',NULL),
 (9,'published',NULL,'2020-02-01');
INSERT INTO public.scheduled_publish_notification_outbox(practice_id,published_at) VALUES (9,'2020-02-01');
INSERT INTO public.practice_moderation_events VALUES
 (5,'published','unpublished','2020-01-15'),
 (6,'published','edit_mode_started','2020-01-15');
INSERT INTO public.practices(id,status,created_at,scheduled_publish_at) VALUES
 (7,'published','2020-01-01','2020-02-01'),
 (8,'published','2020-01-01',now()+interval '1 day');
"""
checks = """
SELECT public.check_test((SELECT published_at='2020-01-01' AND created_at='2020-01-01' FROM practices WHERE id=2), 'legacy fields not rewritten');
SELECT public.check_test((SELECT created_at IS NULL FROM practices WHERE id=3), 'unknown creation never replaced');
SELECT public.check_test((SELECT first_published_at='2020-02-01' AND NOT first_publication_date_unknown FROM practices WHERE id=1), 'retained factual timestamp');
SELECT public.check_test((SELECT bool_and(first_published_at IS NULL AND first_publication_date_unknown) FROM practices WHERE id IN (2,3,5,6)), 'synthetic/overwritten/missing history stays unknown');
SELECT public.check_test((SELECT first_published_at IS NULL AND NOT first_publication_date_unknown FROM practices WHERE id=4), 'historical never-published draft');
SELECT public.check_test((SELECT first_published_at=scheduled_publish_at AND published_at=scheduled_publish_at FROM practices WHERE id=7), 'historical elapsed schedule');
SELECT public.check_test((SELECT count(*)=1 FROM scheduled_publish_notification_outbox WHERE practice_id=7), 'backfill preserves indexing notification for elapsed schedule');
SELECT public.check_test((SELECT first_published_at IS NULL AND published_at IS NULL AND NOT first_publication_date_unknown FROM practices WHERE id=8), 'pending schedule');
SELECT public.check_test((SELECT first_published_at='2020-02-01' AND created_at IS NULL FROM practices WHERE id=9), 'outbox restores factual release with unknown creation');
BEGIN;
-- All kinds share the same product table, including courses and meditations.
INSERT INTO practices(id, product_kind, publication_class, title) VALUES
 (10,'music','release','Музыка'), (11,'practice','practice','Медитация'),
 (12,'practice','course','Курс'), (13,'audio_post','post','Аудиопост');
SELECT public.check_test((SELECT bool_and(first_published_at IS NULL) FROM practices WHERE id BETWEEN 10 AND 13), 'drafts have no publication date');
UPDATE practices SET status='published', published_at='2021-01-01' WHERE id BETWEEN 10 AND 13;
SELECT public.check_test((SELECT bool_and(first_published_at=now()) FROM practices WHERE id BETWEEN 10 AND 13), 'actual publish ignores supplied old published_at for all types');
UPDATE practices SET title='Изменено', updated_at=now()+interval '1 day', first_published_at='2022-01-01', created_at='1990-01-01', first_publication_date_unknown=true WHERE id BETWEEN 10 AND 13;
SELECT public.check_test((SELECT bool_and(first_published_at=now() AND created_at=now() AND NOT first_publication_date_unknown) FROM practices WHERE id BETWEEN 10 AND 13), 'edit cannot forge dates or marker');
UPDATE practices SET status='unpublished' WHERE id BETWEEN 10 AND 13;
UPDATE practices SET status='published', published_at=now()+interval '1 hour' WHERE id BETWEEN 10 AND 13;
SELECT public.check_test((SELECT bool_and(first_published_at=now()) FROM practices WHERE id BETWEEN 10 AND 13), 'hide then restore retains first date');
UPDATE practices SET status='published',first_publication_date_unknown=false,first_published_at=now() WHERE id IN (2,3,5,6);
SELECT public.check_test((SELECT bool_and(first_published_at IS NULL AND first_publication_date_unknown) FROM practices WHERE id IN (2,3,5,6)), 'unknown republish never invents today');
INSERT INTO practices(id,status,scheduled_publish_at) VALUES (20,'published',now()+interval '1 hour');
SELECT public.check_test((SELECT first_published_at IS NULL AND published_at IS NULL FROM practices WHERE id=20), 'approval before schedule stays unstamped');
COMMIT;
-- Passage of time without touching the row: historical old row is eligible
-- for prospective tracking; create it by approving before the schedule.
BEGIN;
INSERT INTO practices(id,status,scheduled_publish_at) VALUES (21,'published',now()+interval '1 hour');
-- Only the isolated fixture disables guards to simulate time passing.
ALTER TABLE practices DISABLE TRIGGER USER;
UPDATE practices SET scheduled_publish_at=now()-interval '1 hour' WHERE id=21;
ALTER TABLE practices ENABLE TRIGGER USER;
SELECT public.check_test(public.claim_due_scheduled_practice_publications()=1, 'late claim produces one event');
SELECT public.check_test((SELECT first_published_at=scheduled_publish_at AND published_at=scheduled_publish_at FROM practices WHERE id=21), 'late claim uses go-live, not read time');
SELECT public.check_test(public.claim_due_scheduled_practice_publications()=0, 'claim retry is idempotent');
SELECT public.check_test((SELECT count(*)=1 FROM scheduled_publish_notification_outbox WHERE practice_id=21), 'indexing outbox unchanged');
INSERT INTO practices(id,status,scheduled_publish_at) VALUES (22,'draft',now()-interval '1 hour');
UPDATE practices SET status='published' WHERE id=22;
SELECT public.check_test((SELECT first_published_at=now() AND published_at=now() FROM practices WHERE id=22), 'late moderation uses approval, not elapsed schedule');
INSERT INTO practices(id,status,scheduled_publish_at) VALUES (23,'published',now()+interval '1 hour');
ALTER TABLE practices DISABLE TRIGGER USER;
UPDATE practices SET scheduled_publish_at=now()-interval '1 hour' WHERE id=23;
ALTER TABLE practices ENABLE TRIGGER USER;
UPDATE practices SET status='unpublished' WHERE id=23;
SELECT public.check_test((SELECT first_published_at=scheduled_publish_at FROM practices WHERE id=23), 'hide after elapsed schedule before claim retains go-live');
INSERT INTO practices(id,status,first_published_at,first_publication_date_unknown) VALUES (24,'draft','2000-01-01',true);
SELECT public.check_test((SELECT first_published_at IS NULL AND NOT first_publication_date_unknown FROM practices WHERE id=24), 'insert cannot forge first publication');
INSERT INTO practices(id,status,scheduled_publish_at) VALUES (25,'published',now()+interval '1 hour');
UPDATE practices SET status='unpublished' WHERE id=25;
SELECT public.check_test((SELECT first_published_at IS NULL FROM practices WHERE id=25), 'hide before schedule never stamps first publication');
ALTER TABLE practices DISABLE TRIGGER USER;
UPDATE practices SET scheduled_publish_at=now()-interval '1 hour' WHERE id=25;
ALTER TABLE practices ENABLE TRIGGER USER;
UPDATE practices SET status='published' WHERE id=25;
SELECT public.check_test((SELECT first_published_at=now() FROM practices WHERE id=25), 'restore after hidden schedule uses actual restore');
COMMIT;
SELECT 'product-publication-dates: PASS';
"""
with tempfile.TemporaryDirectory(prefix='audiolad-product-dates-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'], check=True, capture_output=True)
    blocks = [stubs, schedule, claim, migration, checks]
    sql = '\n'.join(' '.join(line for line in block.splitlines() if not line.lstrip().startswith('--')) for block in blocks)+'\n'
    result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'], input=sql, text=True, capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'product-publication-dates: PASS' not in result.stdout:
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print('product-publication-dates-isolated: historical backfill, drafts, all types, publish, immutable dates, republish, schedule, late approval, claim + indexing outbox: PASS')

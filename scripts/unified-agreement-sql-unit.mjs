#!/usr/bin/env node
// 8dcba9d1 / 8d9cd0af PR 2: unified commercial agreement 2.0 (migration 20270109120000 + rollout SQL).
// Contract checks + real PostgreSQL scenarios in an EXPLICIT disposable test container only
// (same harness contract as business-rightsholder-onboarding-sql-unit.mjs; never a production URL).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20270109120000_unified_commercial_agreement.sql');
const dir = 'docs/business/unified-agreement-8dcba9d1/sql/';
const insert20 = read(`${dir}01-insert-edition-2.0.sql`);
const switchCurrent = read(`${dir}02-switch-current.sql`);
const rollbackSwitch = read(`${dir}03-rollback-switch.sql`);
const rollbackMigration = read(`${dir}99-rollback-migration.sql`);
const v2 = read('src/lib/author-terms/approved-content-v2.ts');
const clean = migration.replace(/--[^\n]*/g, '');

// ---- Contract: additive only; nothing inserts/switches editions or touches historical rows.
assert.match(clean, /^\s*BEGIN;/);
assert.match(clean, /COMMIT;\s*$/);
const outside = clean.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, '').replace(/DO \$\$[\s\S]*?\$\$;/g, '');
assert.doesNotMatch(outside, /\b(DROP\s+(TABLE|COLUMN|FUNCTION)|INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE\s+(TABLE\s+)?public)\b/i, "no DML / destructive DDL outside function bodies");
assert.doesNotMatch(clean, /UPDATE public\.author_terms_versions|INSERT INTO public\.author_terms_(versions|acceptances)/, 'migration never inserts/switches editions or acceptances');
assert.doesNotMatch(clean, /business_legal_consents\s*\(|INSERT INTO public\.business_legal_consents/, 'submit_v3 writes no legacy consents');
assert.doesNotMatch(clean, /UPDATE public\.music_rights_grants[\s\S]{0,400}source_type\s*<>/, 'never mutates foreign grants');
for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)) {
  assert.match(body[0], /SECURITY DEFINER/);
  assert.match(body[0], /SET search_path = public, pg_temp/);
}
// Flag-off behaviour is preserved: the opt-in revoke happens only at activation (02-switch), regrant on rollback.
assert.doesNotMatch(clean, /author_business_product_optin/, 'migration leaves the legacy opt-in untouched');
assert.match(switchCurrent, /REVOKE EXECUTE ON FUNCTION public\.author_business_product_optin\(uuid\[\],boolean,boolean,text,text,inet,text\) FROM authenticated;/);
// Sergey 17.10.2026: no forced cut-off for 1.2 authors; clause 22.4 restriction is not used.
assert.doesNotMatch(clean, /grace/i, 'migration has no grace / cut-off logic');
assert.doesNotMatch(switchCurrent, /grace_until|:'/, 'switch script takes no cut-off date');
assert.doesNotMatch(clean.match(/FUNCTION public\.author_has_accepted_current_terms[\s\S]*?\$\$;/)[0], /clock_timestamp|now\(\)|interval/i, 'commercial gate is not time-bound');
assert.match(switchCurrent, /SET commercial_access_continues = true\s+WHERE id = '9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902';/, 'only 1.2 keeps commercial access');
{
  // Commercial application approval uses the same flag-independent gate (no hidden is_current-only check).
  const approve = clean.match(/FUNCTION public\.approve_author_commercial_application\([\s\S]*?\$\$;/)[0];
  assert.equal((approve.match(/public\.author_has_accepted_current_terms\(v_row\.author_id\)/g) ?? []).length, 2, 'approve: both terms checks via author_has_accepted_current_terms');
  assert.doesNotMatch(approve, /is_current/, 'approve: no is_current-only terms join');
  assert.doesNotMatch(approve, /clock_timestamp|now\(\)|interval/i, 'approve: no time-bound gate');
  assert.match(rollbackMigration, /FUNCTION public\.approve_author_commercial_application\(/, 'rollback restores the original approve body');
}
assert.match(rollbackSwitch, /GRANT EXECUTE ON FUNCTION public\.author_business_product_optin\(uuid\[\],boolean,boolean,text,text,inet,text\) TO authenticated;/);
// Every new write path checks the DB activation gate; sync and review share the per-track lock.
for (const fn of ['author_business_verification_submit_v3', 'moderator_business_track_review', 'business_catalog_sync_run']) {
  const body = clean.match(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?\\$\\$;`))[0];
  assert.match(body, /business_unified_agreement_active\(\)/, `${fn} gated by activation`);
}
{
  const review = clean.match(/FUNCTION public\.moderator_business_track_review\([\s\S]*?\$\$;/)[0];
  assert.ok(review.indexOf('business_author_lock') > 0 && review.indexOf('business_author_lock') < review.indexOf('business_track_lock'), 'review: author lock before track lock');
  const run = clean.match(/FUNCTION public\.business_catalog_sync_run\([\s\S]*?\$\$;/)[0];
  assert.ok(run.indexOf('business_author_lock') > 0 && run.indexOf('business_author_lock') < run.indexOf('business_track_lock'), 'sync: author lock before track locks');
  assert.match(run, /ORDER BY ai\.id/, 'tracks locked in ascending id');
  const draft3 = clean.match(/FUNCTION public\.author_business_verification_draft_v3\([\s\S]*?\$\$;/)[0];
  assert.match(draft3, /business_unified_agreement_active\(\)/);
  assert.match(draft3, /business_consent_caller_in_support_mode/);
  assert.doesNotMatch(draft3 + clean.match(/FUNCTION public\.author_business_verification_submit_v3[\s\S]*?\$\$;/)[0], /business_onboarding_product\(/, 'unified rights check never requires the whole album to be published');
  assert.match(clean, /RENAME TO resolve_business_track_eligibility_v1/);
  assert.match(clean, /FUNCTION public\.resolve_business_track_eligibility\([\s\S]*?resolve_business_track_eligibility_v1\(/);
  assert.match(clean, /WHERE source_type = 'platform_agreement' AND status IN \('draft', 'verified'\) AND valid_until IS NULL;/);
  assert.match(rollbackMigration, /RENAME TO resolve_business_track_eligibility;/);
}
assert.match(clean.match(/FUNCTION public\.moderator_business_track_review\([\s\S]*?\$\$;/)[0], /business_track_lock/);
assert.match(clean.match(/FUNCTION public\.business_catalog_sync_run\([\s\S]*?\$\$;/)[0], /business_track_lock/);
assert.match(clean, /CREATE UNIQUE INDEX IF NOT EXISTS music_rights_grants_platform_agreement_open_uidx/);
for (const t of ['author_terms_acceptances', 'business_rightsholder_verifications', 'practices', 'audio_items']) {
  assert.match(clean, new RegExp(`CREATE TRIGGER zz_business_unified_auto_sync_\\w+ AFTER (INSERT|UPDATE) ON public\\.${t}`), `auto inflow on ${t}`);
  assert.match(rollbackMigration, new RegExp(`DROP TRIGGER IF EXISTS zz_business_unified_auto_sync_\\w+ ON public\\.${t}`), `rollback drops trigger on ${t}`);
}
assert.match(clean, /business_catalog_sync\(p_author_id uuid, p_dry_run boolean DEFAULT true\)/, 'dry run is the default');
const submitV3 = clean.match(/FUNCTION public\.author_business_verification_submit_v3[\s\S]*?\$\$;/)[0];
assert.ok(submitV3.indexOf('business_consent_caller_in_support_mode') < submitV3.indexOf('FOR UPDATE'), 'support guard first');
assert.match(submitV3, /business_unified_agreement_required/);
// Rollout SQL: the hash/version id in the docs equal the code edition.
const textMatch = v2.match(/export const AUTHOR_TERMS_V2_TEXT = `([\s\S]*)`;\s*$/);
const hash = createHash('sha256').update(textMatch[1], 'utf8').digest('hex');
assert.match(v2, new RegExp(`contentHash: "${hash}"`), 'meta hash = sha256(text)');
const versionId = v2.match(/versionId: "([0-9a-f-]{36})"/)[1];
for (const sql of [insert20, switchCurrent]) {
  assert.ok(sql.includes(hash) && sql.includes(versionId), 'rollout SQL uses the code hash and id');
}
assert.match(insert20, /ON CONFLICT \(id\) DO NOTHING/);
assert.match(insert20, /edition_2_0_duplicate_hash/);
assert.match(insert20, /\n  false,\n  true,\n/, 'inserted as NOT current, covers_business = true');
const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.scripts['test:unified-agreement'].includes('unified-agreement-sql-unit.mjs'));
assert.match(read('.github/workflows/business-pr-validation.yml'), /npm run test:unified-agreement/);

const stub = read('scripts/lib/business-rights-eligibility-sql-stub.sql') + `
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text);
CREATE TABLE public.platform_user_roles(user_id uuid, role_code text);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb, UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
CREATE TABLE public.author_support_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE,
  actor_user_id uuid NOT NULL, acting_user_id uuid NOT NULL, acting_author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz NULL);
REVOKE ALL ON public.author_support_sessions FROM PUBLIC, anon, authenticated;
-- Commercial applications (only what approve_author_commercial_application needs; real bodies live in
-- 20260725230000 / 20260727180000). Used to prove 1.2 authors keep commercial activation after 2.0.
ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'free';
CREATE TABLE public.author_commercial_applications(id uuid PRIMARY KEY, author_id uuid NOT NULL REFERENCES public.authors(id), status text NOT NULL);
CREATE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE AS
  $f$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN ('platform_admin','platform_owner')) $f$;
CREATE FUNCTION public.transition_author_commercial_application_status(p_id uuid, p_status text, p_comment text, p_reason text)
  RETURNS jsonb LANGUAGE sql AS $f$ UPDATE public.author_commercial_applications SET status = p_status WHERE id = p_id RETURNING jsonb_build_object('idempotent', false) $f$;
CREATE FUNCTION public.set_author_access_status_for_commercial_application(p_author_id uuid, p_new_status text, p_changed_by uuid, p_reason text, p_application_id uuid)
  RETURNS text LANGUAGE sql AS $f$ UPDATE public.authors SET access_status = p_new_status WHERE id = p_author_id RETURNING access_status $f$;
`;
// author_terms tables exactly as 20260728140000 (tables + indexes only).
const termsTables = read('supabase/migrations/20260728140000_author_terms_acceptance.sql')
  .match(/CREATE TABLE IF NOT EXISTS public\.author_terms_versions[\s\S]*?author_terms_acceptances_author_version_uidx[\s\S]*?;/)[0];

const A = '00000000-0000-0000-0000-00000000000a'; // owner of space A (e.g. Sergey's own music)
const B = '00000000-0000-0000-0000-00000000000b'; // author on 1.2 only
const M = '00000000-0000-0000-0000-00000000000c'; // moderator
const C = '00000000-0000-0000-0000-00000000000d'; // author on 1.1 only (never accepted 1.2)
const fixtures = String.raw`
CREATE SCHEMA ua_test;
CREATE FUNCTION ua_test.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || expected || '%' THEN RAISE EXCEPTION 'expected %, got %: %',expected,SQLERRM,command; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error %, succeeded: %', expected, command;
END $f$;
CREATE FUNCTION ua_test.ok(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', message; END IF; END $f$;
GRANT USAGE ON SCHEMA ua_test TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ua_test TO authenticated;
CREATE FUNCTION ua_test.as_user(p uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claim.sub', p::text, false), set_config('request.jwt.claim.role','authenticated',false);
$f$;

INSERT INTO auth.users(id) VALUES ('${A}'),('${B}'),('${M}'),('${C}');
INSERT INTO public.profiles VALUES ('${A}','listener'),('${B}','listener'),('${M}','platform_admin'),('${C}','listener');
INSERT INTO public.authors(id,slug) VALUES ('10000000-0000-0000-0000-00000000000a','space-a'),('10000000-0000-0000-0000-00000000000b','space-b'),('10000000-0000-0000-0000-00000000000d','space-c');
INSERT INTO public.author_members(author_id,user_id,role) VALUES
 ('10000000-0000-0000-0000-00000000000a','${A}','owner'),('10000000-0000-0000-0000-00000000000b','${B}','owner'),
 ('10000000-0000-0000-0000-00000000000d','${C}','owner');
INSERT INTO public.practices(id,author_id,slug,status) VALUES
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','aurafon','published'),
 ('20000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a','jazz-relax','published'),
 ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','prod-b','published');
INSERT INTO public.audio_items(id,practice_id,title,position) VALUES
 ('30000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a','Aurafon 1',1),
 ('30000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-00000000000a','Aurafon 2',2),
 ('30000000-0000-0000-0000-0000000000a3','20000000-0000-0000-0000-0000000000a2','Jazz Relax 1',1),
 ('30000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-00000000000b','Track B',1);
-- Editions 1.2 (current) and acceptances of A and B on 1.2 (historical rows that must stay untouched).
INSERT INTO public.author_terms_versions(id,version,title,published_at,effective_at,content_hash,document_key,is_current)
 VALUES ('9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902','1.2','v1.2','2026-09-13','2026-09-13',repeat('1',64),'author-terms',true),
        ('8a3aaabe-8a12-4d58-8c4c-77bc2ba1a901','1.1','v1.1','2026-09-01','2026-09-01',repeat('2',64),'author-terms',false);
INSERT INTO public.author_terms_acceptances(id,author_id,terms_version_id,accepted_by_user_id,acceptance_text) VALUES
 ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902','${A}','1.2'),
 ('40000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902','${B}','1.2'),
 ('40000000-0000-0000-0000-00000000000d','10000000-0000-0000-0000-00000000000d','8a3aaabe-8a12-4d58-8c4c-77bc2ba1a901','${C}','1.1');
-- A pre-existing grant from another source on Aurafon 1 (recording layer): must stay byte-identical.
INSERT INTO public.music_rightsholders(id,display_name,entity_type) VALUES ('50000000-0000-0000-0000-0000000000ff','Legacy holder','person');
INSERT INTO public.music_rights_grants(id,audio_item_id,rightsholder_id,rights_layer,use_type,territory_scope,valid_from,source_type,status,verified_at)
 VALUES ('60000000-0000-0000-0000-0000000000ff','30000000-0000-0000-0000-0000000000a3','50000000-0000-0000-0000-0000000000ff','recording','business_background_playback','worldwide','2026-10-01','other','verified','2026-10-01');
CREATE TABLE ua_test.snap AS SELECT 'grant' AS k, to_jsonb(g) AS row FROM public.music_rights_grants g
  UNION ALL SELECT 'acc', to_jsonb(a) FROM public.author_terms_acceptances a;
`;

const beforeSwitch = String.raw`
DO $t$ BEGIN
  PERFORM ua_test.ok(public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000b'), '1.2 still current: B commercial');
  PERFORM ua_test.ok(NOT public.author_has_business_agreement('10000000-0000-0000-0000-00000000000a'), '1.2 never covers Business');
  PERFORM ua_test.ok((SELECT NOT covers_business FROM public.author_terms_versions WHERE version = '1.2'), 'default covers_business=false');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.author_terms_versions WHERE commercial_access_continues), 'migration flags no edition (inert)');
  PERFORM ua_test.ok(NOT public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000d'), '1.1-only author: strict today (unchanged)');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM information_schema.columns WHERE table_name = 'author_terms_versions' AND column_name = 'reaccept_grace_until'), 'no grace/cut-off column');
  PERFORM ua_test.ok((SELECT count(*) = 1 FROM public.author_terms_versions WHERE version = '2.0' AND NOT is_current AND covers_business), '2.0 inserted, not current');
  PERFORM ua_test.ok((SELECT version = '1.2' FROM public.author_terms_versions WHERE is_current), 'insert does not switch');
  -- Inactive (flag off / 1.2 current): legacy flow unchanged, new paths refuse, auto inflow inert.
  PERFORM ua_test.ok(NOT public.business_unified_agreement_active(), 'unified model inactive before switch');
  PERFORM ua_test.ok(has_function_privilege('authenticated','public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text)','EXECUTE'), 'legacy opt-in still callable');
  PERFORM ua_test.as_user('${B}');
  SET LOCAL ROLE authenticated;
  PERFORM ua_test.expect_error('SELECT public.author_business_verification_submit_v3(gen_random_uuid(),ARRAY[]::uuid[])', 'business_unified_agreement_inactive');
  RESET ROLE;
  PERFORM ua_test.as_user('${M}');
  SET LOCAL ROLE authenticated;
  PERFORM ua_test.expect_error('SELECT public.moderator_business_track_review(''30000000-0000-0000-0000-0000000000b1'',''admitted'',''ok'')', 'business_unified_agreement_inactive');
  PERFORM ua_test.ok((SELECT public.business_catalog_sync('10000000-0000-0000-0000-00000000000a', false)->'reasons' ? 'unified_agreement_inactive'), 'sync refuses while inactive');
  RESET ROLE;
  UPDATE public.audio_items SET status = 'published' WHERE id = '30000000-0000-0000-0000-0000000000a1';
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.music_rights_grants WHERE source_type = 'platform_agreement'), 'auto inflow inert while inactive');
  -- Commercial approval before the switch: exactly the old rule (accepted current 1.2 → active; 1.1-only → onboarding).
  INSERT INTO public.author_commercial_applications(id,author_id,status) VALUES
    ('70000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-00000000000b','submitted'),
    ('70000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-00000000000d','submitted');
  PERFORM ua_test.as_user('${M}');
  PERFORM public.approve_author_commercial_application('70000000-0000-0000-0000-0000000000b1');
  PERFORM public.approve_author_commercial_application('70000000-0000-0000-0000-0000000000d1');
  PERFORM ua_test.ok((SELECT access_status = 'commercial_active' FROM public.authors WHERE id = '10000000-0000-0000-0000-00000000000b'), 'before switch: 1.2 author activated on approve');
  PERFORM ua_test.ok((SELECT access_status = 'commercial_onboarding' FROM public.authors WHERE id = '10000000-0000-0000-0000-00000000000d'), 'before switch: 1.1-only author stays onboarding');
  UPDATE public.authors SET access_status = 'free' WHERE id IN ('10000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000d');
END $t$;
`;

const scenario = String.raw`
DO $t$
DECLARE v uuid; e1 public.business_verification_evidence; e2 public.business_verification_evidence; s text; r jsonb; sess uuid;
  v20 uuid := (SELECT id FROM public.author_terms_versions WHERE version = '2.0');
BEGIN
  -- After switch: 1.2 keeps its commercial gates with NO end date, never Business. Nobody auto-accepted.
  PERFORM ua_test.ok((SELECT version = '2.0' FROM public.author_terms_versions WHERE is_current), '2.0 current');
  PERFORM ua_test.ok((SELECT commercial_access_continues FROM public.author_terms_versions WHERE version = '1.2'), '1.2 flagged commercial_access_continues');
  PERFORM ua_test.ok((SELECT count(*) = 1 FROM public.author_terms_versions WHERE commercial_access_continues), 'only 1.2 flagged');
  PERFORM ua_test.ok(public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000b'), '1.2 keeps B commercial');
  PERFORM ua_test.ok(NOT public.author_has_business_agreement('10000000-0000-0000-0000-00000000000b'), '1.2 never opens Business');
  PERFORM ua_test.ok(NOT public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000d'), '1.1-only author unchanged (strict, as before 2.0)');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.author_terms_acceptances WHERE terms_version_id = v20), 'no auto-acceptance of 2.0');
  PERFORM ua_test.ok(NOT public.author_has_accepted_current_terms('10000000-0000-0000-0000-0000000000ee'), 'unknown author false');
  -- No forced cut-off (Sergey 17.10, still binding 18.10): a 1.2 author approved AFTER the switch is still
  -- activated commercially without accepting 2.0; a 1.1-only author is unchanged (onboarding). No date involved.
  INSERT INTO public.author_commercial_applications(id,author_id,status) VALUES
    ('70000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-00000000000b','submitted'),
    ('70000000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-00000000000d','submitted');
  PERFORM ua_test.as_user('${M}');
  r := public.approve_author_commercial_application('70000000-0000-0000-0000-0000000000b2');
  PERFORM ua_test.ok(r->>'access_status' = 'commercial_active', 'after switch: 1.2 author activated on approve (no 2.0 needed): ' || r::text);
  r := public.approve_author_commercial_application('70000000-0000-0000-0000-0000000000d2');
  PERFORM ua_test.ok(r->>'access_status' = 'commercial_onboarding', 'after switch: 1.1-only author unchanged: ' || r::text);
  PERFORM ua_test.ok(NOT public.author_has_business_agreement('10000000-0000-0000-0000-00000000000b'), 'commercial activation never opens Business');

  -- B: rights check without personal 2.0 acceptance → refused.
  PERFORM ua_test.as_user('${B}');
  SET LOCAL ROLE authenticated;
  r := public.author_commercial_agreement_state('10000000-0000-0000-0000-00000000000b');
  PERFORM ua_test.ok((r->>'reaccept_invited')::boolean AND (r->>'previous_edition_active')::boolean AND NOT (r->>'business_agreement')::boolean AND NOT (r ? 'grace_until') AND NOT (r ? 'in_grace'), 'B state: invitation notice, 1.2 active, no Business, no date');
  PERFORM ua_test.expect_error('SELECT public.author_commercial_agreement_state(''10000000-0000-0000-0000-00000000000a'')', 'author_membership_required');
  EXECUTE 'SELECT public.author_business_verification_draft_v2(''20000000-0000-0000-0000-00000000000b'',''30000000-0000-0000-0000-0000000000b1'',''suno'',NULL,''B'',''https://suno.com/s/bbb'',''{"paid_plan":"Pro"}''::jsonb)' INTO v;
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('a',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('b',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  PERFORM ua_test.expect_error(format('SELECT public.author_business_verification_submit_v3(%L,ARRAY[%L,%L]::uuid[])',v,e1.id,e2.id), 'business_unified_agreement_required');
  -- Per-product opt-in is no longer callable by clients.
  PERFORM ua_test.expect_error('SELECT public.author_business_product_optin(ARRAY[''20000000-0000-0000-0000-00000000000b'']::uuid[],true,true,''x'',''x'')', 'permission denied');
  PERFORM ua_test.expect_error('SELECT public.business_catalog_sync(''10000000-0000-0000-0000-00000000000b'')', 'business_moderator_required');
  PERFORM ua_test.expect_error('SELECT public.moderator_business_track_review(''30000000-0000-0000-0000-0000000000b1'',''admitted'',''ok'')', 'business_moderator_required');
  PERFORM ua_test.expect_error('SELECT public.author_business_agreement_acceptance(''10000000-0000-0000-0000-00000000000b'')', 'permission denied');
  RESET ROLE;

  -- A personally accepts 2.0 (the app writes this row on the owner's own click).
  INSERT INTO public.author_terms_acceptances(author_id,terms_version_id,accepted_by_user_id,acceptance_text)
    VALUES ('10000000-0000-0000-0000-00000000000a',v20,'${A}','2.0 text');
  PERFORM ua_test.ok(public.author_has_business_agreement('10000000-0000-0000-0000-00000000000a'), 'A has Business agreement');

  -- Aurafon also has an unpublished track: the legacy draft refuses the whole album, the unified one does not.
  INSERT INTO public.audio_items(id,practice_id,title,position,status) VALUES ('30000000-0000-0000-0000-0000000000a0','20000000-0000-0000-0000-00000000000a','Aurafon demo',9,'draft');
  PERFORM ua_test.as_user('${A}');
  SET LOCAL ROLE authenticated;
  PERFORM ua_test.expect_error('SELECT public.author_business_verification_draft_v2(''20000000-0000-0000-0000-00000000000a'',''30000000-0000-0000-0000-0000000000a1'',''suno'',NULL,''Spa'',''https://suno.com/s/abc'',''{"paid_plan":"Pro"}''::jsonb)', 'business_track_not_published');
  PERFORM ua_test.expect_error('SELECT public.author_business_verification_draft_v3(''20000000-0000-0000-0000-00000000000a'',''30000000-0000-0000-0000-0000000000a0'',''suno'',NULL,''Spa'',''https://suno.com/s/abc'',''{"paid_plan":"Pro"}''::jsonb)', 'business_track_not_in_product');
  PERFORM ua_test.expect_error('SELECT public.author_business_verification_draft_v3(''20000000-0000-0000-0000-00000000000b'',''30000000-0000-0000-0000-0000000000b1'',''suno'',NULL,''Spa'',''https://suno.com/s/abc'',''{"paid_plan":"Pro"}''::jsonb)', 'business_product_not_owned');
  EXECUTE 'SELECT public.author_business_verification_draft_v3(''20000000-0000-0000-0000-00000000000a'',''30000000-0000-0000-0000-0000000000a1'',''suno'',NULL,''Spa'',''https://suno.com/s/abc'',''{"paid_plan":"Pro"}''::jsonb)' INTO v;
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('c',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('d',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  s := format('SELECT public.author_business_verification_submit_v3(%L,ARRAY[%L,%L]::uuid[],NULL,%L)',v,e1.id,e2.id,'UA');
  RESET ROLE;
  -- Support session open for A → refused even for A's own space (PR 1 guard).
  INSERT INTO public.author_support_sessions(token_hash,actor_user_id,acting_user_id,acting_author_id,expires_at)
    VALUES(repeat('e',64),'${A}','${B}','10000000-0000-0000-0000-00000000000b',now() + interval '1 hour') RETURNING id INTO sess;
  SET LOCAL ROLE authenticated;
  PERFORM ua_test.expect_error(s, 'support_mode_consent_forbidden');
  RESET ROLE;
  UPDATE public.author_support_sessions SET revoked_at = now() WHERE id = sess;
  SET LOCAL ROLE authenticated;
  EXECUTE s;
  RESET ROLE;
  PERFORM ua_test.ok((SELECT status = 'submitted' FROM public.business_rightsholder_verifications WHERE id = v), 'submitted');
  PERFORM ua_test.ok((SELECT snapshot->'agreement'->>'version' = '2.0' AND snapshot->'agreement'->>'content_hash' = (SELECT content_hash FROM public.author_terms_versions WHERE id = v20)
     AND jsonb_array_length(snapshot->'consent_ids') = 0 FROM public.business_rightsholder_verification_attempts WHERE verification_id = v), 'attempt snapshots the 2.0 acceptance');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.business_legal_consents), 'no legacy consents written');

  -- Catalogue sync: not ready before the rights check is verified.
  PERFORM ua_test.as_user('${M}');
  r := public.business_catalog_sync('10000000-0000-0000-0000-00000000000a');
  PERFORM ua_test.ok(r->>'status' = 'not_ready' AND r->'reasons' ? 'rights_check_not_verified', 'not ready before verification');
  PERFORM ua_test.as_user('${M}');
  SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_verification_action(v,'approve','ok',NULL,'Synthetic A','person');
  -- Automatic inflow: the verification approval alone brought A's suitable tracks into Business.
  r := public.business_catalog_sync('10000000-0000-0000-0000-00000000000a');
  RESET ROLE;
  PERFORM ua_test.ok((SELECT count(*) = 4 FROM public.music_rights_grants WHERE source_type = 'platform_agreement' AND status = 'verified'), 'auto inflow after rights check: 2 tracks x 2 layers');
  PERFORM ua_test.ok(r->>'status' = 'ok' AND (r->>'dry_run')::boolean AND (r->>'created_grants')::int = 0 AND jsonb_array_length(r->'ready') = 0 AND jsonb_array_length(r->'skipped') = 3, 'dry run after inflow: nothing left, 3 skipped: ' || r::text);
  -- B (1.2 only) is not ready: no personal 2.0 acceptance.
  PERFORM ua_test.as_user('${M}');
  r := public.business_catalog_sync('10000000-0000-0000-0000-00000000000b', false);
  PERFORM ua_test.ok(r->>'status' = 'not_ready' AND r->'reasons' ? 'unified_agreement_not_accepted', 'B not ready');
  -- Real run as service (no JWT user).
  PERFORM set_config('request.jwt.claim.sub','',false);
  PERFORM set_config('request.jwt.claim.role','service_role',false);
  r := public.business_catalog_sync('10000000-0000-0000-0000-00000000000a', false);
  -- Jazz Relax 1 has a foreign-holder grant → skipped, untouched; the 4 grants already exist (no duplicates).
  PERFORM ua_test.ok((r->>'created_grants')::int = 0 AND r->'skipped' @> '[{"audio_item_id":"30000000-0000-0000-0000-0000000000a1","reason":"already_granted"}]', 'manual run idempotent after auto inflow: ' || r::text);
  PERFORM ua_test.ok(r->'skipped' @> '[{"audio_item_id":"30000000-0000-0000-0000-0000000000a3","reason":"other_rightsholder_grant"}]', 'foreign grant track skipped');
  PERFORM ua_test.ok((SELECT count(*) = 4 FROM public.music_rights_grants WHERE source_type = 'platform_agreement' AND status = 'verified'
     AND territory_scope = 'countries' AND source_reference LIKE 'author-terms:2.0:acceptance:%'), 'grants: verified, RU, sourced to the 2.0 acceptance');
  PERFORM ua_test.ok((SELECT count(*) = 4 FROM public.music_rights_grant_countries WHERE country_code = 'RU' AND effect = 'include'), 'RU territory rows');
  r := public.business_catalog_sync('10000000-0000-0000-0000-00000000000a', false);
  PERFORM ua_test.ok((r->>'created_grants')::int = 0, 'idempotent re-run');

  -- Per-track control: moderator blocks Aurafon 2 → its agreement grants revoked; others intact.
  PERFORM ua_test.as_user('${M}');
  SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_track_review('30000000-0000-0000-0000-0000000000a2','blocked','rights_revoked_or_disputed','dispute');
  PERFORM ua_test.expect_error('SELECT public.moderator_business_track_review(''30000000-0000-0000-0000-0000000000a2'',''admitted'',''rights_revoked_or_disputed'')', 'check constraint');
  PERFORM ua_test.expect_error('UPDATE public.business_track_eligibility_reviews SET comment = ''x''', 'permission denied');
  RESET ROLE;
  PERFORM ua_test.ok((SELECT count(*) = 2 AND bool_and(status = 'revoked' AND ceased_at IS NOT NULL) FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a2'), 'blocked track grants revoked');
  PERFORM ua_test.ok((SELECT count(*) = 2 AND bool_and(status = 'verified') FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1'), 'other track untouched');
  r := public.business_catalog_sync('10000000-0000-0000-0000-00000000000a', false);
  PERFORM ua_test.ok((r->>'created_grants')::int = 0 AND r->'skipped' @> '[{"audio_item_id":"30000000-0000-0000-0000-0000000000a2","reason":"review_blocked"}]', 'blocked track not re-synced');
  -- RLS: B cannot see A's reviews; A can.
  PERFORM ua_test.as_user('${B}');
  SET LOCAL ROLE authenticated;
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.business_track_eligibility_reviews), 'B sees no foreign reviews');
  RESET ROLE;
  PERFORM ua_test.as_user('${A}');
  SET LOCAL ROLE authenticated;
  PERFORM ua_test.ok((SELECT count(*) = 1 FROM public.business_track_eligibility_reviews), 'A sees own track review');
  PERFORM ua_test.expect_error('SELECT public.business_catalog_sync(''10000000-0000-0000-0000-00000000000a'', false)', 'business_moderator_required');
  RESET ROLE;

  -- Historical rows untouched (pre-existing grant and acceptances byte-identical).
  PERFORM ua_test.ok((SELECT bool_and(s.row = to_jsonb(g)) FROM ua_test.snap s JOIN public.music_rights_grants g ON s.k = 'grant' AND g.id = (s.row->>'id')::uuid), 'pre-existing grant untouched');
  PERFORM ua_test.ok((SELECT count(*) = 3 AND bool_and(s.row = to_jsonb(a)) FROM ua_test.snap s JOIN public.author_terms_acceptances a ON s.k = 'acc' AND a.id = (s.row->>'id')::uuid), 'acceptances untouched');

  -- No cut-off: B (1.2 only) keeps the commercial gate at any time; A accepted 2.0.
  PERFORM ua_test.ok(public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000b'), 'B still commercial (no end date)');
  PERFORM ua_test.ok(NOT public.author_has_business_agreement('10000000-0000-0000-0000-00000000000b'), 'B still no Business without 2.0');
  PERFORM ua_test.ok(public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000a'), 'A accepted 2.0');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.author_terms_acceptances WHERE author_id = '10000000-0000-0000-0000-00000000000b' AND terms_version_id = v20), 'B never auto-accepted 2.0');
END $t$;
`;

const scenario2 = String.raw`
DO $t$
DECLARE r jsonb;
  A_ uuid := '10000000-0000-0000-0000-00000000000a';
  a4 uuid := '30000000-0000-0000-0000-0000000000a4'; a5 uuid := '30000000-0000-0000-0000-0000000000a5';
BEGIN
  -- Auto inflow on publish: a draft track gets nothing; publishing it brings both layers in.
  INSERT INTO public.audio_items(id,practice_id,title,position,status) VALUES (a5,'20000000-0000-0000-0000-00000000000a','Aurafon 3',3,'draft');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.music_rights_grants WHERE audio_item_id = a5), 'draft track: no grants');
  UPDATE public.audio_items SET status = 'published' WHERE id = a5;
  PERFORM ua_test.ok((SELECT count(*) = 2 AND bool_and(status = 'verified' AND source_type = 'platform_agreement') FROM public.music_rights_grants WHERE audio_item_id = a5), 'published track flowed in automatically');

  -- Historical restriction: an expired Business grant (another holder) blocks automatic inflow.
  INSERT INTO public.audio_items(id,practice_id,title,position,status) VALUES (a4,'20000000-0000-0000-0000-0000000000a2','Jazz Relax 2',2,'draft');
  INSERT INTO public.music_rights_grants(id,audio_item_id,rightsholder_id,rights_layer,use_type,territory_scope,valid_from,valid_until,source_type,status,verified_at)
    VALUES ('60000000-0000-0000-0000-0000000000fe',a4,'50000000-0000-0000-0000-0000000000ff','recording','business_background_playback','worldwide','2026-01-01','2026-06-01','other','verified','2026-01-01');
  UPDATE public.audio_items SET status = 'published' WHERE id = a4;
  PERFORM ua_test.ok((SELECT count(*) = 1 FROM public.music_rights_grants WHERE audio_item_id = a4), 'expired restriction: no automatic grants');
  r := public.business_catalog_sync(A_, true);
  PERFORM ua_test.ok(r->'skipped' @> jsonb_build_array(jsonb_build_object('audio_item_id', a4, 'reason', 'historical_rights_restriction')), 'restriction reported: ' || r::text);
  -- Explicit admission by a moderator lifts it and the track flows in.
  PERFORM ua_test.as_user('${M}');
  SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_track_review(a4,'admitted','ok','rights confirmed');
  -- Blocked Aurafon 2 is re-admitted: new grants, the revoked rows stay as history.
  PERFORM public.moderator_business_track_review('30000000-0000-0000-0000-0000000000a2','admitted','ok','dispute resolved');
  RESET ROLE;
  PERFORM ua_test.ok((SELECT count(*) = 2 FROM public.music_rights_grants WHERE audio_item_id = a4 AND source_type = 'platform_agreement' AND status = 'verified'), 'admitted after restriction: inflow');
  PERFORM ua_test.ok((SELECT count(*) FILTER (WHERE status = 'revoked') = 2 AND count(*) FILTER (WHERE status = 'verified') = 2 FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a2'), 're-admitted: new grants, revoked history kept');
  -- A rights revocation made outside the review flow (e.g. a grant revoked by the rights team) is a
  -- restriction too: no sync or later event restores the track without an explicit admission.
  UPDATE public.music_rights_grants SET status = 'revoked', updated_at = clock_timestamp()
    WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1' AND rights_layer = 'recording' AND source_type = 'platform_agreement';
  PERFORM set_config('request.jwt.claim.sub','',false);
  PERFORM set_config('request.jwt.claim.role','service_role',false);
  r := public.business_catalog_sync(A_, false);
  PERFORM ua_test.ok(r->'skipped' @> '[{"audio_item_id":"30000000-0000-0000-0000-0000000000a1","reason":"historical_rights_restriction"}]'
     AND (SELECT count(*) = 0 FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1' AND rights_layer = 'recording' AND status = 'verified'), 'revoked grant never restored by sync: ' || r::text);
  UPDATE public.audio_items SET title = 'Aurafon 1 (remaster)' WHERE id = '30000000-0000-0000-0000-0000000000a1';
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1' AND rights_layer = 'recording' AND status = 'verified'), 'revoked grant not restored by a later event');

  -- Expired agreement grants are history: after an explicit admission the track gets open-ended replacements.
  INSERT INTO public.audio_items(id,practice_id,title,position,status) VALUES ('30000000-0000-0000-0000-0000000000a7','20000000-0000-0000-0000-0000000000a2','Jazz Relax 3',3,'draft');
  INSERT INTO public.music_rights_grants(audio_item_id,rightsholder_id,rights_layer,use_type,territory_scope,valid_from,valid_until,source_type,source_reference,status,verified_at)
    SELECT '30000000-0000-0000-0000-0000000000a7', rightsholder_id, l, 'business_background_playback', 'worldwide', '2026-01-01', '2026-06-01', 'platform_agreement', 'author-terms:2.0:legacy-test', 'verified', '2026-01-01'
    FROM (SELECT rightsholder_id FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1' LIMIT 1) h, unnest(ARRAY['recording','composition']) l;
  UPDATE public.audio_items SET status = 'published' WHERE id = '30000000-0000-0000-0000-0000000000a7';
  PERFORM ua_test.ok((SELECT count(*) = 2 FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a7'), 'expired agreement grants: no automatic replacement');
  PERFORM ua_test.as_user('${M}');
  SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_track_review('30000000-0000-0000-0000-0000000000a7','admitted','ok',NULL);
  RESET ROLE;
  PERFORM ua_test.ok((SELECT count(*) FILTER (WHERE valid_until IS NULL AND status = 'verified') = 2 AND count(*) FILTER (WHERE valid_until IS NOT NULL) = 2
     FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a7'), 'readmitted after expiry: 2 new open grants, expired history kept');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.business_catalog_sync_failures), 'no sync failures so far');

  -- Playback enforces per-track admission: a blocked track is INELIGIBLE whatever grants exist.
  INSERT INTO public.business_organizations(id,name) VALUES ('70000000-0000-0000-0000-000000000001','Spa Org');
  INSERT INTO public.business_locations(id,organization_id,name,business_category,country_code) VALUES ('70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','Spa','spa','RU');
  PERFORM ua_test.as_user('${M}');
  SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_track_review(a5,'blocked','rights_revoked_or_disputed',NULL);
  RESET ROLE;
  r := public.resolve_business_track_eligibility(a5, '70000000-0000-0000-0000-000000000002');
  PERFORM ua_test.ok(r->>'decision' = 'INELIGIBLE' AND r->'reason_codes' ? 'BUSINESS_TRACK_ADMISSION_BLOCKED', 'blocked track not playable: ' || r::text);
  PERFORM ua_test.ok(public.resolve_business_track_eligibility('30000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-000000000002')
     = public.resolve_business_track_eligibility_v1('30000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-000000000002', NULL, 'business_background_playback', now()), 'no review: identical to v1');
  r := public.resolve_business_track_eligibility(a5, '70000000-0000-0000-0000-000000000002', NULL, 'business_background_playback', now() - interval '1 day');
  PERFORM ua_test.ok(NOT (r->'reason_codes' ? 'BUSINESS_TRACK_ADMISSION_BLOCKED'), 'as_of before the decision: not blocked');
  PERFORM ua_test.ok(NOT has_function_privilege('service_role','public.resolve_business_track_eligibility_v1(uuid,uuid,uuid,text,timestamptz)','EXECUTE')
     AND has_function_privilege('service_role','public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz)','EXECUTE')
     AND NOT has_function_privilege('authenticated','public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz)','EXECUTE'), 'resolver grants');

  -- A failing automatic sync never breaks the triggering write and is recorded for retry.
  CREATE FUNCTION ua_test.boom() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN RAISE EXCEPTION 'injected_failure'; END $b$;
  CREATE TRIGGER ua_boom BEFORE INSERT ON public.music_rights_grant_countries FOR EACH ROW EXECUTE FUNCTION ua_test.boom();
  INSERT INTO public.audio_items(id,practice_id,title,position,status) VALUES ('30000000-0000-0000-0000-0000000000a8','20000000-0000-0000-0000-00000000000a','Aurafon 4',4,'published');
  DROP TRIGGER ua_boom ON public.music_rights_grant_countries;
  PERFORM ua_test.ok((SELECT status = 'published' FROM public.audio_items WHERE id = '30000000-0000-0000-0000-0000000000a8'), 'publish succeeded despite sync failure');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a8'), 'failed sync rolled back as a unit');
  PERFORM ua_test.ok((SELECT count(*) = 1 AND bool_and(error LIKE '%injected_failure%') FROM public.business_catalog_sync_failures WHERE author_id = A_), 'failure recorded');

  -- Idempotency is enforced by the DB, not only by the sync loop.
  PERFORM ua_test.expect_error($q$INSERT INTO public.music_rights_grants(audio_item_id,rightsholder_id,rights_layer,use_type,territory_scope,valid_from,source_type,status)
    SELECT '30000000-0000-0000-0000-0000000000a1', rightsholder_id, 'composition','business_background_playback','worldwide',now(),'platform_agreement','draft'
    FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1' LIMIT 1$q$, 'music_rights_grants_platform_agreement_open_uidx');
  -- Internal runner and lock are not callable by clients.
  PERFORM ua_test.as_user('${A}');
  SET LOCAL ROLE authenticated;
  PERFORM ua_test.expect_error('SELECT public.business_catalog_sync_run(''10000000-0000-0000-0000-00000000000a'', false)', 'permission denied');
  PERFORM ua_test.expect_error('SELECT public.business_track_lock(''30000000-0000-0000-0000-0000000000a1'')', 'permission denied');
  PERFORM ua_test.expect_error('SELECT public.business_unified_auto_sync_authors(ARRAY[''10000000-0000-0000-0000-00000000000a'']::uuid[])', 'permission denied');
  RESET ROLE;
END $t$;
`;

const container = process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER;
if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === '1' || !container) {
  assert.notEqual(process.env.AUDIOLAD_REQUIRE_ONBOARDING_SQL, '1', 'isolated SQL required; provide disposable test container');
  console.log('unified-agreement-sql-unit: contract OK; SQL scenarios SKIPPED (no explicit disposable container)');
} else {
  assert.match(container, /^audiolad-onboarding-test-[a-z0-9-]+$/, 'refusing non-test container');
  const db = `ua_test_${process.pid}_${Date.now()}`;
  const psql = (database, input, extra = []) =>
    execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', ...extra], { input, stdio: ['pipe', 'pipe', 'inherit'] });
  psql('postgres', `CREATE DATABASE ${db};`);
  try {
    const setup = [stub, termsTables,
      read('supabase/migrations/20261205120000_music_rights_foundation.sql'),
      read('supabase/migrations/20261206120200_business_rights_eligibility.sql'),
      read('supabase/migrations/20270101120000_business_rightsholder_onboarding.sql'),
      read('supabase/migrations/20270102120000_business_rightsholder_providers.sql'),
      read('supabase/migrations/20270103120000_business_rightsholder_suno_single_link.sql'),
      read('supabase/migrations/20270105120000_business_consents_block_support_mode.sql'),
      // Production approve body before this migration (function + grants only, no backfill).
      read('supabase/migrations/20261026120100_commercial_activate_on_approve_if_terms.sql')
        .match(/CREATE OR REPLACE FUNCTION public\.approve_author_commercial_application[\s\S]*?TO authenticated, service_role;/)[0]].join('\n');
    psql(db, [setup, fixtures].join('\n'));
    // Rollout must refuse before the migration exists.
    let refused = false;
    try { execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: insert20, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { refused = true; }
    assert.ok(refused, 'insert refuses without the migration');
    // Migration twice (idempotent), 2.0 insert twice (idempotent), switch twice (no-op second time).
    psql(db, `CREATE TABLE ua_test.t0 AS SELECT clock_timestamp() AS t;`);
    psql(db, [migration, migration, insert20].join('\n'));
    // 2.0 dates (Sergey 18.10.2026 15:02): insert holds only a placeholder; re-insert keeps it.
    psql(db, `CREATE TABLE ua_test.d_ins AS SELECT published_at, effective_at FROM public.author_terms_versions WHERE version = '2.0';`);
    psql(db, [insert20, beforeSwitch, String.raw`DO $t$ BEGIN
      PERFORM ua_test.ok((SELECT v.published_at = d.published_at AND v.effective_at = d.effective_at FROM public.author_terms_versions v, ua_test.d_ins d WHERE v.version = '2.0'), 're-insert keeps placeholder dates');
      PERFORM ua_test.ok((SELECT d.published_at >= t.t AND d.published_at <> '2026-10-17T00:00:00+03:00'::timestamptz FROM ua_test.d_ins d, ua_test.t0 t), 'placeholder = insert time, never 17.10');
      PERFORM ua_test.ok((SELECT published_at = '2026-09-13'::timestamptz FROM public.author_terms_versions WHERE version = '1.2'), '1.2 dates untouched by insert');
    END $t$;`].join('\n'));
    psql(db, switchCurrent);
    psql(db, `CREATE TABLE ua_test.d_sw AS SELECT published_at, effective_at FROM public.author_terms_versions WHERE version = '2.0';`);
    psql(db, switchCurrent);
    psql(db, String.raw`DO $t$ BEGIN
      PERFORM ua_test.ok((SELECT s.published_at > d.published_at AND s.effective_at = s.published_at FROM ua_test.d_sw s, ua_test.d_ins d), 'switch sets 2.0 published_at = effective_at = switch moment');
      PERFORM ua_test.ok((SELECT v.published_at = s.published_at AND v.effective_at = s.effective_at FROM public.author_terms_versions v, ua_test.d_sw s WHERE v.version = '2.0'), 'no-op re-switch keeps the switch dates');
      PERFORM ua_test.ok((SELECT published_at = '2026-09-13'::timestamptz AND effective_at = '2026-09-13'::timestamptz FROM public.author_terms_versions WHERE version = '1.2'), '1.2 dates untouched by switch');
    END $t$;`);
    psql(db, scenario);
    psql(db, scenario2);
    // Real concurrency (two sessions): sync vs sync on a track without grants, review vs sync.
    const session = (sql) => new Promise((resolve, reject) => {
      const p = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => { err += d; });
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`session failed: ${err}`))));
      p.stdin.end(sql);
    });
    const later = (ms, fn) => new Promise((r) => setTimeout(r, ms)).then(fn);
    const svc = "SELECT set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','service_role',false);";
    const syncA = `${svc} BEGIN; SELECT public.business_catalog_sync('10000000-0000-0000-0000-00000000000a', false); SELECT pg_sleep(1.5); COMMIT;`;
    await Promise.all([session(syncA), later(300, () => session(syncA))]);
    const reviewA1 = `SELECT ua_test.as_user('${M}'); SET ROLE authenticated; BEGIN; SELECT public.moderator_business_track_review('30000000-0000-0000-0000-0000000000a1','admitted','ok','concurrent'); SELECT pg_sleep(1.5); COMMIT;`;
    await Promise.all([session(reviewA1), later(300, () => session(syncA))]);
    psql(db, String.raw`DO $t$ BEGIN
      PERFORM ua_test.ok((SELECT count(*) = 2 FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a8' AND status = 'verified'), 'concurrent syncs: exactly 2 grants (retry after failure)');
      PERFORM ua_test.ok((SELECT count(*) = 1 FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1' AND rights_layer = 'recording' AND status = 'verified' AND valid_until IS NULL), 'review+sync concurrently: exactly 1 new recording grant');
      PERFORM ua_test.ok((SELECT count(*) = 0 FROM (SELECT 1 FROM public.music_rights_grants WHERE source_type = 'platform_agreement' AND status IN ('draft','verified') AND valid_until IS NULL GROUP BY audio_item_id, rights_layer, use_type HAVING count(*) > 1) d), 'no duplicate open grants');
    END $t$;`);
    // Cabinet status screen reads grant layers with the owner's own session (membership-checked RPC).
    psql(db, String.raw`DO $t$ DECLARE n int; BEGIN
      PERFORM ua_test.as_user('${A}');
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO n FROM public.author_business_track_grant_layers('10000000-0000-0000-0000-00000000000a',
        ARRAY['30000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000b1']::uuid[]);
      PERFORM ua_test.ok(n >= 2, 'owner sees own track grant layers: ' || n);
      SELECT count(*) INTO n FROM public.author_business_track_grant_layers('10000000-0000-0000-0000-00000000000a',
        ARRAY['30000000-0000-0000-0000-0000000000b1']::uuid[]);
      PERFORM ua_test.ok(n = 0, 'foreign track ids filtered out even if passed');
      PERFORM ua_test.expect_error('SELECT * FROM public.author_business_track_grant_layers(''10000000-0000-0000-0000-00000000000b'', ARRAY[''30000000-0000-0000-0000-0000000000b1'']::uuid[])', 'author_membership_required');
      RESET ROLE;
      PERFORM ua_test.ok(NOT has_function_privilege('anon','public.author_business_track_grant_layers(uuid,uuid[])','EXECUTE'), 'anon cannot read grant layers');
    END $t$;`);
    // Rollback: migration rollback refuses while 2.0 is current; switch back first; history kept.
    let blocked = false;
    try { execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: rollbackMigration, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { blocked = true; }
    assert.ok(blocked, 'migration rollback refuses while 2.0 is current');
    psql(db, [rollbackSwitch, rollbackMigration,
      "SELECT 1 / CASE WHEN to_regprocedure('public.business_catalog_sync(uuid,boolean)') IS NULL AND to_regprocedure('public.author_business_verification_submit_v3(uuid,uuid[],inet,text)') IS NULL AND to_regprocedure('public.business_catalog_sync_run(uuid,boolean)') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname LIKE 'zz_business_unified_auto_sync_%') AND to_regprocedure('public.resolve_business_track_eligibility_v1(uuid,uuid,uuid,text,timestamptz)') IS NULL AND has_function_privilege('service_role','public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz)','EXECUTE') AND NOT has_function_privilege('authenticated','public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz)','EXECUTE') THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN to_regprocedure('public.author_business_track_grant_layers(uuid,uuid[])') IS NULL THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN has_function_privilege('authenticated','public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text)','EXECUTE') THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN (SELECT version FROM public.author_terms_versions WHERE is_current) = '1.2' THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.author_terms_versions WHERE commercial_access_continues) THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN to_regprocedure('public.approve_author_commercial_application(uuid,text)') IS NOT NULL AND pg_get_functiondef('public.approve_author_commercial_application(uuid,text)'::regprocedure) LIKE '%atv.is_current = true%' THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN (SELECT count(*) FROM public.author_terms_acceptances) = 4 AND (SELECT count(*) FROM public.business_track_eligibility_reviews) = 6 THEN 1 ELSE 0 END;",
      // Re-apply after rollback works.
      migration].join('\n'));
    console.log('unified-agreement-sql-unit: contract + isolated PostgreSQL scenarios OK');
  } finally {
    psql('postgres', `DROP DATABASE ${db};`);
  }
}

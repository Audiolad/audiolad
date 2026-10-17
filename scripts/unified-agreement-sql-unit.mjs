#!/usr/bin/env node
// 8dcba9d1 / 8d9cd0af PR 2: unified commercial agreement 2.0 (migration 20270106120000 + rollout SQL).
// Contract checks + real PostgreSQL scenarios in an EXPLICIT disposable test container only
// (same harness contract as business-rightsholder-onboarding-sql-unit.mjs; never a production URL).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20270106120000_unified_commercial_agreement.sql');
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
assert.match(rollbackSwitch, /GRANT EXECUTE ON FUNCTION public\.author_business_product_optin\(uuid\[\],boolean,boolean,text,text,inet,text\) TO authenticated;/);
// Every new write path checks the DB activation gate; sync and review share the per-track lock.
for (const fn of ['author_business_verification_submit_v3', 'moderator_business_track_review', 'business_catalog_sync_run']) {
  const body = clean.match(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?\\$\\$;`))[0];
  assert.match(body, /business_unified_agreement_active\(\)/, `${fn} gated by activation`);
}
assert.match(clean.match(/FUNCTION public\.moderator_business_track_review\([\s\S]*?\$\$;/)[0], /business_track_lock/);
assert.match(clean.match(/FUNCTION public\.business_catalog_sync_run\([\s\S]*?\$\$;/)[0], /business_track_lock/);
assert.match(clean, /CREATE UNIQUE INDEX IF NOT EXISTS music_rights_grants_platform_agreement_live_uidx/);
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
`;
// author_terms tables exactly as 20260728140000 (tables + indexes only).
const termsTables = read('supabase/migrations/20260728140000_author_terms_acceptance.sql')
  .match(/CREATE TABLE IF NOT EXISTS public\.author_terms_versions[\s\S]*?author_terms_acceptances_author_version_uidx[\s\S]*?;/)[0];

const A = '00000000-0000-0000-0000-00000000000a'; // owner of space A (e.g. Sergey's own music)
const B = '00000000-0000-0000-0000-00000000000b'; // author on 1.2 only
const M = '00000000-0000-0000-0000-00000000000c'; // moderator
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

INSERT INTO auth.users(id) VALUES ('${A}'),('${B}'),('${M}');
INSERT INTO public.profiles VALUES ('${A}','listener'),('${B}','listener'),('${M}','platform_admin');
INSERT INTO public.authors(id,slug) VALUES ('10000000-0000-0000-0000-00000000000a','space-a'),('10000000-0000-0000-0000-00000000000b','space-b');
INSERT INTO public.author_members(author_id,user_id,role) VALUES
 ('10000000-0000-0000-0000-00000000000a','${A}','owner'),('10000000-0000-0000-0000-00000000000b','${B}','owner');
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
 VALUES ('9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902','1.2','v1.2','2026-09-13','2026-09-13',repeat('1',64),'author-terms',true);
INSERT INTO public.author_terms_acceptances(id,author_id,terms_version_id,accepted_by_user_id,acceptance_text) VALUES
 ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902','${A}','1.2'),
 ('40000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','9b4bbabe-8a12-4d58-8c4c-77bc2ba1a902','${B}','1.2');
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
END $t$;
`;

const scenario = String.raw`
DO $t$
DECLARE v uuid; e1 public.business_verification_evidence; e2 public.business_verification_evidence; s text; r jsonb; sess uuid;
  v20 uuid := (SELECT id FROM public.author_terms_versions WHERE version = '2.0');
BEGIN
  -- After switch with grace: earlier acceptances keep commercial gates, never Business. Nobody auto-accepted.
  PERFORM ua_test.ok((SELECT version = '2.0' AND reaccept_grace_until > now() FROM public.author_terms_versions WHERE is_current), '2.0 current with grace');
  PERFORM ua_test.ok(public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000b'), 'grace keeps B commercial');
  PERFORM ua_test.ok(NOT public.author_has_business_agreement('10000000-0000-0000-0000-00000000000b'), 'grace never opens Business');
  PERFORM ua_test.ok((SELECT count(*) = 0 FROM public.author_terms_acceptances WHERE terms_version_id = v20), 'no auto-acceptance of 2.0');
  PERFORM ua_test.ok(NOT public.author_has_accepted_current_terms('10000000-0000-0000-0000-0000000000ee'), 'unknown author false');

  -- B: rights check without personal 2.0 acceptance → refused.
  PERFORM ua_test.as_user('${B}');
  SET LOCAL ROLE authenticated;
  r := public.author_commercial_agreement_state('10000000-0000-0000-0000-00000000000b');
  PERFORM ua_test.ok((r->>'reaccept_required')::boolean AND (r->>'in_grace')::boolean AND NOT (r->>'business_agreement')::boolean, 'B state: reaccept banner, grace, no Business');
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

  PERFORM ua_test.as_user('${A}');
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT public.author_business_verification_draft_v2(''20000000-0000-0000-0000-00000000000a'',''30000000-0000-0000-0000-0000000000a1'',''suno'',NULL,''Spa'',''https://suno.com/s/abc'',''{"paid_plan":"Pro"}''::jsonb)' INTO v;
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
  PERFORM ua_test.ok((SELECT count(*) = 2 AND bool_and(s.row = to_jsonb(a)) FROM ua_test.snap s JOIN public.author_terms_acceptances a ON s.k = 'acc' AND a.id = (s.row->>'id')::uuid), 'acceptances untouched');

  -- Grace over: B loses commercial gate until personal acceptance.
  UPDATE public.author_terms_versions SET reaccept_grace_until = now() - interval '1 second' WHERE id = v20;
  PERFORM ua_test.ok(NOT public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000b'), 'grace expired');
  PERFORM ua_test.ok(public.author_has_accepted_current_terms('10000000-0000-0000-0000-00000000000a'), 'A accepted 2.0');
  UPDATE public.author_terms_versions SET reaccept_grace_until = now() + interval '30 days' WHERE id = v20;
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

  -- Idempotency is enforced by the DB, not only by the sync loop.
  PERFORM ua_test.expect_error($q$INSERT INTO public.music_rights_grants(audio_item_id,rightsholder_id,rights_layer,use_type,territory_scope,valid_from,source_type,status)
    SELECT '30000000-0000-0000-0000-0000000000a1', rightsholder_id, 'composition','business_background_playback','worldwide',now(),'platform_agreement','draft'
    FROM public.music_rights_grants WHERE audio_item_id = '30000000-0000-0000-0000-0000000000a1' LIMIT 1$q$, 'music_rights_grants_platform_agreement_live_uidx');
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
      read('supabase/migrations/20270105120000_business_consents_block_support_mode.sql')].join('\n');
    psql(db, [setup, fixtures].join('\n'));
    // Rollout must refuse before the migration exists.
    let refused = false;
    try { execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: insert20, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { refused = true; }
    assert.ok(refused, 'insert refuses without the migration');
    // Migration twice (idempotent), 2.0 insert twice (idempotent), switch twice (no-op second time).
    psql(db, [migration, migration, insert20, insert20, beforeSwitch].join('\n'));
    const grace = new Date(Date.now() + 30 * 86400e3).toISOString();
    psql(db, switchCurrent, ['-v', `grace_until=${grace}`]);
    psql(db, switchCurrent, ['-v', `grace_until=${grace}`]);
    psql(db, scenario);
    psql(db, scenario2);
    // Rollback: migration rollback refuses while 2.0 is current; switch back first; history kept.
    let blocked = false;
    try { execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: rollbackMigration, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { blocked = true; }
    assert.ok(blocked, 'migration rollback refuses while 2.0 is current');
    psql(db, [rollbackSwitch, rollbackMigration,
      "SELECT 1 / CASE WHEN to_regprocedure('public.business_catalog_sync(uuid,boolean)') IS NULL AND to_regprocedure('public.author_business_verification_submit_v3(uuid,uuid[],inet,text)') IS NULL AND to_regprocedure('public.business_catalog_sync_run(uuid,boolean)') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname LIKE 'zz_business_unified_auto_sync_%') THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN has_function_privilege('authenticated','public.author_business_product_optin(uuid[],boolean,boolean,text,text,inet,text)','EXECUTE') THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN (SELECT version FROM public.author_terms_versions WHERE is_current) = '1.2' THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN (SELECT count(*) FROM public.author_terms_acceptances) = 3 AND (SELECT count(*) FROM public.business_track_eligibility_reviews) = 3 THEN 1 ELSE 0 END;",
      // Re-apply after rollback works.
      migration].join('\n'));
    console.log('unified-agreement-sql-unit: contract + isolated PostgreSQL scenarios OK');
  } finally {
    psql('postgres', `DROP DATABASE ${db};`);
  }
}

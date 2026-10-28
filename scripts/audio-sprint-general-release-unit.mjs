#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { buildSql, resolveMode } from './audio-sprint-general-release.mjs';

assert.deepEqual(resolveMode([], {}), { apply: false, execute: false });
assert.throws(() => resolveMode(['--apply'], {}));
for (const host of ['72.56.232.160', 'example.org', '127.0.0.1?host=example.org']) {
  assert.throws(() => resolveMode(['--execute'], { AUDIO_SPRINT_DATABASE_URL: `postgresql://u@${host}/db` }));
}
assert.throws(() => resolveMode(['--execute', '--apply'], { AUDIO_SPRINT_DATABASE_URL: 'postgresql://u@localhost/db' }));
assert.match(buildSql(), /^BEGIN READ ONLY;/);
assert.doesNotMatch(buildSql(), /\b(UPDATE|INSERT|DELETE)\b/);
assert.match(buildSql(true), /LOCK TABLE/);
assert.doesNotMatch(buildSql(true), /\b(INSERT|DELETE)\b/);
console.log('Защита CLI и read-only SQL: OK');

const url = process.env.AUDIO_SPRINT_TEST_DATABASE_URL;
const singleData = process.env.AUDIO_SPRINT_TEST_PGDATA;
if (!url && !singleData) {
  console.log('SQL-тесты не выполнены: нужен AUDIO_SPRINT_TEST_DATABASE_URL отдельной локальной тестовой БД.');
  process.exit(0);
}
if (url) resolveMode(['--execute'], { AUDIO_SPRINT_DATABASE_URL: url });
if (singleData) assert.match(singleData, /^\/tmp\/2a3f80bf-/);
const run = sql => {
  if (!singleData) return execFileSync('psql', ['-X', url, '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' }).trim();
  const inputFile = `${singleData}/test-input.sql`;
  writeFileSync(inputFile, sql.replace(/\n\s*\n/g, '\n') + '\n\n');
  const fd = openSync(inputFile, 'r');
  let out;
  try {
    const result = spawnSync('/usr/lib/postgresql/17/bin/postgres', ['--single', '-j', '-c', 'jit=off', '-D', singleData, 'postgres'], {
      encoding: 'utf8', timeout: 20000, stdio: [fd,'pipe','pipe'],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /(?:ERROR|FATAL):/, result.stderr);
    out = result.stdout;
  } finally { closeSync(fd); }
  return [...out.matchAll(/\t 1: \w+ = "(.*)"\t\(typeid/g)].map(m=>m[1]).join('\n');
};
// Отдельная пустая БД, без удаления существующих объектов.
run(`CREATE TABLE seo_sprints(id uuid PRIMARY KEY, slug text);
CREATE TABLE seo_queries(id uuid PRIMARY KEY, query_text text, normalized_query text UNIQUE, analysis_status text);
CREATE TABLE seo_sprint_queries(sprint_id uuid, query_id uuid, pool text, author_group text, display_title text, PRIMARY KEY(sprint_id, query_id));
CREATE TABLE seo_query_reservations(id uuid PRIMARY KEY, query_id uuid, author_id uuid, product_id uuid, status text, expires_at timestamptz, released_at timestamptz);
CREATE TABLE seo_query_proposals(id uuid PRIMARY KEY, query_id uuid, author_id uuid);
CREATE TABLE practices(id uuid PRIMARY KEY, primary_seo_query_id uuid, seo_primary_query text, status text, deleted_at timestamptz);
CREATE FUNCTION normalize_seo_query(p_query text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
SELECT trim(regexp_replace(regexp_replace(lower(translate(p_query, 'Ёё', 'Ее')), '[[:punct:]]+', ' ', 'g'), '\\s+', ' ', 'g')); $$;`);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
run(`INSERT INTO seo_sprints VALUES ('${id(100)}', 'osen-zvuchit-2026');
INSERT INTO seo_queries SELECT ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'Тема ' || n, 'тема ' || n, CASE WHEN n=9 THEN 'not_analyzed' ELSE 'analyzed' END FROM generate_series(1,14) n;
INSERT INTO seo_sprint_queries SELECT '${id(100)}', id, CASE WHEN query_text = 'Тема 9' THEN 'reserve' ELSE 'initial' END, 'voice', query_text FROM seo_queries;`);
// Аудит работает и перед установкой новой колонки.
assert.equal(JSON.parse(run(buildSql())).considered, 14);
run(readFileSync(new URL('../supabase/migrations/20270202120000_seo_sprint_general_release.sql', import.meta.url), 'utf8'));
run(`INSERT INTO seo_query_reservations VALUES
('${id(201)}','${id(2)}','${id(101)}',null,'active',now()+interval '1 day',null),
('${id(202)}','${id(3)}','${id(101)}',null,'active',now()-interval '1 day',null),
('${id(203)}','${id(4)}','${id(101)}','${id(301)}','active',now()-interval '1 day',null),
('${id(204)}','${id(5)}','${id(101)}',null,'used',null,null),
('${id(205)}','${id(6)}','${id(101)}',null,'released',null,now()),
('${id(206)}','${id(14)}','${id(101)}',null,'active',null,null);
INSERT INTO practices VALUES
('${id(301)}','${id(4)}',null,'draft',null),
('${id(302)}','${id(7)}',null,'published',null),
('${id(303)}',null,'  ТЕМА-8! ','published',null),
('${id(304)}','${id(11)}',null,'published',now()),
('${id(305)}',null,'Тема 12','draft',null);
INSERT INTO seo_sprints VALUES ('${id(110)}','another');
INSERT INTO seo_sprint_queries VALUES ('${id(110)}','${id(10)}','initial','voice','Тема 10');
UPDATE seo_sprint_queries SET released_to_general_at=now() WHERE query_id='${id(13)}';`);
let report = JSON.parse(run(buildSql()));
const expected = ['free','active_rights','expired_reservation','active_rights','active_rights','ambiguous','published_product','published_product','ambiguous','ambiguous','ambiguous','ambiguous','already_general','active_rights'];
for (let n=1;n<=14;n++) assert.equal(report.rows.find(r=>r.query_id===id(n)).category, expected[n-1], `Тема ${n}`);
assert.equal(report.already_in_base,14);
const snapshot = () => run(`SELECT jsonb_build_object('queries',(SELECT jsonb_agg(q) FROM seo_queries q),'products',(SELECT jsonb_agg(p) FROM practices p),'reservations',(SELECT jsonb_agg(r) FROM seo_query_reservations r));`);
const before = snapshot();
const result = run(buildSql(true)).split('\n').map(JSON.parse);
assert.equal(result[1].transferred,1);
assert.deepEqual(result[1].query_ids,[id(1)]);
assert.equal(snapshot(),before);
assert.equal(run('SELECT count(*) FROM seo_sprint_queries'), '15');
assert.equal(run('SELECT count(*) FROM seo_queries'), '14');
assert.equal(run(buildSql(true)).split('\n').map(JSON.parse)[1].transferred,0);
// История авторского предложения также требует решения владельца.
run(`INSERT INTO seo_query_proposals VALUES ('${id(401)}','${id(13)}','${id(101)}');`);
report = JSON.parse(run(buildSql()));
assert.equal(report.rows.find(r=>r.query_id===id(13)).category,'ambiguous');
// Новая публикация свободной общей темы не делает её снова кандидатом.
run(`INSERT INTO practices VALUES ('${id(306)}','${id(1)}',null,'published',null);`);
report = JSON.parse(run(buildSql()));
assert.equal(report.rows.find(r=>r.query_id===id(1)).category,'published_product');
assert.equal(report.eligible,0);
console.log('SQL: 14 сценариев, legacy-связь, идемпотентность, отсутствие дублей и сохранение истории: OK');

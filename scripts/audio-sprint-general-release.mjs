#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const privilegeGuard = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user
    AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Нужна локальная роль с BYPASSRLS для полного аудита';
  END IF;
END $$;`;

const audit = readFileSync(new URL('./sql/audio-sprint-general-audit.sql', import.meta.url), 'utf8');
export function buildSql(apply = false) {
  const report = `${audit}
SELECT jsonb_build_object(
  'sprint', 'osen-zvuchit-2026', 'considered', count(*),
  'categories', (SELECT COALESCE(jsonb_object_agg(category, n), '{}')
    FROM (SELECT category, count(*) AS n FROM classified GROUP BY category) totals),
  'already_in_base', count(*) FILTER (WHERE already_in_base),
  'eligible', count(*) FILTER (WHERE category = 'free'),
  'already_general', count(*) FILTER (WHERE category = 'already_general'),
  'needs_review', count(*) FILTER (WHERE category IN ('ambiguous', 'expired_reservation')),
  'protected', count(*) FILTER (WHERE category IN ('published_product', 'active_rights')),
  'rows', COALESCE(jsonb_agg(to_jsonb(classified) ORDER BY query_id), '[]')) FROM classified;`;
  if (!apply) return `BEGIN READ ONLY;\n${privilegeGuard}\n${report}\nCOMMIT;\n`;
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
${privilegeGuard}
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Блокируем конкурентные изменения до повторной классификации.
LOCK TABLE public.seo_sprints, public.seo_sprint_queries, public.seo_queries,
  public.seo_query_reservations, public.seo_query_proposals, public.practices IN SHARE ROW EXCLUSIVE MODE;
${report}
${audit}, changed AS (
  UPDATE public.seo_sprint_queries sq SET released_to_general_at = now()
  FROM classified c WHERE c.category = 'free'
    AND sq.sprint_id = c.sprint_id AND sq.query_id = c.query_id
    AND sq.released_to_general_at IS NULL
  RETURNING sq.query_id
)
SELECT jsonb_build_object('transferred', count(*),
  'query_ids', COALESCE(jsonb_agg(query_id), '[]')) FROM changed;
${report}
COMMIT;\n`;
}

export function resolveMode(argv, env = process.env) {
  if (argv.some(a => !['--execute', '--apply'].includes(a))) throw new Error('Неизвестный параметр.');
  const apply = argv.includes('--apply');
  const execute = argv.includes('--execute');
  if (apply && !execute) throw new Error('Для apply нужен --execute и согласование Сергея.');
  if (!execute) return { apply, execute };
  let url;
  try { url = new URL(env.AUDIO_SPRINT_DATABASE_URL); } catch { throw new Error('Нужен AUDIO_SPRINT_DATABASE_URL локальной копии БД.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.search || url.hash) throw new Error('Разрешена только локальная БД без параметров подключения.');
  if (apply && env.AUDIO_SPRINT_APPLY_CONFIRM !== 'sergey-approved-local-copy')
    throw new Error('Для apply нужен AUDIO_SPRINT_APPLY_CONFIRM=sergey-approved-local-copy.');
  return { apply, execute, url };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const mode = resolveMode(argv, env);
  const sql = buildSql(mode.apply);
  if (!mode.execute) { process.stdout.write(sql); return; }
  // Пароль не передаётся аргументом процесса и не попадает в отчёт.
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 70000,
    env: { PATH: env.PATH, LANG: 'C.UTF-8',
      PGHOST: mode.url.hostname.replace(/^\[|\]$/g, ''), PGPORT: mode.url.port || '5432',
      PGDATABASE: decodeURIComponent(mode.url.pathname.slice(1)),
      PGUSER: decodeURIComponent(mode.url.username), PGPASSWORD: decodeURIComponent(mode.url.password),
      PGCONNECT_TIMEOUT: '5' },
  });
  if (result.error || result.status !== 0) throw new Error('Ошибка локального аудита/apply; транзакция не подтверждена. Проверьте схему и доступ локально.');
  process.stdout.write(result.stdout);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

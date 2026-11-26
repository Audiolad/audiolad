// t1485u: automatic Shazam check – pure helpers, worker orchestration, UI states and wiring.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SHAZAM_MAX_SKEW,
  SHAZAM_MIN_REQUEST_GAP_MS,
  classifyShazamSegments,
  parseShazamHelperOutput,
  planShazamSegments,
  shazamCheckView,
  shazamJobRetryDelaySeconds,
  shazamRateLimitBackoffMs,
  type ShazamHelperOutput,
} from '../src/lib/business-track-passports/shazam';
import { createBusinessShazamWorker, processShazamJob, type ShazamWorkerPort } from '../src/lib/business-track-passports/shazam-worker';
import { parseClaimedShazamJob } from '../src/lib/business-track-passports/shazam-runtime';
import { changedPassportKeys } from '../src/lib/business-track-passports/model';
import * as shazamUi from '../src/app/(platform)/admin/business-catalog/ShazamAutoStatus';
const ui = ((shazamUi as unknown as { default?: typeof shazamUi }).default?.ShazamAutoStatus ? (shazamUi as unknown as { default: typeof shazamUi }).default : shazamUi);
const { ShazamAutoStatus, ShazamAutoBadge } = ui;

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---- segment plan: 0:30, middle, end−30 s; 15 s windows ----
assert.deepEqual(planShazamSegments(186).map((s) => [s.label, s.offsetSeconds, s.durationSeconds]), [['t30', 30, 15], ['mid', 85, 15], ['end30', 156, 15]]);
assert.deepEqual(planShazamSegments(40).map((s) => s.offsetSeconds), [25, 12, 10]);
assert.deepEqual(planShazamSegments(10).map((s) => [s.offsetSeconds, s.durationSeconds]), [[0, 10], [0, 10], [0, 10]]);
assert.throws(() => planShazamSegments(0), /shazam_duration_unknown/);
assert.equal(SHAZAM_MAX_SKEW, 1e-3);
assert.ok(SHAZAM_MIN_REQUEST_GAP_MS >= 5_000);

// ---- verdict ----
const clean = { matched: false as const, error: null };
assert.equal(classifyShazamSegments([clean, clean, clean]), 'no_match');
assert.equal(classifyShazamSegments([clean, { matched: true, error: null }, clean]), 'match');
assert.equal(classifyShazamSegments([clean, clean]), 'error');
assert.equal(classifyShazamSegments([clean, clean, { matched: null, error: 'timeout' }]), 'error');
assert.equal(classifyShazamSegments([{ matched: true, error: null }, clean, { matched: null, error: 'x' }]), 'match');

// ---- backoff ----
assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(shazamRateLimitBackoffMs), [5000, 10000, 20000, 40000, 80000, 160000, 160000]);
assert.deepEqual([1, 2, 3, 10].map(shazamJobRetryDelaySeconds), [120, 240, 480, 3600]);

// ---- helper output ----
const parsed = parseShazamHelperOutput('noise\n{"ok":true,"library_version":"shazamio 0.9.0","matched":true,"title":"Song","artist":"Band","timeskew":0.0004,"frequencyskew":-0.0002,"rate_limited":false,"error":null}\n');
assert.equal(parsed.matched, true);
assert.equal(parsed.title, 'Song');
assert.equal(parsed.library_version, 'shazamio 0.9.0');
assert.equal(parseShazamHelperOutput('garbage').error, 'helper_output_unreadable');
assert.equal(parseShazamHelperOutput('{"ok":false,"rate_limited":true,"error":"rate_limited"}').rate_limited, true);
const rejected = parseShazamHelperOutput('{"ok":true,"matched":false,"title":"X","rejected_title":"Cheri Cheri Lady","rejected_timeskew":0.0302}');
assert.equal(rejected.matched, false);
assert.equal(rejected.title, null, 'rejected candidate is never a match title');
assert.equal(rejected.rejected_timeskew, 0.0302);

// ---- fake port ----
type Call = { kind: string; [key: string]: unknown };
function fakePort(answers: ShazamHelperOutput[], overrides: Partial<ShazamWorkerPort> = {}) {
  let clock = 1_000_000;
  const calls: Call[] = [];
  const requestTimes: number[] = [];
  const heartbeats: number[] = [];
  const port: ShazamWorkerPort = {
    available: async () => ({ ok: true, libraryVersion: 'shazamio 0.9.0' }),
    claim: async () => null,
    heartbeat: async () => { heartbeats.push(clock); return true; },
    loadMaster: async () => ({ storageBucket: 'music-masters', storagePath: 'm.wav', durationSeconds: 186, passportStatus: 'draft' }),
    prepare: async (_job, master, plan) => {
      calls.push({ kind: 'prepare' });
      return { workDir: '/tmp/x', durationSeconds: master.durationSeconds ?? 0, segments: plan(master.durationSeconds ?? 0).map((p) => ({ plan: p, path: `/tmp/x/${p.label}.wav` })) };
    },
    cleanup: async (dir) => { calls.push({ kind: 'cleanup', dir }); },
    recognize: async (_path, maxSkew) => {
      assert.equal(maxSkew, 1e-3);
      requestTimes.push(clock);
      clock += 700;
      const next = answers.shift();
      assert.ok(next, 'unexpected extra Shazam request');
      return next;
    },
    complete: async (input) => { calls.push({ kind: 'complete', ...input }); return { status: input.outcome }; },
    sleep: async (ms) => { calls.push({ kind: 'sleep', ms }); clock += ms; },
    now: () => clock,
    log: (event) => { calls.push({ kind: 'log', ...event }); },
    ...overrides,
  };
  return { port, calls, requestTimes, heartbeats };
}
const none: ShazamHelperOutput = { ok: true, library_version: 'shazamio 0.9.0', matched: false, title: null, artist: null, timeskew: null, frequencyskew: null, rejected_title: null, rejected_artist: null, rejected_timeskew: null, rejected_frequencyskew: null, rate_limited: false, error: null };
const hit: ShazamHelperOutput = { ...none, matched: true, title: 'Чужая', artist: 'Кто-то', timeskew: 0.0003, frequencyskew: 0.0001 };
const limited: ShazamHelperOutput = { ...none, ok: false, matched: null, rate_limited: true, error: 'rate_limited' };
const broken: ShazamHelperOutput = { ...none, ok: false, matched: null, error: 'timeout' };
const job = { id: 'c1', audio_item_id: 'a1', master_asset_id: 'm1', attempts: 1 };
const live = { lastRequestAt: null as number | null, stopping: () => false };
const complete = (calls: Call[]) => calls.filter((c) => c.kind === 'complete');

{
  const { port, calls, requestTimes } = fakePort([none, none, none]);
  assert.equal(await processShazamJob(port, job, { ...live }, 'shazamio 0.9.0'), 'no_match');
  const done = complete(calls);
  assert.equal(done.length, 1);
  assert.equal(done[0].outcome, 'no_match');
  assert.equal((done[0].segments as unknown[]).length, 3);
  assert.deepEqual((done[0].segments as { offset_seconds: number }[]).map((s) => s.offset_seconds), [30, 85, 156]);
  for (let i = 1; i < requestTimes.length; i += 1) assert.ok(requestTimes[i] - requestTimes[i - 1] >= 5_000, 'at least 5 s between Shazam requests');
  assert.equal(calls.filter((c) => c.kind === 'cleanup').length, 1, 'audio deleted after job');
  const segmentLogs = calls.filter((c) => c.kind === 'log' && c.event === 'business_shazam_segment');
  assert.equal(segmentLogs.length, 3);
  for (const log of segmentLogs) {
    assert.equal(log.libraryVersion, 'shazamio 0.9.0');
    assert.match(String(log.startedAt), /MSK$/);
    assert.ok('offsetSeconds' in log && 'timeskew' in log && 'elapsedMs' in log);
  }
}
{
  const { port, calls } = fakePort([none, hit, none]);
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'match');
  const done = complete(calls)[0];
  assert.equal(done.outcome, 'match');
  assert.equal((done.segments as { title: string | null }[])[1].title, 'Чужая');
  assert.equal(calls.filter((c) => c.kind === 'cleanup').length, 1);
}
{
  const { port, calls, requestTimes } = fakePort([limited, limited, none, none, none]);
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'no_match');
  const backoffs = calls.filter((c) => c.kind === 'log' && c.event === 'business_shazam_rate_limited').map((c) => c.backoffMs);
  assert.deepEqual(backoffs, [5000, 10000], '429 backs off exponentially');
  assert.equal(requestTimes.length, 5);
  assert.equal((complete(calls)[0].segments as { rate_limit_retries: number }[])[0].rate_limit_retries, 2);
}
{
  const { port, calls } = fakePort([limited, limited, limited, limited, limited, limited]);
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'retry');
  const done = complete(calls)[0];
  assert.equal(done.error, 'rate_limited');
  assert.equal(done.retryAfterSeconds, 120);
  assert.equal(calls.filter((c) => c.kind === 'cleanup').length, 1);
}
{
  const { port, calls } = fakePort([none, broken, none]);
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'retry', 'an errored segment never yields «совпадений нет»');
  const { port: lastPort, calls: lastCalls } = fakePort([none, broken, none]);
  assert.equal(await processShazamJob(lastPort, { ...job, attempts: 4 }, { ...live }, null), 'error');
  assert.equal(complete(lastCalls)[0].outcome, 'error');
  assert.equal(complete(calls)[0].outcome, 'retry');
}
{
  const { port, calls } = fakePort([], { loadMaster: async () => ({ storageBucket: 'music-masters', storagePath: 'm', durationSeconds: 100, passportStatus: 'approved' }) });
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'skipped');
  assert.equal(calls.filter((c) => c.kind === 'prepare').length, 0, 'no download for approved passports');
}
{
  const { port, calls } = fakePort([], { prepare: async () => { throw new Error('ffmpeg failed'); } });
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'retry');
  assert.match(String(complete(calls)[0].error), /prepare_failed/);
}
{
  let stop = false;
  const { port, calls } = fakePort([none], { recognize: async () => { stop = true; return none; } });
  assert.equal(await processShazamJob(port, job, { lastRequestAt: null, stopping: () => stop }, null), 'retry');
  assert.equal(complete(calls)[0].error, 'worker_shutdown');
  assert.equal(calls.filter((c) => c.kind === 'cleanup').length, 1);
}
{
  const { port, calls } = fakePort([], { available: async () => ({ ok: false, reason: 'shazamio_venv_unavailable' }), claim: async () => { throw new Error('must not claim'); } });
  const worker = createBusinessShazamWorker(port, { idleIntervalMs: 10 });
  assert.equal(await worker.runOnce(), 'unavailable');
  assert.equal(await worker.runOnce(), 'unavailable');
  assert.equal(calls.filter((c) => c.kind === 'log' && c.event === 'business_shazam_unavailable').length, 1);
  const stale = createBusinessShazamWorker(port, { idleIntervalMs: 10, checkRelease: async () => ({ state: 'STALE' }) });
  assert.equal(await stale.runOnce(), 'stale');
}
// ---- lease heartbeat (review fix 4) ----
{
  const { port, heartbeats, requestTimes } = fakePort([limited, none, none, none]);
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'no_match');
  assert.equal(heartbeats.length, 1 + requestTimes.length, 'lease renewed before download and before every Shazam request, retries included');
}
{
  let beats = 0;
  const { port, calls } = fakePort([none, none, none], { heartbeat: async () => { beats += 1; return beats < 3; } });
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'lease_lost');
  assert.equal(complete(calls).length, 0, 'a reclaimed job is never completed by the old worker');
  assert.equal(calls.filter((c) => c.kind === 'cleanup').length, 1, 'audio deleted when the lease is lost');
  assert.equal(calls.filter((c) => c.kind === 'log' && c.event === 'business_shazam_lease_lost').length, 1);
}
{
  const { port, calls } = fakePort([none, none, none], { heartbeat: async () => { throw new Error('network'); } });
  assert.equal(await processShazamJob(port, job, { ...live }, null), 'no_match', 'a transient heartbeat error does not drop the job');
  assert.ok(calls.some((c) => c.kind === 'log' && c.event === 'business_shazam_heartbeat_failed'));
}
{
  // Worst single step between two heartbeats stays far below the 30-minute reclaim window.
  const runtime = read('src/lib/business-track-passports/shazam-runtime.ts');
  assert.match(runtime, /downloadMusicStorageObjectToFile/);
  assert.match(runtime, /timeoutMs: 300_000/, 'download timeout 5 min');
  assert.match(runtime, /timeout: 180_000/, 'helper timeout 3 min');
  const prepareWorstMs = 300_000 + 60_000 + 3 * 120_000;
  const requestWorstMs = 180_000 + 80_000 + 5_000;
  assert.ok(Math.max(prepareWorstMs, requestWorstMs) < 30 * 60_000 / 2, 'reclaim window is at least twice the longest step');
  assert.match(read('supabase/migrations/20270313120000_business_passport_shazam_checks.sql'), /interval '30 minutes'/);
  assert.match(runtime, /heartbeat_business_shazam_check/);
}
assert.deepEqual(parseClaimedShazamJob([{ id: 'c', audio_item_id: 'a', master_asset_id: 'm', attempts: 2 }]), { id: 'c', audio_item_id: 'a', master_asset_id: 'm', attempts: 2 });
assert.equal(parseClaimedShazamJob([]), null);

// ---- passport form saves only changed keys (review fix 2) ----
{
  const opened = { shazam_result: null, shazam_checked_at: null, generator_tool: 'MusicGPT', notes: 'x' };
  assert.deepEqual(changedPassportKeys(opened, { ...opened, generator_tool: 'MusicGPT', notes: 'x' }), [], 'nothing changed – nothing sent');
  assert.deepEqual(changedPassportKeys(opened, { ...opened, generator_tool: 'Suno' }), ['generator_tool'], 'Shazam fields the worker may have written are not sent');
  assert.deepEqual(changedPassportKeys({ shazam_result: 'not_found' }, { shazam_result: '' }), ['shazam_result'], 'a deliberate manual clear is sent');
  assert.deepEqual(changedPassportKeys(undefined, { al_code: 'AL-T-1', shazam_result: '' }), ['al_code'], 'new passport: only filled fields');
  const form = read('src/app/(platform)/admin/business-catalog/PassportForm.tsx');
  assert.match(form, /changedPassportKeys\(passport, payload\)/);
  assert.match(read('src/app/(platform)/admin/business-catalog/actions.ts'), /saveBusinessPassport\(audioItemId, fields, keys \? \{ keys \} : undefined\)/);
  const admin = read('src/lib/business-track-passports/admin.server.ts');
  for (const code of ['passport_shazam_pending', 'passport_shazam_match', 'passport_shazam_stale']) assert.match(admin, new RegExp(`includes\\('${code}'\\)\\) throw new Error\\('[^']*[а-я]`), `${code}: Russian message`);
  assert.ok(!admin.includes('\u2014') && !form.includes('\u2014'), 'en dash only');
}

// ---- UI states ----
const pending = shazamCheckView({ audio_item_id: 'a', status: 'running' }, null);
assert.equal(pending.state, 'pending');
const noMatch = shazamCheckView({ audio_item_id: 'a', status: 'no_match' }, { shazam_result: 'not_found', shazam_checked_at: '2026-11-16T21:30:00Z' });
assert.equal(noMatch.state, 'no_match');
assert.match(noMatch.state === 'no_match' ? noMatch.label : '', /совпадений нет – 17\.11\.2026/, 'date shown in Europe/Moscow');
const match = shazamCheckView({ audio_item_id: 'a', status: 'match', finished_at: '2026-11-16T08:00:00Z', segments: [{ matched: false }, { matched: true, title: 'Song', artist: 'Band', timeskew: 0.0004, frequencyskew: -0.0007, offset_seconds: 85 }] }, null);
assert.equal(match.state, 'match');
assert.deepEqual(match.state === 'match' ? match.matches : [], [{ title: 'Song', artist: 'Band', skew: '0,0007', offset: '1:25', range: '1:25–1:40' }]);
assert.equal(match.state === 'match' ? match.date : null, '16.11.2026', 'match check date in Europe/Moscow');
const manual = shazamCheckView({ audio_item_id: 'a', status: 'match', finished_at: '2026-11-16T08:00:00Z', segments: [] }, { shazam_result: 'not_found', shazam_checked_at: '2026-11-16T09:00:00Z' });
assert.equal(manual.state, 'no_match', 'manual «совпадений нет» after a match is respected');
assert.equal(shazamCheckView(null, null).state, 'none');
// Delta review fixes: the status line mirrors the approval RPC exactly, no dates compared.
{
  const earlierMatch = { audio_item_id: 'a', master_asset_id: 'm', status: 'match' as const, finished_at: '2026-11-16T08:00:00Z', segments: [{ matched: true, title: 'Song', artist: 'Band', timeskew: 0.0004, frequencyskew: 0, offset_seconds: 30 }] };
  const manual = { shazam_result: 'not_found', shazam_checked_at: '2020-01-01' };
  const manualGate = { autoMaster: null, currentMaster: 'm' };
  const autoGate = { autoMaster: 'm', currentMaster: 'm' };
  for (const status of ['error', 'skipped'] as const) {
    const later = { audio_item_id: 'a', master_asset_id: 'm', status, finished_at: '2026-11-16T09:00:00Z' };
    assert.equal(shazamCheckView(later, null, earlierMatch, manualGate).state, 'match', `${status} after a match keeps the match`);
    assert.equal(shazamCheckView(later, manual, earlierMatch, autoGate).state, 'match', `${status}: an automatic not_found never lifts a match`);
  }
  assert.equal(shazamCheckView(earlierMatch, manual, earlierMatch, manualGate).state, 'no_match', 'manual not_found (necessarily entered after the match) lifts it, typed date ignored');
  assert.equal(shazamCheckView(earlierMatch, { shazam_result: 'not_found', shazam_checked_at: '2099-01-01' }, earlierMatch, manualGate).state, 'no_match', 'typed date is irrelevant');
  assert.equal(shazamCheckView({ audio_item_id: 'a', status: 'pending' }, manual, earlierMatch, manualGate).state, 'pending');
  assert.equal(shazamCheckView({ audio_item_id: 'a', status: 'error' }, manual, null, { autoMaster: 'old', currentMaster: 'm' }).state, 'error', 'auto not_found of another master: stale');
  assert.equal(shazamCheckView({ audio_item_id: 'a', status: 'error' }, manual, null, manualGate).state, 'no_match');
  const ui = renderToStaticMarkup(createElement(ShazamAutoStatus, { check: { audio_item_id: 'a', status: 'error' }, finalCheck: earlierMatch, gate: autoGate, passport: manual }));
  assert.match(ui, /«Song» – Band/);
  const adminSource = read('src/lib/business-track-passports/admin.server.ts');
  assert.match(adminSource, /\.in\('status', \['match', 'no_match'\]\)\s*\.order\('created_at', \{ ascending: false \}\)\.limit\(1\)/, 'per-track latest final check');
  assert.doesNotMatch(adminSource, /trackIds\.length \* 10/, 'no shared row cap across the album');
  assert.match(adminSource, /\.eq\('passport_checked_at', checkedAt\)/, 'same auto marker as the RPC');
  assert.match(adminSource, /Shazam нашёл совпадение\. Если это ложное срабатывание, проверьте трек вручную и укажите «Совпадений нет», затем допустите трек\./);
  assert.doesNotMatch(adminSource, /по Москве/);
  const sql = read('supabase/migrations/20270313120000_business_passport_shazam_checks.sql');
  assert.match(sql, /AND c\.status IN \('match','no_match'\)/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /Europe\/Moscow|shazam_checked_at\s*[<>]/, 'no typed-date comparison in SQL');
  assert.match(sql, /v_note := 'passport_not_found_cleared'/);
}
assert.equal(shazamCheckView({ audio_item_id: 'a', status: 'error' }, null).state, 'error');
const html = renderToStaticMarkup(createElement(ShazamAutoStatus, { check: { audio_item_id: 'a', status: 'match', segments: [{ matched: true, title: 'Song', artist: 'Band', timeskew: 0.0004, frequencyskew: 0, offset_seconds: 30 }] } }));
assert.match(html, /«Song» – Band, перекос 0,0004/);
assert.match(html, /укажите результат вручную/);
assert.doesNotMatch(html, /Допущен/);
assert.match(renderToStaticMarkup(createElement(ShazamAutoBadge, { check: { audio_item_id: 'a', status: 'pending' } })), /Shazam: проверяется/);
for (const path of ['src/app/(platform)/admin/business-catalog/ShazamAutoStatus.tsx', 'src/lib/business-track-passports/shazam.ts']) {
  assert.ok(!read(path).includes('\u2014'), `${path}: en dash only`);
}

// ---- wiring: never in a Next request, never auto-admit ----
const autoFill = read('src/lib/business-track-passports/auto-fill.server.ts');
assert.match(autoFill, /enqueue_business_shazam_check/);
assert.doesNotMatch(autoFill, /shazam-runtime|recognize_segment|shazamio/);
for (const path of ['src/app/(platform)/admin/business-catalog/actions.ts', 'src/app/(platform)/admin/business-catalog/page.tsx', 'src/lib/business-track-passports/admin.server.ts']) {
  assert.doesNotMatch(read(path), /shazam-runtime|recognize_segment|shazamio/, `${path} must not run Shazam`);
}
const worker = read('src/lib/business-track-passports/shazam-worker.ts') + read('src/lib/business-track-passports/shazam-runtime.ts');
assert.doesNotMatch(worker, /admin_approve_business_track_passport|decideBusinessPassport|approveReady/);
assert.match(read('src/lib/business-track-passports/shazam-runtime.ts'), /'nice', \['-n', '10', 'ffmpeg'/);
const migration = read('supabase/migrations/20270313120000_business_passport_shazam_checks.sql');
// The only replaced function is the approval RPC: same body plus the Shazam gate (review fix 1a).
const approveStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_approve_business_track_passport');
assert.ok(approveStart > 0, 'approval gate present');
const approveBody = migration.slice(approveStart, migration.indexOf('END $$;', approveStart));
for (const code of ['passport_shazam_pending', 'passport_shazam_match', 'passport_shazam_stale', 'passport_fingerprint_match', 'passport_hash_mismatch']) assert.match(approveBody, new RegExp(code));
const withoutApprove = migration.slice(0, approveStart) + migration.slice(migration.indexOf('END $$;', approveStart));
assert.doesNotMatch(withoutApprove.replace(/--[^\n]*/g, ''), /\bALTER TABLE\b(?! public\.business_passport_shazam_checks)|\bDROP\b|status\s*=\s*'approved'|admin_approve|CREATE OR REPLACE/i, 'migration is additive and the worker never approves');
const rollback = read('supabase/rollback/20270313120000_business_passport_shazam_checks.down.sql');
assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.admin_approve_business_track_passport/);
assert.doesNotMatch(rollback, /passport_shazam_(pending|match|stale)/, 'rollback restores the original approval RPC');
assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
assert.ok(existsSync(new URL('../supabase/rollback/20270313120000_business_passport_shazam_checks.down.sql', import.meta.url)));
const ecosystem = read('deploy/business-shazam-worker.ecosystem.config.cjs');
assert.match(ecosystem, /name: "audiolad-business-shazam-worker"/);
assert.match(ecosystem, /scripts\/run-business-shazam-worker\.mts/);
assert.doesNotMatch(ecosystem, /SERVICE_ROLE|KEY=|TOKEN/);
const ensure = read('deploy/scripts/ensure-business-shazam-worker.sh');
assert.match(ensure, /audiolad-business-shazam-worker/);
assert.match(ensure, /business_shazam_worker_already_online/);
assert.doesNotMatch(ensure, /transcode/);
assert.ok(statSync(new URL('../deploy/scripts/ensure-business-shazam-worker.sh', import.meta.url)).mode & 0o111, 'ensure script executable');
const deploy = read('deploy/scripts/deploy.sh');
assert.match(deploy, /ensure-business-shazam-worker\.sh/);
assert.match(deploy, /business_shazam_worker_ensure_failed_non_fatal/);
assert.match(read('scripts/business-shazam/requirements.txt'), /^shazamio==0\.9\.0$/m);
const helper = read('scripts/business-shazam/recognize_segment.py');
assert.match(helper, /max_skew=max_skew/);
assert.match(helper, /statuses=\{500, 502, 503, 504\}/, 'library does not swallow 429; the worker backs off');

console.log('business-shazam-worker-unit: PASS (segments, verdict, 5 s pacing, 429 backoff, cleanup, retries, lease heartbeat, changed-keys save, approval gate wiring, UI states, wiring, additive migration)');

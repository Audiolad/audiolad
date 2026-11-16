// t1490u: grouped result of «Допустить все готовые», album card state and the calmer
// «Заполнить автоматически» notice. Pure helpers + source wiring; approval rules untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  albumAdmissionState,
  formatApprovalSummary,
  isServerSetupAutoFillError,
  passportRefusalCodes,
  refusalCodeFromRpcError,
  summarizeApproval,
  summarizeAutoFill,
  AUTOFILL_SETUP_NOTICE,
  SHAZAM_WAIT_HINT,
} from '../src/lib/business-track-passports/admission-ui';
import { passportMissing, type Passport } from '../src/lib/business-track-passports/model';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const complete: Passport = {
  status: 'draft',
  al_code: 'AL-T-1', generator_tool: 'MusicGPT', generator_plan: 'Pro', generated_at: '2026-11-15T12:00:00+03:00',
  generation_ref: 'История', terms_snapshot_ref: 'business-passport-license:x', human_contribution: 'none',
  source_sha256: 'ab'.repeat(32), master_sha256: 'ab'.repeat(32), fingerprint_sha256: 'cd'.repeat(32),
  shazam_checked_at: '2026-11-15T12:00:00+03:00', shazam_result: 'not_found',
  acoustid_checked_at: '2026-11-15T12:00:00+03:00', acoustid_result: 'not_found',
  never_published_checked_at: '2026-11-15T12:00:00+03:00', evidence_inventory_sha256: 'ef'.repeat(32),
  stored_master_asset_id: 'bab5488c-8b28-43a8-ba7c-5d03396b187e', stored_master_sha256: 'ab'.repeat(32),
  stored_master_sha256_verified_at: '2026-11-15T12:00:00+03:00',
};
assert.deepEqual(passportMissing(complete), []);
assert.deepEqual(passportRefusalCodes(complete), [], 'complete draft is ready');
assert.deepEqual(passportRefusalCodes({ ...complete, status: 'approved' }), []);
assert.deepEqual(passportRefusalCodes(undefined), ['no_passport']);
assert.deepEqual(passportRefusalCodes({ ...complete, status: 'revoked' }), ['revoked']);

// Prod today (16.11): Shazam queued, no fpcalc → no fingerprint/AcoustID.
const prodToday: Passport = { ...complete, shazam_result: null, shazam_checked_at: null, fingerprint_sha256: null, acoustid_checked_at: null, acoustid_result: null };
assert.deepEqual(passportRefusalCodes(prodToday, true), ['shazam_pending', 'fingerprint_missing']);
assert.deepEqual(passportRefusalCodes(prodToday, false), ['shazam_missing', 'fingerprint_missing']);
assert.deepEqual(passportRefusalCodes({ ...complete, shazam_result: 'match' }), ['match']);
assert.deepEqual(passportRefusalCodes({ ...complete, acoustid_result: 'match' }), ['match']);
assert.deepEqual(passportRefusalCodes({ ...complete, stored_master_sha256_verified_at: null }), ['master']);
assert.deepEqual(passportRefusalCodes({ ...complete, master_sha256: 'cd'.repeat(32) }), ['master']);
assert.deepEqual(passportRefusalCodes({ ...complete, generator_plan: '' }), ['fields']);
assert.deepEqual(passportRefusalCodes({ ...complete, human_contribution: 'human', human_contribution_details: '' }), ['fields']);
assert.deepEqual(passportRefusalCodes(complete, true), ['shazam_pending'], 'active queue job blocks like the RPC');
// Every passport passportMissing() rejects gets at least one reason (never a silent skip).
for (const key of Object.keys(complete) as (keyof Passport)[]) {
  if (key === 'status') continue;
  const broken = { ...complete, [key]: null } as Passport;
  if (passportMissing(broken).length > 0) assert.ok(passportRefusalCodes(broken).length > 0, `${key}: reason given`);
}

// RPC refusal codes → groups.
assert.equal(refusalCodeFromRpcError('passport_shazam_pending'), 'shazam_pending');
assert.equal(refusalCodeFromRpcError('passport_shazam_stale'), 'shazam_pending');
assert.equal(refusalCodeFromRpcError('passport_shazam_match'), 'match');
assert.equal(refusalCodeFromRpcError('passport_fingerprint_match'), 'match');
assert.equal(refusalCodeFromRpcError('passport_hash_mismatch'), 'master');
assert.equal(refusalCodeFromRpcError('passport_master_replaced'), 'master');
assert.equal(refusalCodeFromRpcError('passport_missing_fields: passport'), 'no_passport');
assert.equal(refusalCodeFromRpcError('passport_missing_fields: fingerprint_sha256,acoustid_result'), 'fingerprint_missing');
assert.equal(refusalCodeFromRpcError('passport_missing_fields: shazam_result'), 'shazam_missing');
assert.equal(refusalCodeFromRpcError('passport_missing_fields: generator_plan'), 'fields');
assert.equal(refusalCodeFromRpcError('permission_denied'), 'error');
assert.equal(refusalCodeFromRpcError(''), 'error');

// Grouped result line.
const summary = summarizeApproval([
  ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, title: `A${i}`, outcome: 'approved' as const, reasons: [] })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `b${i}`, title: `B${i}`, outcome: 'already_approved' as const, reasons: [] })),
  { id: 'c1', title: 'C1', outcome: 'refused' as const, reasons: ['shazam_pending' as const] },
  { id: 'c2', title: 'C2', outcome: 'refused' as const, reasons: ['shazam_pending' as const] },
  { id: 'c3', title: 'C3', outcome: 'refused' as const, reasons: ['master' as const] },
]);
assert.deepEqual(formatApprovalSummary(summary), {
  approvedLine: 'Допущено 7 из 10 (сейчас – 5).',
  refusedLine: 'Не допущены 3: Shazam ещё проверяет (2), нет проверенного мастер-файла (1).',
});
const none = formatApprovalSummary(summarizeApproval(Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, outcome: 'refused' as const, reasons: ['shazam_pending' as const, 'fingerprint_missing' as const] }))));
assert.equal(none.approvedLine, 'Допущено 0 из 10.');
assert.equal(none.refusedLine, 'Не допущены 10: Shazam ещё проверяет (10), нет отпечатка и AcoustID – нужна настройка сервера (10).');
assert.deepEqual(formatApprovalSummary(summarizeApproval([{ id: 'x', title: 'X', outcome: 'approved', reasons: [] }])), { approvedLine: 'Допущено 1 из 1.', refusedLine: null });
assert.equal(summarizeApproval([{ id: 'x', title: 'X', outcome: 'refused', reasons: [] }]).reasonCounts.error, 1, 'refusal without code is still counted');

// Album card state.
const approvedTrack = { passport: { ...complete, status: 'approved' as const } };
const allIn = albumAdmissionState(Array.from({ length: 10 }, () => approvedTrack));
assert.equal(allIn.complete, true);
assert.equal(allIn.hint, null);
const partial = albumAdmissionState([approvedTrack, approvedTrack, { passport: complete }, { passport: prodToday, shazamActive: true }]);
assert.deepEqual([partial.complete, partial.approved, partial.ready], [false, 2, 1]);
assert.equal(partial.hint, null, 'something ready – button stays enabled, no hint');
const waiting = albumAdmissionState(Array.from({ length: 10 }, () => ({ passport: { ...complete, shazam_result: null, shazam_checked_at: null }, shazamActive: true })));
assert.equal(waiting.ready, 0);
assert.ok(waiting.hint?.endsWith(SHAZAM_WAIT_HINT), 'pending Shazam → wait hint');
assert.match(waiting.hint ?? '', /Shazam ещё проверяет \(10\)/);
const prod = albumAdmissionState(Array.from({ length: 10 }, () => ({ passport: prodToday, shazamActive: true })));
assert.equal(prod.hint, 'Сейчас нет треков, готовых к допуску: Shazam ещё проверяет (10), нет отпечатка и AcoustID – нужна настройка сервера (10). Ждём проверку Shazam – обычно несколько минут.');
assert.equal(albumAdmissionState([{ passport: { ...complete, generator_plan: '' } }]).hint, 'Сейчас нет треков, готовых к допуску: не заполнены поля паспорта (1).');
assert.equal(albumAdmissionState([]).complete, false, 'empty album is never «в каталоге»');
assert.equal(albumAdmissionState([{ passport: { ...complete, status: 'revoked' } }]).complete, false);

// «Заполнить автоматически»: fpcalc/AcoustID gaps are an amber notice, deduplicated.
const fpcalc = 'На сервере не установлен fpcalc (пакет chromaprint-tools). Отпечаток и AcoustID не записаны.';
const queued = 'Shazam: автоматическая проверка поставлена в очередь, результат появится у трека через несколько минут.';
const source = 'Отдельного исходного файла нет – SHA-256 исходника совпадает с хешем сохранённого мастера.';
assert.ok(isServerSetupAutoFillError(fpcalc));
assert.ok(isServerSetupAutoFillError('Ключ AcoustID не задан в окружении (ACOUSTID_API_KEY). Результат AcoustID не записан.'));
assert.ok(!isServerSetupAutoFillError('Сначала загрузите мастер-файл.'));
const setupOnly = summarizeAutoFill(['Быстрый заказ', 'Светофор'].map((title) => ({
  title, ok: false, errors: [fpcalc, fpcalc], skipped: [queued, source], message: `Частично заполнено: ${fpcalc} ${fpcalc}`,
})));
assert.equal(setupOnly.tone, 'notice');
assert.equal(setupOnly.message, AUTOFILL_SETUP_NOTICE);
assert.match(setupOnly.message, /^Заполнено\. Отпечаток и AcoustID будут добавлены после настройки сервера/);
assert.deepEqual(setupOnly.lines, ['Быстрый заказ: заполнено, кроме отпечатка и AcoustID.', 'Светофор: заполнено, кроме отпечатка и AcoustID.']);
assert.equal(setupOnly.notes.filter((note) => note === fpcalc).length, 1, 'fpcalc sentence once');
assert.equal(setupOnly.notes.filter((note) => note === queued).length, 1);
assert.ok(!setupOnly.lines.join(' ').includes('chromaprint'), 'per-track lines do not repeat the fpcalc sentence');
const real = summarizeAutoFill([
  { title: 'A', ok: false, errors: ['Сначала загрузите мастер-файл.'], skipped: [], message: 'Сначала загрузите мастер-файл.' },
  { title: 'B', ok: false, errors: [fpcalc], skipped: [], message: '' },
]);
assert.equal(real.tone, 'error', 'a real failure stays red');
assert.equal(real.lines[0], 'A: Сначала загрузите мастер-файл.');
const thrown = summarizeAutoFill([{ title: 'A', ok: false, errors: [], skipped: [], message: 'Трек не найден.' }]);
assert.equal(thrown.tone, 'error');
const fine = summarizeAutoFill([{ title: 'A', ok: true, errors: [], skipped: [queued], message: 'ok' }, { title: 'B', ok: true, errors: [], skipped: [], message: '', alreadyDecided: true }]);
assert.equal(fine.tone, 'ok');
assert.deepEqual(fine.lines, ['A: заполнено.', 'B: пропущен, паспорт уже допущен или отозван.']);

// The server still emits the sentences the notice recognises.
const autoFill = read('src/lib/business-track-passports/auto-fill.server.ts');
assert.ok(autoFill.includes('fpcalc (пакет chromaprint-tools)'));
assert.ok(autoFill.includes('Ключ AcoustID не задан'));

// Wiring: no rule change, no auto-approval, refresh after the action, badge + hint.
assert.match(autoFill, /const missing = passportMissing\(passport\);\n\s+if \(missing\.length > 0\) \{\n\s+skipped \+= 1;/, 'local precheck unchanged');
assert.match(autoFill, /await decideBusinessPassport\(track\.id, 'approve'\)/);
assert.equal((autoFill.match(/decideBusinessPassport\(/g) ?? []).length, 1, 'approval only from the bulk action');
const tools = read('src/app/(platform)/admin/business-catalog/AlbumPassportTools.tsx');
assert.match(tools, /Альбом в каталоге Бизнеса ✓/);
assert.match(tools, /disabled=\{pending \|\| nothingReady\}/);
assert.match(tools, /Always reload the album[^\n]*\n\s+router\.refresh\(\);/);
assert.match(tools, /Допущено \{admission\.approved\} из \{admission\.total\}/);
assert.doesNotMatch(tools, /завершено с ошибками/);
const card = read('src/app/(platform)/admin/business-catalog/ClosedAlbumWork.tsx');
assert.match(card, /allApproved \? 'mt-2 text-sm font-semibold text-\[#1f7a46\]'/);
const actions = read('src/app/(platform)/admin/business-catalog/actions.ts');
assert.match(actions, /formatApprovalSummary\(summary\)/);
assert.doesNotMatch(actions, /rpcCode/, 'raw RPC codes never leave the server');
for (const path of [
  'src/lib/business-track-passports/admission-ui.ts',
  'src/app/(platform)/admin/business-catalog/AlbumPassportTools.tsx',
  'src/app/(platform)/admin/business-catalog/ClosedAlbumWork.tsx',
  'src/app/(platform)/admin/business-catalog/actions.ts',
]) assert.ok(!read(path).includes('\u2014'), `${path}: en dash only`);

console.log('business-catalog-admission-ui-unit: ok');

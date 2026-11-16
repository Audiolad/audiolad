/**
 * t1490u: pure helpers for the closed catalog admin UI. They only DESCRIBE why a track is not
 * admitted yet – the approval rules stay in admin_approve_business_track_passport and
 * passportMissing(). Nothing here approves, skips or changes a passport.
 */
import { passportMissing, type Passport } from './model';

export type AdmissionRefusalCode =
  | 'shazam_pending'
  | 'shazam_missing'
  | 'match'
  | 'fingerprint_missing'
  | 'master'
  | 'fields'
  | 'no_passport'
  | 'revoked'
  | 'error';

/** Order in which reasons are listed to the operator. */
export const ADMISSION_REFUSAL_ORDER: AdmissionRefusalCode[] = [
  'shazam_pending',
  'shazam_missing',
  'fingerprint_missing',
  'match',
  'master',
  'no_passport',
  'fields',
  'revoked',
  'error',
];

export const ADMISSION_REFUSAL_LABELS: Record<AdmissionRefusalCode, string> = {
  shazam_pending: 'Shazam ещё проверяет',
  shazam_missing: 'нет результата Shazam',
  match: 'найдено совпадение Shazam или AcoustID',
  fingerprint_missing: 'нет отпечатка и AcoustID – нужна настройка сервера',
  master: 'нет проверенного мастер-файла',
  fields: 'не заполнены поля паспорта',
  no_passport: 'паспорт не заполнен – нажмите «Заполнить автоматически»',
  revoked: 'паспорт отозван',
  error: 'ошибка при допуске',
};

export const SHAZAM_WAIT_HINT = 'Ждём проверку Shazam – обычно несколько минут.';

const FINGERPRINT_FIELDS = new Set(['fingerprint_sha256', 'acoustid_checked_at', 'acoustid_result', 'evidence_inventory_sha256']);
const SHAZAM_FIELDS = new Set(['shazam_checked_at', 'shazam_result']);
const MASTER_FIELDS = new Set([
  'master_sha256', 'source_sha256', 'stored_master_sha256', 'stored_master_asset_id', 'stored_master_sha256_verified_at',
]);

function blank(value: unknown) {
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * Every reason (not just one) why a track is not admissible right now, or [] when the local
 * checks pass. `shazamActive` = a Shazam queue job of this track is pending/running.
 * A track that is already approved returns [].
 */
export function passportRefusalCodes(passport: Passport | undefined | null, shazamActive = false): AdmissionRefusalCode[] {
  if (!passport || !passport.status) return ['no_passport'];
  if (passport.status === 'approved') return [];
  if (passport.status === 'revoked') return ['revoked'];
  const codes = new Set<AdmissionRefusalCode>();
  const filled = (key: string) => !blank((passport as Record<string, unknown>)[key]);
  if ((filled('shazam_result') && passport.shazam_result !== 'not_found')
    || (filled('acoustid_result') && passport.acoustid_result !== 'not_found')) codes.add('match');
  if ([...SHAZAM_FIELDS].some((key) => !filled(key))) codes.add(shazamActive ? 'shazam_pending' : 'shazam_missing');
  else if (shazamActive) codes.add('shazam_pending');
  if ([...FINGERPRINT_FIELDS].some((key) => !filled(key))) codes.add('fingerprint_missing');
  if ([...MASTER_FIELDS].some((key) => !filled(key))
    || (passport.master_sha256 && passport.master_sha256 !== passport.stored_master_sha256)) codes.add('master');
  // Anything passportMissing() still reports that the groups above do not explain.
  const missing = passportMissing(passport);
  const explained = new Set<string>([
    'Дата проверки Shazam', 'Результат Shazam', 'SHA-256 аудиоотпечатка', 'Дата проверки AcoustID', 'Результат AcoustID',
    'SHA-256 описи доказательств', 'SHA-256 мастер-файла', 'SHA-256 исходного файла', 'Shazam: найдено совпадение',
    'AcoustID: найдено совпадение', 'Проверьте хеш сохранённого мастер-файла', 'Хеш мастер-файла не совпадает',
  ]);
  if (missing.some((label) => !explained.has(label))) codes.add('fields');
  return ADMISSION_REFUSAL_ORDER.filter((code) => codes.has(code));
}

/** Maps a raw admin_approve_business_track_passport error code to a refusal group. */
export function refusalCodeFromRpcError(raw: string | null | undefined): AdmissionRefusalCode {
  const text = raw ?? '';
  if (text.includes('passport_shazam_pending') || text.includes('passport_shazam_stale')) return 'shazam_pending';
  if (text.includes('passport_shazam_match') || text.includes('passport_fingerprint_match')) return 'match';
  if (text.includes('passport_hash_mismatch') || text.includes('passport_master_replaced')) return 'master';
  const fields = text.match(/passport_missing_fields: (.+)/)?.[1];
  if (fields) {
    const keys = fields.split(',').map((key) => key.trim());
    if (keys.includes('passport')) return 'no_passport';
    if (keys.some((key) => SHAZAM_FIELDS.has(key))) return 'shazam_missing';
    if (keys.some((key) => FINGERPRINT_FIELDS.has(key))) return 'fingerprint_missing';
    if (keys.some((key) => MASTER_FIELDS.has(key))) return 'master';
    return 'fields';
  }
  return 'error';
}

export type ApprovalTrackOutcome = {
  id: string;
  title: string;
  outcome: 'approved' | 'already_approved' | 'refused';
  reasons: AdmissionRefusalCode[];
  message?: string;
};

export type ApprovalSummary = {
  total: number;
  approvedNow: number;
  approvedTotal: number;
  refused: number;
  reasonCounts: Partial<Record<AdmissionRefusalCode, number>>;
};

export function summarizeApproval(tracks: ApprovalTrackOutcome[]): ApprovalSummary {
  const reasonCounts: Partial<Record<AdmissionRefusalCode, number>> = {};
  let approvedNow = 0;
  let already = 0;
  let refused = 0;
  for (const track of tracks) {
    if (track.outcome === 'approved') approvedNow += 1;
    else if (track.outcome === 'already_approved') already += 1;
    else {
      refused += 1;
      for (const code of track.reasons.length ? track.reasons : ['error' as const]) {
        reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
      }
    }
  }
  return { total: tracks.length, approvedNow, approvedTotal: approvedNow + already, refused, reasonCounts };
}

export function formatRefusalReasons(reasonCounts: Partial<Record<AdmissionRefusalCode, number>>): string {
  return ADMISSION_REFUSAL_ORDER
    .filter((code) => (reasonCounts[code] ?? 0) > 0)
    .map((code) => `${ADMISSION_REFUSAL_LABELS[code]} (${reasonCounts[code]})`)
    .join(', ');
}

/** «Допущено 7 из 10. Не допущены 3: Shazam ещё проверяет (2), нет проверенного мастер-файла (1).» */
export function formatApprovalSummary(summary: ApprovalSummary): { approvedLine: string; refusedLine: string | null } {
  const now = summary.approvedNow > 0 && summary.approvedNow !== summary.approvedTotal
    ? ` (сейчас – ${summary.approvedNow})`
    : '';
  const approvedLine = `Допущено ${summary.approvedTotal} из ${summary.total}${now}.`;
  if (summary.refused === 0) return { approvedLine, refusedLine: null };
  const reasons = formatRefusalReasons(summary.reasonCounts);
  return { approvedLine, refusedLine: `Не допущены ${summary.refused}${reasons ? `: ${reasons}` : ''}.` };
}

export type AlbumAdmissionTrack = { passport?: Passport | null; shazamActive?: boolean };
export type AlbumAdmissionState = {
  total: number;
  approved: number;
  ready: number;
  complete: boolean;
  reasonCounts: Partial<Record<AdmissionRefusalCode, number>>;
  /** Shown instead of a silent no-op when nothing can be admitted right now. */
  hint: string | null;
};

export function albumAdmissionState(tracks: AlbumAdmissionTrack[]): AlbumAdmissionState {
  let approved = 0;
  let ready = 0;
  const reasonCounts: Partial<Record<AdmissionRefusalCode, number>> = {};
  for (const track of tracks) {
    if (track.passport?.status === 'approved') { approved += 1; continue; }
    const codes = passportRefusalCodes(track.passport ?? undefined, track.shazamActive === true);
    if (codes.length === 0) { ready += 1; continue; }
    for (const code of codes) reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
  }
  const complete = tracks.length > 0 && approved === tracks.length;
  let hint: string | null = null;
  if (!complete && ready === 0 && tracks.length > 0) {
    const reasons = formatRefusalReasons(reasonCounts);
    hint = `Сейчас нет треков, готовых к допуску${reasons ? `: ${reasons}` : ''}.`;
    if (reasonCounts.shazam_pending) hint += ` ${SHAZAM_WAIT_HINT}`;
  }
  return { total: tracks.length, approved, ready, complete, reasonCounts, hint };
}

// ---- «Заполнить автоматически» result ----

/** Server-setup gaps (no fpcalc / no AcoustID key): an amber notice, not a red failure. */
export function isServerSetupAutoFillError(message: string): boolean {
  return message.includes('fpcalc (пакет chromaprint-tools)') || message.includes('Ключ AcoustID не задан');
}

export type AutoFillTrackView = { title: string; ok: boolean; errors: string[]; skipped: string[]; message: string; alreadyDecided?: boolean };
export type AutoFillSummary = { tone: 'ok' | 'notice' | 'error'; message: string; lines: string[]; notes: string[] };

export const AUTOFILL_SETUP_NOTICE = 'Заполнено. Отпечаток и AcoustID будут добавлены после настройки сервера – до этого треки нельзя допустить в Бизнес.';

export function summarizeAutoFill(results: AutoFillTrackView[]): AutoFillSummary {
  const lines: string[] = [];
  const notes: string[] = [];
  let realFailure = false;
  let setupGap = false;
  const addNote = (note: string) => { if (note && !notes.includes(note)) notes.push(note); };
  for (const result of results) {
    if (result.alreadyDecided) {
      lines.push(`${result.title}: пропущен, паспорт уже допущен или отозван.`);
      continue;
    }
    const errors = [...new Set(result.errors.map((item) => item.trim()).filter(Boolean))];
    const setup = errors.filter(isServerSetupAutoFillError);
    const real = errors.filter((item) => !isServerSetupAutoFillError(item));
    for (const note of result.skipped) addNote(note.trim());
    if (real.length > 0 || (!result.ok && errors.length === 0)) {
      realFailure = true;
      const text = real.length ? real.join(' ') : result.message;
      lines.push(`${result.title}: ${text}${setup.length ? ' Отпечаток и AcoustID не записаны.' : ''}`);
    } else if (setup.length > 0) {
      setupGap = true;
      lines.push(`${result.title}: заполнено, кроме отпечатка и AcoustID.`);
    } else {
      lines.push(`${result.title}: заполнено.`);
    }
  }
  const setupNotes = new Set<string>();
  for (const result of results) for (const item of result.errors) if (isServerSetupAutoFillError(item)) setupNotes.add(item.trim());
  for (const note of setupNotes) addNote(note);
  if (realFailure) {
    return { tone: 'error', message: 'Заполнение не удалось у части треков – причины указаны ниже.', lines, notes };
  }
  if (setupGap) return { tone: 'notice', message: AUTOFILL_SETUP_NOTICE, lines, notes };
  return { tone: 'ok', message: 'Автоматическое заполнение завершено. Shazam проверит треки в фоне, допуск – вручную.', lines, notes };
}

// t1485u: pure helpers for the automatic Shazam check of closed Business album tracks.
// Shared by the PM2 worker (scripts/run-business-shazam-worker.mts) and the closed-catalog UI.
// No server-only imports here: the UI renders the state, the worker does the network work.

export const SHAZAM_SEGMENT_SECONDS = 15;
export const SHAZAM_EDGE_OFFSET_SECONDS = 30;
export const SHAZAM_MIN_REQUEST_GAP_MS = 5_000;
export const SHAZAM_MAX_SKEW = 1e-3;
export const SHAZAM_RATE_LIMIT_BASE_MS = 5_000;
export const SHAZAM_RATE_LIMIT_MAX_MS = 160_000;
export const SHAZAM_RATE_LIMIT_RETRIES = 5;
export const SHAZAM_MAX_JOB_ATTEMPTS = 4;

export const SHAZAM_QUEUED_MESSAGE = 'Shazam: автоматическая проверка поставлена в очередь, результат появится у трека через несколько минут.';
export const SHAZAM_QUEUE_UNAVAILABLE_MESSAGE = 'Shazam: автоматическая проверка недоступна – укажите результат вручную.';

export type ShazamSegmentLabel = 't30' | 'mid' | 'end30';

export type ShazamSegmentPlan = {
  label: ShazamSegmentLabel;
  offsetSeconds: number;
  durationSeconds: number;
};

/** 3 windows of 15 s: from 0:30, centred on the middle, and from end−30 s. Clamped for short tracks. */
export function planShazamSegments(trackDurationSeconds: number): ShazamSegmentPlan[] {
  if (!Number.isFinite(trackDurationSeconds) || trackDurationSeconds <= 0) {
    throw new Error('shazam_duration_unknown');
  }
  const duration = trackDurationSeconds;
  const window = Math.min(SHAZAM_SEGMENT_SECONDS, duration);
  const lastStart = Math.max(0, duration - window);
  const clamp = (value: number) => Math.min(Math.max(0, Math.floor(value)), Math.floor(lastStart));
  return [
    { label: 't30', offsetSeconds: clamp(SHAZAM_EDGE_OFFSET_SECONDS), durationSeconds: window },
    { label: 'mid', offsetSeconds: clamp(duration / 2 - SHAZAM_SEGMENT_SECONDS / 2), durationSeconds: window },
    { label: 'end30', offsetSeconds: clamp(duration - SHAZAM_EDGE_OFFSET_SECONDS), durationSeconds: window },
  ];
}

export type ShazamSegmentResult = {
  label: ShazamSegmentLabel;
  offset_seconds: number;
  duration_seconds: number;
  started_at: string;
  finished_at: string;
  elapsed_ms: number;
  matched: boolean | null;
  title: string | null;
  artist: string | null;
  timeskew: number | null;
  frequencyskew: number | null;
  /** Skew of a candidate that max_skew rejected – logged only, never shown as a match. */
  rejected_title: string | null;
  rejected_artist: string | null;
  rejected_timeskew: number | null;
  rejected_frequencyskew: number | null;
  rate_limit_retries: number;
  error: string | null;
};

export type ShazamOutcome = 'no_match' | 'match' | 'error';

/** «совпадений нет» only when all 3 segments answered and none matched or errored. */
export function classifyShazamSegments(segments: readonly Pick<ShazamSegmentResult, 'matched' | 'error'>[]): ShazamOutcome {
  if (segments.some((segment) => segment.matched === true)) return 'match';
  if (segments.length === 3 && segments.every((segment) => segment.matched === false && !segment.error)) return 'no_match';
  return 'error';
}

export function shazamRateLimitBackoffMs(retry: number): number {
  const step = Math.max(0, Math.floor(retry));
  return Math.min(SHAZAM_RATE_LIMIT_MAX_MS, SHAZAM_RATE_LIMIT_BASE_MS * 2 ** step);
}

/** Whole-job retry after an error or exhausted 429 backoff: 2, 4, 8 min … capped at 1 h. */
export function shazamJobRetryDelaySeconds(attempt: number): number {
  const step = Math.max(0, Math.floor(attempt) - 1);
  return Math.min(3_600, 120 * 2 ** step);
}

export type ShazamHelperOutput = {
  ok: boolean;
  library_version: string | null;
  matched: boolean | null;
  title: string | null;
  artist: string | null;
  timeskew: number | null;
  frequencyskew: number | null;
  rejected_title: string | null;
  rejected_artist: string | null;
  rejected_timeskew: number | null;
  rejected_frequencyskew: number | null;
  rate_limited: boolean;
  error: string | null;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parses the last JSON line printed by scripts/business-shazam/recognize_segment.py. */
export function parseShazamHelperOutput(stdout: string): ShazamHelperOutput {
  const line = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
  let raw: Record<string, unknown>;
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not_object');
    raw = parsed as Record<string, unknown>;
  } catch {
    return {
      ok: false, library_version: null, matched: null, title: null, artist: null, timeskew: null, frequencyskew: null,
      rejected_title: null, rejected_artist: null, rejected_timeskew: null, rejected_frequencyskew: null,
      rate_limited: false, error: 'helper_output_unreadable',
    };
  }
  const ok = raw.ok === true;
  const matched = ok ? raw.matched === true : null;
  return {
    ok,
    library_version: str(raw.library_version),
    matched,
    title: matched ? str(raw.title) : null,
    artist: matched ? str(raw.artist) : null,
    timeskew: num(raw.timeskew),
    frequencyskew: num(raw.frequencyskew),
    rejected_title: str(raw.rejected_title),
    rejected_artist: str(raw.rejected_artist),
    rejected_timeskew: num(raw.rejected_timeskew),
    rejected_frequencyskew: num(raw.rejected_frequencyskew),
    rate_limited: raw.rate_limited === true,
    error: ok ? null : (str(raw.error) ?? 'helper_failed'),
  };
}

// ---------- UI state ----------

export type ShazamCheckRow = {
  id?: string;
  audio_item_id: string;
  status: 'pending' | 'running' | 'no_match' | 'match' | 'error' | 'skipped';
  attempts?: number | null;
  segments?: unknown;
  error?: string | null;
  passport_written?: boolean | null;
  library_version?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
};

export type ShazamMatchView = { title: string; artist: string; skew: string; offset: string };

export type ShazamCheckView =
  | { state: 'none' }
  | { state: 'pending'; label: string }
  | { state: 'no_match'; label: string; date: string | null }
  | { state: 'match'; label: string; matches: ShazamMatchView[] }
  | { state: 'error'; label: string };

const MOSCOW_DATE = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
});

export function formatMoscowDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return MOSCOW_DATE.format(new Date(parsed));
}

function formatOffset(seconds: unknown): string {
  const value = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function formatSkew(timeskew: unknown, frequencyskew: unknown): string {
  const values = [timeskew, frequencyskew].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return 'нет данных';
  const skew = Math.max(...values.map((v) => Math.abs(v)));
  return skew.toFixed(4).replace('.', ',');
}

export function shazamMatchesFromSegments(segments: unknown): ShazamMatchView[] {
  if (!Array.isArray(segments)) return [];
  const out: ShazamMatchView[] = [];
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue;
    const row = segment as Record<string, unknown>;
    if (row.matched !== true) continue;
    out.push({
      title: str(row.title) ?? 'без названия',
      artist: str(row.artist) ?? 'исполнитель не указан',
      skew: formatSkew(row.timeskew, row.frequencyskew),
      offset: formatOffset(row.offset_seconds),
    });
  }
  return out;
}

/**
 * The passport is the source of truth for «совпадений нет»: a manual entry shows the same way.
 * The latest automatic check adds «проверяется» and «найдено» states for the operator.
 */
export function shazamCheckView(
  check: ShazamCheckRow | null | undefined,
  passport?: { shazam_result?: string | null; shazam_checked_at?: string | null } | null,
): ShazamCheckView {
  if (check && (check.status === 'pending' || check.status === 'running')) {
    return { state: 'pending', label: 'Shazam: проверяется автоматически' };
  }
  const manualAfterCheck = check?.status === 'match' && passport?.shazam_result === 'not_found'
    && Date.parse(passport.shazam_checked_at ?? '') > Date.parse(check.finished_at ?? '');
  if (check?.status === 'match' && !manualAfterCheck) {
    return { state: 'match', label: 'Shazam нашёл совпадение – проверьте вручную, допуск не выполнен', matches: shazamMatchesFromSegments(check.segments) };
  }
  if (passport?.shazam_result === 'not_found') {
    const date = formatMoscowDate(passport.shazam_checked_at);
    return { state: 'no_match', label: date ? `Shazam: совпадений нет – ${date}` : 'Shazam: совпадений нет', date };
  }
  if (passport?.shazam_result === 'match') {
    return { state: 'match', label: 'Shazam: в паспорте указано совпадение', matches: [] };
  }
  if (check?.status === 'no_match' && check.error === 'passport_not_draft') {
    return { state: 'error', label: 'Shazam совпадений не нашёл, но паспорт уже не черновик – поле не изменено' };
  }
  if (check?.status === 'error') {
    return { state: 'error', label: 'Shazam: автоматическая проверка не удалась – укажите результат вручную' };
  }
  return { state: 'none' };
}

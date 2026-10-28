import { isSoundReviewStatus, type SoundReviewRow, type SoundReviewStatus } from '@/lib/business/track-sound-review';

/** One admin action stays bounded. Larger sets are narrowed with filters and retried. */
export const SOUND_REVIEW_BULK_LIMIT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SoundReviewBulkScope =
  | { kind: 'ids'; ids: string[] }
  | { kind: 'filter'; status: string; artist: string; album: string; space: string; excludedIds: string[] }
  | { kind: 'album'; albumId: string; excludedIds: string[] }
  | { kind: 'artist'; artistId: string; excludedIds: string[] };

export type SoundReviewQueueScope = {
  status: string;
  artist: string;
  album: string;
  space: string;
  total: number;
  albumTotal: number | null;
  artistTotal: number | null;
};

export type SoundReviewSelection =
  | { kind: 'none' }
  | { kind: 'ids'; ids: string[] }
  | { kind: 'filter'; excludedIds: string[] }
  | { kind: 'album'; excludedIds: string[] }
  | { kind: 'artist'; excludedIds: string[] };

export function soundReviewSelectionCount(selection: SoundReviewSelection, scope: SoundReviewQueueScope) {
  if (selection.kind === 'none') return 0;
  if (selection.kind === 'ids') return selection.ids.length;
  const base = selection.kind === 'filter' ? scope.total
    : selection.kind === 'album' ? scope.albumTotal ?? 0
    : scope.artistTotal ?? 0;
  return Math.max(0, base - selection.excludedIds.length);
}

export function soundReviewBulkConfirm(statusLabel: string, count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11 ? 'треку' : 'трекам';
  return `Применить «${statusLabel}» к ${count} ${noun}? Решение и история запишутся по каждому треку.`;
}

export function soundReviewBulkMessage(saved: number, failed: number, problem?: 'too_many' | 'unavailable' | 'empty' | 'invalid') {
  if (problem === 'too_many') return { ok: false as const, saved: 0, failed: 0, message: 'Слишком много треков за один раз. Сузьте фильтр.' };
  if (problem === 'unavailable') return { ok: false as const, saved, failed, message: 'Не удалось прочитать очередь. Повторите попытку.' };
  if (problem === 'invalid') return { ok: false as const, saved: 0, failed: 0, message: 'Проверьте поля решения.' };
  if (problem === 'empty' || (saved === 0 && failed === 0)) return { ok: false as const, saved: 0, failed: 0, message: 'Ничего не выбрано.' };
  if (failed === 0) return { ok: true as const, saved, failed, message: `Сохранено: ${saved}.` };
  if (saved === 0) return { ok: false as const, saved, failed, message: `Не сохранено: ${failed}. Обновите очередь и повторите попытку.` };
  return { ok: true as const, saved, failed, message: `Сохранено: ${saved}. Не сохранено: ${failed}.` };
}

function cleanIds(ids: readonly string[]) {
  return [...new Set(ids.filter((id) => UUID.test(id)))];
}

/** Same status and reason on the current file is already done. A retry does not add another history row. */
export function soundReviewAlreadySaved(row: SoundReviewRow, status: SoundReviewStatus, reason: string) {
  return row.status === status && (row.reason ?? '') === reason.trim();
}

export async function collectQueuedSoundReviews(
  loadPage: (page: number) => Promise<{ rows: SoundReviewRow[]; total: number } | null>,
  excludedIds: readonly string[],
  limit = SOUND_REVIEW_BULK_LIMIT,
): Promise<{ ok: true; rows: SoundReviewRow[] } | { ok: false; reason: 'too_many' | 'unavailable' }> {
  const first = await loadPage(0);
  if (!first || !Array.isArray(first.rows) || !Number.isFinite(first.total)) return { ok: false, reason: 'unavailable' };
  const excluded = new Set(cleanIds(excludedIds));
  if (Math.max(0, first.total - excluded.size) > limit) return { ok: false, reason: 'too_many' };
  const rows: SoundReviewRow[] = [];
  const seen = new Set<string>();
  const take = (pageRows: SoundReviewRow[]) => {
    for (const row of pageRows) {
      if (!row?.id || seen.has(row.id) || excluded.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  };
  take(first.rows);
  const pages = Math.min(1000, Math.ceil(Math.max(0, first.total) / 100));
  for (let page = 1; page < pages; page++) {
    const next = await loadPage(page);
    if (!next || !Array.isArray(next.rows)) return { ok: false, reason: 'unavailable' };
    take(next.rows);
    if (!next.rows.length) break;
  }
  if (rows.length > limit) return { ok: false, reason: 'too_many' };
  return { ok: true, rows };
}

export function soundReviewBulkScopeFilter(scope: SoundReviewBulkScope): { p_status: string | null; p_artist: string | null; p_album: string | null; p_space: string | null; excludedIds: string[] } | null {
  if (scope.kind === 'ids') return null;
  if (scope.kind === 'album') {
    if (!UUID.test(scope.albumId)) return null;
    return { p_status: null, p_artist: null, p_album: scope.albumId, p_space: null, excludedIds: scope.excludedIds };
  }
  if (scope.kind === 'artist') {
    if (!UUID.test(scope.artistId)) return null;
    return { p_status: null, p_artist: scope.artistId, p_album: null, p_space: null, excludedIds: scope.excludedIds };
  }
  if (scope.status && !isSoundReviewStatus(scope.status)) return null;
  if (scope.artist && !UUID.test(scope.artist)) return null;
  if (scope.album && !UUID.test(scope.album)) return null;
  return {
    p_status: scope.status || null,
    p_artist: scope.artist || null,
    p_album: scope.album || null,
    p_space: scope.space || null,
    excludedIds: scope.excludedIds,
  };
}

export async function saveSoundReviewBatch(
  rows: readonly SoundReviewRow[],
  status: SoundReviewStatus,
  reason: string,
  review: (row: SoundReviewRow) => Promise<boolean>,
) {
  let saved = 0;
  let failed = 0;
  for (let index = 0; index < rows.length; index += 25) {
    const chunk = rows.slice(index, index + 25);
    for (const row of chunk) {
      if (soundReviewAlreadySaved(row, status, reason)) {
        saved += 1;
        continue;
      }
      try {
        if (await review(row)) saved += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { saved, failed };
}

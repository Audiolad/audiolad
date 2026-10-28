'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminPermission } from '@/lib/admin/guard';
import { isSoundReviewStatus, type SoundReviewHistory, type SoundReviewRow } from '@/lib/business/track-sound-review';
import { locateSoundReviewRow } from '@/lib/business/track-sound-preview.server';
import { businessTrackPreviewHref } from '@/lib/business/track-sound-preview';
import { isBusinessSpaceId } from '@/lib/business-workspace/spaces';
import {
  SOUND_REVIEW_BULK_LIMIT,
  collectQueuedSoundReviews,
  soundReviewBulkMessage,
  soundReviewBulkScopeFilter,
  saveSoundReviewBatch,
  type SoundReviewBulkScope,
} from '@/lib/business/track-sound-bulk';
import { admissionAuthorsVisible, hiddenArtistIds, listSectorAlbums, verifiedRightsAuthorIds } from '@/lib/business-admission/agreement.server';
import { sectorNextValue } from '@/lib/business-admission/sectors';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reviewBusinessTrack(input: {
  id: string; status: string; reason: string; audioIdentity: string;
}): Promise<{ ok: boolean; message: string }> {
  await requireAdminPermission('author_products.moderate');
  if (!input || typeof input.id !== 'string' || typeof input.reason !== 'string' || typeof input.audioIdentity !== 'string'
    || !UUID.test(input.id) || !isSoundReviewStatus(input.status) || input.reason.length > 2000
    || input.audioIdentity.length > 4000) return { ok: false, message: 'Проверьте поля решения.' };
  const db = await createClient();
  const { error } = await db.rpc('admin_review_business_track_sound', {
    p_audio_item_id: input.id, p_status: input.status, p_reason: input.reason,
    p_audio_identity: input.audioIdentity,
  });
  if (error) return { ok: false, message: error.code === '40001'
    ? 'Аудиофайл заменён. Обновите очередь и прослушайте новую версию.'
    : 'Решение не сохранено. Обновите очередь и повторите попытку.' };
  revalidatePath('/admin/business-track-review');
  return { ok: true, message: 'Решение сохранено.' };
}

export async function reviewBusinessTracksBulk(input: {
  scope: SoundReviewBulkScope; status: string; reason: string;
}): Promise<{ ok: boolean; saved: number; failed: number; message: string }> {
  await requireAdminPermission('author_products.moderate');
  if (!input || typeof input.reason !== 'string' || input.reason.length > 2000 || !isSoundReviewStatus(input.status) || !input.scope) {
    return soundReviewBulkMessage(0, 0, 'invalid');
  }
  const db = await createClient();
  const verified = await verifiedRightsAuthorIds();
  const hidden = await hiddenArtistIds();
  const review = async (row: SoundReviewRow) => {
    const { error } = await db.rpc('admin_review_business_track_sound', {
      p_audio_item_id: row.id, p_status: input.status, p_reason: input.reason, p_audio_identity: row.audio_identity,
    });
    return !error;
  };
  if (input.scope.kind === 'ids') {
    const ids = [...new Set(input.scope.ids)].filter((id) => UUID.test(id));
    if (!ids.length) return soundReviewBulkMessage(0, 0, 'empty');
    if (ids.length > SOUND_REVIEW_BULK_LIMIT) return soundReviewBulkMessage(0, 0, 'too_many');
    const rows: SoundReviewRow[] = [];
    let missing = 0;
    for (const id of ids) {
      const row = await locateSoundReviewRow(db, id);
      if (!row) missing += 1;
      else rows.push(row);
    }
    if (rows.some((row) => !verified.has(row.artist_id))) {
      return { ok: false, saved: 0, failed: 0, message: 'В выборе есть треки без подтверждённых прав.' };
    }
    if (rows.some((row) => hidden.has(row.artist_id))) {
      return { ok: false, saved: 0, failed: 0, message: 'В выборе есть скрытые артисты.' };
    }
    const saved = await saveSoundReviewBatch(rows, input.status, input.reason, review);
    const result = soundReviewBulkMessage(saved.saved, saved.failed + missing);
    if (result.saved > 0) revalidatePath('/admin/business-track-review');
    return result;
  }
  const filter = soundReviewBulkScopeFilter(input.scope);
  if (!filter || (filter.p_space && !isBusinessSpaceId(filter.p_space))) return soundReviewBulkMessage(0, 0, 'invalid');
  const collected = await collectQueuedSoundReviews(async (page) => {
    const { data, error } = await db.rpc('admin_business_sound_queue', {
      p_status: filter.p_status, p_artist: filter.p_artist, p_album: filter.p_album, p_space: filter.p_space, p_page: page,
    });
    if (error || !data) return null;
    const payload = data as { rows?: SoundReviewRow[]; total?: number };
    if (!Array.isArray(payload.rows) || typeof payload.total !== 'number') return null;
    return { rows: payload.rows, total: payload.total };
  }, filter.excludedIds);
  if (!collected.ok) return soundReviewBulkMessage(0, 0, collected.reason);
  const allowedRows = collected.rows.filter((row) => verified.has(row.artist_id) && !hidden.has(row.artist_id));
  const saved = await saveSoundReviewBatch(allowedRows, input.status, input.reason, review);
  const result = soundReviewBulkMessage(saved.saved, saved.failed);
  if (result.saved > 0) revalidatePath('/admin/business-track-review');
  return result;
}

export async function saveAlbumSectors(form: FormData): Promise<void> {
  await requireAdminPermission('author_products.moderate');
  const ids = [...new Set(form.getAll('albumId').map(String))].filter((id) => UUID.test(id));
  const checked = new Set(form.getAll('on').map(String));
  const reset = String(form.get('reset') ?? '') === '1';
  let failed = ids.length === 0 || ids.length > 200;
  const writes = new Map<string, string[]>();
  if (!failed) {
    try {
      if (!await admissionAuthorsVisible('album', ids)) failed = true;
      else {
        const board = await listSectorAlbums(ids);
        for (const album of board.albums.filter((item) => ids.includes(item.id))) {
          for (const direction of board.directions) {
            const next = sectorNextValue(album.sectors[direction.key] ?? { artist: null, album: null }, checked.has(direction.key), reset);
            if (next === undefined) continue;
            const bucket = `${direction.key}\n${String(next)}`;
            writes.set(bucket, [...(writes.get(bucket) ?? []), album.id]);
          }
        }
        const db = await createClient();
        for (const [bucket, albumIds] of writes) {
          const [direction, allowed] = bucket.split('\n');
          const { error } = await db.rpc('set_business_content_admissions', {
            p_direction: direction, p_kind: 'album', p_ids: albumIds,
            p_allowed: allowed === 'true' ? true : allowed === 'false' ? false : null,
          });
          if (error) failed = true;
        }
      }
    } catch { failed = true; }
  }
  revalidatePath('/admin/business-track-review');
  const query = new URLSearchParams({ sectors: failed ? 'error' : 'saved' });
  for (const key of ['status', 'artist', 'album', 'space', 'page']) {
    const value = form.get(key);
    if (typeof value === 'string' && value) query.set(key, value);
  }
  redirect(`/admin/business-track-review?${query}`);
}

export async function previewBusinessTrack(id: string, audioIdentity: string) {
  await requireAdminPermission('author_products.moderate');
  if (typeof id !== 'string' || !UUID.test(id) || typeof audioIdentity !== 'string' || audioIdentity.length > 4000) {
    return { ok: false as const, reason: 'invalid_request' };
  }
  // The playback route checks the same grants again. This only fails fast for the button.
  const db = await createClient();
  const row = await locateSoundReviewRow(db, id);
  if (!row || row.audio_identity !== audioIdentity) {
    return { ok: false as const, reason: row ? 'audio_replaced_reload' : 'not_in_queue' };
  }
  return { ok: true as const, url: businessTrackPreviewHref(id, audioIdentity) };
}

export async function businessTrackReviewHistory(id: string, before?: number): Promise<SoundReviewHistory[]> {
  await requireAdminPermission('author_products.moderate');
  if (!UUID.test(id)) throw new Error('invalid_request');
  const db = await createClient();
  let query = db.from('business_track_sound_review_history')
    .select('id,old_status,new_status,reason,changed_at,changed_by,event').eq('audio_item_id', id);
  if (before != null) query = query.lt('id', before);
  const { data, error } = await query.order('id', { ascending: false }).limit(50);
  if (error) throw new Error('history_unavailable');
  return data as SoundReviewHistory[];
}

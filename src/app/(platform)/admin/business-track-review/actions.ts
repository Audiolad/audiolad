'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/lib/admin/guard';
import { isSoundReviewStatus, type SoundReviewHistory } from '@/lib/business/track-sound-review';
import { locateSoundReviewRow } from '@/lib/business/track-sound-preview.server';
import { businessTrackPreviewHref } from '@/lib/business/track-sound-preview';
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

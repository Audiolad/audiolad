'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/lib/admin/guard';
import { isSoundReviewStatus, type SoundReviewHistory, type SoundReviewRow } from '@/lib/business/track-sound-review';
import { signWorkspaceAudio } from '@/lib/business-workspace/sign.server';
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
  // Guard the queue membership and identity with the same session RPC as the page.
  // Filter by album is derived from the requested track, never trusted from the client.
  const db = await createClient();
  // Public track metadata is readable to the administrator; all decisions stay in guarded RPCs.
  const { data: audio } = await db.from('audio_items').select('practice_id').eq('id', id).maybeSingle();
  if (!audio) return { ok: false as const, reason: 'not_in_queue' };
  const { data, error } = await db.rpc('admin_business_sound_queue', { p_album: audio.practice_id, p_page: 0 });
  if (error) return { ok: false as const, reason: 'not_in_queue' };
  // Albums can exceed one page. Walk the server queue without a fixed row ceiling.
  let rows = data.rows as SoundReviewRow[];
  let row = rows.find((item) => item.id === id);
  for (let page = 1; !row && page * 100 < data.total; page++) {
    const next = await db.rpc('admin_business_sound_queue', { p_album: audio.practice_id, p_page: page });
    if (next.error) break;
    rows = next.data.rows as SoundReviewRow[];
    row = rows.find((item) => item.id === id);
  }
  if (!row || row.audio_identity !== audioIdentity) return { ok: false as const, reason: 'audio_replaced_reload' };
  return signWorkspaceAudio(id, new Set([id]), audioIdentity);
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

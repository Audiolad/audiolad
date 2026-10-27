import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

/** Fresh fail-closed gate, deliberately outside the cached legal decision pool. */
export async function soundAllowedTrackIds(
  ids: readonly string[], space: string,
  db = createServiceRoleClient(),
): Promise<Set<string>> {
  const allowed = new Set<string>();
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await db.rpc('business_sound_allowed_tracks', {
      p_audio_item_ids: ids.slice(i, i + 80), p_space_id: space,
    });
    if (error || !Array.isArray(data)) throw new Error('business_sound_gate_unavailable');
    for (const row of data) allowed.add(row.audio_item_id as string);
  }
  return allowed;
}

export function sameSoundAudioIdentity(identity: string, row: {
  audio_path: string | null; desired_music_master_asset_id: string | null; active_music_delivery_asset_id: string | null;
}): boolean {
  try {
    return JSON.stringify(JSON.parse(identity)) === JSON.stringify([
      row.audio_path, row.desired_music_master_asset_id, row.active_music_delivery_asset_id,
    ]);
  } catch { return false; }
}

/** Check the very source about to be signed, after loading the manifest. */
export async function hasCurrentSoundApproval(db: ReturnType<typeof createServiceRoleClient>, row: {
  id: string; audio_path: string | null; desired_music_master_asset_id: string | null; active_music_delivery_asset_id: string | null;
}): Promise<boolean> {
  const { data, error } = await db.from('business_track_sound_reviews')
    .select('status,audio_identity').eq('audio_item_id', row.id).maybeSingle();
  return !error && data?.status === 'approved' && sameSoundAudioIdentity(data.audio_identity as string, row);
}

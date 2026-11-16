import 'server-only';
import { createHash } from 'node:crypto';
import { requireAdminPanelAccess } from '@/lib/admin/guard';
import { listAuthorWorkspacesForUser } from '@/lib/author-products/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { PASSPORT_FIELDS, type Passport } from './model';
import { loadCatalogAndAlbumDefaults, loadCatalogAndAlbumLicenseRefs } from '@/lib/business-track-passports/license.server';
import { resolveCatalogPassportDefaults } from '@/lib/business-track-passports/shared';
import type { ShazamCheckRow, ShazamGateFacts } from '@/lib/business-track-passports/shazam';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value: string) { if (!UUID.test(value)) throw new Error('Некорректный идентификатор.'); }
function rpcError(error: { message: string } | null) {
  if (error) {
    const fields = error.message.match(/passport_missing_fields: (.+)/)?.[1];
    if (fields) throw new Error(`Заполните обязательные поля: ${fields.split(',').map((key) => PASSPORT_FIELDS[key as keyof typeof PASSPORT_FIELDS] ?? key).join(', ')}.`);
    if (error.message.includes('passport_hash_mismatch')) throw new Error('Хеш мастер-файла не совпадает.');
    if (error.message.includes('passport_fingerprint_match')) throw new Error('Найдено совпадение Shazam или AcoustID. Допуск заблокирован.');
    if (error.message.includes('passport_shazam_pending')) throw new Error('Shazam ещё проверяет этот трек. Допустить его можно, когда проверка закончится.');
    if (error.message.includes('passport_shazam_match')) throw new Error('Shazam нашёл совпадение. Если это ложное срабатывание, проверьте трек вручную и укажите «Совпадений нет», затем допустите трек.');
    if (error.message.includes('passport_shazam_stale')) throw new Error('Результат Shazam относится к прежнему мастер-файлу. Дождитесь проверки нового мастера.');
    throw new Error('Операция не выполнена. Обновите страницу и проверьте поля паспорта.');
  }
}
// t1485u: per track, the facts admin_approve_business_track_passport uses, so the status line
// mirrors the gate exactly: the latest check (any status), the latest FINAL check (match |
// no_match) of the current master, and the master of an automatic passport «not_found» (same
// marker as business_passport_auto_shazam_master). Each is a per-track LIMIT 1 query, never a
// shared cap across the album. A missing queue table (migration not yet applied) must never
// break the closed catalog page, so errors yield empty state.
const SHAZAM_CHECK_COLUMNS = 'id,audio_item_id,master_asset_id,status,attempts,segments,error,passport_written,library_version,created_at,finished_at';
type ShazamTrackState = { latest: ShazamCheckRow | null; final: ShazamCheckRow | null | undefined; gate: ShazamGateFacts };
async function loadTrackShazamState(
  db: ReturnType<typeof createServiceRoleClient>,
  track: { id: string; master: string | null; passport?: Passport },
): Promise<ShazamTrackState> {
  const empty: ShazamTrackState = { latest: null, final: undefined, gate: {} };
  const checks = () => db.from('business_passport_shazam_checks').select(SHAZAM_CHECK_COLUMNS).eq('audio_item_id', track.id);
  const latest = await checks().order('created_at', { ascending: false }).limit(1);
  if (latest.error) return empty;
  let final: ShazamCheckRow | null = null;
  if (track.master) {
    const finals = await checks().eq('master_asset_id', track.master).in('status', ['match', 'no_match'])
      .order('created_at', { ascending: false }).limit(1);
    if (finals.error) return empty;
    final = ((finals.data ?? [])[0] as ShazamCheckRow | undefined) ?? null;
  }
  let autoMaster: string | null = null;
  const checkedAt = track.passport?.shazam_checked_at;
  if (track.passport?.shazam_result === 'not_found' && checkedAt) {
    const auto = await db.from('business_passport_shazam_checks').select('master_asset_id')
      .eq('audio_item_id', track.id).eq('passport_written', true).eq('passport_checked_at', checkedAt)
      .order('finished_at', { ascending: false, nullsFirst: false }).limit(1);
    if (auto.error) return empty;
    const row = (auto.data ?? [])[0] as { master_asset_id?: string | null } | undefined;
    autoMaster = row?.master_asset_id ?? null;
  }
  return {
    latest: ((latest.data ?? [])[0] as ShazamCheckRow | undefined) ?? null,
    final,
    gate: { autoMaster, currentMaster: track.master },
  };
}
export async function loadClosedBusinessCatalog() {
  const admin = await requireAdminPanelAccess();
  const authors = await listAuthorWorkspacesForUser(admin.userId);
  const db = createServiceRoleClient();
  const albums = await db.from('practices')
    .select('id,title,author_id,status,cover_url,cover_image,updated_at')
    .eq('business_only', true).is('deleted_at', null).order('created_at', { ascending: false });
  if (albums.error) throw new Error('Не удалось загрузить закрытый каталог.');
  const albumIds = (albums.data ?? []).map((album) => String(album.id));
  const licenseRefs = await loadCatalogAndAlbumLicenseRefs(albumIds);
  const defaults = await loadCatalogAndAlbumDefaults(albumIds);
  const catalogDefaults = resolveCatalogPassportDefaults(null, defaults.catalogDefaults);
  const authorIds = [...new Set((albums.data ?? []).map((album) => String(album.author_id ?? '')).filter(Boolean))];
  const names = new Map<string, string>();
  for (let index = 0; index < authorIds.length; index += 100) {
    const { data, error } = await db.from('authors').select('id, name').in('id', authorIds.slice(index, index + 100));
    if (error) throw new Error('Не удалось загрузить закрытый каталог.');
    for (const row of (data ?? []) as { id: string; name: string | null }[]) names.set(row.id, row.name?.trim() ?? '');
  }
  const rows = [];
  for (const album of albums.data ?? []) {
    const tracks = await db.from('audio_items').select('id,title,music_track_code,desired_music_master_asset_id').eq('practice_id', album.id).order('position');
    const passports = await db.from('business_track_passports').select('*').eq('practice_id', album.id);
    if (tracks.error || passports.error) throw new Error('Не удалось загрузить паспорта.');
    const passportOf = (trackId: string) => (passports.data ?? []).find((p) => p.audio_item_id === trackId) as Passport | undefined;
    const shazamStates = await Promise.all((tracks.data ?? []).map((track) => loadTrackShazamState(db, {
      id: String(track.id),
      master: typeof track.desired_music_master_asset_id === 'string' ? track.desired_music_master_asset_id : null,
      passport: passportOf(String(track.id)),
    })));
    rows.push({
      ...album,
      authorName: names.get(String(album.author_id ?? '')) ?? '',
      tracks: (tracks.data ?? []).map((track, index) => ({
        ...track,
        music_track_code: typeof track.music_track_code === 'string' ? track.music_track_code : null,
        passport: (passports.data ?? []).find((p) => p.audio_item_id === track.id) as Passport | undefined,
        shazamCheck: shazamStates[index]?.latest ?? null,
        shazamFinalCheck: shazamStates[index]?.final,
        shazamGate: shazamStates[index]?.gate ?? {},
      })),
      licenseRef: licenseRefs.albumLicenseRefs[String(album.id)] ?? null,
      defaults: defaults.albumDefaults[String(album.id)] ?? null,
    });
  }
  return { authors, albums: rows, catalogLicenseRef: licenseRefs.catalogLicenseRef, catalogDefaults };
}
export async function createClosedBusinessAlbum(authorId: string, title: string) {
  const admin = await requireAdminPanelAccess();
  id(authorId);
  const authors = await listAuthorWorkspacesForUser(admin.userId);
  if (!authors.some((author) => author.id === authorId)) throw new Error('Нет доступа к автору для загрузки музыки.');
  if (!title.trim() || title.length > 300) throw new Error('Введите название до 300 символов.');
  const db = await createClient();
  const { data, error } = await db.rpc('admin_create_business_album', { p_author_id: authorId, p_title: title.trim() });
  rpcError(error);
  return data as string;
}
export async function saveBusinessPassport(audioItemId: string, fields: Record<string, unknown>, options?: { keys?: readonly string[] }) {
  await requireAdminPanelAccess();
  id(audioItemId);
  // Never accept status, approvals, verified hashes or timestamps from the client.
  const allowed = new Set(Object.keys(PASSPORT_FIELDS));
  const keys = (options?.keys ?? Object.keys(PASSPORT_FIELDS)).filter((key) => allowed.has(key));
  const safe = Object.fromEntries(keys.map((key) => [key, typeof fields[key] === 'string' ? fields[key] : null]));
  const db = await createClient();
  const { error } = await db.rpc('admin_upsert_business_track_passport', { p_audio_item_id: audioItemId, p_fields: safe });
  rpcError(error);
}
export async function verifyBusinessMaster(audioItemId: string) {
  const admin = await requireAdminPanelAccess();
  id(audioItemId);
  const db = createServiceRoleClient();
  const { data: audio, error: audioError } = await db.from('audio_items').select('desired_music_master_asset_id,practice_id').eq('id', audioItemId).single();
  if (audioError || !audio?.desired_music_master_asset_id) throw new Error('Сначала загрузите мастер-файл.');
  const { data: album } = await db.from('practices').select('business_only').eq('id', audio.practice_id).single();
  if (album?.business_only !== true) throw new Error('Нужен закрытый альбом Бизнеса.');
  const { data: asset, error: assetError } = await db.from('music_audio_assets').select('id,storage_bucket,storage_path,size_bytes')
    .eq('id', audio.desired_music_master_asset_id).eq('audio_item_id', audioItemId).eq('asset_role', 'master').eq('lifecycle_state', 'verified').single();
  if (assetError || !asset || asset.storage_bucket !== 'music-masters') throw new Error('Мастер-файл ещё не проверен при загрузке.');
  const { data: signed, error: signedError } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 300);
  if (signedError || !signed) throw new Error('Не удалось прочитать мастер-файл.');
  const response = await fetch(signed.signedUrl, { cache: 'no-store', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error('Не удалось прочитать мастер-файл.');
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 314572800) throw new Error('Мастер-файл превышает допустимый размер.');
      hash.update(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  if (bytes === 0 || bytes !== Number(asset.size_bytes)) throw new Error('Размер сохранённого файла не совпадает.');
  const sha256 = hash.digest('hex');
  const { error } = await db.rpc('record_business_master_hash', {
    p_audio_item_id: audioItemId, p_asset_id: asset.id, p_sha256: sha256, p_admin_id: admin.userId,
  });
  rpcError(error);
  return sha256;
}
export async function decideBusinessPassport(audioItemId: string, decision: 'approve' | 'revoke') {
  await requireAdminPanelAccess();
  id(audioItemId);
  const db = await createClient();
  const { error } = await db.rpc(decision === 'approve' ? 'admin_approve_business_track_passport' : 'admin_revoke_business_track_passport', { p_audio_item_id: audioItemId });
  rpcError(error);
}

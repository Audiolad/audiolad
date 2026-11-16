import 'server-only';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants as fsConstants, createWriteStream } from 'node:fs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { getPriority, setPriority, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { requireAdminPanelAccess } from '@/lib/admin/guard';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { PASSPORT_FIELDS, passportMissing, type Passport } from '@/lib/business-track-passports/model';
import {
  ALBUM_SHARED_PASSPORT_FIELDS,
  evidenceInventorySha256,
  findConfiguredAcoustIdEnvName,
  generatedAtFromTimestamps,
  generationRefForTrackTitle,
  parseAcoustIdLookup,
  parseFpcalcJson,
  pickAlbumSharedPassport,
  resolveCatalogPassportDefaults,
} from '@/lib/business-track-passports/shared';
import { findBusinessPassportLicense, loadCatalogPassportDefaults } from '@/lib/business-track-passports/license.server';
import { saveBusinessPassport, decideBusinessPassport } from '@/lib/business-track-passports/admin.server';

const execFileAsync = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MASTER_BYTES = 314_572_800;

function id(value: string) {
  if (!UUID.test(value)) throw new Error('Некорректный идентификатор.');
}

async function withLowPriority<T>(work: () => Promise<T>): Promise<T> {
  let previous: number | null = null;
  try {
    previous = getPriority();
    setPriority(10);
  } catch {
    previous = null;
  }
  try {
    return await work();
  } finally {
    if (previous !== null) {
      try { setPriority(previous); } catch { /* keep going */ }
    }
  }
}

async function resolveFpcalcPath(): Promise<string | null> {
  const configured = process.env.FPCALC_PATH?.trim();
  if (configured) {
    try {
      await access(configured, fsConstants.X_OK);
      return configured;
    } catch {
      return null;
    }
  }
  try {
    const { stdout } = await execFileAsync('which', ['fpcalc'], { timeout: 5_000 });
    const found = stdout.trim();
    return found || null;
  } catch {
    return null;
  }
}


async function runFpcalc(bin: string, filePath: string): Promise<{ duration: number; fingerprint: string }> {
  const { stdout } = await execFileAsync('nice', ['-n', '10', bin, '-json', '-length', '120', filePath], {
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return parseFpcalcJson(stdout);
}

function acoustIdKey(): string | null {
  const name = findConfiguredAcoustIdEnvName();
  return name ? process.env[name]?.trim() || null : null;
}

async function lookupAcoustId(fingerprint: string, durationSeconds: number): Promise<{ result: 'not_found' | 'match'; checkedAt: string } | { error: string }> {
  const key = acoustIdKey();
  if (!key) {
    return { error: 'Ключ AcoustID не задан в окружении (ACOUSTID_API_KEY). Результат AcoustID не записан.' };
  }
  const url = new URL('https://api.acoustid.org/v2/lookup');
  url.searchParams.set('client', key);
  url.searchParams.set('meta', 'recordings');
  url.searchParams.set('duration', String(Math.round(durationSeconds)));
  url.searchParams.set('fingerprint', fingerprint);
  let payload: unknown;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'AudioLad-business-passport/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    payload = await response.json();
    if (!response.ok) {
      const parsed = parseAcoustIdLookup(payload);
      return { error: parsed.status === 'error' ? parsed.message : `AcoustID вернул статус ${response.status}. Результат не записан.` };
    }
  } catch {
    return { error: 'Не удалось обратиться к AcoustID. Результат не записан.' };
  }
  const parsed = parseAcoustIdLookup(payload);
  if (parsed.status === 'error') return { error: `${parsed.message} Результат не записан.` };
  return { result: parsed.status, checkedAt: new Date().toISOString() };
}

async function hashAndStoreMaster(signedUrl: string, expectedBytes: number, destPath: string): Promise<string> {
  const response = await fetch(signedUrl, { cache: 'no-store', signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error('Не удалось прочитать мастер-файл.');
  const hash = createHash('sha256');
  let bytes = 0;
  const output = createWriteStream(destPath);
  const source = Readable.from(async function* () {
    const reader = response.body!.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_MASTER_BYTES) throw new Error('Мастер-файл превышает допустимый размер.');
        hash.update(value);
        yield value;
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }());
  try {
    await pipeline(source, output);
  } catch (error) {
    await rm(destPath, { force: true });
    throw error;
  }
  if (bytes === 0 || bytes !== expectedBytes) {
    await rm(destPath, { force: true });
    throw new Error('Размер сохранённого файла не совпадает.');
  }
  return hash.digest('hex');
}

export type AutoFillTrackResult = {
  ok: boolean;
  trackId: string;
  title: string;
  filled: string[];
  skipped: string[];
  errors: string[];
  message: string;
};


async function defaultsForAlbum(albumId: string) {
  const album = await loadCatalogPassportDefaults({ albumId });
  const catalog = await loadCatalogPassportDefaults('catalog');
  return resolveCatalogPassportDefaults(album, catalog);
}

async function sharedAutoFields(albumId: string, title: string, generatedAt: string | null, existingTerms: string | null): Promise<Record<string, string>> {
  const defaults = await defaultsForAlbum(albumId);
  const albumLicense = await findBusinessPassportLicense({ albumId });
  const catalogLicense = albumLicense ? null : await findBusinessPassportLicense('catalog');
  const terms = (existingTerms && existingTerms.trim()) || albumLicense || catalogLicense || '';
  const fields: Record<string, string> = {
    generator_tool: defaults.generator_tool,
    generator_plan: defaults.generator_plan,
    human_contribution: defaults.human_contribution,
    human_contribution_details: defaults.human_contribution_details,
    generation_ref: generationRefForTrackTitle(title),
    never_published_checked_at: new Date().toISOString(),
  };
  if (generatedAt) fields.generated_at = generatedAt;
  if (terms) fields.terms_snapshot_ref = terms;
  return fields;
}

export async function autoFillBusinessPassportTrack(audioItemId: string): Promise<AutoFillTrackResult> {
  const admin = await requireAdminPanelAccess();
  id(audioItemId);
  const filled: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const db = createServiceRoleClient();
  const { data: audio, error: audioError } = await db
    .from('audio_items')
    .select('id,title,music_track_code,desired_music_master_asset_id,practice_id,created_at')
    .eq('id', audioItemId)
    .single();
  const title = typeof audio?.title === 'string' ? audio.title : '';
  const fail = (message: string): AutoFillTrackResult => ({ ok: false, trackId: audioItemId, title, filled, skipped, errors: [...errors, message], message });
  if (audioError || !audio) return fail('Трек не найден.');
  const { data: album } = await db.from('practices').select('business_only').eq('id', audio.practice_id).single();
  if (album?.business_only !== true) return fail('Нужен закрытый альбом Бизнеса.');
  const { data: existing } = await db.from('business_track_passports').select('*').eq('audio_item_id', audioItemId).maybeSingle();
  const passport = (existing ?? {}) as Passport;
  if (passport.status === 'approved' || passport.status === 'revoked') {
    return { ok: true, trackId: audioItemId, title, filled, skipped: ['Паспорт уже допущен или отозван – автоматическое заполнение пропущено.'], errors, message: 'Пропущено: паспорт уже допущен или отозван.' };
  }

  const alCode = (typeof passport.al_code === 'string' && passport.al_code.trim())
    || (typeof audio.music_track_code === 'string' ? audio.music_track_code.trim() : '');
  if (alCode && alCode !== passport.al_code) {
    await saveBusinessPassport(audioItemId, { al_code: alCode }, { keys: ['al_code'] });
    filled.push(PASSPORT_FIELDS.al_code);
  } else if (!existing) {
    await saveBusinessPassport(audioItemId, { al_code: alCode || '' }, { keys: ['al_code'] });
  }

  if (!audio.desired_music_master_asset_id) {
    errors.push('Сначала загрузите мастер-файл.');
    return fail('Сначала загрузите мастер-файл.');
  }

  const { data: asset, error: assetError } = await db.from('music_audio_assets')
    .select('id,storage_bucket,storage_path,size_bytes,duration_seconds,source_asset_id,created_at,verified_at')
    .eq('id', audio.desired_music_master_asset_id)
    .eq('audio_item_id', audioItemId)
    .eq('asset_role', 'master')
    .eq('lifecycle_state', 'verified')
    .single();
  if (assetError || !asset || asset.storage_bucket !== 'music-masters') {
    return fail('Мастер-файл ещё не проверен при загрузке.');
  }

  const generatedAt = generatedAtFromTimestamps(
    typeof asset.created_at === 'string' ? asset.created_at : null,
    typeof asset.verified_at === 'string' ? asset.verified_at : null,
    typeof audio.created_at === 'string' ? audio.created_at : null,
  );
  if (!generatedAt) {
    errors.push('Не удалось определить дату файла мастера.');
    return fail('Не удалось определить дату файла мастера.');
  }
  const existingTerms = typeof passport.terms_snapshot_ref === 'string' ? passport.terms_snapshot_ref : null;
  const shared = await sharedAutoFields(String(audio.practice_id), title, generatedAt, existingTerms);
  await saveBusinessPassport(audioItemId, { ...shared, ...(alCode ? { al_code: alCode } : {}) }, { keys: Object.keys({ ...shared, ...(alCode ? { al_code: alCode } : {}) }) });
  filled.push(PASSPORT_FIELDS.generator_tool, PASSPORT_FIELDS.generator_plan, PASSPORT_FIELDS.generated_at, PASSPORT_FIELDS.generation_ref, PASSPORT_FIELDS.human_contribution, PASSPORT_FIELDS.never_published_checked_at);
  if (shared.terms_snapshot_ref) filled.push(PASSPORT_FIELDS.terms_snapshot_ref);
  else errors.push('Сначала загрузите образец лицензии в настройках каталога.');

  return withLowPriority(async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'audiolad-passport-'));
    const destPath = join(tmp, 'master.wav');
    try {
      const { data: signed, error: signedError } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 300);
      if (signedError || !signed?.signedUrl) throw new Error('Не удалось прочитать мастер-файл.');
      const sha256 = await hashAndStoreMaster(signed.signedUrl, Number(asset.size_bytes), destPath);
      const { error: recordError } = await db.rpc('record_business_master_hash', {
        p_audio_item_id: audioItemId,
        p_asset_id: asset.id,
        p_sha256: sha256,
        p_admin_id: admin.userId,
      });
      if (recordError) {
        if (recordError.message.includes('passport_hash_mismatch')) throw new Error('Хеш мастер-файла не совпадает.');
        throw new Error('Не удалось записать проверенный хеш мастера.');
      }
      filled.push(PASSPORT_FIELDS.master_sha256, 'Проверенный хеш сохранённого мастера');

      const updates: Record<string, string> = {
        master_sha256: sha256,
        source_sha256: sha256,
      };
      if (asset.source_asset_id) {
        skipped.push('Отдельный исходный файл в ролях ассетов не используется – SHA-256 исходника записан по сохранённому мастеру.');
      } else {
        skipped.push('Отдельного исходного файла нет – SHA-256 исходника совпадает с хешем сохранённого мастера.');
      }
      filled.push(PASSPORT_FIELDS.source_sha256);

      const fpcalc = await resolveFpcalcPath();
      let fingerprint: string | null = null;
      let duration = Number(asset.duration_seconds);
      if (!fpcalc) {
        errors.push('На сервере не установлен fpcalc (пакет chromaprint-tools). Отпечаток и AcoustID не записаны.');
      } else {
        try {
          const printed = await runFpcalc(fpcalc, destPath);
          fingerprint = printed.fingerprint;
          duration = printed.duration;
          updates.fingerprint_sha256 = createHash('sha256').update(printed.fingerprint, 'utf8').digest('hex');
          filled.push(PASSPORT_FIELDS.fingerprint_sha256);
        } catch {
          errors.push('Не удалось посчитать аудиоотпечаток через fpcalc. Отпечаток и AcoustID не записаны.');
        }
      }

      if (fingerprint) {
        if (!Number.isFinite(duration) || duration <= 0) {
          errors.push('Нет длительности трека для запроса AcoustID. Результат AcoustID не записан.');
        } else {
          const lookup = await lookupAcoustId(fingerprint, duration);
          if ('error' in lookup) {
            errors.push(lookup.error);
          } else {
            updates.acoustid_result = lookup.result;
            updates.acoustid_checked_at = lookup.checkedAt;
            filled.push(PASSPORT_FIELDS.acoustid_result, PASSPORT_FIELDS.acoustid_checked_at);
            if (lookup.result === 'match') {
              errors.push('AcoustID нашёл совпадение. Допуск будет заблокирован, пока результат не будет «совпадений нет».');
            }
          }
        }
      }

      const { data: latest } = await db.from('business_track_passports').select('*').eq('audio_item_id', audioItemId).maybeSingle();
      const merged = { ...(latest as Passport | undefined), ...updates } as Passport;
      updates.evidence_inventory_sha256 = evidenceInventorySha256(merged);
      filled.push(PASSPORT_FIELDS.evidence_inventory_sha256);
      await saveBusinessPassport(audioItemId, updates, { keys: Object.keys(updates) });

      const message = errors.length
        ? `Частично заполнено: ${errors.join(' ')}`
        : 'Автоматические поля заполнены.';
      return { ok: errors.length === 0, trackId: audioItemId, title, filled, skipped, errors, message };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
}

export async function applyAlbumSharedPassportFields(albumId: string, fields: Record<string, string>): Promise<{ ok: true; applied: number; skipped: number }> {
  await requireAdminPanelAccess();
  id(albumId);
  const db = createServiceRoleClient();
  const { data: album, error: albumError } = await db.from('practices').select('id, business_only').eq('id', albumId).maybeSingle();
  if (albumError || !album || album.business_only !== true) throw new Error('Нужен закрытый альбом Бизнеса.');
  const shared = pickAlbumSharedPassport(fields);
  if (!shared.terms_snapshot_ref.trim()) {
    const albumLicense = await findBusinessPassportLicense({ albumId });
    const catalogLicense = albumLicense ? null : await findBusinessPassportLicense('catalog');
    const licenseRef = albumLicense ?? catalogLicense;
    if (licenseRef) shared.terms_snapshot_ref = licenseRef;
  }
  const { data: tracks, error: tracksError } = await db
    .from('audio_items')
    .select('id, music_track_code')
    .eq('practice_id', albumId)
    .order('position');
  if (tracksError) throw new Error('Не удалось загрузить треки альбома.');
  const { data: passports, error: passportsError } = await db.from('business_track_passports').select('*').eq('practice_id', albumId);
  if (passportsError) throw new Error('Не удалось загрузить паспорта.');
  const byTrack = new Map((passports ?? []).map((row) => [row.audio_item_id as string, row as Passport]));
  let applied = 0;
  let skipped = 0;
  for (const track of tracks ?? []) {
    const current = byTrack.get(track.id);
    if (current?.status === 'approved' || current?.status === 'revoked') {
      skipped += 1;
      continue;
    }
    const payload: Record<string, string> = { ...shared };
    const existingCode = typeof current?.al_code === 'string' ? current.al_code.trim() : '';
    const catalogCode = typeof track.music_track_code === 'string' ? track.music_track_code.trim() : '';
    if (!existingCode && catalogCode) payload.al_code = catalogCode;
    const keys: string[] = [...ALBUM_SHARED_PASSPORT_FIELDS];
    if (payload.al_code) keys.push('al_code');
    await saveBusinessPassport(track.id, payload, { keys });
    applied += 1;
  }
  return { ok: true, applied, skipped };
}

export async function approveReadyBusinessPassports(albumId: string): Promise<{ approved: number; skipped: number; errors: { title: string; message: string }[] }> {
  await requireAdminPanelAccess();
  id(albumId);
  const db = createServiceRoleClient();
  const { data: album, error: albumError } = await db.from('practices').select('id, business_only').eq('id', albumId).maybeSingle();
  if (albumError || !album || album.business_only !== true) throw new Error('Нужен закрытый альбом Бизнеса.');
  const { data: tracks, error: tracksError } = await db.from('audio_items').select('id, title').eq('practice_id', albumId).order('position');
  if (tracksError) throw new Error('Не удалось загрузить треки альбома.');
  const { data: passports, error: passportsError } = await db.from('business_track_passports').select('*').eq('practice_id', albumId);
  if (passportsError) throw new Error('Не удалось загрузить паспорта.');
  const byTrack = new Map((passports ?? []).map((row) => [row.audio_item_id as string, row as Passport]));
  let approved = 0;
  let skipped = 0;
  const errors: { title: string; message: string }[] = [];
  for (const track of tracks ?? []) {
    const passport = byTrack.get(track.id);
    const title = typeof track.title === 'string' ? track.title : track.id;
    if (!passport || passport.status === 'approved' || passport.status === 'revoked') {
      skipped += 1;
      continue;
    }
    const missing = passportMissing(passport);
    if (missing.length > 0) {
      skipped += 1;
      continue;
    }
    try {
      await decideBusinessPassport(track.id, 'approve');
      approved += 1;
    } catch (error) {
      errors.push({ title, message: error instanceof Error ? error.message : 'Не удалось допустить паспорт.' });
    }
  }
  return { approved, skipped, errors };
}


import 'server-only';
import { requireAdminPanelAccess } from '@/lib/admin/guard';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  BUSINESS_PASSPORT_LICENSE_BUCKET,
  BUSINESS_PASSPORT_LICENSE_MAX_BYTES,
  BUSINESS_PASSPORT_LICENSE_MIME,
  businessPassportDefaultsPath,
  businessPassportLicensePath,
  businessPassportLicenseRef,
  parseBusinessPassportLicenseRef,
  parseCatalogDefaultsPdf,
  parseCatalogPassportDefaults,
  wrapCatalogDefaultsPdf,
  type CatalogPassportDefaults,
} from '@/lib/business-track-passports/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PassportLicenseScope = 'catalog' | { albumId: string };

function scopePath(scope: PassportLicenseScope): string {
  if (scope === 'catalog') return businessPassportLicensePath('catalog');
  if (!UUID.test(scope.albumId)) throw new Error('Некорректный идентификатор.');
  return businessPassportLicensePath({ albumId: scope.albumId });
}

async function licenseObjectExists(path: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const folder = path.replace(/\/license\.pdf$/i, '');
  const { data, error } = await db.storage.from(BUSINESS_PASSPORT_LICENSE_BUCKET).list(folder, { limit: 50 });
  if (error) return false;
  return (data ?? []).some((item) => item.name === 'license.pdf');
}

export async function findBusinessPassportLicense(scope: PassportLicenseScope): Promise<string | null> {
  await requireAdminPanelAccess();
  const path = scopePath(scope);
  if (!(await licenseObjectExists(path))) return null;
  return businessPassportLicenseRef(path);
}

export async function signBusinessPassportLicense(ref: string, expiresIn = 120): Promise<string | null> {
  await requireAdminPanelAccess();
  const parsed = parseBusinessPassportLicenseRef(ref);
  if (!parsed) return null;
  const db = createServiceRoleClient();
  const { data, error } = await db.storage
    .from(BUSINESS_PASSPORT_LICENSE_BUCKET)
    .createSignedUrl(parsed.path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function signBusinessPassportLicenseForScope(scope: PassportLicenseScope): Promise<string | null> {
  const ref = await findBusinessPassportLicense(scope);
  if (!ref) return null;
  return signBusinessPassportLicense(ref);
}

function isPdf(bytes: Uint8Array, mime: string, name: string): boolean {
  const header = Buffer.from(bytes.subarray(0, 5)).toString('latin1');
  const typeOk = mime === BUSINESS_PASSPORT_LICENSE_MIME || mime === 'application/octet-stream' || mime === '';
  const nameOk = name.toLowerCase().endsWith('.pdf');
  return header === '%PDF-' && typeOk && nameOk;
}

export async function uploadBusinessPassportLicense(scope: PassportLicenseScope, file: File): Promise<string> {
  await requireAdminPanelAccess();
  if (scope !== 'catalog') {
    const albumId = scope.albumId;
    const db = createServiceRoleClient();
    const { data, error } = await db.from('practices').select('id, business_only').eq('id', albumId).maybeSingle();
    if (error || !data || data.business_only !== true) throw new Error('Нужен закрытый альбом Бизнеса.');
  }
  if (file.size <= 0 || file.size > BUSINESS_PASSPORT_LICENSE_MAX_BYTES) {
    throw new Error('Файл лицензии должен быть PDF до 10 МБ.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes, file.type, file.name)) throw new Error('Загрузите образец лицензии в формате PDF.');
  const path = scopePath(scope);
  const db = createServiceRoleClient();
  const { error } = await db.storage.from(BUSINESS_PASSPORT_LICENSE_BUCKET).upload(path, bytes, {
    contentType: BUSINESS_PASSPORT_LICENSE_MIME,
    upsert: true,
  });
  if (error) throw new Error('Не удалось сохранить образец лицензии.');
  return businessPassportLicenseRef(path);
}

export async function loadCatalogAndAlbumLicenseRefs(albumIds: string[]): Promise<{ catalogLicenseRef: string | null; albumLicenseRefs: Record<string, string> }> {
  const catalogPath = businessPassportLicensePath('catalog');
  const catalogLicenseRef = (await licenseObjectExists(catalogPath)) ? businessPassportLicenseRef(catalogPath) : null;
  const albumLicenseRefs: Record<string, string> = {};
  for (const albumId of albumIds) {
    if (!UUID.test(albumId)) continue;
    const path = businessPassportLicensePath({ albumId });
    if (await licenseObjectExists(path)) albumLicenseRefs[albumId] = businessPassportLicenseRef(path);
  }
  return { catalogLicenseRef, albumLicenseRefs };
}

function defaultsPath(scope: PassportLicenseScope): string {
  if (scope === 'catalog') return businessPassportDefaultsPath('catalog');
  if (!UUID.test(scope.albumId)) throw new Error('Некорректный идентификатор.');
  return businessPassportDefaultsPath({ albumId: scope.albumId });
}

export async function loadCatalogPassportDefaults(scope: PassportLicenseScope = 'catalog'): Promise<CatalogPassportDefaults | null> {
  await requireAdminPanelAccess();
  const db = createServiceRoleClient();
  const { data, error } = await db.storage.from(BUSINESS_PASSPORT_LICENSE_BUCKET).download(defaultsPath(scope));
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return parseCatalogDefaultsPdf(bytes);
}

export async function saveCatalogPassportDefaults(scope: PassportLicenseScope, fields: Record<string, string>): Promise<CatalogPassportDefaults> {
  await requireAdminPanelAccess();
  if (scope !== 'catalog') {
    const db = createServiceRoleClient();
    const { data, error } = await db.from('practices').select('id, business_only').eq('id', scope.albumId).maybeSingle();
    if (error || !data || data.business_only !== true) throw new Error('Нужен закрытый альбом Бизнеса.');
  }
  const defaults = parseCatalogPassportDefaults(fields);
  const bytes = wrapCatalogDefaultsPdf(defaults);
  if (bytes.byteLength > BUSINESS_PASSPORT_LICENSE_MAX_BYTES) throw new Error('Не удалось сохранить настройки каталога.');
  const db = createServiceRoleClient();
  const { error } = await db.storage.from(BUSINESS_PASSPORT_LICENSE_BUCKET).upload(defaultsPath(scope), bytes, {
    contentType: BUSINESS_PASSPORT_LICENSE_MIME,
    upsert: true,
  });
  if (error) throw new Error('Не удалось сохранить настройки каталога.');
  return defaults;
}

export async function loadCatalogAndAlbumDefaults(albumIds: string[]): Promise<{ catalogDefaults: CatalogPassportDefaults | null; albumDefaults: Record<string, CatalogPassportDefaults> }> {
  const catalogDefaults = await loadCatalogPassportDefaults('catalog');
  const albumDefaults: Record<string, CatalogPassportDefaults> = {};
  for (const albumId of albumIds) {
    if (!UUID.test(albumId)) continue;
    const loaded = await loadCatalogPassportDefaults({ albumId });
    if (loaded) albumDefaults[albumId] = loaded;
  }
  return { catalogDefaults, albumDefaults };
}

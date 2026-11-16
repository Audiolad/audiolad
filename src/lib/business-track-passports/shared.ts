import { createHash } from 'node:crypto';
import { PASSPORT_FIELDS, type Passport, type PassportField } from '@/lib/business-track-passports/model';

export const ALBUM_SHARED_PASSPORT_FIELDS = [
  'generator_tool',
  'generator_plan',
  'generated_at',
  'generation_ref',
  'terms_snapshot_ref',
  'human_contribution',
  'human_contribution_details',
  'never_published_checked_at',
] as const satisfies readonly PassportField[];

export type AlbumSharedPassportField = (typeof ALBUM_SHARED_PASSPORT_FIELDS)[number];

export const AUTO_PASSPORT_FIELDS = [
  'al_code',
  'source_sha256',
  'master_sha256',
  'fingerprint_sha256',
  'acoustid_checked_at',
  'acoustid_result',
  'evidence_inventory_sha256',
] as const satisfies readonly PassportField[];

export function pickAlbumSharedPassport(fields: Passport | Record<string, unknown>): Record<AlbumSharedPassportField, string> {
  const picked = {} as Record<AlbumSharedPassportField, string>;
  for (const key of ALBUM_SHARED_PASSPORT_FIELDS) {
    const value = fields[key];
    picked[key] = typeof value === 'string' ? value : '';
  }
  return picked;
}

export function evidenceInventoryPayload(passport: Passport): Record<string, string> {
  const body: Record<string, string> = {};
  const keys = [
    'al_code',
    'generator_tool',
    'generator_plan',
    'generated_at',
    'generation_ref',
    'terms_snapshot_ref',
    'human_contribution',
    'human_contribution_details',
    'source_sha256',
    'master_sha256',
    'fingerprint_sha256',
    'acoustid_checked_at',
    'acoustid_result',
    'never_published_checked_at',
    'stored_master_sha256',
  ] as const;
  for (const key of keys) {
    const value = passport[key];
    if (typeof value === 'string' && value.trim()) body[key] = value.trim();
  }
  return body;
}

export function evidenceInventorySha256(passport: Passport): string {
  const body = evidenceInventoryPayload(passport);
  const stable = JSON.stringify(body, Object.keys(body).sort());
  return createHash('sha256').update(stable, 'utf8').digest('hex');
}

export const BUSINESS_PASSPORT_LICENSE_REF_PREFIX = 'business-passport-license:';
export const BUSINESS_PASSPORT_LICENSE_BUCKET = 'business-rightsholder-evidence';
export const BUSINESS_PASSPORT_LICENSE_MAX_BYTES = 10 * 1024 * 1024;
export const BUSINESS_PASSPORT_LICENSE_MIME = 'application/pdf';

const LICENSE_PATH = /^(passport-licenses\/(?:catalog|practices\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v[0-9]+\/license\.pdf)$/i;

export function isBusinessPassportLicenseRef(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().startsWith(BUSINESS_PASSPORT_LICENSE_REF_PREFIX);
}

export function parseBusinessPassportLicenseRef(value: string | null | undefined): { path: string } | null {
  if (!isBusinessPassportLicenseRef(value)) return null;
  const path = value!.trim().slice(BUSINESS_PASSPORT_LICENSE_REF_PREFIX.length);
  if (!LICENSE_PATH.test(path)) return null;
  return { path };
}

export function businessPassportLicenseRef(path: string): string {
  return `${BUSINESS_PASSPORT_LICENSE_REF_PREFIX}${path}`;
}

export function businessPassportLicensePath(scope: 'catalog' | { albumId: string }): string {
  if (scope === 'catalog') return 'passport-licenses/catalog/v1/license.pdf';
  return `passport-licenses/practices/${scope.albumId}/v1/license.pdf`;
}

export function adminPassportLicensePreviewHref(scope: 'catalog' | { albumId: string }): string {
  if (scope === 'catalog') return '/api/admin/business-catalog/license?scope=catalog';
  return `/api/admin/business-catalog/license?album=${encodeURIComponent(scope.albumId)}`;
}

export function businessPassportLicensePreviewHrefFromRef(ref: string | null | undefined): string | null {
  const parsed = parseBusinessPassportLicenseRef(ref);
  if (!parsed) return null;
  if (parsed.path.startsWith('passport-licenses/catalog/')) return adminPassportLicensePreviewHref('catalog');
  const match = parsed.path.match(/practices\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  if (!match) return null;
  return adminPassportLicensePreviewHref({ albumId: match[1] });
}

export type AcoustIdLookupResult =
  | { status: 'not_found' }
  | { status: 'match'; count: number }
  | { status: 'error'; message: string };

export function parseAcoustIdLookup(payload: unknown): AcoustIdLookupResult {
  if (!payload || typeof payload !== 'object') return { status: 'error', message: 'Некорректный ответ AcoustID.' };
  const body = payload as { status?: unknown; results?: unknown; error?: unknown };
  if (body.status !== 'ok') {
    const detail = typeof body.error === 'string' ? body.error : 'сервис вернул ошибку';
    return { status: 'error', message: `AcoustID: ${detail}.` };
  }
  const results = Array.isArray(body.results) ? body.results : [];
  const matches = results.filter((row) => row && typeof row === 'object');
  if (matches.length === 0) return { status: 'not_found' };
  return { status: 'match', count: matches.length };
}

export function acoustIdApiKeyEnvNames(): string[] {
  return ['ACOUSTID_API_KEY', 'ACOUSTID_CLIENT_KEY', 'ACOUSTID_CLIENT'];
}

export function findConfiguredAcoustIdEnvName(env: NodeJS.Dict<string> = process.env): string | null {
  for (const name of acoustIdApiKeyEnvNames()) {
    if (env[name]?.trim()) return name;
  }
  return null;
}

export const ALBUM_SHARED_FIELD_LABELS: Record<AlbumSharedPassportField, string> = {
  generator_tool: PASSPORT_FIELDS.generator_tool,
  generator_plan: PASSPORT_FIELDS.generator_plan,
  generated_at: PASSPORT_FIELDS.generated_at,
  generation_ref: PASSPORT_FIELDS.generation_ref,
  terms_snapshot_ref: PASSPORT_FIELDS.terms_snapshot_ref,
  human_contribution: PASSPORT_FIELDS.human_contribution,
  human_contribution_details: PASSPORT_FIELDS.human_contribution_details,
  never_published_checked_at: PASSPORT_FIELDS.never_published_checked_at,
};

export function notesWithOptionalLicenseId(notes: string | null | undefined, licenseId: string | null | undefined): string {
  const without = (notes ?? '').replace(/^MusicGPT License ID:.*$/m, '').trim();
  const id = licenseId?.trim() ?? '';
  if (!id) return without;
  return `MusicGPT License ID: ${id}${without ? `\n${without}` : ''}`;
}

export function licenseIdFromNotes(notes: string | null | undefined): string {
  const match = notes?.match(/^MusicGPT License ID:\s*(\S+)/m);
  return match?.[1] ?? '';
}

export function parseFpcalcJson(raw: string): { duration: number; fingerprint: string } {
  let parsed: { duration?: unknown; fingerprint?: unknown };
  try {
    parsed = JSON.parse(raw) as { duration?: unknown; fingerprint?: unknown };
  } catch {
    throw new Error('fpcalc вернул некорректный отпечаток.');
  }
  const duration = typeof parsed.duration === 'number' ? parsed.duration : Number(parsed.duration);
  const fingerprint = typeof parsed.fingerprint === 'string' ? parsed.fingerprint.trim() : '';
  if (!Number.isFinite(duration) || duration <= 0 || !fingerprint) {
    throw new Error('fpcalc вернул некорректный отпечаток.');
  }
  return { duration, fingerprint };
}


export type CatalogPassportDefaults = {
  generator_tool: string;
  generator_plan: string;
  human_contribution: 'human' | 'none';
  human_contribution_details: string;
};

export const DEFAULT_CATALOG_PASSPORT_DEFAULTS: CatalogPassportDefaults = {
  generator_tool: 'MusicGPT',
  generator_plan: 'Pro',
  human_contribution: 'none',
  human_contribution_details: '',
};

export const HUMAN_CONTRIBUTION_DETAILS_PLACEHOLDER = 'Заполняется только если вклад человека есть';

export const CATALOG_PASSPORT_DEFAULTS_MARKER = 'AUDIOLAD_PASSPORT_DEFAULTS\n';

export function businessPassportDefaultsPath(scope: 'catalog' | { albumId: string }): string {
  if (scope === 'catalog') return 'passport-licenses/catalog/v1/defaults.pdf';
  return `passport-licenses/practices/${scope.albumId}/v1/defaults.pdf`;
}

function clipDefaultText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function parseCatalogPassportDefaults(input: unknown): CatalogPassportDefaults {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const human = body.human_contribution === 'none' ? 'none' : body.human_contribution === 'human' ? 'human' : DEFAULT_CATALOG_PASSPORT_DEFAULTS.human_contribution;
  const details = clipDefaultText(body.human_contribution_details, 2000);
  return {
    generator_tool: clipDefaultText(body.generator_tool, 300) || DEFAULT_CATALOG_PASSPORT_DEFAULTS.generator_tool,
    generator_plan: clipDefaultText(body.generator_plan, 300) || DEFAULT_CATALOG_PASSPORT_DEFAULTS.generator_plan,
    human_contribution: human,
    human_contribution_details: human === 'human' ? (details || DEFAULT_CATALOG_PASSPORT_DEFAULTS.human_contribution_details) : details,
  };
}

export function resolveCatalogPassportDefaults(album: CatalogPassportDefaults | null | undefined, catalog: CatalogPassportDefaults | null | undefined): CatalogPassportDefaults {
  return parseCatalogPassportDefaults({
    ...DEFAULT_CATALOG_PASSPORT_DEFAULTS,
    ...(catalog ?? {}),
    ...(album ?? {}),
  });
}

/** Values for the album override form: saved album defaults, otherwise saved catalog defaults. */
export function albumFormPassportDefaults(
  albumDefaults: CatalogPassportDefaults | null | undefined,
  catalogDefaults: CatalogPassportDefaults | null | undefined,
): CatalogPassportDefaults {
  return resolveCatalogPassportDefaults(albumDefaults, catalogDefaults);
}

export function generationRefForTrackTitle(title: string): string {
  const name = title.trim() || 'без названия';
  return `История MusicGPT аккаунта ИП Петров С.С., трек «${name}»`;
}

export function generatedAtFromTimestamps(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) continue;
    return new Date(parsed).toISOString();
  }
  return null;
}

export function wrapCatalogDefaultsPdf(defaults: CatalogPassportDefaults): Uint8Array {
  const json = JSON.stringify(parseCatalogPassportDefaults(defaults));
  const payload = Buffer.from(`${CATALOG_PASSPORT_DEFAULTS_MARKER}${json}`, 'utf8');
  const header = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${payload.length} >>\nstream\n`, 'utf8');
  const footer = Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
  return new Uint8Array(Buffer.concat([header, payload, footer]));
}

export function parseCatalogDefaultsPdf(bytes: Uint8Array): CatalogPassportDefaults | null {
  const text = Buffer.from(bytes).toString('utf8');
  if (!text.startsWith('%PDF-')) return null;
  const marker = text.indexOf(CATALOG_PASSPORT_DEFAULTS_MARKER);
  if (marker < 0) return null;
  const start = marker + CATALOG_PASSPORT_DEFAULTS_MARKER.length;
  const end = text.indexOf('\nendstream', start);
  const raw = text.slice(start, end === -1 ? undefined : end).trim();
  try {
    return parseCatalogPassportDefaults(JSON.parse(raw));
  } catch {
    return null;
  }
}

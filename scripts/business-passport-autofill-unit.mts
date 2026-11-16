import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ALBUM_SHARED_PASSPORT_FIELDS,
  businessPassportLicensePath,
  businessPassportLicensePreviewHrefFromRef,
  businessPassportLicenseRef,
  evidenceInventorySha256,
  findConfiguredAcoustIdEnvName,
  isBusinessPassportLicenseRef,
  licenseIdFromNotes,
  notesWithOptionalLicenseId,
  parseAcoustIdLookup,
  parseBusinessPassportLicenseRef,
  parseFpcalcJson,
  pickAlbumSharedPassport,
} from '../src/lib/business-track-passports/shared';
import { passportMissing } from '../src/lib/business-track-passports/model';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const shared = pickAlbumSharedPassport({
  generator_tool: 'MusicGPT',
  generator_plan: 'Pro',
  generated_at: '2026-11-10T12:00:00+03:00',
  shazam_result: 'not_found',
  master_sha256: 'a'.repeat(64),
});
assert.equal(shared.generator_tool, 'MusicGPT');
assert.equal(shared.generator_plan, 'Pro');
assert.ok(!('shazam_result' in shared) || !ALBUM_SHARED_PASSPORT_FIELDS.includes('shazam_result' as never));
assert.ok(!('master_sha256' in shared));

const inventoryA = evidenceInventorySha256({
  al_code: 'AL-T-000001697',
  master_sha256: 'ab'.repeat(32),
  notes: 'should be ignored',
  shazam_result: 'not_found',
});
const inventoryB = evidenceInventorySha256({
  shazam_result: 'not_found',
  notes: 'other notes',
  master_sha256: 'ab'.repeat(32),
  al_code: 'AL-T-000001697',
});
assert.equal(inventoryA, inventoryB);
assert.match(inventoryA, /^[0-9a-f]{64}$/);
const empty = evidenceInventorySha256({ notes: 'only notes' });
assert.equal(empty, createHash('sha256').update('{}', 'utf8').digest('hex'));

assert.deepEqual(parseAcoustIdLookup({ status: 'ok', results: [] }), { status: 'not_found' });
assert.deepEqual(parseAcoustIdLookup({ status: 'ok', results: [{ id: 'x', score: 0.9 }] }), { status: 'match', count: 1 });
assert.equal(parseAcoustIdLookup({ status: 'error', error: 'invalid client' }).status, 'error');
assert.equal(parseAcoustIdLookup(null).status, 'error');

const fp = parseFpcalcJson('{"duration": 217.5, "fingerprint": "AQADtExample"}');
assert.equal(fp.duration, 217.5);
assert.equal(fp.fingerprint, 'AQADtExample');
assert.throws(() => parseFpcalcJson('{"duration": 0, "fingerprint": ""}'));
assert.throws(() => parseFpcalcJson('not-json'));

const catalogPath = businessPassportLicensePath('catalog');
const albumPath = businessPassportLicensePath({ albumId: 'bab5488c-8b28-43a8-ba7c-5d03396b187e' });
assert.equal(catalogPath, 'passport-licenses/catalog/v1/license.pdf');
assert.ok(parseBusinessPassportLicenseRef(businessPassportLicenseRef(albumPath)));
assert.equal(parseBusinessPassportLicenseRef('business-passport-license:../secret.pdf'), null);
assert.equal(parseBusinessPassportLicenseRef('business-passport-license:passport-licenses/practices/not-a-uuid/v1/license.pdf'), null);
assert.ok(!isBusinessPassportLicenseRef('https://example.com/terms'));
assert.equal(
  businessPassportLicensePreviewHrefFromRef(businessPassportLicenseRef(catalogPath)),
  '/api/admin/business-catalog/license?scope=catalog',
);
assert.ok(!businessPassportLicensePreviewHrefFromRef(catalogPath)?.includes('passport-licenses'));

assert.equal(findConfiguredAcoustIdEnvName({ NODE_ENV: 'test' }), null);
assert.equal(findConfiguredAcoustIdEnvName({ NODE_ENV: 'test', ACOUSTID_API_KEY: '  ' }), null);
assert.equal(findConfiguredAcoustIdEnvName({ NODE_ENV: 'test', ACOUSTID_API_KEY: 'secret-value' }), 'ACOUSTID_API_KEY');

const notes = notesWithOptionalLicenseId('проверка', '  abc-id  ');
assert.equal(licenseIdFromNotes(notes), 'abc-id');
assert.equal(notesWithOptionalLicenseId(notes, ''), 'проверка');

const missing = passportMissing({
  al_code: 'AL-T-000001697',
  generator_tool: 'MusicGPT',
  generator_plan: 'Pro',
  generated_at: '2026-11-10T12:00:00+03:00',
  generation_ref: 'history-1',
  terms_snapshot_ref: businessPassportLicenseRef(catalogPath),
  human_contribution: 'none',
  source_sha256: 'ab'.repeat(32),
  master_sha256: 'ab'.repeat(32),
  fingerprint_sha256: 'cd'.repeat(32),
  shazam_checked_at: '2026-11-15T12:00:00+03:00',
  shazam_result: 'not_found',
  acoustid_checked_at: '2026-11-15T12:00:00+03:00',
  acoustid_result: 'not_found',
  never_published_checked_at: '2026-11-15T12:00:00+03:00',
  evidence_inventory_sha256: 'ef'.repeat(32),
  stored_master_asset_id: 'bab5488c-8b28-43a8-ba7c-5d03396b187e',
  stored_master_sha256: 'ab'.repeat(32),
  stored_master_sha256_verified_at: '2026-11-15T12:00:00+03:00',
  notes: 'MusicGPT License ID omitted',
});
assert.deepEqual(missing, []);

const tools = read('src/app/(platform)/admin/business-catalog/AlbumPassportTools.tsx');
assert.match(tools, /Заполнить автоматически/);
assert.match(tools, /Допустить все готовые/);
assert.match(tools, /Подтвердить допуск готовых/);
assert.match(tools, /Автоматического допуска нет/);
assert.match(tools, /Лицензию каждого трека загружать не нужно/);
assert.match(tools, /ID лицензии трека указывать необязательно/);
assert.match(tools, /Дата генерации – одна дата, не диапазон/);
assert.doesNotMatch(tools, /uploadPassportLicenseAction\(\) without confirm/);

const form = read('src/app/(platform)/admin/business-catalog/PassportForm.tsx');
assert.match(form, /ID лицензии MusicGPT \(необязательно\)/);
assert.match(form, /допуск не блокирует/);
assert.match(form, /Лицензию трека прикладывать не нужно/);

const autoFill = read('src/lib/business-track-passports/auto-fill.server.ts');
assert.match(autoFill, /Ключ AcoustID не задан/);
assert.match(autoFill, /chromaprint-tools/);
assert.doesNotMatch(autoFill, /acoustid_result: 'not_found'/);
assert.match(autoFill, /passportMissing\(passport\)/);
assert.match(autoFill, /nice/);

const work = read('src/app/(platform)/admin/business-catalog/ClosedAlbumWork.tsx');
assert.match(work, /CatalogLicensePanel/);
assert.match(work, /Заполнить автоматически/);

const licenseServer = read('src/lib/business-track-passports/license.server.ts');
const sharedSource = read('src/lib/business-track-passports/shared.ts');
assert.match(sharedSource, /BUSINESS_PASSPORT_LICENSE_BUCKET = 'business-rightsholder-evidence'/);
assert.match(licenseServer, /BUSINESS_PASSPORT_LICENSE_BUCKET/);
assert.doesNotMatch(licenseServer, /business-private-covers/);
assert.doesNotMatch(sharedSource, /business-private-covers/);

console.log('business-passport-autofill-unit: ok');

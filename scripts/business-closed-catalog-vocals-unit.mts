/**
 * t1660u: manual «С вокалом» label on closed-catalog albums.
 * Analyzer vocal_role is not the source of truth. The hall player engine is untouched.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INSTRUMENTAL_ALBUM_LABEL,
  SET_ALBUM_VOCALS_ROUTE,
  VOCAL_ALBUM_LABEL,
  applyClosedCatalogVocalPolicy,
  parseHasVocalsFlag,
} from '../src/lib/business-catalog/vocals';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

assert.equal(parseHasVocalsFlag(true), true);
assert.equal(parseHasVocalsFlag('true'), true);
assert.equal(parseHasVocalsFlag('on'), true);
assert.equal(parseHasVocalsFlag('1'), true);
assert.equal(parseHasVocalsFlag(false), false);
assert.equal(parseHasVocalsFlag(undefined), false);
assert.equal(parseHasVocalsFlag('false'), false);

const vocal = { id: 'v', hasVocals: true };
const inst = { id: 'i', hasVocals: false };
const unknown = { id: 'u' };
assert.deepEqual(applyClosedCatalogVocalPolicy([vocal, inst, unknown], false).map((t) => t.id), ['i', 'u']);
assert.deepEqual(applyClosedCatalogVocalPolicy([vocal, inst], true).map((t) => t.id), ['v', 'i']);
assert.equal(VOCAL_ALBUM_LABEL, 'С вокалом');
assert.equal(INSTRUMENTAL_ALBUM_LABEL, 'Без вокала');

const migration = read('supabase/migrations/20270407120000_business_closed_catalog_has_vocals.sql');
assert.match(migration, /ADD COLUMN business_has_vocals boolean NOT NULL DEFAULT false/);
assert.match(migration, /practices_business_has_vocals_closed_check/);
assert.match(migration, /business_has_vocals = false OR business_only = true/);
assert.match(migration, /admin_create_business_album\(/);
assert.match(migration, /p_has_vocals boolean DEFAULT false/);
assert.match(migration, /admin_set_business_album_has_vocals/);
assert.match(migration, /sync_audio_item_business_has_vocals/);
assert.match(migration, /propagate_practice_business_has_vocals/);
assert.doesNotMatch(migration.split('CREATE FUNCTION')[0], /UPDATE public\.(practices|audio_items)/, 'migration has no backfill UPDATE');
assert.doesNotMatch(migration.replace(/--[^\n]*/g, ''), /\bvocal_role\b/);
assert.doesNotMatch(migration, /isInstrumentalForBusiness/);
assert.doesNotMatch(migration, /20270406120000/);

const rollback = read('supabase/rollbacks/20270407120000_business_closed_catalog_has_vocals.rollback.sql');
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.admin_set_business_album_has_vocals/);
assert.match(rollback, /CREATE FUNCTION public\.admin_create_business_album\(p_author_id uuid, p_title text\)/);
assert.match(rollback, /DROP COLUMN IF EXISTS business_has_vocals/);

const catalog = read('src/lib/business-workspace/load.server.ts');
assert.match(catalog, /applyClosedCatalogVocalPolicy/);
assert.match(catalog, /loadPaidSimilarMix\(db, locationId, selected, general\)/);
assert.doesNotMatch(catalog, /isInstrumentalForBusiness|vocal_role/);
assert.doesNotMatch(read('src/lib/business-app/cafe-queue/handle.ts'), /business_has_vocals|applyClosedCatalogVocalPolicy/);
assert.doesNotMatch(read('src/lib/business-app/cafe-queue/order.ts'), /business_has_vocals|applyClosedCatalogVocalPolicy/);
assert.doesNotMatch(read('src/lib/business-admission/policy.ts'), /business_has_vocals/);

const work = read('src/app/(platform)/admin/business-catalog/ClosedAlbumWork.tsx');
assert.match(work, /VOCAL_ALBUM_LABEL/);
assert.match(work, /AlbumVocalsToggle/);
assert.match(work, /data-closed-album-vocal-filter/);
assert.match(read('src/app/(platform)/admin/business-catalog/AlbumVocalsToggle.tsx'), /fetch\(SET_ALBUM_VOCALS_ROUTE/);
assert.equal(SET_ALBUM_VOCALS_ROUTE, '/api/admin/business-catalog/albums/vocals');
assert.match(read('src/app/api/admin/business-catalog/albums/vocals/route.ts'), /setBusinessAlbumHasVocals/);
assert.match(read('src/lib/business-track-passports/admin.server.ts'), /p_has_vocals: hasVocals === true/);

const similarPreview = read('src/lib/business-collections/similar-mix.server.ts');
assert.match(similarPreview, /const pool = applyClosedCatalogVocalPolicy\(catalog, false\)/);
assert.doesNotMatch(similarPreview, /pool: catalog/);
assert.match(read('src/app/(platform)/admin/business-catalog/collections/page.tsx'), /tracks=\{catalogTracks\}/);

console.log('business-closed-catalog-vocals: PASS (manual album label, pool policy, no analyzer, no hall engine)');

// 39a7ef48 PR-D: private covers of business-only albums – app side.
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mock = (path: string, exports: unknown) => {
  const key = require.resolve(path); const mod = new Module(key); mod.exports = exports; mod.loaded = true; require.cache[key] = mod;
};

const ALBUM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TRACK = '33333333-3333-4333-8333-333333333333';
const REF = `business-private-cover:practices/${ALBUM}/variants/v1/md.webp`;
const TRACK_REF = `business-private-cover:practices/${ALBUM}/track-covers/${TRACK}/variants/v1/md.webp`;
const PUBLIC = 'https://proj.supabase.co/storage/v1/object/public/practice-covers/practices/x/variants/v1/md.webp';

// ---------- pure helpers and public renderers ----------
const pc = require('../src/lib/business-covers/private-cover.ts') as typeof import('../src/lib/business-covers/private-cover');
assert.deepEqual(pc.parseBusinessPrivateCoverRef(REF), { path: `practices/${ALBUM}/variants/v1/md.webp`, practiceId: ALBUM, audioItemId: null });
assert.equal(pc.parseBusinessPrivateCoverRef(TRACK_REF)?.audioItemId, TRACK);
for (const bad of [PUBLIC, `business-private-cover:practices/${ALBUM}/variants/../../x.webp`, `business-private-cover:other/${ALBUM}/variants/v1/md.webp`,
  `business-private-cover:practices/${ALBUM}/variants/v1/md.svg`, `business-private-cover:practices/not-a-uuid/variants/v1/md.webp`, '', null]) {
  assert.equal(pc.parseBusinessPrivateCoverRef(bad as string), null, `rejects ${bad}`);
}
assert.ok(pc.BUSINESS_PRIVATE_COVER_SIGNED_URL_TTL_SECONDS > 0 && pc.BUSINESS_PRIVATE_COVER_SIGNED_URL_TTL_SECONDS <= 300, 'short-lived signed URL');
assert.ok(pc.BUSINESS_PRIVATE_COVER_REDIRECT_MAX_AGE_SECONDS < pc.BUSINESS_PRIVATE_COVER_SIGNED_URL_TTL_SECONDS, 'redirect never outlives the signature');
assert.ok(pc.BUSINESS_PRIVATE_COVER_PLAYER_MAX_AGE_SECONDS >= 4 * 60 * 60, 'player cover cache covers a long hall session');
assert.ok(pc.BUSINESS_PRIVATE_COVER_PLAYER_MAX_AGE_SECONDS <= 24 * 60 * 60, 'player cover cache stays private and bounded');
const routeUrl = pc.businessWorkspaceCoverUrl(TRACK, 'cafe');
assert.equal(routeUrl, `/api/business/workspace/cover?space=cafe&track=${TRACK}`);
assert.doesNotMatch(routeUrl, /token|sign|business-private-cover/);

const utils = require('../src/lib/author-products/utils.ts') as typeof import('../src/lib/author-products/utils');
const display = require('../src/lib/products/cover-display.ts') as typeof import('../src/lib/products/cover-display');
const resolve = require('../src/lib/images/resolve-display.ts') as typeof import('../src/lib/images/resolve-display');
const albumCover = require('../src/lib/business-app/album-cover.ts') as typeof import('../src/lib/business-app/album-cover');
const coverSource = require('../src/lib/business-workspace/cover-source.ts') as typeof import('../src/lib/business-workspace/cover-source');
assert.equal(utils.buildCoverDisplayUrl(REF, '2026-11-15'), null);
assert.equal(resolve.resolveProductCoverUrl({ cover_url: REF, updated_at: '2026' }), null);
assert.equal(display.getProductCoverDisplayUrl(REF, null), null);
assert.equal(display.buildProductCoverResponsiveProps(REF, null, null, 168).src, null);
assert.equal(albumCover.cabinetAlbumCoverUrl({ coverUrl: REF }), null);
// Ordinary covers unchanged.
assert.equal(utils.buildCoverDisplayUrl(PUBLIC, 'v1'), `${PUBLIC}?v=v1`);
assert.equal(resolve.resolveProductCoverUrl({ cover_url: PUBLIC }), PUBLIC);
assert.equal(albumCover.cabinetAlbumCoverUrl({ coverUrl: PUBLIC }), PUBLIC);
// Player cover source: route only for business-only albums with a private reference.
assert.equal(albumCover.cabinetAlbumCoverUrl({ coverUrl: routeUrl }), routeUrl);
assert.equal(coverSource.workspaceTrackCoverUrl({ business_only: true, cover_url: REF }, TRACK, 'cafe'), routeUrl);
assert.equal(coverSource.workspaceTrackCoverUrl({ business_only: true, cover_url: PUBLIC }, TRACK, 'cafe'), null);
assert.equal(coverSource.workspaceTrackCoverUrl({ business_only: true, cover_url: null }, TRACK, 'cafe'), null);
assert.equal(coverSource.workspaceTrackCoverUrl({ business_only: false, cover_url: PUBLIC }, TRACK, 'cafe'), PUBLIC);
assert.equal(coverSource.workspaceTrackCoverUrl({ cover_url: REF }, TRACK, 'cafe'), null);

// ---------- fakes ----------
type Row = Record<string, unknown> | null;
let rows: Record<string, Row> = {};
const updates: { table: string; patch: Record<string, unknown> }[] = [];
const signCalls: { bucket: string; path: string; ttl: number }[] = [];
const downloadCalls: { bucket: string; path: string }[] = [];
const missingPaths = new Set<string>();
const uploads: { bucket: string; profile: string }[] = [];
const indexNow: unknown[] = [];
let signSeq = 0;
const COVER_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x02, 0x03, 0x04]);
const fakeDb = {
  from(table: string) {
    let updating = false;
    const q = {
      select() { return q; }, eq() { return q; }, is() { return q; }, in() { return q; },
      update(patch: Record<string, unknown>) { updating = true; updates.push({ table, patch }); return q; },
      maybeSingle: async () => ({ data: updating ? { id: 'ok' } : rows[table] ?? null, error: null }),
    };
    return q;
  },
  storage: {
    from(bucket: string) {
      return {
        createSignedUrl: async (path: string, ttl: number) => {
          signCalls.push({ bucket, path, ttl }); signSeq += 1;
          return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t${signSeq}` }, error: null };
        },
        download: async (path: string) => {
          downloadCalls.push({ bucket, path });
          if (missingPaths.has(path)) return { data: null, error: { message: 'Object not found' } };
          return { data: new Blob([COVER_BYTES], { type: 'image/webp' }), error: null };
        },
        list: async () => ({ data: [] }), remove: async () => ({ data: [] }), upload: async () => ({ error: null }),
      };
    },
  },
};
mock('../src/lib/supabase/service-role.ts', { createServiceRoleClient: () => fakeDb });

const realUpload = require('../src/lib/images/image-upload-service.ts') as typeof import('../src/lib/images/image-upload-service');
mock('../src/lib/images/image-upload-service.ts', {
  ...realUpload,
  uploadOptimizedImageSet: async (params: { bucket: string; profile: string; context: { practiceId: string; audioItemId?: string } }) => {
    uploads.push({ bucket: params.bucket, profile: params.profile });
    const base = params.context.audioItemId
      ? `practices/${params.context.practiceId}/track-covers/${params.context.audioItemId}/variants/v2`
      : `practices/${params.context.practiceId}/variants/v2`;
    return { ok: true, data: { primaryDisplayPath: `${base}/md.webp`,
      manifest: { version: 1, versionId: 'v2', profile: params.profile, sourceWidth: 10, sourceHeight: 10, variants: { md: { path: `${base}/md.webp`, width: 10, height: 10, byteSize: 1, mimeType: 'image/webp' } } } } };
  },
});

// ---------- hall/owner workspace cover route ----------
let actor: Record<string, unknown> = { ok: false, reason: 'no_access' };
let allowed: string[] | null = [];
mock('../src/lib/business-workspace/load.server.ts', {
  loadWorkspaceActor: async () => actor,
  loadWorkspaceAllowedIds: async () => allowed,
});
const allowedCache = require('../src/lib/business-workspace/allowed-ids-cache.ts') as typeof import('../src/lib/business-workspace/allowed-ids-cache');
const ws = require('../src/app/api/business/workspace/cover/route.ts') as typeof import('../src/app/api/business/workspace/cover/route');
const wsGet = () => {
  allowedCache.resetWorkspaceAllowedIdsCacheForTests();
  return ws.GET(new Request(`https://audiolad.ru${routeUrl}`));
};
const hall = { ok: true, device: true, playerOpen: true, locationId: 'loc', space: { id: 'cafe', enabled: true } };

rows = { audio_items: { practice_id: ALBUM, practices: { business_only: true, cover_url: REF } } }; // a valid closed cover exists
actor = { ok: false, reason: 'no_access' }; // anon, listener, other author: no hall/owner session
assert.equal((await wsGet()).status, 404);
actor = { ...hall, playerOpen: false }; allowed = [TRACK];
assert.equal((await wsGet()).status, 404, 'closed player gets no cover');
actor = hall; allowed = ['other-track'];
assert.equal((await wsGet()).status, 404, 'track outside the hall catalog');
allowed = [TRACK];
rows = { audio_items: { practice_id: ALBUM, practices: { business_only: false, cover_url: PUBLIC } } };
assert.equal((await wsGet()).status, 404, 'ordinary albums keep their public cover, no proxy');
rows = { audio_items: { practice_id: ALBUM, practices: { business_only: true, cover_url: `business-private-cover:practices/${OTHER}/variants/v1/md.webp` } } };
assert.equal((await wsGet()).status, 404, 'reference of another album is never signed');
assert.equal(signCalls.length, 0);
assert.equal(downloadCalls.length, 0);
rows = { audio_items: { practice_id: ALBUM, practices: [{ business_only: true, cover_url: REF }] } };
const first = await wsGet();
assert.equal(first.status, 200);
assert.equal(first.headers.get('content-type'), 'image/webp');
assert.equal(first.headers.get('cache-control'), `private, max-age=${pc.BUSINESS_PRIVATE_COVER_PLAYER_MAX_AGE_SECONDS}`);
assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
assert.equal(first.headers.get('location'), null);
assert.deepEqual(new Uint8Array(await first.arrayBuffer()), COVER_BYTES);
assert.equal(signCalls.length, 0, 'hall player never receives a short-lived signed URL');
// t1677u: the player thumbnail is the 320 px sm.webp of the same upload version, not md/lg.
assert.deepEqual(downloadCalls.at(-1), { bucket: 'business-private-covers', path: `practices/${ALBUM}/variants/v1/sm.webp` });
// Every uncached request re-checks the session and re-reads the private object.
const second = await wsGet();
assert.equal(second.status, 200);
assert.deepEqual(new Uint8Array(await second.arrayBuffer()), COVER_BYTES);
assert.equal(downloadCalls.length, 2);
// No sm variant in storage: the referenced file is served instead.
missingPaths.add(`practices/${ALBUM}/variants/v1/sm.webp`);
assert.equal((await wsGet()).status, 200);
assert.deepEqual(downloadCalls.slice(-2).map((c) => c.path), [`practices/${ALBUM}/variants/v1/sm.webp`, `practices/${ALBUM}/variants/v1/md.webp`]);
missingPaths.clear();
{
  const { businessPrivateCoverVariantPath } = require('../src/lib/business-covers/private-cover.server.ts') as typeof import('../src/lib/business-covers/private-cover.server');
  assert.equal(businessPrivateCoverVariantPath(`practices/${ALBUM}/variants/v9/lg.webp`, 'sm'), `practices/${ALBUM}/variants/v9/sm.webp`);
  assert.equal(businessPrivateCoverVariantPath(`practices/${ALBUM}/track-covers/${TRACK}/variants/v9/xl.webp`, 'sm'), `practices/${ALBUM}/track-covers/${TRACK}/variants/v9/sm.webp`);
  assert.equal(businessPrivateCoverVariantPath(`practices/${ALBUM}/variants/v9/original.png`, 'sm'), null, 'only the generated webp set has siblings');
  assert.equal(businessPrivateCoverVariantPath(`practices/${ALBUM}/variants/lg.webp`, 'sm'), null);
}
const guestCoverRoute = readFileSync('src/app/api/business/guest/coffee/cover/route.ts', 'utf8');
assert.match(guestCoverRoute, /readBusinessPrivateCover\(db, practice\.cover_url, \{ practiceId: practice\.id \}, \{ variant: "sm" \}\)/);
actor = { ...hall, device: false, userId: 'owner' }; // owner session
assert.equal((await wsGet()).status, 200);

// ---------- author routes ----------
let practice: Record<string, unknown> = { id: ALBUM, business_only: true, status: 'draft', slug: 'a', author_id: 'author', use_shared_cover: false };
let denied = false;
class FakeAccessError extends Error { status = 404; }
mock('../src/lib/author-products/auth.ts', {
  requirePracticeMutationAccess: async () => { if (denied) throw new FakeAccessError('not_found'); return { supabase: fakeDb, practice, user: { id: 'editor' } }; },
  handleAuthorRouteError: (error: { status?: number; message?: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
});
mock('../src/lib/author-products/moderation-actor.ts', { assertPracticePublicContentEditableForActor: async () => {} });
mock('../src/lib/author-products/products.ts', { getAuthorProductDetail: async () => ({ id: ALBUM }) });
mock('../src/lib/seo/indexnow/hooks.ts', {
  loadAuthorSlug: async () => 'author', scheduleIndexNowNotification: (...args: unknown[]) => { indexNow.push(args); },
});
mock('../src/lib/author-products/utils.ts', { ...utils, removePracticeCoverFiles: async () => {}, removeTrackCoverFiles: async () => {} });
const albumRoute = require('../src/app/api/author/products/[id]/cover/route.ts') as typeof import('../src/app/api/author/products/[id]/cover/route');
const trackRoute = require('../src/app/api/author/products/[id]/audio/[audioId]/cover/route.ts') as typeof import('../src/app/api/author/products/[id]/audio/[audioId]/cover/route');
const preview = require('../src/app/api/author/products/[id]/cover/private-preview/route.ts') as typeof import('../src/app/api/author/products/[id]/cover/private-preview/route');
const upload = () => { const form = new FormData(); form.set('file', new File([new Uint8Array([1, 2, 3])], 'c.png', { type: 'image/png' })); return new Request('https://audiolad.ru/x', { method: 'POST', body: form }); };

rows = { audio_items: { id: TRACK, cover_image: null } };
let res: Response = await albumRoute.POST(upload(), { params: Promise.resolve({ id: ALBUM }) });
assert.equal(res.status, 200);
let body = await res.json() as { cover_url: string; cover_image: unknown };
assert.equal(body.cover_url, `business-private-cover:practices/${ALBUM}/variants/v2/md.webp`);
assert.equal(body.cover_image, null);
assert.deepEqual(uploads.at(-1), { bucket: 'business-private-covers', profile: 'product-cover' });
assert.deepEqual(updates.at(-1), { table: 'practices', patch: { cover_url: body.cover_url, cover_image: null, updated_at: updates.at(-1)!.patch.updated_at } });
res = await trackRoute.POST(upload(), { params: Promise.resolve({ id: ALBUM, audioId: TRACK }) });
body = await res.json() as { cover_url: string; cover_image: unknown };
assert.equal(body.cover_url, `business-private-cover:practices/${ALBUM}/track-covers/${TRACK}/variants/v2/md.webp`);
assert.deepEqual(uploads.at(-1), { bucket: 'business-private-covers', profile: 'track-cover' });
assert.ok(uploads.every((row) => row.bucket === 'business-private-covers'), 'closed album never touches the public bucket');
await albumRoute.DELETE(new Request('https://audiolad.ru/x', { method: 'DELETE' }), { params: Promise.resolve({ id: ALBUM }) });
assert.equal(indexNow.length, 0, 'no search-engine ping for closed albums');

// Ordinary album: public bucket exactly as before.
practice = { ...practice, business_only: false, status: 'published' };
res = await albumRoute.POST(upload(), { params: Promise.resolve({ id: ALBUM }) });
assert.equal(res.status, 200);
assert.deepEqual(uploads.at(-1), { bucket: 'practice-covers', profile: 'product-cover' });
assert.match((await res.json() as { cover_url: string }).cover_url, /^https:\/\/.*practice-covers/);
assert.equal(indexNow.length, 1, 'ordinary published album still pings IndexNow');

// Editor preview: same access as editing, short-lived signed URL, never cached.
practice = { ...practice, business_only: true };
rows = { practices: { cover_url: REF }, audio_items: { cover_url: TRACK_REF } };
denied = true;
assert.equal((await preview.GET(new Request('https://audiolad.ru/p'), { params: Promise.resolve({ id: ALBUM }) })).status, 404, 'other author / listener denied');
denied = false;
res = await preview.GET(new Request('https://audiolad.ru/p'), { params: Promise.resolve({ id: ALBUM }) });
assert.equal(res.status, 302);
assert.equal(res.headers.get('cache-control'), 'private, no-store');
assert.equal(signCalls.at(-1)?.ttl, pc.BUSINESS_PRIVATE_COVER_SIGNED_URL_TTL_SECONDS);
res = await preview.GET(new Request(`https://audiolad.ru/p?audio=${TRACK}`), { params: Promise.resolve({ id: ALBUM }) });
assert.equal(res.status, 302);
assert.equal(signCalls.at(-1)?.path, `practices/${ALBUM}/track-covers/${TRACK}/variants/v1/md.webp`);
practice = { ...practice, business_only: false };
assert.equal((await preview.GET(new Request('https://audiolad.ru/p'), { params: Promise.resolve({ id: ALBUM }) })).status, 404, 'no preview proxy for ordinary albums');

// ---------- wiring: no leak paths ----------
const load = read('src/lib/business-workspace/load.server.ts');
assert.equal((load.match(/workspaceTrackCoverUrl\(practice, (audio|row)\.id, spaceId\)/g) ?? []).length, 2, 'both workspace pools use the private-aware cover source');
assert.doesNotMatch(load, /cabinetAlbumCoverUrl\(/);
assert.match(read('src/lib/business-app/proxy-policy.ts'), /"\/api\/business\/workspace\/cover"/, 'coffee/business hosts must serve the cover route');
const migration = read('supabase/migrations/20270312120000_business_only_private_covers.sql');
assert.match(migration, /^BEGIN;\nSET LOCAL lock_timeout = '5s';/m);
assert.match(migration, /'business-private-covers', 'business-private-covers', false/);
assert.doesNotMatch(migration, /CREATE POLICY [a-z_]+ ON storage\.objects (?!AS RESTRICTIVE)/, 'no permissive storage policy for the private bucket');
assert.ok(read('supabase/rollback/20270312120000_business_only_private_covers.down.sql').includes("'audiolad:internal-moderation-readiness:v8;"));
const gallery = read('src/app/api/author/products/[id]/gallery/route.ts');
assert.match(gallery, /assertBusinessOnlyCoverUploadAllowed\(practice\)/, 'gallery stays blocked for closed albums');
console.log('business-private-covers-unit: PASS (refs, public renderers null, hall/owner route 404/200 + long private cache, author upload to private bucket, ordinary unchanged, editor preview, no IndexNow, wiring)');

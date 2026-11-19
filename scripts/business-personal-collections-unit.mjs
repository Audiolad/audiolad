import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveCollectionPermission } from '../src/lib/business-collections/permissions.mjs';
import { serveCollectionAudio, serveCollectionCover } from '../src/lib/business-collections/audio.mjs';

const collection = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const tracks = Array.from({ length: 50 }, (_, n) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`);
const token = 'a'.repeat(64);
let activeToken = token;
let revoked = false;
const accounts = new Map();
let accountReads = 0;
const permission = (key = token, userId = null) => resolveCollectionPermission({
  token: key, userId,
  byToken: async (key) => key === activeToken && !revoked ? { id: collection } : null,
  byAccount: async (id) => { accountReads++; return !revoked ? accounts.get(id) ?? null : null; },
});
assert.equal(await permission(null), null, 'no account needed; absent invitation is denied');
assert.equal((await permission()).id, collection, 'valid guest link');
assert.equal(await permission('malformed'), null);
assert.equal(await permission('b'.repeat(64)), null, 'another secret cannot enumerate collections');

let signCalls = 0;
let fetchCalls = 0;
const deps = {
  hostAllowed: true,
  authorize: async (id, track) => (await permission())?.id === id && tracks.includes(track),
  sign: async () => { signCalls++; return { ok: true, url: 'https://storage.invalid/private?token=SECRET' }; },
  fetchAudio: async (_url, options) => {
    fetchCalls++;
    assert.equal(options.cache, 'no-store');
    return new Response('full-track-bytes', { status: options.headers.Range ? 206 : 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-15/16', 'Location': 'SECRET', 'Set-Cookie': 'SECRET' } });
  },
};
const request = (id = collection, track = tracks[0], range) => new Request(`https://coffee.audiolad.ru/api/business/collections/audio?collection=${id}&track=${track}`, { headers: range ? { Range: range } : {} });
for (const track of tracks) {
  const result = await serveCollectionAudio(request(collection, track), deps);
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'full-track-bytes');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.get('location'), null, 'storage secret never sent to guest');
  assert.equal(result.headers.get('set-cookie'), null);
}
assert.equal((await serveCollectionAudio(request(collection, tracks[0], 'bytes=0-15'), deps)).status, 206, 'seeking supported');
const before = signCalls;
assert.equal((await serveCollectionAudio(request(other), deps)).status, 404, 'no other private collection');
assert.equal((await serveCollectionAudio(request(collection, other), deps)).status, 404, 'no track outside assignment');
assert.equal((await serveCollectionAudio(request('invalid'), deps)).status, 404);
assert.equal((await serveCollectionAudio(request(), { ...deps, hostAllowed: false })).status, 404, 'coffee host only');
assert.equal((await serveCollectionAudio(request(collection, tracks[0], 'bytes=1-2,4-5'), deps)).status, 416);
assert.equal(signCalls, before, 'denied requests never reach signer');

// The explicit existing activation yields a verified user id, then saves the same collection.
// No gift function exists in either preview module. SQL test also checks no access-grant writes.
const choice = await permission();
accounts.set('verified-owner', choice);
assert.equal((await permission(null, 'verified-owner')).id, collection, 'account retains collection after browser cookie is gone');
assert.equal(await permission(null, 'unrelated-owner'), null, 'account isolation');
revoked = true;
const reads = accountReads;
assert.equal(await permission(token, 'verified-owner'), null, 'revoked link never falls back to account permissions');
assert.equal(accountReads, reads);
assert.equal(await permission(null, 'verified-owner'), null, 'revoke also closes saved preview');
const fetched = fetchCalls;
assert.equal((await serveCollectionAudio(request(), deps)).status, 404);
assert.equal(fetchCalls, fetched, 'revocation blocks new audio requests');
assert.equal((await serveCollectionAudio(request(), { ...deps, authorize: async () => { throw new Error('DB unavailable'); } })).status, 404);

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = source('src/app/business-app/collection/page.tsx');
assert.match(page, /BusinessGuestStartCta/);
assert.match(page, /Подключить заведение – \{BUSINESS_GIFT_DAYS\} дней в подарок/);
assert.match(page, /business-app-btn business-app-btn-cta/);
assert.match(page, /formatBusinessMonthlyPrice\(\)/);
assert.match(page, /ИНН и адрес/);
assert.doesNotMatch(page, /activateBusinessTrial|bootstrap|recordAccessActivity/);
const start = source('src/app/api/business/guest-start/route.ts');
assert.match(start, /if \(result.body.ok\)\s*\{\s*try \{ await rememberPersonalCollection\(\)/);
const layout = source('src/app/business-app/layout.tsx');
assert.doesNotMatch(layout, /rememberPersonalCollection/, 'opening any coffee page must not bind the collection');
const returned = source('src/app/(platform)/auth/business-return/page.tsx');
assert.match(returned, /await activateBusinessTrial\([\s\S]*?await rememberPersonalCollection\(\)/);
assert.match(layout, /loadCollectionPermission\(\)/);
assert.equal((start.match(/rememberPersonalCollection/g) || []).length, 2);

const loader = source('src/lib/business-collections/load.server.ts');
assert.match(loader, /auth.getUser\(\)/);
assert.match(loader, /user_id: user.id/);
assert.doesNotMatch(loader, /activateBusinessTrial|bootstrap|access_grants/);
console.log('personal-collections: PASS – 50 guest tracks, seeking, no secret/catalog leak, account handoff, revoke, fail closed');

// Independent device cookies: the capability has no single-session consumer or lock.
revoked = false;
const deviceA = { cookie: token };
const deviceB = { cookie: token };
const audioFor = (device) => serveCollectionAudio(request(), {
  ...deps, authorize: async (id, track) => (await permission(device.cookie))?.id === id && tracks.includes(track),
});
let coverReads = 0;
const coverFor = (device) => serveCollectionCover(request(), {
  hostAllowed: true,
  authorize: async (id, track) => (await permission(device.cookie))?.id === id && tracks.includes(track)
    ? { cover_ref: 'private-cover', album_id: other } : null,
  read: async () => { coverReads++; return { body: new Uint8Array([1,2,3]), contentType: 'image/webp' }; },
});
assert.deepEqual((await Promise.all([audioFor(deviceA), audioFor(deviceB), coverFor(deviceA), coverFor(deviceB)])).map(r => r.status), [200,200,200,200]);
const covered = await coverFor(deviceA);
assert.equal(covered.headers.get('location'), null);
assert.equal(covered.headers.get('set-cookie'), null);
assert.equal(covered.headers.get('referrer-policy'), 'no-referrer');
assert.deepEqual([...new Uint8Array(await covered.arrayBuffer())], [1,2,3]);
activeToken = 'c'.repeat(64); // Same atomic hash replacement as the admin action / SQL test.
const signedBeforeRotation = signCalls;
const coversBeforeRotation = coverReads;
assert.deepEqual((await Promise.all([audioFor(deviceA), audioFor(deviceB), coverFor(deviceA), coverFor(deviceB)])).map(r => r.status), [404,404,404,404]);
assert.equal(signCalls, signedBeforeRotation);
assert.equal(coverReads, coversBeforeRotation);
deviceA.cookie = activeToken;
assert.equal((await audioFor(deviceA)).status, 200);
assert.equal((await coverFor(deviceA)).status, 200);
revoked = true;
assert.equal((await audioFor(deviceA)).status, 404);
assert.equal((await coverFor(deviceA)).status, 404);
assert.equal((await coverFor({ cookie: 'forged' })).status, 404);

const { selectPersonalVenuePool } = await import('../src/lib/business-collections/venue-pool.mjs');
const ordinary = tracks.map(audioItemId => ({ audioItemId }));
assert.deepEqual(await selectPersonalVenuePool(ordinary, async () => [tracks[3], tracks[7], other]), [ordinary[3], ordinary[7]], 'intersection never adds preview-only/ineligible ids');
assert.equal(await selectPersonalVenuePool(ordinary, async () => []), ordinary, 'no collection or revoked collection uses ordinary atmosphere');
assert.equal(await selectPersonalVenuePool(ordinary, async () => [other]), ordinary, 'no eligible collection tracks uses ordinary atmosphere');
await assert.rejects(selectPersonalVenuePool(ordinary, async () => { throw new Error('unavailable'); }), 'lookup failure cannot expand pool');
const workspace = source('src/lib/business-workspace/load.server.ts');
assert.match(workspace, /tracks = await selectPersonalVenuePool/);
assert.match(workspace, /business_personal_collection_location_tracks/);
assert.match(workspace, /input.spaceId === "cafe" && input.locationId/);
const queue = source('src/app/api/business/workspace/queue/route.ts');
assert.match(queue, /loadWorkspaceCatalog/);
const openRoute = source('src/app/api/business/collections/open/route.ts');
assert.match(openRoute, /response.cookies.set\(COLLECTION_COOKIE, token/);
assert.doesNotMatch(openRoute, /\.update\(|\.delete\(|guest-start|signIn|bootstrap/, 'opening does not consume token or start trial');
const cta = source('src/components/business-app/BusinessGuestStartCta.tsx');
assert.match(cta, /if \(!accepted \|\| busy.current\) return/);
assert.match(cta, /requestGuestStart/);
assert.doesNotMatch(source('src/app/business-app/collection/CollectionPlayer.tsx'), /guest-start|activateBusinessTrial|bootstrap/);
const admin = source('src/app/(platform)/admin/business-catalog/collections/actions.ts');
assert.match(admin, /export async function regenerateCollection/);
assert.match(admin, /update\(\{ token_hash: collectionTokenHash\(token\), revoked_at: null \}\)/);
const migrationFiles = readdirSync(new URL('../supabase/migrations/', import.meta.url));
assert.ok(migrationFiles.includes('20270402120000_business_personal_collections.sql'));
assert.ok(!migrationFiles.includes('20270401120000_business_personal_collections.sql'));
assert.equal(migrationFiles.filter(name => name.startsWith('20270402120000_')).length, 1);
assert.doesNotMatch(source('supabase/rollbacks/20270402120000_business_personal_collections.rollback.sql'), /\b(DROP|DELETE|TRUNCATE)\s+(TABLE|FROM|public\.)/i);
console.log('personal-collections-follow-up: PASS – two cookies, rotation/revoke audio+cover, green onboarding CTA, eligibility-intersected venue pool/fallback, unique stamp, preview does not bind');

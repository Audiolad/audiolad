import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolveCollectionPermission } from '../src/lib/business-collections/permissions.mjs';
import { selectPersonalVenuePool } from '../src/lib/business-collections/venue-pool.mjs';

const collection = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const tracks = Array.from({ length: 50 }, (_, n) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`);
const token = 'a'.repeat(64);
let revoked = false;
const accounts = new Map();
let accountReads = 0;
const permission = (key = token, userId = null) => resolveCollectionPermission({
  token: key, userId,
  byToken: async (key) => key === token && !revoked ? { id: collection } : null,
  byAccount: async (id) => { accountReads++; return !revoked ? accounts.get(id) ?? null : null; },
});
assert.equal(await permission(null), null, 'absent invitation is denied');
assert.equal((await permission()).id, collection, 'valid link');
assert.equal(await permission('malformed'), null);
assert.equal(await permission('b'.repeat(64)), null, 'another secret cannot enumerate collections');
accounts.set('verified-owner', { id: collection });
assert.equal((await permission(null, 'verified-owner')).id, collection, 'account keeps collection without the cookie');
assert.equal(await permission(null, 'unrelated-owner'), null, 'account isolation');
revoked = true;
const reads = accountReads;
assert.equal(await permission(token, 'verified-owner'), null, 'revoked link never falls back to account');
assert.equal(accountReads, reads);
assert.equal(await permission(null, 'verified-owner'), null, 'revoke closes the account permission too');
revoked = false;

// Venue pool: the ordinary app limited to the collection (t1616u).
const ordinary = tracks.map(audioItemId => ({ audioItemId }));
assert.deepEqual(await selectPersonalVenuePool(ordinary, async () => [tracks[3], tracks[7], other]), [ordinary[3], ordinary[7]], 'intersection never adds ids');
assert.equal((await selectPersonalVenuePool(ordinary, async () => tracks.slice(0, 50))).length, 50, '50-track collection = 50 tracks');
assert.equal(await selectPersonalVenuePool(ordinary, async () => []), ordinary, 'venue without a collection keeps the ordinary catalog');
assert.equal(await selectPersonalVenuePool(ordinary, async () => [], async () => false), ordinary, 'paid venue keeps playing after a revoke');
assert.equal(await selectPersonalVenuePool(ordinary, async () => [], async () => true), 'collection_unavailable', 'unpaid link venue never gets the whole catalog');
assert.equal(await selectPersonalVenuePool(ordinary, async () => [other], async () => true), 'collection_unavailable');
const similar = [ordinary[20], ordinary[21]];
const trialMix = await selectPersonalVenuePool(ordinary, async () => [tracks[3], tracks[7]], async () => true, async () => similar);
assert.deepEqual(trialMix, [ordinary[3], ordinary[7]], 'trial never receives similar tracks');
const paidMix = await selectPersonalVenuePool(ordinary, async () => [tracks[3], tracks[7]], async () => false, async () => similar);
assert.deepEqual(paidMix, [ordinary[3], ordinary[7], ordinary[20], ordinary[21]], 'paid venue mixes collection then similar');
const leaked = await selectPersonalVenuePool(ordinary, async () => [tracks[3]], async () => false, async () => [{ audioItemId: 'not-in-pool' }, ordinary[3], ordinary[8]]);
assert.deepEqual(leaked, [ordinary[3], ordinary[8]], 'similar lookup cannot add ids outside the admitted pool or duplicates');
const failedMix = await selectPersonalVenuePool(ordinary, async () => [tracks[3]], async () => false, async () => { throw new Error('mix'); });
assert.deepEqual(failedMix, [ordinary[3]], 'failed similar lookup keeps the collection and does not widen');
let similarCalls = 0;
await selectPersonalVenuePool(ordinary, async () => [tracks[0]], async () => true, async () => { similarCalls++; return similar; });
assert.equal(similarCalls, 0, 'unpaid venue never asks for similar tracks');
let strictCalls = 0;
await selectPersonalVenuePool(ordinary, async () => [tracks[0]], async () => { strictCalls++; return true; });
assert.equal(strictCalls, 1, 'paid/unpaid status is checked when the collection is live');
await assert.rejects(selectPersonalVenuePool(ordinary, async () => { throw new Error('unavailable'); }), 'lookup failure cannot expand pool');
await assert.rejects(selectPersonalVenuePool(ordinary, async () => [], async () => { throw new Error('unavailable'); }), 'strict failure cannot expand pool');

const { collectionEntryDestination, COLLECTION_ENTRY_COPY } = await import('../src/lib/business-collections/entry.ts');
assert.equal(collectionEntryDestination('/cabinet'), '/music', 'the link opens the music first');
assert.equal(collectionEntryDestination('/'), '/music');
assert.equal(collectionEntryDestination('/auth/business-return?site=coffee'), '/auth/business-return?site=coffee');
for (const text of Object.values(COLLECTION_ENTRY_COPY)) {
  assert.doesNotMatch(text, /подар|₽|дней|Подключить|оплат/i, `calm copy: ${text}`);
  assert.doesNotMatch(text, /—/, 'en dash only');
}

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// The separate player is gone; /collection is the calm entry screen.
for (const gone of ['src/app/business-app/collection/CollectionPlayer.tsx', 'src/app/api/business/collections/audio/route.ts',
  'src/app/api/business/collections/cover/route.ts', 'src/app/api/business/collections/state/route.ts', 'src/lib/business-collections/audio.mjs']) {
  assert.ok(!existsSync(new URL(`../${gone}`, import.meta.url)), `${gone} removed`);
}
const page = source('src/app/business-app/collection/page.tsx');
assert.doesNotMatch(page, /BusinessGuestStartCta|BUSINESS_GIFT|formatBusinessMonthlyPrice|business-app-btn-cta/);
assert.match(page, /redirect\("\/music"\)/, 'bound account goes straight to the music');
assert.match(page, /collectionHasRoom/);
assert.match(page, /publicHostnameFromHeaders/);
assert.doesNotMatch(page, /isCoffeeHostRequest/);
assert.match(page, /businessGuestCoffeeHallRedirect/, 'hall device never starts an account here');
const entry = source('src/app/business-app/collection/CollectionEntry.tsx');
assert.match(entry, /if \(!accepted \|\| busy.current\) return/, 'explicit offer acceptance');
assert.match(entry, /requestGuestStart/);
assert.match(entry, /collectionEntryDestination/);
const openRoute = source('src/app/api/business/collections/open/route.ts');
assert.match(openRoute, /response.cookies.set\(COLLECTION_COOKIE, token/);
assert.match(openRoute, /https:\/\/coffee.audiolad.ru\/collection/);
assert.match(openRoute, /collection\?state=unavailable/);
assert.match(openRoute, /cookies.set\(COLLECTION_COOKIE, COLLECTION_DEAD_MARKER, \{/, 'dead link replaces another collection cookie with a dead marker');
assert.match(openRoute, /if \(error\) return remember\(\);[\s\S]*\} catch \{ return remember\(\); \}/, "lookup errors still replace a previous collection cookie");
assert.match(page, /state === "unavailable"\) return <Unavailable \/>/);
assert.doesNotMatch(openRoute, /\.update\(|\.delete\(|\.insert\(|\.upsert\(|signIn|bootstrap/, 'opening writes nothing');
const start = source('src/app/api/business/guest-start/route.ts');
assert.match(start, /"collection_full"/);
assert.match(start, /"collection_unavailable"/);
assert.match(start, /if \(entryCollectionId && !await bindPersonalCollection\(entryCollectionId, input.userId\)\) throw new Error\("collection_full"\);\s*const \{ data, error \} = await createServiceRoleClient\(\).rpc\("business_guest_bootstrap"/, 'bound before the venue exists');
assert.match(start, /venues.some\(\(venue\) => venue.collectionId !== entryCollectionId\)\) return json\(503/, 'every cafe venue must play this collection after the start');
assert.match(start, /if \(!permission && \(collectionEntry \|\| await collectionVisitorStrict\(user\?.id \?\? null\)\)\) return json\(410, "collection_unavailable"\)/, 'a revoked link never becomes an ordinary guest');
assert.match(start, /venue.collectionId !== null && venue.collectionId !== permission.id\)\) \{\s*return json\(409, "collection_other"\)/, 'another collection is never kept silently');
assert.match(entry, /COLLECTION_ENTRY_HEADER\]: "1"/);
assert.ok(start.indexOf('collection_full') < start.indexOf('handleBusinessGuestStart('), 'cap checked before any sign-in');
const loader = source('src/lib/business-collections/load.server.ts');
assert.match(loader, /count < COLLECTION_ACCOUNT_LIMIT/);
assert.match(loader, /if \(!await collectionHasRoom\(collectionId, userId\)\) return false;/);
assert.doesNotMatch(loader, /rememberPersonalCollection/, "binding happens only through the gate or the start");
assert.doesNotMatch(loader, /activateBusinessTrial|bootstrap|access_grants/);
assert.match(source('src/lib/business-collections/model.ts'), /COLLECTION_ACCOUNT_LIMIT = 10;/);
const layout = source('src/app/business-app/layout.tsx');
assert.doesNotMatch(layout, /collectionVenueGate|bindPersonalCollection/, 'opening any coffee page must not bind the collection');
assert.match(layout, /customerAccess\?\.mode !== "paid"/);
assert.match(layout, /quietCollection=\{quietCollection\}/);
assert.doesNotMatch(layout, /Ваша подборка/);
const demo = source('src/app/business-app/guest/coffee/page.tsx');
assert.match(demo, /if \(await loadCollectionVisitor\(visitor\?.id \?\? null\)\) redirect\("\/collection"\)/, 'a revoked cookie or binding never sees the demo');
const entryPage = source('src/app/business-app/collection/page.tsx');
assert.match(entryPage, /other = user \? \(await ownerCafeVenueCollections\(user.id\)\)/, 'a venue with another collection is not opened as this link');
assert.match(entryPage, /bound = !other && user/);
const profilePage = source('src/app/business-app/profile/page.tsx');
assert.match(profilePage, /<BusinessQuietHidden>\s*<p>\s*<Link[^>]*href="\/onboarding">\s*Подключить заведение/, 'profile connect button is hidden in quiet');
assert.match(source('src/components/business-app/profile/BusinessProfileSubscription.tsx'), /connectVenueHref \? <p><a className="underline" href=\{connectVenueHref\}/);
assert.match(demo, /redirect\("\/collection"\)/, 'link visitor never sees the public demo');
const workspace = source('src/lib/business-workspace/load.server.ts');
assert.match(workspace, /personalCollectionStrict\(db, locationId\)/);
assert.match(workspace, /loadPaidSimilarMix\(db, locationId, selected, admitted\)/);
assert.match(workspace, /collectionUnavailable: true/);
assert.match(workspace, /business_venue_paid_until/);
// Quiet cabinet (t1617u/t1618u): every pushy element is gated.
const quietGates = {
  'src/components/business-app/BusinessAppShell.tsx': [/showGuestBar = !quiet/, /showAccessLine = !quiet/],
  'src/components/business-app/BusinessSidebar.tsx': [/!collapsed && !quiet/],
  'src/components/business-app/BusinessHomePage.tsx': [/quiet \? null : <BusinessHomeAccessCard \/>/, /showAccess=\{!quiet\}/, /needsNewEdition && !quiet/],
  'src/components/business-app/BusinessPointSlots.tsx': [/multi && !quiet/],
  'src/components/business-app/workspace/BusinessWorkspace.tsx': [/model.status === "anonymous" && !quiet/, /cabinet.can\("payLink"\) && !quiet/, /Подборка сейчас недоступна/, /if \(model.collectionUnavailable\) return false;/],
  'src/app/business-app/profile/page.tsx': [/<BusinessQuietHidden>\s*<div className="mb-4">\s*<BusinessOwnerSurnamePrompt \/>/],
  'src/components/business-app/profile/BusinessProfileSubscription.tsx': [/<details>/, /Подключение и оплата/],
  'src/components/business-app/BusinessOnboardingWizardPage.tsx': [/step !== "done" && !quiet/, /\{quiet \? null : <p className="text-sm text-\[var\(--biz-text-muted\)\]">\s*\{GUEST_COFFEE_TERMS\}/],
};
for (const [file, patterns] of Object.entries(quietGates)) {
  const text = source(file);
  for (const pattern of patterns) assert.match(text, pattern, `${file}: ${pattern}`);
}
const quiet = source('src/components/business-app/BusinessQuietMode.tsx');
assert.match(quiet, /pathname === "\/collection"/, 'entry screen is quiet too');
const policy = source('src/lib/business-app/proxy-policy.ts');
assert.match(policy, /"\/api\/business\/collections\/open"/);
assert.doesNotMatch(policy, /collections\/(audio|cover|state)/);
const admin = source('src/app/(platform)/admin/business-catalog/collections/actions.ts');
assert.match(admin, /export async function regenerateCollection/);
const migrationFiles = readdirSync(new URL('../supabase/migrations/', import.meta.url));
assert.ok(migrationFiles.includes('20270402120000_business_personal_collections.sql'));
assert.deepEqual(migrationFiles.filter((name) => name > '20270402120000_business_personal_collections.sql' && /collection/.test(name)), ['20270405120000_business_personal_collection_share_percent.sql'], 'only the share-percent collection migration was added');
console.log('personal-collections: PASS – ordinary app limited to the collection, strict unpaid pool, calm entry, quiet cabinet, 10 per link');

// Round 3: a venue created by a bound account after a revoke stays strict while unpaid; ordinary
// venues fall back on lookup errors (a hall never goes silent).
{
  const ws = readFileSync(new URL('../src/lib/business-workspace/load.server.ts', import.meta.url), 'utf8');
  assert.match(ws, /business_personal_collection_accounts"\)\.select\("collection_id"\)\.in\("user_id", ownerIds\)/);
  assert.match(ws, /if \(bound.error\) throw new Error\("collection_venue_owner_unavailable"\);/, 'unknown collection status fails closed');
  const ret = readFileSync(new URL('../src/app/(platform)/auth/business-return/page.tsx', import.meta.url), 'utf8');
  assert.match(ret, /const gate = await collectionVenueGate\(user.id\);\s*collectionHandoff = !gate.ok \|\| \(gate.collectionId !== null && !await collectionVenuesMatch\(user.id, gate.collectionId\)\);\s*\} catch \{ collectionHandoff = true; \}\s*if \(collectionHandoff\) redirect\(COLLECTION_ENTRY_URL\);/, 'a full, dead or other link never reaches onboarding');
  const actions = readFileSync(new URL('../src/app/business-app/actions.ts', import.meta.url), 'utf8');
  assert.match(actions, /const gate = await collectionVenueGate\(user.id\);\s*if \(!gate.ok\)[\s\S]*?create_business_organization_with_location/, 'venue creation is gated for collection visitors');
  const gateSrc = readFileSync(new URL('../src/lib/business-collections/load.server.ts', import.meta.url), 'utf8');
  assert.match(gateSrc, /if \(!permission\) return \{ ok: false, reason: "unavailable" \};[\s\S]*reason: "other"[\s\S]*if \(!await bindPersonalCollection\(permission.id, userId\)\) return \{ ok: false, reason: "full" \};/);
  const home = readFileSync(new URL('../src/components/business-app/BusinessHomePage.tsx', import.meta.url), 'utf8');
  assert.match(home, /\{quiet \? null : \(\s*<details className="mt-4">/, 'quick connect hidden in quiet');
}
assert.match(readFileSync(new URL('../src/components/business-app/BusinessEligibilityProbePanel.tsx', import.meta.url), 'utf8'),
  /\{quiet \? "Создать заведение" : "Подключить заведение"\}/, 'probe panel is quiet too');

{
  const ws = readFileSync(new URL('../src/lib/business-workspace/load.server.ts', import.meta.url), 'utf8');
  assert.match(ws, /if \(input.ownerBrowser && input.locationId\) \{\s*try \{\s*if \(await browserCollectionMismatch\(db, input.locationId\)\) return \{ tracks: \[\], unavailable: false, collectionUnavailable: true \};/, 'link browser plays only that link');
  assert.match(ws, /if \(permission && assigned.data\?.collection_id === permission.id\) return false;/);
  for (const route of ['track-url', 'cover', 'queue']) {
    assert.match(readFileSync(new URL(`../src/app/api/business/workspace/${route}/route.ts`, import.meta.url), 'utf8'), /ownerBrowser: !actor.device/, route);
  }
  assert.match(readFileSync(new URL('../src/lib/business-collections/model.ts', import.meta.url), 'utf8'), /COLLECTION_DEAD_MARKER = "0".repeat\(64\)/);
}
assert.match(source('src/lib/business-collections/load.server.ts'), /if \(error\) return true;\s*return Array.isArray\(data\) && data.length > 0;\s*\} catch \{ return true; \}/, 'visitor lookup errors stay quiet');
assert.match(source('src/components/business-app/BusinessHomePage.tsx'), /\? quiet \? "Чтобы слушать подборку, создайте заведение\." : "Подключите своё заведение/);
{
  const studio = source('src/components/business-app/sound/BusinessSoundStudio.tsx');
  assert.match(studio, /limit === "near_end" && !quiet/);
  assert.match(studio, /\{offerGift && !quiet \? \(/);
  assert.match(studio, /\{guest && liveAccess && !quiet \? \(/);
}

// t1639u: the admin list must make it obvious which collection a fresh link belongs to.
// The raw token is never stored; only token_hash, so a link cannot be shown again.
{
  const ui = source('src/app/(platform)/admin/business-catalog/collections/CollectionAdmin.tsx');
  const adminPage = source('src/app/(platform)/admin/business-catalog/collections/page.tsx');
  const adminActions = source('src/app/(platform)/admin/business-catalog/collections/actions.ts');
  assert.match(ui, /Ссылка для подборки «\{fresh\.title\}»/);
  assert.match(ui, /Ссылка показана только один раз – сейчас/);
  assert.match(ui, /\{copied \? "Скопировано" : "Копировать ссылку"\}/);
  assert.match(ui, /\{copied \? <p className="mt-2 text-sm font-medium text-\[#25135c\]">Скопировано<\/p> : null\}/);
  assert.match(ui, /Ссылка действует, выдана \$\{text\}/);
  assert.match(ui, /timeZone: "Europe\/Moscow"/);
  assert.match(ui, /\{revokedNow \? "Ссылка отозвана" : issuedStatus\(entry\.created_at\)\}/);
  assert.match(ui, /Воспользовались: \{entry\.usedCount\} из \{COLLECTION_ACCOUNT_LIMIT\}/);
  assert.match(ui, /Саму ссылку мы не храним/);
  assert.match(ui, /Перевыпустить/);
  assert.match(ui, /fresh\?\.collectionId === entry\.id/);
  assert.match(ui, /scrollIntoView/);
  assert.match(ui, /rounded-xl border border-\[#eadff8\]/);
  assert.doesNotMatch(ui, /—/);
  assert.doesNotMatch(adminPage, /—/);
  assert.doesNotMatch(adminActions, /—/);
  // Copy button lives inside the fresh-link box, next to the URL.
  const boxStart = ui.indexOf('function LinkBox');
  const boxEnd = ui.indexOf('export default function CollectionAdmin');
  const box = ui.slice(boxStart, boxEnd);
  assert.match(box, /Копировать ссылку/);
  assert.match(box, /value=\{fresh\.url\}/);
  assert.ok(box.indexOf('value={fresh.url}') < box.indexOf('Копировать ссылку'), 'copy button is inside the box next to the URL');
  assert.match(adminPage, /select\("id,title,revoked_at,created_at,collection_share_percent"\)/);
  assert.match(adminPage, /loadCollectionSimilarPreviews/);
  assert.match(adminPage, /business_personal_collection_accounts"\)\.select\("collection_id"\)/);
  assert.match(adminPage, /\.order\("collection_id", \{ ascending: true \}\)/);
  assert.match(adminPage, /\.order\("user_id", \{ ascending: true \}\)/);
  assert.match(adminPage, /\.range\(from, from \+ ACCOUNT_PAGE - 1\)/);
  assert.match(adminPage, /if \(used\.error \|\| !used\.data\) return null;/);
  assert.match(adminPage, /usedCount: usedById \? \(usedById\.get\(row\.id\) \?\? 0\) : null/);
  assert.match(adminActions, /p_token_hash: collectionTokenHash\(token\)/);
  assert.match(adminActions, /update\(\{ token_hash: collectionTokenHash\(token\), revoked_at: null \}\)/);
  assert.match(adminActions, /id: asCollectionId\(data\), title, createdAt:/);
  assert.match(adminActions, /select\("id,title"\)/);
  assert.doesNotMatch(adminActions, /token_plain|raw_token/);
  assert.doesNotMatch(adminActions, /p_token:\s*token|token_hash:\s*token(?!_)/, "raw token is never written");
  assert.doesNotMatch(adminPage, /token_hash/);
  const migrationFiles = readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const collectionMigrations = migrationFiles.filter((name) => name > '20270402120000_business_personal_collections.sql' && /collection/.test(name));
  assert.deepEqual(collectionMigrations, ['20270405120000_business_personal_collection_share_percent.sql'], 'only the share-percent collection migration was added');
}

{
  const ui = source('src/app/(platform)/admin/business-catalog/collections/CollectionAdmin.tsx');
  const adminPage = source('src/app/(platform)/admin/business-catalog/collections/page.tsx');
  const adminActions = source('src/app/(platform)/admin/business-catalog/collections/actions.ts');
  assert.match(adminActions, /export async function saveCollectionShare/);
  assert.match(adminActions, /requirePlatformOwnerAccess\(COLLECTION_ADMIN_PATH\)/);
  assert.match(adminActions, /collection_share_percent: percent/);
  assert.match(ui, /Доля подборки после оплаты/);
  assert.match(ui, /После оплаты: \{entry.similar.length\} похожих треков/);
  assert.match(ui, /Какие треки подмешаются/);
  assert.match(ui, /track.title\} – \{track.albumTitle/);
  assert.match(ui, /Сохранить долю/);
  assert.match(ui, /COLLECTION_SHARE_PRESETS/);
  assert.doesNotMatch(ui, /—/, 'share UI uses en dash only');
  assert.doesNotMatch(adminPage, /—/);
  assert.doesNotMatch(adminActions, /—/);
  assert.match(source('src/lib/business-workspace/load.server.ts'), /loadPaidSimilarMix\(db, locationId, selected, admitted\)/);
}
console.log('personal-collections admin links: PASS – named once-only box, in-row reissue, usage count, hash-only token');
console.log('personal-collections similar mix admin: PASS – share selector, similar list, staff-only save');

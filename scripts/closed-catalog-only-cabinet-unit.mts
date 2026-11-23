/**
 * t1505u / t1506u: flagged author can create closed albums from the cabinet;
 * the album wizard drops description, SEO and step 3; other authors unchanged.
 */
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  CLOSED_CATALOG_HOUSE_AUTHOR_ID,
  CLOSED_CATALOG_HOUSE_AUTHOR_SLUG,
  CLOSED_CATALOG_ONLY_AUTHOR_ACCESS_ERROR,
  CLOSED_CATALOG_ONLY_CREATE_BLOCKED,
  CLOSED_CATALOG_ONLY_TOGGLE_ROUTE,
  CREATE_CLOSED_ALBUM_CABINET_BUTTON,
  CREATE_CLOSED_ALBUM_CABINET_ROUTE,
  clampProductWizardStep,
  closedCatalogCreateDecision,
  isClosedCatalogHouseAuthor,
  isClosedCatalogOnlyAuthor,
  isListedInClosedCatalogOnlySettings,
  lastVisibleProductWizardStep,
  nextVisibleProductWizardStep,
  previousVisibleProductWizardStep,
  shouldHideOpenCatalogAlbumFields,
  shouldShowPassportCreateOnLastWizardStep,
  visibleClosedCatalogOnlySettingsAuthors,
  visibleProductWizardSteps,
} from '../src/lib/authors/closed-catalog-only';
import { closedAlbumEditHref, closedBusinessAlbumInsertRow, parseCreateClosedAlbumResponse } from '../src/lib/business-track-passports/create-album';
import { PRODUCT_WIZARD_STEPS } from '../src/lib/author-products/product-wizard-steps';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mock = (path: string, exports: unknown) => {
  const key = require.resolve(path); const mod = new Module(key); mod.exports = exports; mod.loaded = true; require.cache[key] = mod;
};

const albumId = '7b0d1c55-8f3a-4c7e-9a51-2d6f0e9b4a11';
const authorId = 'b7ddb68b-8569-4987-a734-6c6e5502529e';
assert.equal(authorId, CLOSED_CATALOG_HOUSE_AUTHOR_ID);
assert.equal(CLOSED_CATALOG_HOUSE_AUTHOR_SLUG, 'audiolad');


// 1. Flag is explicit; never inferred.
assert.equal(isClosedCatalogOnlyAuthor(true), true);
assert.equal(isClosedCatalogOnlyAuthor(false), false);
assert.equal(isClosedCatalogOnlyAuthor(undefined), false);
assert.equal(isClosedCatalogOnlyAuthor(null), false);
assert.equal(shouldHideOpenCatalogAlbumFields(true), true);
assert.equal(shouldHideOpenCatalogAlbumFields(false), false);
assert.equal(closedCatalogCreateDecision({ error: null, data: { closed_catalog_only: false } }), 'allow');
assert.equal(closedCatalogCreateDecision({ error: null, data: { closed_catalog_only: true } }), 'blocked');
assert.equal(closedCatalogCreateDecision({ error: { message: 'permission denied' }, data: null }), 'unavailable');
assert.equal(closedCatalogCreateDecision({ error: { message: 'column does not exist' } }), 'unavailable');

// 2. Wizard: flagged author keeps steps 1–2 and drops step 3 (and open-catalog step 4).
assert.deepEqual(visibleProductWizardSteps(false), PRODUCT_WIZARD_STEPS);
assert.equal(lastVisibleProductWizardStep(false), 4);
assert.equal(nextVisibleProductWizardStep(2, false), 3);
assert.equal(nextVisibleProductWizardStep(3, false), 4);
assert.equal(previousVisibleProductWizardStep(3, false), 2);

assert.deepEqual(visibleProductWizardSteps(true).map((item) => item.step), [1, 2]);
assert.equal(lastVisibleProductWizardStep(true), 2);
assert.equal(nextVisibleProductWizardStep(1, true), 2);
assert.equal(nextVisibleProductWizardStep(2, true), null, 'no third step');
assert.equal(previousVisibleProductWizardStep(2, true), 1);
assert.equal(clampProductWizardStep(3, true), 2);
assert.equal(clampProductWizardStep(4, true), 2);
assert.equal(clampProductWizardStep(2, true), 2);
assert.equal(clampProductWizardStep(3, false), 3, 'other authors still open step 3');
assert.equal(visibleProductWizardSteps(true).some((item) => item.label === 'Описание и продвижение'), false);

// t1511u: last step (step 2) still offers the passport create button, never step-3 continue labels.
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'idle', continueInBackground: false }), true);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'saving', continueInBackground: false }), true);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'enqueueing', continueInBackground: false }), true);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'failed', continueInBackground: false }), true);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'partial', continueInBackground: false }), true);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'stale', continueInBackground: false }), true);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'completed', continueInBackground: false }), false);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'analyzing', continueInBackground: true }), false);
assert.equal(shouldShowPassportCreateOnLastWizardStep({ kind: 'queued', continueInBackground: true }), false);


// 3. Cabinet insert is the same closed album as the admin RPC (auto-Shazam keys off business_only).
const row = closedBusinessAlbumInsertRow(authorId, 'Утро без суеты', albumId);
assert.equal(row.business_only, true);
assert.equal(row.product_kind, 'music');
assert.equal(row.publication_class, 'release');
assert.equal(row.status, 'draft');
assert.equal(row.catalog_visibility, 'selected_users');
assert.equal(row.is_catalog_listed, false);
assert.equal(row.slug, `business-${albumId}`);
assert.match(read('supabase/migrations/20270313120000_business_passport_shazam_checks.sql'), /p\.business_only AND p\.product_kind='music'/);
assert.match(read('src/lib/business-track-passports/cabinet.server.ts'), /business_only music when the master is verified/);
assert.match(read('src/lib/business-track-passports/cabinet.server.ts'), /closedBusinessAlbumInsertRow/);

// 4. Additive migration: column defaults to false, no author is auto-enabled, rollback drops the guard then the column.
const migration = read('supabase/migrations/20270314120000_author_closed_catalog_only.sql');
assert.match(migration, /ADD COLUMN IF NOT EXISTS closed_catalog_only boolean/);
assert.match(migration, /SET DEFAULT false/);
assert.match(migration, /SET NOT NULL/);
assert.doesNotMatch(migration, /UPDATE public\.authors\s+SET closed_catalog_only = true/i);
assert.doesNotMatch(migration, /UPDATE public\.authors[\s\S]{0,200}SET closed_catalog_only = true[\s\S]{0,200}(name|slug)/i);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.guard_authors_closed_catalog_only\(\)/);
assert.match(migration, /BEFORE UPDATE ON public\.authors/);
assert.match(migration, /NEW\.closed_catalog_only IS NOT DISTINCT FROM OLD\.closed_catalog_only/);
assert.match(migration, /auth\.uid\(\) IS NULL OR public\.is_platform_staff\(auth\.uid\(\)\)/);
assert.match(migration, /RAISE EXCEPTION 'closed_catalog_only_staff_only'/);
assert.match(migration, /ERRCODE = '42501'/);
const rollback = read('supabase/rollback/20270314120000_author_closed_catalog_only.down.sql');
assert.match(rollback, /DROP TRIGGER IF EXISTS guard_authors_closed_catalog_only_trigger/);
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.guard_authors_closed_catalog_only\(\)/);
assert.match(rollback, /DROP COLUMN IF EXISTS closed_catalog_only/);
assert.ok(
  rollback.indexOf('DROP TRIGGER IF EXISTS guard_authors_closed_catalog_only_trigger')
    < rollback.indexOf('DROP COLUMN IF EXISTS closed_catalog_only'),
);

// 5. Cabinet create route: stable JSON API, success / reuse / flag-off 403, no cross-site.
type CreateImpl = (author: string, title: string, hasVocals?: boolean) => Promise<{ id: string; reused: boolean }>;
let createImpl: CreateImpl = async () => ({ id: albumId, reused: false });
const createCalls: [string, string, boolean?][] = [];
mock('../src/lib/business-track-passports/cabinet.server.ts', {
  createClosedBusinessAlbumFromCabinet: async (author: string, title: string, hasVocals?: boolean) => {
    createCalls.push([author, title, hasVocals === true]);
    return createImpl(author, title, hasVocals);
  },
});
const cabinetRoute = require('../src/app/api/author/closed-albums/route.ts') as typeof import('../src/app/api/author/closed-albums/route');
const postCabinet = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }) =>
  cabinetRoute.POST(new Request(`https://audiolad.ru${CREATE_CLOSED_ALBUM_CABINET_ROUTE}`, { method: 'POST', headers, body: JSON.stringify(body) }));

const originalConsoleError = console.error;
console.error = () => {};
let response: Response;
try {
  response = await postCabinet({ author_id: authorId, title: 'Утро без суеты' });
  assert.equal(response.status, 201);
  assert.deepEqual(createCalls.at(-1), [authorId, 'Утро без суеты', false]);
  response = await postCabinet({ author_id: authorId, title: 'Вечер с вокалом', has_vocals: true });
  assert.equal(response.status, 201);
  assert.deepEqual(createCalls.at(-1), [authorId, 'Вечер с вокалом', true]);
  assert.deepEqual(await response.json(), { ok: true, albumId, reused: false, editHref: closedAlbumEditHref(albumId) });

  createImpl = async () => ({ id: albumId, reused: true });
  response = await postCabinet({ author_id: authorId, title: 'Утро без суеты' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reused, true);

  createImpl = async () => { throw new Error('Для этого автора закрытые альбомы из кабинета не включены.'); };
  response = await postCabinet({ author_id: authorId, title: 'X' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).message, 'Для этого автора закрытые альбомы из кабинета не включены.');

  const before = createCalls.length;
  response = await postCabinet({ author_id: authorId, title: 'X' }, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
  assert.equal(response.status, 403);
  assert.equal(createCalls.length, before);
} finally {
  console.error = originalConsoleError;
}

// 6. Admin toggle route: same-origin first, then admin panel, then workspace membership.
const updates: { id: string; enabled: boolean }[] = [];
const adminOk = true;
const workspaces: { id: string }[] = [{ id: authorId }];
const workspaceCalls: string[] = [];
mock('../src/lib/admin/guard.ts', {
  requireAdminPanelAccess: async () => {
    if (!adminOk) throw new Error('Нужен доступ администратора.');
    return { userId: 'admin' };
  },
});
mock('../src/lib/author-products/auth.ts', {
  listAuthorWorkspacesForUser: async (userId: string) => {
    workspaceCalls.push(userId);
    return workspaces;
  },
});
mock('../src/lib/supabase/service-role.ts', {
  createServiceRoleClient: () => ({
    from: () => ({
      update: (payload: { closed_catalog_only: boolean }) => ({
        eq: (column: string, id: string) => ({
          select: () => ({
            maybeSingle: async () => {
              updates.push({ id, enabled: payload.closed_catalog_only });
              assert.equal(column, 'id');
              return { data: { id }, error: null };
            },
          }),
        }),
      }),
    }),
  }),
});
const toggleRoute = require('../src/app/api/admin/business-catalog/closed-catalog-only/route.ts') as typeof import('../src/app/api/admin/business-catalog/closed-catalog-only/route');
const postToggle = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }) =>
  toggleRoute.POST(new Request(`https://audiolad.ru${CLOSED_CATALOG_ONLY_TOGGLE_ROUTE}`, { method: 'POST', headers, body: JSON.stringify(body) }));
response: {
  const response = await postToggle({ author_id: authorId, enabled: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, authorId, enabled: true });
  assert.deepEqual(updates.at(-1), { id: authorId, enabled: true });
}
{
  const response = await postToggle({ author_id: authorId, enabled: false });
  assert.equal(response.status, 200);
  assert.deepEqual(updates.at(-1), { id: authorId, enabled: false });
}
{
  const beforeWorkspaces = workspaceCalls.length;
  const response = await postToggle({ author_id: authorId, enabled: true }, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
  assert.equal(response.status, 403);
  assert.equal(workspaceCalls.length, beforeWorkspaces, 'same-origin is checked before membership');
}
{
  const foreignId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const before = updates.length;
  const response = await postToggle({ author_id: foreignId, enabled: true });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, message: CLOSED_CATALOG_ONLY_AUTHOR_ACCESS_ERROR });
  assert.equal(updates.length, before);
  assert.equal(workspaceCalls.at(-1), 'admin');
}

const toggleRouteSrc = read('src/app/api/admin/business-catalog/closed-catalog-only/route.ts');
assert.match(toggleRouteSrc, /isSameOriginJsonRequest\(request.headers\)/);
assert.match(toggleRouteSrc, /listAuthorWorkspacesForUser\(admin\.userId\)/);
const togglePost = toggleRouteSrc.slice(toggleRouteSrc.indexOf('export async function POST'));
assert.ok(togglePost.indexOf('isSameOriginJsonRequest') < togglePost.indexOf('requireAdminPanelAccess'));
assert.ok(togglePost.indexOf('requireAdminPanelAccess') < togglePost.indexOf('listAuthorWorkspacesForUser'));

// t1513u: the admin block lists only closed-catalog authors plus the house artist.
// Flags are not changed. Identification is by id or slug, never by display name.
const otherOff = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', slug: 'aurafon', name: 'Аурафон', closedCatalogOnly: false };
const otherOn = { id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', slug: 'oriy', name: 'Орий', closedCatalogOnly: true };
const houseOn = { id: CLOSED_CATALOG_HOUSE_AUTHOR_ID, slug: CLOSED_CATALOG_HOUSE_AUTHOR_SLUG, name: 'АудиоЛад', closedCatalogOnly: true };
const houseOff = { id: CLOSED_CATALOG_HOUSE_AUTHOR_ID, slug: CLOSED_CATALOG_HOUSE_AUTHOR_SLUG, name: 'АудиоЛад', closedCatalogOnly: false };
const nameOnly = { id: 'cccccccc-dddd-eeee-ffff-000000000000', slug: 'not-audiolad', name: 'АудиоЛад', closedCatalogOnly: false };
const slugOnly = { id: 'dddddddd-eeee-ffff-0000-111111111111', slug: CLOSED_CATALOG_HOUSE_AUTHOR_SLUG, name: 'Другое имя', closedCatalogOnly: false };

assert.equal(isClosedCatalogHouseAuthor(houseOn), true);
assert.equal(isClosedCatalogHouseAuthor(houseOff), true);
assert.equal(isClosedCatalogHouseAuthor({ id: CLOSED_CATALOG_HOUSE_AUTHOR_ID, slug: 'renamed' }), true);
assert.equal(isClosedCatalogHouseAuthor(slugOnly), true);
assert.equal(isClosedCatalogHouseAuthor(otherOff), false);
assert.equal(isClosedCatalogHouseAuthor(nameOnly), false, 'never match by display name');

assert.equal(isListedInClosedCatalogOnlySettings(houseOn), true);
assert.equal(isListedInClosedCatalogOnlySettings(houseOff), true, 'house artist stays visible if the flag is off');
assert.equal(isListedInClosedCatalogOnlySettings(otherOn), true);
assert.equal(isListedInClosedCatalogOnlySettings(otherOff), false);
assert.equal(isListedInClosedCatalogOnlySettings(nameOnly), false);
assert.equal(isListedInClosedCatalogOnlySettings(slugOnly), true);

const clutter = [otherOff, houseOn, otherOn, nameOnly];
const visible = visibleClosedCatalogOnlySettingsAuthors(clutter);
assert.deepEqual(visible.map((item) => item.id), [houseOn.id, otherOn.id]);
assert.equal(clutter.length, 4, 'input list is not mutated');
assert.equal(otherOff.closedCatalogOnly, false);
assert.equal(houseOn.closedCatalogOnly, true);
assert.deepEqual(visibleClosedCatalogOnlySettingsAuthors([otherOff, nameOnly]).map((item) => item.id), []);
assert.deepEqual(visibleClosedCatalogOnlySettingsAuthors([houseOff]).map((item) => item.id), [houseOff.id]);

// 7. UI: cabinet form and admin toggle use fixed routes, not server actions. Russian copy, en dash only.
const cabinetForm = read('src/components/author-dashboard/CreateClosedAlbumCabinet.tsx');
assert.match(cabinetForm, /fetch\(CREATE_CLOSED_ALBUM_CABINET_ROUTE/);
assert.match(cabinetForm, /name="has_vocals"/);
assert.match(cabinetForm, /С вокалом/);
assert.match(cabinetForm, /has_vocals: form\.get\('has_vocals'\) === 'on'/);
assert.match(cabinetForm, /router\.push\(result\.editHref\)/);
assert.match(cabinetForm, /event\.preventDefault\(\)/);
assert.doesNotMatch(cabinetForm, /use server|closedCatalogAction/);
assert.match(cabinetForm, /CREATE_CLOSED_ALBUM_CABINET_BUTTON/);
assert.match(read('src/lib/authors/closed-catalog-only.ts'), new RegExp(CREATE_CLOSED_ALBUM_CABINET_BUTTON));
assert.doesNotMatch(cabinetForm, /—/);

const dashboard = read('src/components/author-dashboard/AuthorDashboardClient.tsx');
assert.match(dashboard, /closedCatalogOnly \? \(/);
assert.match(dashboard, /CreateClosedAlbumCabinet/);
assert.match(dashboard, /isClosedCatalogOnlyAuthor\(selectedAuthor\.closedCatalogOnly\)/);

const newPage = read('src/app/(platform)/author-dashboard/products/new/page.tsx');
assert.match(newPage, /isClosedCatalogOnlyAuthor\(initialAuthor\.closedCatalogOnly\)/);
assert.match(newPage, /CreateClosedAlbumCabinet/);
assert.doesNotMatch(newPage.slice(newPage.indexOf('isClosedCatalogOnlyAuthor(initialAuthor.closedCatalogOnly)'), newPage.indexOf('const publicationClass')), /AuthorCreateWizard|AuthorProductSeoQueryStep/);

const form = read('src/components/author-dashboard/AuthorProductForm.tsx');
assert.match(form, /showWizardStep\(3\) && !hideOpenCatalogFields/);
assert.match(form, /steps=\{visibleWizardSteps\}/);
assert.match(form, /wizardStep === lastWizardStep/);
assert.match(form, /!hideOpenCatalogFields/);
assert.doesNotMatch(form, /nextProductWizardStep\(wizardStep\)/);

// t1511u: #1280 hid the step-nav on the last step, which also hid «Сохранить и создать музыкальный паспорт».
const lastStepStart = form.indexOf('wizardEnabled && wizardStep === lastWizardStep');
const lastStepBlock = form.slice(lastStepStart, form.indexOf('{!wizardEnabled', lastStepStart));
assert.match(lastStepBlock, /shouldShowPassportCreateOnLastWizardStep\(passportActivity\)/);
assert.match(lastStepBlock, /data-passport-create=/);
assert.match(lastStepBlock, /saveWizardStepAndContinue\(\)/);
assert.match(lastStepBlock, /passportActivity\.buttonLabel/);
assert.doesNotMatch(lastStepBlock, /Продолжить без музыкального паспорта/);
assert.doesNotMatch(lastStepBlock, /Перейти к оформлению/);
assert.doesNotMatch(lastStepBlock, /Продолжить – паспорт создаётся в фоне/);
assert.match(form, /jazzRelaxMusicPassport && wizardStep === 2 \? <JazzRelaxPassportHelp/);
assert.match(form, /showWizardStep\(3\) && !hideOpenCatalogFields/);

const toggleSrc = read('src/app/(platform)/admin/business-catalog/ClosedCatalogOnlySettings.tsx');
assert.match(toggleSrc, /fetch\(CLOSED_CATALOG_ONLY_TOGGLE_ROUTE/);
assert.doesNotMatch(toggleSrc, /use server/);
assert.doesNotMatch(toggleSrc, /—/);
const catalogPage = read('src/app/(platform)/admin/business-catalog/page.tsx');
assert.match(catalogPage, /ClosedCatalogOnlySettings authors=\{visibleClosedCatalogOnlySettingsAuthors\(authors\)\}/);
assert.match(catalogPage, /CreateClosedAlbum authors=\{authors\}/);
assert.match(toggleSrc, /visibleClosedCatalogOnlySettingsAuthors\(authors\)/);
assert.match(toggleSrc, /visibleAuthors\.map\(/);
assert.doesNotMatch(toggleSrc, /authors\.map\(/);
assert.doesNotMatch(catalogPage, /—/);
assert.doesNotMatch(read('src/lib/authors/closed-catalog-only.ts'), /—/);
assert.match(read('src/lib/authors/closed-catalog-only.ts'), /CLOSED_CATALOG_HOUSE_AUTHOR_ID/);
assert.doesNotMatch(toggleRouteSrc, /visibleClosedCatalogOnlySettingsAuthors/);

assert.equal(parseCreateClosedAlbumResponse({
  status: 201,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, albumId, reused: false }),
}).ok, true);

assert.match(read('src/lib/author-products/products.ts'), /CLOSED_CATALOG_ONLY_CREATE_BLOCKED/);
assert.match(read('src/lib/author-products/auth.ts'), /closed_catalog_only/);
assert.equal(CLOSED_CATALOG_ONLY_CREATE_BLOCKED.includes('закрытые альбомы'), true);
const productsSrc = read('src/lib/author-products/products.ts');
assert.match(productsSrc, /closedCatalogCreateDecision\(closedCatalogAuthor\)/);
assert.match(productsSrc, /closedCatalogDecision === "unavailable"/);
assert.match(productsSrc, /throw new Error\("draft_create_failed"\)/);
assert.doesNotMatch(productsSrc, /!closedCatalogAuthor\.error && isClosedCatalogOnlyAuthor/);

console.log('closed-catalog-only-cabinet: PASS (flag, cabinet route, admin toggle, simplified wizard, last-step passport CTA, settings list only house/closed authors, other authors unchanged)');

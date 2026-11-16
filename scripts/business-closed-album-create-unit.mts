/**
 * t1504u: «Создать закрытый альбом» goes to the album edit page (stable route, no server action,
 * no silent reload, no duplicate), and closed album covers show in the author cabinet list
 * through the signed editor preview route only.
 */
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CLOSED_ALBUM_DUPLICATE_WINDOW_MS,
  CREATE_CLOSED_ALBUM_FALLBACK_ERROR,
  CREATE_CLOSED_ALBUM_ROUTE,
  CREATE_CLOSED_ALBUM_SESSION_ERROR,
  closedAlbumEditHref,
  findRecentClosedAlbumDuplicate,
  normalizeClosedAlbumTitle,
  parseCreateClosedAlbumResponse,
} from '../src/lib/business-track-passports/create-album';
import { publishedBusinessEditHref } from '../src/lib/business-admission/published-catalog';
import {
  BUSINESS_PRIVATE_COVERS_BUCKET,
  authorProductListPrivateCoverSrc,
  businessPrivateCoverPreviewUrl,
} from '../src/lib/business-covers/private-cover';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mock = (path: string, exports: unknown) => {
  const key = require.resolve(path); const mod = new Module(key); mod.exports = exports; mod.loaded = true; require.cache[key] = mod;
};

const albumId = 'c2009a43-9dcc-4d14-9450-c9c94fefe5bc';
const otherAlbumId = 'bab5488c-8b28-43a8-ba7c-5d03396b187e';
const authorId = 'b7ddb68b-8569-4987-a734-6c6e5502529e';

// 1. Pure helpers.
assert.equal(normalizeClosedAlbumTitle('  Утро   без СУЁТЫ '), 'утро без суеты');
assert.equal(closedAlbumEditHref(albumId), publishedBusinessEditHref(albumId, true));
assert.equal(closedAlbumEditHref(albumId), `/author-dashboard/products/${albumId}?step=2`);
const now = Date.parse('2026-11-16T11:00:00Z');
const at = (msAgo: number) => new Date(now - msAgo).toISOString();
assert.equal(findRecentClosedAlbumDuplicate([{ id: albumId, title: 'Утро без суеты', created_at: at(30_000) }], 'утро  без суеты', now), albumId);
assert.equal(findRecentClosedAlbumDuplicate([{ id: albumId, title: 'Утро без суеты', created_at: at(CLOSED_ALBUM_DUPLICATE_WINDOW_MS + 1) }], 'Утро без суеты', now), null);
assert.equal(findRecentClosedAlbumDuplicate([{ id: albumId, title: 'Вечер без суеты', created_at: at(1000) }], 'Утро без суеты', now), null);
assert.equal(findRecentClosedAlbumDuplicate([{ id: albumId, title: 'Утро без суеты', created_at: null }], 'Утро без суеты', now), null);
assert.equal(findRecentClosedAlbumDuplicate([{ id: albumId, title: 'Утро без суеты', created_at: at(1000) }], '   ', now), null);
assert.equal(findRecentClosedAlbumDuplicate([
  { id: otherAlbumId, title: 'Утро без суеты', created_at: at(120_000) },
  { id: albumId, title: 'Утро без суеты', created_at: at(10_000) },
], 'Утро без суеты', now), albumId, 'newest duplicate wins');

// 2. Response parsing: success → edit page; every failure → a visible message.
const json = 'application/json; charset=utf-8';
assert.deepEqual(parseCreateClosedAlbumResponse({ status: 201, contentType: json, body: JSON.stringify({ ok: true, albumId, reused: false }) }),
  { ok: true, albumId, editHref: closedAlbumEditHref(albumId), reused: false });
assert.deepEqual(parseCreateClosedAlbumResponse({ status: 200, contentType: json, body: JSON.stringify({ ok: true, albumId, reused: true }) }),
  { ok: true, albumId, editHref: closedAlbumEditHref(albumId), reused: true });
assert.deepEqual(parseCreateClosedAlbumResponse({ status: 400, contentType: json, body: JSON.stringify({ ok: false, message: 'Нет доступа к автору для загрузки музыки.' }) }),
  { ok: false, message: 'Нет доступа к автору для загрузки музыки.' });
assert.deepEqual(parseCreateClosedAlbumResponse({ status: 200, redirected: true, contentType: 'text/html', body: '<html>Войти</html>' }),
  { ok: false, message: CREATE_CLOSED_ALBUM_SESSION_ERROR });
assert.deepEqual(parseCreateClosedAlbumResponse({ status: 502, contentType: 'text/html', body: 'Bad Gateway' }),
  { ok: false, message: CREATE_CLOSED_ALBUM_FALLBACK_ERROR });
assert.deepEqual(parseCreateClosedAlbumResponse({ status: 200, contentType: json, body: '{oops' }),
  { ok: false, message: CREATE_CLOSED_ALBUM_FALLBACK_ERROR });
assert.deepEqual(parseCreateClosedAlbumResponse({ status: 200, contentType: json, body: JSON.stringify({ ok: true }) }),
  { ok: false, message: CREATE_CLOSED_ALBUM_FALLBACK_ERROR }, 'no album id is never a success');

// 3. Route handler: same-origin JSON only, success/reuse/error statuses, guard redirects rethrown.
type CreateImpl = (author: string, title: string) => Promise<{ id: string; reused: boolean }>;
let createImpl: CreateImpl = async () => ({ id: albumId, reused: false });
const createCalls: [string, string][] = [];
mock('../src/lib/business-track-passports/admin.server.ts', {
  createClosedBusinessAlbum: async (author: string, title: string) => { createCalls.push([author, title]); return createImpl(author, title); },
});
const route = require('../src/app/api/admin/business-catalog/albums/route.ts') as typeof import('../src/app/api/admin/business-catalog/albums/route');
const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }) =>
  route.POST(new Request(`https://audiolad.ru${CREATE_CLOSED_ALBUM_ROUTE}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const originalConsoleError = console.error;
console.error = () => {};
try {
  let response = await post({ author_id: authorId, title: 'Утро без суеты' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { ok: true, albumId, reused: false, editHref: closedAlbumEditHref(albumId) });
  assert.deepEqual(createCalls.at(-1), [authorId, 'Утро без суеты']);

  createImpl = async () => ({ id: otherAlbumId, reused: true });
  response = await post({ author_id: authorId, title: 'Утро без суеты' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).albumId, otherAlbumId);

  createImpl = async () => { throw new Error('Нет доступа к автору для загрузки музыки.'); };
  response = await post({ author_id: authorId, title: 'X' });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, message: 'Нет доступа к автору для загрузки музыки.' });

  createImpl = async () => { throw new Error('connection reset by peer'); };
  response = await post({ author_id: authorId, title: 'X' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, CREATE_CLOSED_ALBUM_FALLBACK_ERROR, 'technical errors are not shown raw');

  const redirectError = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/auth/sign-in?next=/admin;307;' });
  createImpl = async () => { throw redirectError; };
  await assert.rejects(() => post({ author_id: authorId, title: 'X' }), (error) => error === redirectError, 'admin guard redirect is rethrown');

  const before = createCalls.length;
  response = await post({ author_id: authorId, title: 'X' }, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
  assert.equal(response.status, 403);
  response = await post({ author_id: authorId, title: 'X' }, { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' });
  assert.equal(response.status, 403);
  response = await post('{bad', { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' });
  assert.equal(response.status, 400);
  assert.equal(createCalls.length, before, 'rejected requests never create');
} finally {
  console.error = originalConsoleError;
}

// 4. The form no longer depends on the build-specific server action and goes to the album.
const formSrc = read('src/app/(platform)/admin/business-catalog/PassportForm.tsx');
const createFormSrc = formSrc.slice(formSrc.indexOf('export function CreateClosedAlbum'), formSrc.indexOf('export default function PassportForm'));
assert.doesNotMatch(createFormSrc, /closedCatalogAction/);
assert.match(createFormSrc, /fetch\(CREATE_CLOSED_ALBUM_ROUTE/);
assert.match(createFormSrc, /router\.push\(result\.editHref\)/);
assert.match(createFormSrc, /event\.preventDefault\(\)/);
assert.match(createFormSrc, /role=\{ok === false \? 'alert' : 'status'\}/);
assert.match(createFormSrc, /bg-\[#fff5f5\][^']*text-\[#9b3d3d\]/);
assert.doesNotMatch(read('src/app/(platform)/admin/business-catalog/actions.ts'), /createClosedBusinessAlbum/);

// 5. Author cabinet list covers: only the album's own private reference, only via the signed preview route.
const ref = `business-private-cover:practices/${albumId}/variants/b289cfe0-fd96-4b04-a234-de1c3ff15969/lg.webp`;
const src = authorProductListPrivateCoverSrc({ id: albumId, cover_url: ref });
assert.equal(src, businessPrivateCoverPreviewUrl(albumId, ref));
assert.ok(src!.startsWith(`/api/author/products/${albumId}/cover/private-preview?`));
assert.doesNotMatch(src!, new RegExp(BUSINESS_PRIVATE_COVERS_BUCKET));
assert.doesNotMatch(src!, /storage\/v1|token=/);
assert.equal(authorProductListPrivateCoverSrc({ id: otherAlbumId, cover_url: ref }), null, 'another album reference is never used');
assert.equal(authorProductListPrivateCoverSrc({ id: albumId, cover_url: `business-private-cover:practices/${albumId}/track-covers/${otherAlbumId}/variants/x/lg.webp` }), null);
assert.equal(authorProductListPrivateCoverSrc({ id: albumId, cover_url: 'https://audiolad.ru/storage/v1/object/public/practice-covers/a.webp' }), null);
assert.equal(authorProductListPrivateCoverSrc({ id: albumId, cover_url: null }), null);
assert.equal(authorProductListPrivateCoverSrc({ id: albumId, cover_url: 'business-private-cover:../../etc/passwd' }), null);

const Thumb = (require('../src/components/products/ProductCoverThumbnail.tsx') as typeof import('../src/components/products/ProductCoverThumbnail')).default;
const withPrivate = renderToStaticMarkup(createElement(Thumb, { slug: `business-${albumId}`, title: 'Город входит в ритм', coverUrl: ref, privateCoverSrc: src }));
assert.match(withPrivate, /<img/);
assert.ok(withPrivate.includes(`src="${src!.replace(/&/g, '&amp;')}"`), withPrivate);
assert.doesNotMatch(withPrivate, /srcSet|srcset/);
const withoutPrivate = renderToStaticMarkup(createElement(Thumb, { slug: `business-${albumId}`, title: 'Город входит в ритм', coverUrl: ref }));
assert.doesNotMatch(withoutPrivate, /<img|business-private-cover/, 'a private reference is never rendered as a URL');
const dashboardSrc = read('src/components/author-dashboard/AuthorDashboardClient.tsx');
assert.match(dashboardSrc, /privateCoverSrc=\{authorProductListPrivateCoverSrc\(product\)\}/);
// The preview route keeps the album edit access check (owner/editor of the author, or admin support mode).
assert.match(read('src/app/api/author/products/[id]/cover/private-preview/route.ts'), /requirePracticeMutationAccess\(id\)/);

console.log('business-closed-album-create: PASS (stable create route, redirect to album, red errors, no duplicates, private cabinet covers)');

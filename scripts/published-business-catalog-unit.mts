import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ADMIN_BUSINESS_CATALOG_COVER_PATH,
  PUBLISHED_BUSINESS_GROUP_LABELS,
  PUBLISHED_IN_BUSINESS_STATUS_LABEL,
  buildPublishedBusinessCatalog,
  isPublishedBusinessVisibility,
  publishedBusinessCoverUrl,
  publishedBusinessEditHref,
  ruTrackCountLabel,
  type PublishedCatalogAdmissionRow,
  type PublishedCatalogAlbumRow,
  type PublishedCatalogTrackRow,
} from '../src/lib/business-admission/published-catalog';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

const closedId = '00000000-0000-0000-0000-000000000101';
const openId = '00000000-0000-0000-0000-000000000102';
const draftId = '00000000-0000-0000-0000-000000000103';
const noDirId = '00000000-0000-0000-0000-000000000104';
const noPassId = '00000000-0000-0000-0000-000000000105';
const authorClosed = '00000000-0000-0000-0000-000000000201';
const authorOpen = '00000000-0000-0000-0000-000000000202';
const trackClosed = '00000000-0000-0000-0000-000000000301';
const trackOpenA = '00000000-0000-0000-0000-000000000302';
const trackOpenB = '00000000-0000-0000-0000-000000000303';
const privateRef = `business-private-cover:practices/${closedId}/variants/v1/cover.webp`;

function album(partial: Partial<PublishedCatalogAlbumRow> & Pick<PublishedCatalogAlbumRow, 'id' | 'title' | 'authorId'>): PublishedCatalogAlbumRow {
  return {
    authorName: 'Автор',
    status: 'published',
    productKind: 'music',
    catalogVisibility: 'listed',
    businessOnly: false,
    deletedAt: null,
    coverUrl: null,
    ...partial,
  };
}

const directions = [
  { key: 'cafe', name: 'Кафе, кофейни, рестораны' },
  { key: 'spa', name: 'Спа и массаж' },
];
const decisions: PublishedCatalogAdmissionRow[] = [
  { author_id: authorClosed, practice_id: null, direction_key: 'cafe', allowed: true },
  { author_id: authorOpen, practice_id: null, direction_key: 'spa', allowed: true },
  { author_id: authorOpen, practice_id: openId, direction_key: 'cafe', allowed: false },
];
const tracks: PublishedCatalogTrackRow[] = [
  { id: trackClosed, practiceId: closedId, title: 'Утро в зале', status: 'published', position: 1 },
  { id: trackOpenB, practiceId: openId, title: 'Второй', status: 'published', position: 2 },
  { id: trackOpenA, practiceId: openId, title: 'Первый', status: 'published', position: 1 },
];

assert.equal(isPublishedBusinessVisibility(album({ id: openId, title: 'Открытый', authorId: authorOpen }), 0), true);
assert.equal(isPublishedBusinessVisibility(album({ id: draftId, title: 'Черновик', authorId: authorOpen, status: 'draft' }), 0), false);
assert.equal(isPublishedBusinessVisibility(album({ id: closedId, title: 'Закрытый', authorId: authorClosed, businessOnly: true, catalogVisibility: 'selected_users' }), 0), false);
assert.equal(isPublishedBusinessVisibility(album({ id: closedId, title: 'Закрытый', authorId: authorClosed, businessOnly: true, catalogVisibility: 'selected_users' }), 1), true);

assert.equal(publishedBusinessEditHref(closedId, true), `/author-dashboard/products/${closedId}?step=2`);
assert.equal(publishedBusinessEditHref(openId, false), `/author-dashboard/products/${openId}`);
assert.equal(publishedBusinessCoverUrl({ id: closedId, coverUrl: privateRef }), `${ADMIN_BUSINESS_CATALOG_COVER_PATH}?album=${closedId}`);
assert.ok(!publishedBusinessCoverUrl({ id: closedId, coverUrl: privateRef })?.includes('business-private-cover:'));
assert.equal(ruTrackCountLabel(1), '1 трек');
assert.equal(ruTrackCountLabel(2), '2 трека');
assert.equal(ruTrackCountLabel(5), '5 треков');
assert.equal(ruTrackCountLabel(21), '21 трек');

const catalog = buildPublishedBusinessCatalog({
  albums: [
    album({ id: openId, title: 'Вечерний джаз', authorId: authorOpen, authorName: 'Проект', coverUrl: 'https://cdn.example/public-cover.jpg' }),
    album({ id: closedId, title: 'Первый глоток', authorId: authorClosed, authorName: 'Аурафон', businessOnly: true, catalogVisibility: 'selected_users', coverUrl: privateRef }),
    album({ id: draftId, title: 'Черновик', authorId: authorOpen, status: 'draft' }),
    album({ id: noDirId, title: 'Без направления', authorId: '00000000-0000-0000-0000-000000000299' }),
    album({ id: noPassId, title: 'Без паспорта', authorId: authorClosed, businessOnly: true, catalogVisibility: 'selected_users' }),
  ],
  tracks,
  directions,
  decisions,
  approvedPassportTrackIds: new Set([trackClosed]),
});

assert.deepEqual(catalog.closed.map((row) => row.title), ['Первый глоток']);
assert.deepEqual(catalog.open.map((row) => row.title), ['Вечерний джаз']);
assert.deepEqual(catalog.closed[0].directions.map((row) => row.key), ['cafe']);
assert.deepEqual(catalog.open[0].directions.map((row) => row.key), ['spa']);
assert.equal(catalog.open[0].trackCount, 2);
assert.deepEqual(catalog.open[0].tracks.map((row) => row.title), ['Первый', 'Второй']);
assert.equal(catalog.closed[0].approvedPassportCount, 1);
assert.equal(catalog.closed[0].statusLabel, PUBLISHED_IN_BUSINESS_STATUS_LABEL);
assert.equal(catalog.closed[0].coverUrl, `${ADMIN_BUSINESS_CATALOG_COVER_PATH}?album=${closedId}`);
assert.equal(catalog.closed[0].editHref, `/author-dashboard/products/${closedId}?step=2`);
assert.equal(catalog.open[0].editHref, `/author-dashboard/products/${openId}`);
assert.ok(catalog.open[0].tracks.every((track) => !('author' in track)));

const { default: PublishedBusinessCatalog } = require('../src/app/(platform)/admin/business-catalog/PublishedBusinessCatalog.tsx') as {
  default: (props: { closed: typeof catalog.closed; open: typeof catalog.open }) => ReactNode;
};
const html = renderToStaticMarkup(createElement(PublishedBusinessCatalog, { closed: catalog.closed, open: catalog.open }));
assert.match(html, /Опубликовано в АудиоЛад Бизнес/);
assert.match(html, /Только для Бизнеса/);
assert.match(html, /Из открытого АудиоЛада/);
assert.match(html, /Первый глоток/);
assert.match(html, /Вечерний джаз/);
assert.match(html, /<details[^>]*data-published-group="open"/);
assert.doesNotMatch(html, /<details[^>]*data-published-group="closed"/);
assert.doesNotMatch(html, /data-published-group="open"[^>]*\sopen/);
assert.match(html, /Утро в зале/);
assert.match(html, /<li>Утро в зале<\/li>/);
assert.match(html, /<li>Первый<\/li>/);
assert.doesNotMatch(html, /<li>[^<]*Аурафон/);

assert.match(html, /Кафе, кофейни, рестораны/);
assert.match(html, /Спа и массаж/);
assert.match(html, /Открыть альбом/);
assert.doesNotMatch(html, /business-private-cover:/);
assert.match(html, /\/api\/admin\/business-catalog\/cover\?album=/);
const pageSource = read('src/app/(platform)/admin/business-catalog/page.tsx');
assert.match(pageSource, /PublishedBusinessCatalog/);
assert.match(pageSource, /ClosedAlbumWork/);
const createAt = pageSource.indexOf('<CreateClosedAlbum');
const workAt = pageSource.indexOf('<ClosedAlbumWork');
const publishedAt = pageSource.indexOf('<PublishedBusinessCatalog');
assert.ok(createAt >= 0 && workAt > createAt && publishedAt > workAt, 'closed work block must sit after the create form and before the published list');

const workSource = read('src/app/(platform)/admin/business-catalog/ClosedAlbumWork.tsx');
assert.match(workSource, /Работа с закрытыми альбомами/);
assert.match(workSource, /Открыть альбом/);
assert.match(workSource, />Треки</);
assert.match(workSource, /ruTrackCountLabel/);
assert.match(workSource, /с допущенным паспортом/);
assert.match(workSource, /publishedBusinessCoverUrl/);
assert.match(workSource, /черновик/);
assert.match(workSource, /паспорт ещё не заполнен или не допущен/);
assert.match(workSource, /Допустить в Бизнес/);
assert.ok(!workSource.includes('business-private-cover:'), 'closed work cards must not emit private cover refs');
assert.match(read('src/app/(platform)/admin/business-catalog/PassportForm.tsx'), /suggestedAlCode/);
assert.match(read('src/app/api/admin/business-catalog/cover/route.ts'), /requireAdminPanelAccess/);
assert.match(read('src/app/api/admin/business-catalog/cover/route.ts'), /signBusinessPrivateCover/);
for (const path of [
  'src/lib/business-admission/published-catalog.ts',
  'src/lib/business-admission/published-catalog.server.ts',
  'src/app/(platform)/admin/business-catalog/PublishedBusinessCatalog.tsx',
  'src/app/(platform)/admin/business-catalog/ClosedAlbumWork.tsx',
  'src/app/(platform)/admin/business-catalog/page.tsx',
  'src/app/api/admin/business-catalog/cover/route.ts',
]) {
  assert.ok(!read(path).includes('\u2014'), `${path}: en dash only`);
}
assert.equal(PUBLISHED_BUSINESS_GROUP_LABELS.closed, 'Только для Бизнеса');
assert.equal(PUBLISHED_BUSINESS_GROUP_LABELS.open, 'Из открытого АудиоЛада');
console.log('published-business-catalog: PASS (visibility, admission, groups, covers, Russian labels, no private ref leak)');

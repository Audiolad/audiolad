import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PASSPORT_FIELDS, BUSINESS_ONLY_BADGE, businessOnlyVisibilityConflict, passportMissing } from '../src/lib/business-track-passports/model';
import { isWorkspaceMusicPractice } from '../src/lib/business-workspace/candidates';
import { planPracticePublishedSearchNotifications } from '../src/lib/seo/practice-publish-plan';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mock = (path: string, exports: unknown) => {
  const key = require.resolve(path); const mod = new Module(key); mod.exports = exports; mod.loaded = true; require.cache[key] = mod;
};
const audioId = '00000000-0000-0000-0000-000000000801';
const authorId = '00000000-0000-0000-0000-000000000500';
const assetId = '00000000-0000-0000-0000-000000000901';
const adminId = '00000000-0000-0000-0000-000000000006';
let admin = true;
let guardCalls = 0;
let serviceCalls = 0;
let rpcFailure: { message: string } | null = null;
const masterChanged = false;
const calls: { name: string; args: Record<string, unknown> }[] = [];
const bytes = new TextEncoder().encode('human mastered file');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const db = {
  rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: 'album', error: rpcFailure }; },
  from(table: string) {
    const q = {
      select() { return q; }, eq() { return q; },
      single: async () => ({ error: null, data: table === 'audio_items' ? { practice_id: 'album', desired_music_master_asset_id: assetId }
        : table === 'practices' ? { business_only: true }
          : { id: masterChanged ? 'new-master' : assetId, storage_bucket: 'music-masters', storage_path: 'private/master.wav', size_bytes: bytes.length } }),
    }; return q;
  },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.invalid/master' }, error: null }) }) },
};
mock('server-only', {});
mock('../src/lib/admin/guard.ts', { requireAdminPanelAccess: async () => { guardCalls++; if (!admin) throw new Error('forbidden'); return { userId: adminId }; } });
mock('../src/lib/author-products/auth.ts', {
  listAuthorWorkspacesForUser: async () => [{ id: authorId, name: 'Артист' }],
  requirePracticeMutationAccess: async () => ({ supabase: db, practice: { business_only: true, status: 'draft' }, user: { id: adminId } }),
  handleAuthorRouteError: (error: Error) => { throw error; },
});
mock('../src/lib/supabase/server.ts', { createClient: async () => db });
mock('../src/lib/supabase/service-role.ts', { createServiceRoleClient: () => { serviceCalls++; return db; } });
mock('next/cache', { revalidatePath: () => {} });
const server = require('../src/lib/business-track-passports/admin.server.ts') as typeof import('../src/lib/business-track-passports/admin.server');
const actions = require('../src/app/(platform)/admin/business-catalog/actions.ts') as typeof import('../src/app/(platform)/admin/business-catalog/actions');
for (const operation of [() => server.createClosedBusinessAlbum(authorId, 'Альбом'), () => server.saveBusinessPassport(audioId, {}),
  () => server.verifyBusinessMaster(audioId), () => server.decideBusinessPassport(audioId, 'approve'), () => server.decideBusinessPassport(audioId, 'revoke'),
  () => server.loadClosedBusinessCatalog()]) {
  admin = false; const before = calls.length; const services = serviceCalls;
  await assert.rejects(operation, /forbidden/); assert.equal(calls.length, before); assert.equal(serviceCalls, services);
}
admin = true;
await assert.rejects(() => server.createClosedBusinessAlbum(assetId, 'Альбом'), /Нет доступа/);
await server.createClosedBusinessAlbum(authorId, ' Альбом ');
assert.deepEqual(calls.at(-1), { name: 'admin_create_business_album', args: { p_author_id: authorId, p_title: 'Альбом' } });
await server.saveBusinessPassport(audioId, { al_code: 'AL-T-123', stored_master_sha256: sha256, stored_master_sha256_verified_at: 'fake', status: 'approved', approved_by: adminId });
assert.equal((calls.at(-1)!.args.p_fields as Record<string, unknown>).al_code, 'AL-T-123');
for (const key of ['stored_master_sha256', 'stored_master_sha256_verified_at', 'status', 'approved_by']) assert.ok(!(key in (calls.at(-1)!.args.p_fields as object)));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 5)); controller.enqueue(bytes.slice(5)); controller.close(); } }));
try {
  assert.equal(await server.verifyBusinessMaster(audioId), sha256);
  assert.deepEqual(calls.at(-1), { name: 'record_business_master_hash', args: { p_audio_item_id: audioId, p_asset_id: assetId, p_sha256: sha256, p_admin_id: adminId } });
  globalThis.fetch = async () => new Response('truncated');
  await assert.rejects(() => server.verifyBusinessMaster(audioId), /Размер/);
} finally { globalThis.fetch = originalFetch; }
await server.decideBusinessPassport(audioId, 'approve'); assert.equal(calls.at(-1)?.name, 'admin_approve_business_track_passport');
await server.decideBusinessPassport(audioId, 'revoke'); assert.equal(calls.at(-1)?.name, 'admin_revoke_business_track_passport');
rpcFailure = { message: 'passport_missing_fields: generation_ref,master_sha256' };
const rejected = await actions.closedCatalogAction('approve', audioId, {});
assert.equal(rejected.ok, false); assert.match(rejected.message, /ID или ссылка генерации/); assert.match(rejected.message, /SHA-256 мастер-файла/);
rpcFailure = null;
assert.equal((await actions.closedCatalogAction('save', audioId, {})).ok, true);
assert.ok(guardCalls >= 12);
// Real PATCH route must reject before mutable fields or side-effects are evaluated.
const route = require('../src/app/api/author/products/[id]/route.ts') as typeof import('../src/app/api/author/products/[id]/route');
for (const payload of [{ catalog_visibility: 'listed' }, { catalog_visibility: 'selected_users' }, { is_catalog_listed: true }]) {
  const response = await route.PATCH(new Request('https://audiolad.invalid/api/author/products/id', { method: 'PATCH', body: JSON.stringify(payload) }), { params: Promise.resolve({ id: audioId }) });
  assert.equal(response.status, 409); assert.match((await response.json()).message, /Видимость закрытого альбома/);
}
assert.equal(businessOnlyVisibilityConflict({ business_only: false }, { catalog_visibility: 'unlisted' }), null);
assert.equal(businessOnlyVisibilityConflict({ business_only: true }, { title: 'Новое название' }), null);
const complete = Object.fromEntries(Object.keys(PASSPORT_FIELDS).map((key) => [key,
  key.endsWith('_sha256') ? sha256 : key.endsWith('_at') ? '2026-11-15T00:00:00Z' : 'evidence']));
Object.assign(complete, { al_code: 'AL-T-test', human_contribution: 'human', shazam_result: 'not_found', acoustid_result: 'not_found',
  stored_master_asset_id: assetId, stored_master_sha256: sha256, stored_master_sha256_verified_at: '2026-11-15T00:00:00Z' });
assert.deepEqual(passportMissing(complete), []);
for (const key of Object.keys(PASSPORT_FIELDS).filter((key) => key !== 'notes')) assert.ok(passportMissing({ ...complete, [key]: '' }).length, `missing ${key}`);
assert.ok(passportMissing({ ...complete, shazam_result: 'match' }).length);
const listed = { practiceStatus: 'published', productKind: 'music', catalogVisibility: 'listed', deletedAt: null };
assert.equal(isWorkspaceMusicPractice(listed), true);
assert.equal(isWorkspaceMusicPractice({ ...listed, catalogVisibility: 'selected_users', businessOnly: true }), false);
assert.equal(isWorkspaceMusicPractice({ ...listed, catalogVisibility: 'selected_users', businessOnly: true, passportApproved: true }), true);
assert.deepEqual(planPracticePublishedSearchNotifications({ authorSlug: 'author', practiceSlug: 'album', business_only: true,
  isFirstPublishOfPractice: true, publishedCountBefore: 0, catalogVisibility: 'selected_users' }), { indexNow: [], yandex: null });
for (const path of ['src/lib/business-track-passports/model.ts', 'src/lib/business-track-passports/admin.server.ts',
  'src/app/(platform)/admin/business-catalog/page.tsx', 'src/app/(platform)/admin/business-catalog/PassportForm.tsx']) assert.ok(!read(path).includes('\u2014'), `${path}: en dash only`);
assert.match(BUSINESS_ONLY_BADGE, /Только для АудиоЛад Бизнес – не публикуется/);
const form = read('src/components/author-dashboard/AuthorProductForm.tsx');
assert.match(form, /showWizardStep\(4\) && !businessOnly \? \(\s*<fieldset/);
assert.match(form, /!businessOnly && form\.slug && selectedAuthor\?\.slug/);
assert.match(form, /!businessOnly && !form\.isFree/);
assert.match(form, /!businessOnly && shouldOpenPublishPreviewFromForm/);
assert.match(read('src/components/author-dashboard/product-form-sections/AuthorProductFormActions.tsx'), /!businessOnly &&/);
for (const path of ['src/app/api/author/products/[id]/publish/route.ts', 'src/app/(platform)/admin/product-moderation/actions.ts']) assert.match(read(path), /business_only: (?:product\.practice|publishedPractice)\.business_only/);
const { default: FormActions } = require('../src/components/author-dashboard/product-form-sections/AuthorProductFormActions.tsx') as typeof import('../src/components/author-dashboard/product-form-sections/AuthorProductFormActions');
const noop = () => {};
const actionProps = { mode: 'edit' as const, busy: false, publishing: false, canEditPublicFields: true,
  canMutateContent: true, canBypassProductModeration: true, isPublished: false, isUnpublished: false, isDraft: true,
  isSubmitted: false, needsChanges: false, publishedAt: null, moderationStatus: 'approved', practiceId: audioId,
  publicPath: '', publishPreviewPath: '', deleteLockedAfterPaidPurchase: false, error: null,
  onSaveDraft: noop, onUnpublish: noop, onStartEditing: noop, onOpenPublishPreview: noop, onPublish: noop,
  onSubmitForModeration: noop, onWithdrawFromModeration: noop, onDeleteProduct: noop };
const closedMarkup = renderToStaticMarkup(createElement(FormActions, { ...actionProps, businessOnly: true }));
assert.doesNotMatch(closedMarkup, /Предпросмотр|Открыть публичную карточку/);
assert.match(closedMarkup, /Опубликовать/);
assert.match(renderToStaticMarkup(createElement(FormActions, actionProps)), /Предпросмотр/);
console.log('business-only-admin: PASS (guarded actions, streamed hash, forged verification, real PATCH 409, missing evidence, SQL pool mirror, publication planner, Russian UI)');

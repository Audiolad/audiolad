import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOUND_REVIEW_STATUSES, isSoundReviewStatus, nextUnchecked, restrictSoundQueueToAgreement, type SoundReviewRow } from '../src/lib/business/track-sound-review';
import { hasCurrentSoundApproval, sameSoundAudioIdentity, soundAllowedTrackIds } from '../src/lib/business/track-sound-review.server';
import { workspaceSignBlocked } from '../src/lib/business-workspace/sign-gate';
import type { PlatformAccessSnapshot } from '../src/lib/auth/platform-access';
import {
  BUSINESS_TRACK_PREVIEW_CACHE_CONTROL,
  BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS,
  businessTrackPreviewHref,
  businessTrackPreviewStatus,
  businessTrackPreviewWindowSeconds,
  clipPreviewRange,
  previewByteCap,
  previewResponseHeaders,
  readLimitedBody,
} from '../src/lib/business/track-sound-preview';
import { readPreviewSlice } from '../src/lib/business/track-sound-preview.server';

assert.deepEqual(SOUND_REVIEW_STATUSES, ['unchecked', 'approved', 'rejected']);
for (const value of ['approved,rejected', '', null, true, 'both']) assert.equal(isSoundReviewStatus(value), false);
const rows = ['a', 'b', 'c'].map((id, i) => ({ id, status: i === 1 ? 'approved' : 'unchecked' })) as SoundReviewRow[];
assert.equal(nextUnchecked(rows, 'a'), 'c');
assert.equal(nextUnchecked(rows, 'c'), 'a');
assert.equal(nextUnchecked(rows, null), 'a');
const queueRows = [
  { id: 't1', title: 'One', artist_id: 'jazz', artist: 'Джаз Релакс', album_id: 'al', album: 'Вечер', duration_seconds: 1, spaces: ['cafe'], audio_identity: '[]', status: 'unchecked' as const, reason: null, reviewed_at: null, reviewed_by: null },
  { id: 't2', title: 'Two', artist_id: 'med', artist: 'Медитация', album_id: 'am', album: 'Тишина', duration_seconds: 1, spaces: ['cafe'], audio_identity: '[]', status: 'approved' as const, reason: null, reviewed_at: null, reviewed_by: null },
];
const restricted = restrictSoundQueueToAgreement(queueRows, new Set(['jazz']), { page: 0 });
assert.deepEqual(restricted.rows.map((row) => row.id), ['t1']);
assert.equal(restricted.total, 1);
assert.equal(restricted.counts.approved, 0);
assert.deepEqual(restricted.artists.map((artist) => artist.id), ['jazz']);
assert.equal(nextUnchecked([], null), null);
assert.equal(nextUnchecked([rows[0]], 'a'), null);

type Db = NonNullable<Parameters<typeof soundAllowedTrackIds>[2]>;
const ids = Array.from({ length: 161 }, (_, i) => String(i));
const batches: string[][] = [];
const db = { rpc: async (name: string, args: { p_audio_item_ids: string[]; p_space_id: string }) => {
  assert.equal(name, 'business_sound_allowed_tracks');
  assert.equal(args.p_space_id, 'cafe');
  batches.push(args.p_audio_item_ids);
  return { data: args.p_audio_item_ids.filter((id) => Number(id) % 2 === 0).map((audio_item_id) => ({ audio_item_id })), error: null };
} } as unknown as Db;
const allowed = await soundAllowedTrackIds(ids, 'cafe', db);
assert.deepEqual(batches.map((batch) => batch.length), [80, 80, 1]);
assert.equal(allowed.size, 81);
assert.equal(allowed.has('1'), false);
await assert.rejects(soundAllowedTrackIds(['a'], 'spa', { rpc: async () => ({ data: null, error: { message: 'offline' } }) } as unknown as Db));
assert.equal((await soundAllowedTrackIds([], 'cafe', db)).size, 0);

const row = { id: 'a', audio_path: 'path.mp3', desired_music_master_asset_id: null, active_music_delivery_asset_id: null };
assert.equal(sameSoundAudioIdentity('["path.mp3", null, null]', row), true);
assert.equal(sameSoundAudioIdentity('["old.mp3", null, null]', row), false);
assert.equal(sameSoundAudioIdentity('invalid', row), false);
function reviewDb(status: string, identity = '["path.mp3",null,null]') {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status, audio_identity: identity }, error: null }) }) }) }) } as unknown as Db;
}
assert.equal(await hasCurrentSoundApproval(reviewDb('approved'), row), true);
assert.equal(await hasCurrentSoundApproval(reviewDb('unchecked'), row), false);
assert.equal(await hasCurrentSoundApproval(reviewDb('rejected'), row), false);
assert.equal(await hasCurrentSoundApproval(reviewDb('approved', '["old.mp3",null,null]'), row), false);

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = read('src/app/(platform)/admin/business-track-review/ReviewQueue.tsx');
assert.match(ui, /controlsList="nodownload"/);
assert.match(ui, /onSeeked/);
assert.match(ui, /currentTime >= end.current/);
assert.match(ui, /value=\{15\}/);
assert.match(ui, /value=\{30\}/);
assert.doesNotMatch(ui, /—/);
for (const path of ['src/lib/business-workspace/sign.server.ts', 'src/lib/business-app/spa-pilot.ts']) {
  assert.match(read(path), /resolve_business_track_eligibility/);
  assert.match(read(path), /businessManualContentGateEnabled/);
}
assert.match(read('src/lib/business-workspace/sign.server.ts'), /workspaceSignBlocked/);
assert.doesNotMatch(read('src/lib/business-workspace/sign.server.ts'), /expectedAudioIdentity|sameSoundAudioIdentity/);
assert.equal(workspaceSignBlocked({ gateOn: true, locationId: 'loc', decision: 'INELIGIBLE' }), true);
assert.equal(workspaceSignBlocked({ gateOn: true, locationId: 'loc', decision: 'UNKNOWN' }), true);
assert.equal(workspaceSignBlocked({ gateOn: true, locationId: 'loc', decision: null }), true);
assert.equal(workspaceSignBlocked({ gateOn: true, locationId: 'loc', decision: 'ELIGIBLE' }), false);
assert.equal(workspaceSignBlocked({ gateOn: false, locationId: 'loc', decision: 'INELIGIBLE' }), false);
assert.equal(workspaceSignBlocked({ gateOn: true, locationId: null, decision: 'INELIGIBLE' }), false);

const previewAccess = (permissions: string[], roles: PlatformAccessSnapshot['roles'] = []): PlatformAccessSnapshot =>
  ({ userId: 'user', roles, permissions: new Set(permissions), usedLegacyFallback: false });
assert.equal(businessTrackPreviewStatus(null), 401);
assert.equal(businessTrackPreviewStatus(previewAccess([])), 403);
assert.equal(businessTrackPreviewStatus(previewAccess(['admin_panel.access'])), 403);
assert.equal(businessTrackPreviewStatus(previewAccess(['author_products.moderate'])), 403);
assert.equal(businessTrackPreviewStatus(previewAccess(['admin_panel.access', 'author_products.moderate'])), 200);
assert.equal(businessTrackPreviewStatus(previewAccess([], ['owner'])), 200);

const href = businessTrackPreviewHref('cccccccc-cccc-4ccc-accc-cccccccccccc', '["one.mp3",null,null]');
assert.match(href, /^\/api\/admin\/business-track-review\/preview\?/);
assert.doesNotMatch(href, /https?:|signedUrl|token=/);
assert.equal(BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS <= 60, true);
assert.equal(BUSINESS_TRACK_PREVIEW_CACHE_CONTROL, 'private, no-store');
const windowSeconds = businessTrackPreviewWindowSeconds();
assert.equal(windowSeconds, 35);
const longFile = 9_000_000;
const longDuration = 180;
const cap = previewByteCap(longFile, longDuration);
assert.equal(cap, Math.ceil((longFile / longDuration) * windowSeconds));
assert.ok(cap < longFile);
assert.equal(previewByteCap(longFile, null), Math.min(longFile, Math.ceil((320_000 / 8) * windowSeconds)));
assert.equal(previewByteCap(20_000, 10), 20_000);
const opened = clipPreviewRange(longFile, cap, 'bytes=0-');
assert.equal(opened.ok && opened.end - opened.start + 1, cap);
const sought = clipPreviewRange(longFile, cap, `bytes=${cap}-`);
assert.equal(sought.ok && sought.start, cap);
assert.equal(sought.ok && sought.end - sought.start + 1, cap);
assert.equal(clipPreviewRange(longFile, cap, 'bytes=0-1,2-3').ok, false);
const headers = previewResponseHeaders({ start: 0, end: cap - 1, total: longFile, contentType: 'audio/mpeg' });
assert.equal(headers.get('cache-control'), 'private, no-store');
assert.equal(headers.get('content-length'), String(cap));
assert.match(headers.get('content-range') ?? '', new RegExp(`^bytes 0-${cap - 1}/${longFile}$`));
const limited = await readLimitedBody(new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(5_000));
    controller.close();
  },
}), 100);
assert.equal(limited.byteLength, 100);

const oversized = new Uint8Array(5_000);
const slice = await readPreviewSlice({
  signer: { storage: { from: () => ({ createSignedUrl: async (_path: string, ttl: number) => {
    assert.equal(ttl, BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS);
    return { data: { signedUrl: 'object/sign/practice-audio/one.mp3' }, error: null };
  } }) } },
  bucket: 'practice-audio',
  path: 'one.mp3',
  ttlSeconds: BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS,
  start: 0,
  end: 99,
  fetchImpl: (async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('range'), 'bytes=0-99');
    return new Response(oversized, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=3600' } });
  }) as typeof fetch,
});
assert.equal(slice?.bytes.byteLength, 100);
assert.equal(slice?.contentType, 'audio/mpeg');
const ignoredRange = await readPreviewSlice({
  signer: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'object/sign/practice-audio/one.mp3' }, error: null }) }) } },
  bucket: 'practice-audio',
  path: 'one.mp3',
  ttlSeconds: BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS,
  start: 400,
  end: 499,
  fetchImpl: (async () => new Response(oversized, { status: 200 })) as typeof fetch,
});
assert.equal(ignoredRange, null);

const route = read('src/app/api/admin/business-track-review/preview/route.ts');
assert.ok(route.indexOf('businessTrackPreviewStatus(access)') < route.indexOf('probeStorageSize({'));
assert.match(route, /businessTrackPreviewStatus/);
assert.match(route, /BUSINESS_TRACK_PREVIEW_CACHE_CONTROL/);
assert.match(route, /BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS/);
assert.doesNotMatch(route, /LISTEN_SIGNED_URL_TTL_SECONDS|signWorkspaceAudio/);
assert.doesNotMatch(read('src/app/(platform)/admin/business-track-review/actions.ts'), /signWorkspaceAudio/);
assert.match(read('src/app/(platform)/admin/business-track-review/actions.ts'), /businessTrackPreviewHref/);
const sql = read('supabase/migrations/20270201120000_business_track_sound_reviews.sql');
assert.doesNotMatch(sql, /\b(?:DELETE FROM|DROP TABLE|UPDATE public\.(?:audio_items|practices))\b/i);
assert.match(sql, /resolve_business_track_eligibility_v1\(p_audio_item_id/);
assert.match(sql, /resolve_business_content_admission/);
assert.match(sql, /business_manual_content_gate_enabled\(\)/);
assert.match(sql, /BUSINESS_SOUND_REVIEW_REQUIRED/);
assert.doesNotMatch(sql, /resolve_business_track_eligibility_before_sound|JOIN public\.business_space_admissions/);
assert.doesNotMatch(sql, /notification|email_outbox|music_passport_analysis/);
console.log('business-track-sound-review-unit: PASS (navigation, fail-closed batches, source identity, preview cap, cabinet gate, UI fragment contract)');

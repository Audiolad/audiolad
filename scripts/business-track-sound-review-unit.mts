import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOUND_REVIEW_STATUSES, isSoundReviewStatus, nextUnchecked, type SoundReviewRow } from '../src/lib/business/track-sound-review';
import { hasCurrentSoundApproval, sameSoundAudioIdentity, soundAllowedTrackIds } from '../src/lib/business/track-sound-review.server';

assert.deepEqual(SOUND_REVIEW_STATUSES, ['unchecked', 'approved', 'rejected']);
for (const value of ['approved,rejected', '', null, true, 'both']) assert.equal(isSoundReviewStatus(value), false);
const rows = ['a', 'b', 'c'].map((id, i) => ({ id, status: i === 1 ? 'approved' : 'unchecked' })) as SoundReviewRow[];
assert.equal(nextUnchecked(rows, 'a'), 'c');
assert.equal(nextUnchecked(rows, 'c'), 'a');
assert.equal(nextUnchecked(rows, null), 'a');
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
const sql = read('supabase/migrations/20270201120000_business_track_sound_reviews.sql');
assert.doesNotMatch(sql, /\b(?:DELETE FROM|DROP TABLE|UPDATE public\.(?:audio_items|practices))\b/i);
assert.match(sql, /resolve_business_track_eligibility_v1\(p_audio_item_id/);
assert.match(sql, /resolve_business_content_admission/);
assert.match(sql, /business_manual_content_gate_enabled\(\)/);
assert.match(sql, /BUSINESS_SOUND_REVIEW_REQUIRED/);
assert.doesNotMatch(sql, /resolve_business_track_eligibility_before_sound|JOIN public\.business_space_admissions/);
assert.doesNotMatch(sql, /notification|email_outbox|music_passport_analysis/);
console.log('business-track-sound-review-unit: PASS (navigation, fail-closed batches, source identity, signed-source guards, UI fragment contract)');

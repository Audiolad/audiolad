import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { metadataProfile, radioSimilarity, rankRadioCandidates, withArtistProfile } from '../src/lib/listen/album-radio-ranking.mjs';
import { canStartAlbumRadio, readAlbumRadioEnabled, writeAlbumRadioEnabled, subscribeAlbumRadioEnabled, ALBUM_RADIO_STORAGE_KEY } from '../src/lib/listen/album-radio-preference.mjs';

const profile = (text) => metadataProfile(text);
const source = { practiceId: 'album', authorId: 'artist', profile: profile('smooth jazz calm instrumental 90 bpm') };
const candidate = (id, text, authorId = 'other') => ({ audioItemId: id, practiceId: `p-${id}`, authorId, profile: profile(text) });
const close = 'smooth jazz calm instrumental 92 bpm';

test('genre, subgenre, mood, BPM and vocal metadata are explicit and unknown stays null', () => {
  assert.deepEqual(profile('Смуз джаз, спокойная инструментальная музыка, 90 BPM'), source.profile);
  assert.deepEqual(profile('Рок Классика Электроника').genres.sort(), ['classical', 'electronic', 'rock']);
  assert.deepEqual(profile('Музыка'), { genres: [], styles: [], moods: [], bpm: null, vocal: null });
});
test('matching sound includes other artists and artist identity cannot create similarity', () => {
  const ranked = rankRadioCandidates(source, [candidate('same', close, 'artist'), candidate('other', close), candidate('unrelated', 'rock energetic vocal', 'artist')]);
  assert.equal(ranked[0].audioItemId, 'other');
  assert.equal(ranked.length, 2);
});
test('sound similarity outweighs discovery bonus', () => {
  assert.equal(rankRadioCandidates(source, [candidate('same', close, 'artist'), candidate('other', 'jazz')])[0].audioItemId, 'same');
});
test('vocal, large tempo and conflicting mood changes fail closed', () => {
  for (const text of ['smooth jazz calm vocal 90 bpm', 'smooth jazz calm instrumental 145 bpm', 'smooth jazz energetic instrumental 90 bpm']) {
    assert.equal(radioSimilarity(source.profile, profile(text)), null);
  }
});
test('no arbitrary fill from sparse or unlabelled catalogue', () => {
  assert.deepEqual(rankRadioCandidates(source, [candidate('empty', ''), candidate('rock', 'rock')]), []);
  assert.deepEqual(rankRadioCandidates(source, []), []);
});
test('source album, history and duplicate ids are excluded', () => {
  const c = candidate('one', close);
  assert.deepEqual(rankRadioCandidates(source, [c, c, candidate('two', close), { ...candidate('source', close), practiceId: 'album' }], ['one']).map((v) => v.audioItemId), ['two']);
});
test('adjacent tracks stay close even at opposite ends of source tempo range', () => {
  const ranked = rankRadioCandidates(source, [candidate('slow', 'smooth jazz calm instrumental 66 bpm'), candidate('fast', 'smooth jazz calm instrumental 114 bpm')]);
  assert.equal(ranked.length, 1);
  const refill = rankRadioCandidates(source, [candidate('fast', 'smooth jazz calm instrumental 114 bpm')], [], profile('smooth jazz calm instrumental 66 bpm'));
  assert.equal(refill.length, 0);
});
test('artist profile fills only unambiguous missing fields and album labels win', () => {
  assert.deepEqual(withArtistProfile(profile(''), [profile('jazz'), profile('jazz')]).genres, ['jazz']);
  assert.deepEqual(withArtistProfile(profile(''), [profile('jazz'), profile('rock')]).genres, []);
  assert.deepEqual(withArtistProfile(profile('ambient'), [profile('jazz')]).genres, ['ambient']);
});
const seed = { source: { practiceId: 'album' }, trackIds: ['a', 'b'] };
const session = { practiceId: 'album', tracks: [{ id: 'a' }, { id: 'b' }], playbackMode: 'full' };
const start = { naturalEnd: true, enabled: true, repeatMode: 'off', queue: null, session, seed };
test('only natural end of complete album can start radio', () => {
  assert.equal(canStartAlbumRadio(start), true);
  for (const patch of [ { naturalEnd: false }, { enabled: false }, { repeatMode: 'one' }, { repeatMode: 'all' }, { queue: {} }, { seed: null } ]) {
    assert.equal(canStartAlbumRadio({ ...start, ...patch }), false);
  }
  for (const patch of [{ tracks: [{ id: 'b' }] }, { practiceId: 'practice' }, { sourceType: 'private_audio' }, { playbackMode: 'preview' }, { isAuthorPreview: true }]) {
    assert.equal(canStartAlbumRadio({ ...start, session: { ...session, ...patch } }), false);
  }
});
test('preference persists, notifies same tab and follows other tabs', () => {
  const data = new Map(); const events = new Map();
  globalThis.window = { localStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
    addEventListener: (k, fn) => events.set(k, fn), removeEventListener: (k) => events.delete(k) };
  let calls = 0; const unsubscribe = subscribeAlbumRadioEnabled(() => calls++);
  assert.equal(readAlbumRadioEnabled(), true);
  writeAlbumRadioEnabled(false);
  assert.equal(data.get(ALBUM_RADIO_STORAGE_KEY), '0');
  assert.equal(readAlbumRadioEnabled(), false);
  data.set(ALBUM_RADIO_STORAGE_KEY, '1'); events.get('storage')({ key: ALBUM_RADIO_STORAGE_KEY });
  assert.equal(readAlbumRadioEnabled(), true); assert.equal(calls, 2);
  unsubscribe(); assert.equal(events.size, 0); delete globalThis.window;
});
test('blocked storage still permits disabling within the current tab', () => {
  globalThis.window = { localStorage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } };
  writeAlbumRadioEnabled(false); assert.equal(readAlbumRadioEnabled(), false);
  writeAlbumRadioEnabled(true); delete globalThis.window;
});
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('integration: only natural ended opts in, manual Next remains distinct', () => {
  const player = read('src/components/audio/useSequentialPlayer.ts');
  assert.match(player, /onTracksExhaustedRef.current\(practiceId, true\)/);
  assert.match(player, /await onTracksExhaustedRef.current\(practiceId\)/);
});
test('integration: radio access failure cannot fall back to paid preview', () => {
  const resolver = read('src/lib/playlists/queue-entry-session.ts');
  assert.match(resolver, /entry.fullOnly\) \|\|/);
  assert.match(resolver, /listen.session.playbackMode === "preview"/);
  assert.match(read('src/lib/listen/album-radio.server.ts'), /fullOnly: true/);
});
test('integration: recommendation scope and usage attribution preserve consumer boundaries', () => {
  const server = read('src/lib/listen/album-radio.server.ts');
  assert.match(server, /productKind: "music"/);
  assert.match(server, /loadListenSessionPayload/);
  assert.doesNotMatch(server, /business-app|music-analyzer-runs|execute.*analy/);
  assert.match(read('src/components/analytics/ListenAnalyticsTracker.tsx'), /listening_key: input.listeningKey,\s*\.\.\.input.playbackAttribution/);
  assert.match(read('src/lib/analytics/pending-confirmed-plays-store.ts'), /playbackAttribution: input.playbackAttribution/);
});

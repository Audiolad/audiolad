import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { aggregateRadioProfile, emptyRadioProfile, labelSimilarity, metadataProfile, passportProfile, radioSimilarity, rankRadioCandidates, tempoDistance, withArtistProfile, withTextFallback } from '../src/lib/listen/album-radio-ranking.mjs';
import { canStartAlbumRadio, readAlbumRadioEnabled, writeAlbumRadioEnabled, subscribeAlbumRadioEnabled, ALBUM_RADIO_STORAGE_KEY } from '../src/lib/listen/album-radio-preference.mjs';

const profile = (text) => metadataProfile(text);
const labels = (list) => list.map((label, i) => ({ label, weight: [1, 0.85, 0.7, 0.55, 0.45, 0.35][i] ?? 0.3 }));
const passport = (p) => passportProfile({ genres: labels(p.genres ?? []), styles: labels(p.styles ?? []), moods: labels(p.moods ?? []),
  instruments: labels(p.instruments ?? []), character: p.character ?? null, bpm: p.bpm ?? null, energy: p.energy ?? null, vocal: p.vocal ?? null });
const source = { practiceId: 'album', authorId: 'artist', profile: profile('smooth jazz calm instrumental 90 bpm') };
const candidate = (id, text, authorId = 'other') => ({ audioItemId: id, practiceId: `p-${id}`, authorId, profile: profile(text) });
const pcand = (id, p, authorId = 'other') => ({ audioItemId: id, practiceId: `p-${id}`, authorId, profile: passport(p) });
const close = 'smooth jazz calm instrumental 92 bpm';
const lounge = { genres: ['Jazz', 'New Age', 'Blues'], styles: ['Lounge Jazz', 'Smooth Jazz', 'Chillout'], moods: ['warm', 'relaxing', 'calm'], instruments: ['saxophone', 'piano'], character: 'warm', energy: 40 };
const psource = { practiceId: 'album', authorId: 'artist', profile: passport(lounge) };

test('text fallback is explicit, in passport vocabulary, and unknown stays empty', () => {
  const p = profile('Смуз джаз, спокойная инструментальная музыка, 90 BPM');
  assert.deepEqual(p.genres.map((g) => g.label), ['jazz']);
  assert.deepEqual(p.styles.map((g) => g.label), ['smooth jazz']);
  assert.deepEqual(p.moods.map((g) => g.label), ['calm']);
  assert.equal(p.bpm, 90); assert.equal(p.vocal, 'instrumental'); assert.equal(p.basis, 'text');
  assert.deepEqual(profile('Рок Классика Электроника').genres.map((g) => g.label).sort(), ['classical', 'electronic', 'rock']);
  assert.deepEqual(profile('Музыка'), emptyRadioProfile());
});
test('passport vocabulary is used as is (no lossy keyword mapping)', () => {
  const p = passport({ genres: ['Funk/Soul', 'Cinematic/Soundtrack'], styles: ['Lounge Jazz'], moods: ['warm', 'melancholic', 'playful'] });
  assert.deepEqual(p.genres.map((g) => g.label), ['funk soul', 'cinematic soundtrack']);
  assert.deepEqual(p.moods.map((g) => g.label), ['warm', 'melancholic', 'playful']);
  assert.equal(p.basis, 'passport');
  assert.equal(passport({}), null);
});
test('sparse passport keeps every field it has; text fills only missing ones', () => {
  const sparse = passport({ instruments: ['piano'], bpm: 72, vocal: 'instrumental', character: 'warm' });
  assert.equal(sparse.basis, 'passport');
  const merged = withTextFallback(sparse, profile('jazz guitar 120 bpm vocal'));
  assert.deepEqual(merged.instruments.map((i) => i.label), ['piano']);
  assert.equal(merged.bpm, 72); assert.equal(merged.vocal, 'instrumental'); assert.equal(merged.character, 'warm');
  assert.deepEqual(merged.genres.map((g) => g.label), ['jazz']);
  // Admission is decided on the merged profile, so passport guards still apply.
  assert.equal(radioSimilarity(merged, withTextFallback(passport({ vocal: 'vocal' }), profile('jazz'))), null);
});
test('passport fields win; author text fills only missing fields', () => {
  const merged = withTextFallback(passport({ moods: ['warm'], energy: 30 }), profile('джаз лаунж 80 bpm без вокала'));
  assert.deepEqual(merged.moods.map((m) => m.label), ['warm']);
  assert.deepEqual(merged.genres.map((m) => m.label), ['jazz']);
  assert.equal(merged.bpm, 80); assert.equal(merged.vocal, 'instrumental'); assert.equal(merged.energy, 30);
  assert.equal(withTextFallback(null, profile('jazz')).basis, 'text');
});
test('energy closeness ranks and a sharp energy jump fails closed', () => {
  const near = pcand('near', { ...lounge, energy: 44 });
  const far = pcand('far', { ...lounge, energy: 60 });
  const jump = pcand('jump', { ...lounge, energy: 70 });
  const ranked = rankRadioCandidates(psource, [far, jump, near]);
  assert.deepEqual(ranked.map((c) => c.audioItemId), ['near', 'far']);
  assert.equal(radioSimilarity(psource.profile, jump.profile), null);
});
test('BPM closeness with half/double-time tolerance; real tempo jumps fail closed', () => {
  const base = passport({ ...lounge, bpm: 70 });
  assert.equal(tempoDistance(70, 140), 0);
  assert.ok(radioSimilarity(base, passport({ ...lounge, bpm: 142 })) !== null);
  assert.equal(radioSimilarity(base, passport({ ...lounge, bpm: 105 })), null);
  assert.ok(radioSimilarity(base, passport({ ...lounge, bpm: 72 })) > radioSimilarity(base, passport({ ...lounge, bpm: 88 })));
});
test('passport sound dominates author text at equal labels', () => {
  const viaPassport = pcand('passport', lounge);
  const viaText = candidate('text', 'jazz new age lounge smooth chill warm relax calm saxophone piano');
  assert.equal(rankRadioCandidates(psource, [viaText, viaPassport])[0].audioItemId, 'passport');
});
test('weighted genre/style/mood overlap: closer passport wins', () => {
  const same = pcand('same', lounge);
  const partial = pcand('partial', { ...lounge, styles: ['Contemporary Jazz'], moods: ['relaxing', 'dreamy'] });
  assert.deepEqual(rankRadioCandidates(psource, [partial, same]).map((c) => c.audioItemId), ['same', 'partial']);
  assert.equal(labelSimilarity([], labels(['jazz'])), 0);
});
test('dominant mood opposites fail closed (calm vs energetic, happy vs melancholic)', () => {
  assert.equal(radioSimilarity(psource.profile, passport({ ...lounge, moods: ['energetic', 'tense'] })), null);
  const happy = passport({ ...lounge, moods: ['happy', 'playful'] });
  assert.equal(radioSimilarity(happy, passport({ ...lounge, moods: ['melancholic', 'solemn'] })), null);
  // A minor (non-dominant) opposite label does not block.
  assert.ok(radioSimilarity(psource.profile, passport({ ...lounge, moods: ['warm', 'relaxing', 'energetic'] })) !== null);
});
test('album aggregate: mean rank weights, median energy, unanimous vocal', () => {
  const agg = aggregateRadioProfile([passport({ ...lounge, energy: 30, vocal: 'instrumental' }), passport({ ...lounge, energy: 50, vocal: 'instrumental' }), profile('rock')]);
  assert.equal(agg.energy, 40); assert.equal(agg.vocal, 'instrumental'); assert.equal(agg.genres[0].label, 'jazz');
  assert.equal(aggregateRadioProfile([profile('jazz')]), null);
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
  for (const text of ['smooth jazz calm vocal 90 bpm', 'smooth jazz calm instrumental 125 bpm', 'smooth jazz energetic instrumental 90 bpm']) {
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
test('adjacent tracks stay close even at opposite ends of source energy range', () => {
  const ranked = rankRadioCandidates(psource, [pcand('low', { ...lounge, energy: 18 }), pcand('high', { ...lounge, energy: 62 })]);
  assert.equal(ranked.length, 1);
  const refill = rankRadioCandidates(psource, [pcand('high', { ...lounge, energy: 62 })], [], passport({ ...lounge, energy: 18 }));
  assert.equal(refill.length, 0);
});
test('artist profile fills only unambiguous missing fields and album labels win', () => {
  const g = (p) => p.genres.map((v) => v.label);
  assert.deepEqual(g(withArtistProfile(profile(''), [profile('jazz'), profile('jazz')])), ['jazz']);
  assert.deepEqual(g(withArtistProfile(profile(''), [profile('jazz'), profile('rock')])), []);
  assert.deepEqual(g(withArtistProfile(profile('ambient'), [profile('jazz')])), ['ambient']);
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

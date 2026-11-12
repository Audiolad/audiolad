/**
 * Album radio ranking (455be80c, t1412u). Passport first.
 *
 * Sound features come from the sealed Music Passport snapshot of each track and
 * its bound analyzer result: ranked genres, styles, moods, instruments, sound
 * character, the published BPM and the analyzer energy. Labels are used as the
 * passport spells them (normalized case/punctuation only), with their rank weight.
 * Author text is a fallback only for a field the passport does not have; its
 * keywords are mapped onto the same passport vocabulary.
 */

/** «Smooth Jazz», «Funk/Soul» → «smooth jazz», «funk soul». */
export function normalizeRadioLabel(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

/** Text fallback: author keywords → passport vocabulary labels. */
const TEXT_LABELS = {
  genres: [
    [/ambient|эмбиент/i, 'ambient'], [/jazz|джаз/i, 'jazz'], [/classical|классик|классическ/i, 'classical'],
    [/electronic|электрон|techno|техно/i, 'electronic'], [/\brock\b|(?:^|[^\p{L}])рок(?:$|[^\p{L}])/iu, 'rock'],
    [/\bpop\b|поп-музык/i, 'pop'], [/\bfolk\b|фолк|world music|этно/i, 'folk world'],
    [/hip.?hop|хип.?хоп|r&b/i, 'hip hop r b'], [/blues|блюз/i, 'blues'], [/new.?age|нью.?эйдж/i, 'new age'],
    [/soundtrack|cinematic|саундтрек|кинематограф/i, 'cinematic soundtrack'], [/latin|латин|босса|bossa/i, 'latin'],
    [/funk|soul|фанк|соул/i, 'funk soul'],
  ],
  styles: [
    [/smooth|смуз/i, 'smooth jazz'], [/lounge|лаунж/i, 'lounge jazz'], [/chill|чилл/i, 'chillout'],
    [/lo.?fi|лоу.?фай|downtempo|даунтемпо/i, 'downtempo'], [/swing|свинг/i, 'swing'], [/fusion|фьюжн/i, 'jazz fusion'],
    [/deep house|дип.?хаус/i, 'deep house'], [/synthwave|синтвейв/i, 'synthwave'],
  ],
  moods: [
    [/calm|спокойн/i, 'calm'], [/relax|расслабл|релакс/i, 'relaxing'], [/energetic|энергичн|бодр/i, 'energetic'],
    [/\bsad\b|груст|печаль/i, 'melancholic'], [/melanchol|меланхол/i, 'melancholic'], [/happy|радост|весёл|весел/i, 'happy'],
    [/dream|мечтат/i, 'dreamy'], [/\bdark\b|мрачн/i, 'dark'], [/romantic|романтич/i, 'romantic'],
    [/meditat|медитат/i, 'meditative'], [/warm|тёпл|тепл/i, 'warm'], [/uplift|вдохнов/i, 'uplifting'],
  ],
  instruments: [
    [/piano|фортепиан|пианино/i, 'piano'], [/orchestr|оркестр/i, 'orchestra'], [/sax|саксоф/i, 'saxophone'],
    [/guitar|гитар/i, 'guitar'], [/violin|скрипк/i, 'violin'], [/flute|флейт/i, 'flute'], [/harp|арф/i, 'harp'],
    [/synth|синтез/i, 'synthesizer'], [/strings|струнн/i, 'strings'],
  ],
};

/** @typedef {{ label: string, weight: number }} RadioLabel */
/** @typedef {{ genres: RadioLabel[], styles: RadioLabel[], moods: RadioLabel[], instruments: RadioLabel[],
 *   character: string | null, bpm: number | null, energy: number | null, vocal: string | null,
 *   basis: 'passport' | 'text' }} RadioProfile */

export const RADIO_LABEL_GROUPS = /** @type {const} */ (['genres', 'styles', 'moods', 'instruments']);

/** @returns {RadioProfile} */
export function emptyRadioProfile() {
  return { genres: [], styles: [], moods: [], instruments: [], character: null, bpm: null, energy: null, vocal: null, basis: 'text' };
}

/** Author text profile (fallback only). @returns {RadioProfile} */
export function metadataProfile(text = '') {
  const profile = emptyRadioProfile();
  for (const group of RADIO_LABEL_GROUPS) {
    const labels = [...new Set(TEXT_LABELS[group].filter(([pattern]) => pattern.test(text)).map(([, label]) => label))];
    profile[group] = labels.map((label) => ({ label, weight: 1 }));
  }
  const bpm = text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (bpm && Number(bpm[1]) >= 30 && Number(bpm[1]) <= 240) profile.bpm = Number(bpm[1]);
  if (/instrumental|инструментальн|без вокала/i.test(text)) profile.vocal = 'instrumental';
  else if (/\bvocal\b|с вокалом|песня|песни/i.test(text)) profile.vocal = 'vocal';
  return profile;
}

const finiteIn = (value, min, max) => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null);

/** Passport sound features (already withheld/gated by the reader) → radio profile.
 * @param {{ genres?: RadioLabel[], styles?: RadioLabel[], moods?: RadioLabel[], instruments?: RadioLabel[],
 *   character?: RadioLabel[] | string | null, bpm?: number | null, energy?: number | null, vocal?: string | null } | null | undefined} features
 * @returns {RadioProfile | null} */
export function passportProfile(features) {
  if (!features) return null;
  const profile = emptyRadioProfile();
  for (const group of RADIO_LABEL_GROUPS) {
    const seen = new Set();
    profile[group] = (features[group] ?? []).flatMap((item) => {
      const label = normalizeRadioLabel(item.label);
      const weight = finiteIn(item.weight, 0, 1);
      if (!label || weight === null || weight === 0 || seen.has(label)) return [];
      seen.add(label);
      return [{ label, weight }];
    });
  }
  const character = Array.isArray(features.character) ? features.character[0]?.label : features.character;
  profile.character = character ? normalizeRadioLabel(character) : null;
  profile.bpm = finiteIn(features.bpm ?? null, 30, 240);
  profile.energy = finiteIn(features.energy ?? null, 0, 100);
  profile.vocal = features.vocal === 'instrumental' || features.vocal === 'vocal' ? features.vocal : null;
  const sound = profile.genres.length + profile.styles.length + profile.moods.length + (profile.energy === null ? 0 : 1);
  if (!sound) return null;
  profile.basis = 'passport';
  return profile;
}

/** Passport wins field by field; text fills only what the passport does not have.
 * @param {RadioProfile | null} passport @param {RadioProfile} fallback @returns {RadioProfile} */
export function withTextFallback(passport, fallback) {
  if (!passport) return { ...fallback, basis: 'text' };
  const result = { ...passport };
  for (const group of RADIO_LABEL_GROUPS) if (!result[group].length) result[group] = fallback[group];
  if (result.bpm === null) result.bpm = fallback.bpm;
  if (result.vocal === null) result.vocal = fallback.vocal;
  return result;
}

/** Album-level passport: mean rank weight over the album tracks, median energy/BPM.
 * Used only to choose which albums to open for track-level ranking.
 * @param {RadioProfile[]} profiles @returns {RadioProfile | null} */
export function aggregateRadioProfile(profiles) {
  const passports = profiles.filter((p) => p.basis === 'passport');
  if (!passports.length) return null;
  const result = emptyRadioProfile();
  result.basis = 'passport';
  for (const group of RADIO_LABEL_GROUPS) {
    const sums = new Map();
    for (const p of passports) for (const { label, weight } of p[group]) sums.set(label, (sums.get(label) ?? 0) + weight);
    result[group] = [...sums].map(([label, sum]) => ({ label, weight: Number((sum / passports.length).toFixed(4)) }))
      .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)).slice(0, 6);
  }
  const median = (values) => {
    const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  result.energy = median(passports.map((p) => p.energy));
  result.bpm = median(passports.map((p) => p.bpm));
  const vocals = new Set(passports.map((p) => p.vocal));
  result.vocal = vocals.size === 1 ? [...vocals][0] : null;
  const characters = new Map();
  for (const p of passports) if (p.character) characters.set(p.character, (characters.get(p.character) ?? 0) + 1);
  result.character = [...characters].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return result;
}

/** Weighted label overlap in [0, 1] (cosine of rank weights). Unknown is never a match. */
export function labelSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  const other = new Map(b.map((item) => [item.label, item.weight]));
  let dot = 0;
  for (const item of a) dot += item.weight * (other.get(item.label) ?? 0);
  if (!dot) return 0;
  const norm = (list) => Math.sqrt(list.reduce((sum, item) => sum + item.weight * item.weight, 0));
  return Math.min(1, dot / (norm(a) * norm(b)));
}

/** Mood axes for the hard guard. Only the dominant moods of each side count. */
const MOOD_AXES = [
  [['calm', 'relaxing', 'meditative', 'peaceful'], ['energetic', 'tense', 'dramatic']],
  [['happy', 'playful', 'bright', 'uplifting'], ['sad', 'melancholic', 'solemn']],
  [['dreamy', 'bright', 'warm'], ['dark', 'tense', 'mysterious']],
];
const dominantMoods = (profile) => {
  const top = profile.moods.length ? profile.moods[0].weight : 0;
  // Text labels are all weight 1; passport keeps its two strongest moods.
  return profile.moods.filter((m, i) => profile.basis === 'text' ? m.weight >= top : i < 2).map((m) => m.label);
};

export const RADIO_ENERGY_MAX_JUMP = 25;
export const RADIO_BPM_MAX_JUMP = 25;

/** Tempo distance allowing half/double time (a common analyzer octave ambiguity). */
export function tempoDistance(a, b) {
  return Math.min(Math.abs(a - b), Math.abs(a - 2 * b), Math.abs(2 * a - b));
}

/** Similarity score, or null when the transition would be sharp.
 * @param {RadioProfile} source @param {RadioProfile} candidate */
export function radioSimilarity(source, candidate) {
  if (source.vocal && candidate.vocal && source.vocal !== candidate.vocal) return null;
  if (source.bpm !== null && candidate.bpm !== null && tempoDistance(source.bpm, candidate.bpm) > RADIO_BPM_MAX_JUMP) return null;
  if (source.energy !== null && candidate.energy !== null && Math.abs(source.energy - candidate.energy) > RADIO_ENERGY_MAX_JUMP) return null;
  const a = dominantMoods(source), b = dominantMoods(candidate);
  if (MOOD_AXES.some(([left, right]) => (a.some((m) => left.includes(m)) && b.some((m) => right.includes(m)) && !b.some((m) => left.includes(m))) ||
    (a.some((m) => right.includes(m)) && b.some((m) => left.includes(m)) && !b.some((m) => right.includes(m))))) return null;
  const genre = labelSimilarity(source.genres, candidate.genres);
  const style = labelSimilarity(source.styles, candidate.styles);
  const mood = labelSimilarity(source.moods, candidate.moods);
  const instruments = labelSimilarity(source.instruments, candidate.instruments);
  // Admission needs shared sound family: genre, or mood together with style or instruments.
  if (!genre && !(mood && (style || instruments))) return null;
  const energy = source.energy !== null && candidate.energy !== null
    ? 30 * (1 - Math.abs(source.energy - candidate.energy) / RADIO_ENERGY_MAX_JUMP) : 0;
  const bpm = source.bpm !== null && candidate.bpm !== null
    ? 15 * (1 - tempoDistance(source.bpm, candidate.bpm) / RADIO_BPM_MAX_JUMP) : 0;
  const score = 35 * genre + 25 * style + 30 * mood + 10 * instruments + energy + bpm +
    (source.character && source.character === candidate.character ? 5 : 0) +
    (source.vocal && source.vocal === candidate.vocal ? 8 : 0);
  // Measured passport sound beats author wording at equal similarity.
  const basis = source.basis === 'passport' && candidate.basis === 'passport' ? 1 : 0.85;
  return Number((score * basis).toFixed(4));
}

/** Sound dominates; other artists win ties. No repeats within this radio run. */
/** @template {{ audioItemId: string, practiceId: string, authorId: string, profile: RadioProfile }} T
 * @param {{ practiceId: string, authorId: string, profile: RadioProfile }} source
 * @param {T[]} candidates
 * @param {string[]} excluded
 * @param {RadioProfile} [previousProfile]
 * @returns {(T & {score: number})[]}
 */
export function rankRadioCandidates(source, candidates, excluded = [], previousProfile = source.profile) {
  const seen = new Set(excluded);
  const pool = candidates.flatMap((candidate) => {
    if (candidate.practiceId === source.practiceId || seen.has(candidate.audioItemId)) return [];
    seen.add(candidate.audioItemId);
    const score = radioSimilarity(source.profile, candidate.profile);
    return score === null ? [] : [{ ...candidate, score }];
  });
  const result = [];
  let previous = previousProfile;
  let previousArtist = source.authorId;
  while (pool.length) {
    const eligible = pool.flatMap((candidate) => {
      const adjacent = radioSimilarity(previous, candidate.profile);
      return adjacent === null ? [] : [{ candidate, value: candidate.score * 0.75 + adjacent * 0.25 -
        (candidate.authorId === previousArtist ? 4 : 0) }];
    }).sort((a, b) => b.value - a.value ||
      Number(a.candidate.authorId === source.authorId) - Number(b.candidate.authorId === source.authorId) ||
      a.candidate.audioItemId.localeCompare(b.candidate.audioItemId));
    if (!eligible.length) break;
    const selected = eligible[0].candidate;
    result.push(selected);
    pool.splice(pool.indexOf(selected), 1);
    previous = selected.profile;
    previousArtist = selected.authorId;
  }
  return result;
}

/** Use only an unambiguous artist catalogue profile to fill missing text labels.
 * Explicit album metadata always wins; artist identity alone is not similarity. */
/** @param {RadioProfile} profile @param {RadioProfile[]} artistProfiles @returns {RadioProfile} */
export function withArtistProfile(profile, artistProfiles) {
  const result = { ...profile };
  for (const group of RADIO_LABEL_GROUPS) {
    if (result[group].length) continue;
    const values = [...new Set(artistProfiles.flatMap((item) => item[group].map((v) => v.label)))];
    if (values.length === 1) result[group] = [{ label: values[0], weight: 1 }];
  }
  return result;
}

/** Metadata adapter is deliberately separate from scoring: a future sealed
 * Passport adapter can supply these same fields without running an analyzer. */
const LABELS = {
  genres: {
    ambient: /ambient|эмбиент/i, jazz: /jazz|джаз/i, classical: /classical|классик|классическ/i,
    electronic: /electronic|электрон/i, rock: /\brock\b|(?:^|[^\p{L}])рок(?:$|[^\p{L}])/iu,
    pop: /\bpop\b|поп-музык/i, folk: /\bfolk\b|фолк/i,
    hiphop: /hip.?hop|хип.?хоп/i, lofi: /lo.?fi|лоу.?фай/i,
    acoustic: /acoustic|акустическ/i, blues: /blues|блюз/i,
  },
  styles: { smooth: /smooth|смуз/i, lounge: /lounge|лаунж/i, piano: /piano|фортепиан|пианино/i,
    chill: /chill|чилл/i, orchestral: /orchestr|оркестр/i, techno: /techno|техно/i },
  moods: { calm: /calm|relax|спокойн|расслабл/i, energetic: /energetic|энергичн|бодр/i,
    sad: /sad|груст|печаль/i, happy: /happy|радост|весёл|весел/i,
    dreamy: /dream|мечтат/i, dark: /dark|мрачн/i },
};

/** @typedef {{ genres: string[], styles: string[], moods: string[], bpm: number | null, vocal: string | null }} RadioProfile */

/** @returns {RadioProfile} */
export function metadataProfile(text = '') {
  /** @type {RadioProfile} */
  const profile = { genres: [], styles: [], moods: [], bpm: null, vocal: null };
  for (const group of ['genres', 'styles', 'moods']) {
    profile[group] = Object.entries(LABELS[group]).filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
  }
  const bpm = text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (bpm && Number(bpm[1]) >= 30 && Number(bpm[1]) <= 240) profile.bpm = Number(bpm[1]);
  if (/instrumental|инструментальн|без вокала/i.test(text)) profile.vocal = 'instrumental';
  else if (/\bvocal\b|с вокалом|песня|песни/i.test(text)) profile.vocal = 'vocal';
  return profile;
}

const overlap = (a, b) => a.some((value) => b.includes(value));

/** Unknown metadata never becomes a match. Hard guards avoid sharp changes. */
export function radioSimilarity(source, candidate) {
  if (source.vocal && candidate.vocal && source.vocal !== candidate.vocal) return null;
  if (source.bpm && candidate.bpm && Math.abs(source.bpm - candidate.bpm) > 25) return null;
  const opposites = [['calm', 'energetic'], ['happy', 'sad'], ['dreamy', 'dark']];
  if (opposites.some(([a, b]) => (source.moods.includes(a) && candidate.moods.includes(b)) ||
    (source.moods.includes(b) && candidate.moods.includes(a)))) return null;
  const genre = overlap(source.genres, candidate.genres);
  const style = overlap(source.styles, candidate.styles);
  const mood = overlap(source.moods, candidate.moods);
  if (!genre && !(style && mood)) return null;
  return (genre ? 60 : 0) + (style ? 25 : 0) + (mood ? 20 : 0) +
    (source.vocal && source.vocal === candidate.vocal ? 8 : 0) +
    (source.bpm && candidate.bpm ? 15 * (1 - Math.abs(source.bpm - candidate.bpm) / 25) : 0);
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

/** Use only an unambiguous artist catalogue profile to fill missing labels.
 * Explicit album metadata always wins; artist identity alone is not similarity. */
/** @param {RadioProfile} profile @param {RadioProfile[]} artistProfiles @returns {RadioProfile} */
export function withArtistProfile(profile, artistProfiles) {
  const result = { ...profile };
  for (const group of ['genres', 'styles', 'moods']) {
    if (result[group].length) continue;
    const values = [...new Set(artistProfiles.flatMap((item) => item[group]))];
    if (values.length === 1) result[group] = values;
  }
  return result;
}

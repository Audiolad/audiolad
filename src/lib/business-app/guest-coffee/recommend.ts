/**
 * a8240527 (passport stage, Sergey 17.10.2026 – clarifications 5ff3ce84 / d1e867c1): the
 * recommendation module of the coffee-shop Music section. Pure and deterministic.
 *
 * The visible setup stays simple – 4 venue characters × 4 sound types × 4 times of day. The
 * HIDDEN basis of the ranking is the sound of the tracks themselves (music passports:
 * genres, styles, moods, instruments, sound character, and only a reliable tempo / energy)
 * aggregated per album, with the editorial hand tags as the RESERVE basis:
 *
 * 1. Every shelf track with a usable passport gets affinities 0..1 to each sound type,
 *    time of day and venue character (explainable label rules below – hypotheses to be
 *    checked by listening, not truth). One track may fit several categories at once
 *    (warm + calm + romantic + piano / harp → calm, melodic, cozy).
 * 2. An album's passport affinity is the mean over its covered tracks. It is used only when
 *    at least half of the album's shelf tracks (and at least two, or the only one) have a
 *    passport; its weight grows with the coverage (0.6 … 0.8). Below that – NO_PASSPORT,
 *    low coverage, a source error – the album is ranked by the editorial tags alone, slightly
 *    discounted (a hand tag is weaker evidence than a consistent measured sound).
 * 3. Albums are ranked by 10 × sound + 4 × time of day + 2 × character. There is NO hard
 *    filter: albums that fit the chosen sound type come first, the closest ones follow, so a
 *    shelf is never empty. Inside an album the tracks whose own passport fits best come first.
 *
 * Only ids, track positions and yes / no matches leave the server (the plan); passport
 * labels, scores and coverage never do. Rights are not decided here: the guest plays only the
 * curated free shelf through the metered guest route, a venue's airplay only rights-confirmed
 * tracks of its program.
 */
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  GUEST_COFFEE_MAX_RESULTS,
  type GuestCoffeeCharacter,
  type GuestCoffeeDaypart,
  type GuestCoffeeDirection,
  type GuestCoffeeEditorialStyle,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
} from "./catalog";
import type { GuestCoffeeLabelWeight, GuestCoffeeSoundFeatures } from "./passport-features";

type Part = Exclude<GuestCoffeeDaypart, "allday">;
const PARTS: readonly Part[] = ["morning", "day", "evening"];

export type GuestCoffeeAffinity = {
  sound: Record<GuestCoffeeDirection, number>;
  daypart: Record<GuestCoffeeDaypart, number>;
  character: Record<GuestCoffeeCharacter, number>;
};

/** A setting «fits» an album from this affinity up. */
export const GUEST_COFFEE_FIT_THRESHOLD = 0.5;
/** Passport basis needs at least this share of the album's shelf tracks. */
export const GUEST_COFFEE_MIN_COVERAGE = 0.5;
export const GUEST_COFFEE_SCORE_WEIGHTS = { sound: 10, daypart: 4, character: 2 } as const;
/**
 * Calibration: the label rules give a clearly fitting track about 0.8 – that counts as a full
 * fit (1.0), so passport and editorial affinities are on one scale.
 */
export const GUEST_COFFEE_PASSPORT_FULL_FIT = 0.8;
/**
 * An album ranked by hand tags alone is a hypothesis with less evidence than a consistent
 * measured sound: its SCORE is discounted a little, so passports lead where they exist. What
 * it fits (yes / no) is not discounted.
 */
export const GUEST_COFFEE_EDITORIAL_RESERVE_FACTOR = 0.8;

// ------------------------------------------------------------------ editorial reserve basis

const EDITORIAL_STYLE_SOUND: Record<GuestCoffeeEditorialStyle, Record<GuestCoffeeDirection, number>> = {
  jazz: { jazz: 1, calm: 0.25, rhythm: 0.3, melodic: 0.3 },
  bossa: { jazz: 0.45, calm: 0.25, rhythm: 1, melodic: 0.4 },
  sax: { jazz: 0.8, calm: 0.3, rhythm: 0.45, melodic: 0.55 },
  calm: { jazz: 0.1, calm: 1, rhythm: 0.05, melodic: 0.6 },
};

const PART_NEIGHBOUR: Record<Part, Record<Part, number>> = {
  morning: { morning: 1, day: 0.35, evening: 0.1 },
  day: { morning: 0.35, day: 1, evening: 0.35 },
  evening: { morning: 0.1, day: 0.35, evening: 1 },
};

const CHARACTER_NEIGHBOUR: Record<GuestCoffeeCharacter, Record<GuestCoffeeCharacter, number>> = {
  cozy: { cozy: 1, city: 0.2, classic: 0.25, evening: 0.4 },
  city: { cozy: 0.2, city: 1, classic: 0.4, evening: 0.2 },
  classic: { cozy: 0.25, city: 0.4, classic: 1, evening: 0.35 },
  evening: { cozy: 0.4, city: 0.2, classic: 0.35, evening: 1 },
};

type EditorialInput = Pick<GuestCoffeePlaylist, "direction" | "dayparts" | "characters"> & { sounds?: readonly GuestCoffeeDirection[] };

export function guestCoffeeEditorialAffinity(p: EditorialInput): GuestCoffeeAffinity {
  const sound = { ...EDITORIAL_STYLE_SOUND[p.direction] };
  (p.sounds ?? []).forEach((s, i) => {
    sound[s] = Math.max(sound[s], i === 0 ? 0.9 : 0.8);
  });
  const daypart = {} as Record<GuestCoffeeDaypart, number>;
  for (const part of PARTS) {
    daypart[part] = p.dayparts === "allday" ? 0.85 : Math.max(0.15, ...p.dayparts.map((d) => PART_NEIGHBOUR[d][part]));
  }
  // One listed part of the day is closeness, not an all-day match (below the fit threshold).
  daypart.allday = p.dayparts === "allday" ? 1 : Math.min(0.9, 0.3 + 0.15 * p.dayparts.length);
  const character = {} as Record<GuestCoffeeCharacter, number>;
  for (const c of GUEST_COFFEE_CHARACTERS) {
    character[c.id] = Math.max(0.1, ...p.characters.map((own) => CHARACTER_NEIGHBOUR[own][c.id]));
  }
  return { sound, daypart, character };
}

// ------------------------------------------------------------------ passport basis (hidden)

type Category = "genres" | "styles" | "moods" | "instruments" | "character";
/** Label → weight; a key starting with «~» matches any label containing the rest. */
type LabelRule = Record<string, number>;
type TargetRule = Partial<Record<Category, { w: number; labels: LabelRule }>>;

const SOUND_RULES: Record<GuestCoffeeDirection, TargetRule> = {
  jazz: {
    genres: { w: 0.45, labels: { jazz: 1, blues: 0.4, latin: 0.3, "funk soul": 0.2 } },
    styles: { w: 0.35, labels: { "~jazz": 0.8, "smooth jazz": 1, "cool jazz": 1, "lounge jazz": 0.9, swing: 1, bebop: 1, "bossa nova": 0.5, lounge: 0.3 } },
    instruments: { w: 0.2, labels: { saxophone: 1, trumpet: 1, "double bass": 0.8, "upright bass": 0.8, brushes: 0.7, vibraphone: 0.8, "jazz guitar": 0.8, organ: 0.4, "electric piano": 0.4, piano: 0.3 } },
  },
  calm: {
    moods: { w: 0.55, labels: { calm: 1, relaxing: 1, peaceful: 1, soothing: 1, tranquil: 1, meditative: 0.9, mellow: 0.8, chill: 0.7, dreamy: 0.6, tender: 0.5, warm: 0.3, romantic: 0.2, happy: -0.2, playful: -0.3, dark: -0.3, upbeat: -0.6, tense: -0.6, epic: -0.6, energetic: -0.8, aggressive: -1 } },
    genres: { w: 0.25, labels: { ambient: 1, "new age": 0.8, classical: 0.4, jazz: 0.1, electronic: -0.2, "funk soul": -0.3, rock: -0.6 } },
    styles: { w: 0.2, labels: { "relaxation music": 1, ambient: 1, chillout: 0.9, lounge: 0.5, "lounge jazz": 0.4, "smooth jazz": 0.3, "cool jazz": 0.3, swing: -0.3, "jazz fusion": -0.3, bebop: -0.5 } },
    character: { w: 0.1, labels: { soft: 1, warm: 0.5, dark: 0.2, bright: -0.2, punchy: -0.5 } },
  },
  rhythm: {
    moods: { w: 0.5, labels: { playful: 1, cheerful: 1, upbeat: 1, groovy: 1, fun: 1, happy: 0.8, energetic: 0.8, uplifting: 0.7, dreamy: -0.3, calm: -0.4, melancholic: -0.4, meditative: -0.6, sad: -0.6 } },
    styles: { w: 0.3, labels: { "bossa nova": 1, "latin jazz": 1, funk: 1, "jazz funk": 1, swing: 0.9, "acid jazz": 0.9, "jazz fusion": 0.6, bebop: 0.6, "lounge jazz": 0.4, lounge: 0.3, "contemporary jazz": 0.3, "relaxation music": -0.5, ambient: -0.6 } },
    genres: { w: 0.1, labels: { latin: 1, "funk soul": 0.8, pop: 0.5, blues: 0.3, "new age": -0.4, ambient: -0.6 } },
    instruments: { w: 0.1, labels: { percussion: 1, congas: 1, shaker: 1, drums: 0.8, "bass guitar": 0.6, "acoustic guitar": 0.5, guitar: 0.5 } },
  },
  melodic: {
    moods: { w: 0.4, labels: { romantic: 1, tender: 1, sentimental: 1, nostalgic: 0.6, warm: 0.5, dreamy: 0.5, hopeful: 0.5, melancholic: 0.4 } },
    instruments: { w: 0.4, labels: { piano: 1, "grand piano": 1, harp: 1, strings: 0.8, violin: 0.8, cello: 0.7, flute: 0.7, "electric piano": 0.6, "acoustic guitar": 0.6, guitar: 0.4, saxophone: 0.3 } },
    genres: { w: 0.2, labels: { classical: 1, "new age": 0.6, jazz: 0.2, ambient: 0.2 } },
  },
};

const PART_RULES: Record<Part, TargetRule> = {
  morning: {
    moods: { w: 0.7, labels: { cheerful: 1, uplifting: 1, bright: 1, happy: 0.8, hopeful: 0.8, warm: 0.6, playful: 0.5, peaceful: 0.4, calm: 0.3, melancholic: -0.3, sensual: -0.4, mysterious: -0.4, dark: -0.6, sad: -0.6 } },
    styles: { w: 0.3, labels: { "bossa nova": 0.6, acoustic: 0.5, "contemporary jazz": 0.3, "smooth jazz": 0.2, lounge: 0.1, "dark jazz": -0.8 } },
    character: { w: 0.1, labels: { bright: 1, warm: 0.5, soft: 0.3, dark: -0.6 } },
  },
  day: {
    moods: { w: 0.6, labels: { upbeat: 1, playful: 0.9, cheerful: 0.9, groovy: 0.9, energetic: 0.8, happy: 0.7, uplifting: 0.6, warm: 0.2, dreamy: -0.2, melancholic: -0.3, meditative: -0.5 } },
    styles: { w: 0.4, labels: { "jazz funk": 0.8, swing: 0.7, "bossa nova": 0.7, "latin jazz": 0.7, "contemporary jazz": 0.6, lounge: 0.5, "lounge jazz": 0.5, "smooth jazz": 0.3, "relaxation music": -0.2, "dark jazz": -0.5 } },
  },
  evening: {
    moods: { w: 0.65, labels: { dreamy: 1, romantic: 1, sensual: 1, mellow: 0.9, melancholic: 0.6, nostalgic: 0.6, mysterious: 0.6, calm: 0.6, relaxing: 0.6, warm: 0.3, playful: -0.3, upbeat: -0.5, energetic: -0.6 } },
    styles: { w: 0.35, labels: { "smooth jazz": 0.8, "lounge jazz": 0.8, "cool jazz": 0.8, "dark jazz": 0.7, lounge: 0.6, "vocal jazz": 0.5, "relaxation music": 0.4, "jazz funk": -0.3 } },
    character: { w: 0.1, labels: { dark: 0.6, warm: 0.5, rich: 0.5, bright: -0.3 } },
  },
};

const CHARACTER_RULES: Record<GuestCoffeeCharacter, TargetRule> = {
  cozy: {
    moods: { w: 0.5, labels: { warm: 1, tender: 1, calm: 0.7, relaxing: 0.7, peaceful: 0.7, romantic: 0.6, dreamy: 0.4, energetic: -0.6, aggressive: -1 } },
    instruments: { w: 0.3, labels: { "acoustic guitar": 1, harp: 0.9, piano: 0.8, "electric piano": 0.6, brushes: 0.6, guitar: 0.6, strings: 0.5 } },
    styles: { w: 0.2, labels: { "relaxation music": 0.6, "smooth jazz": 0.5, "bossa nova": 0.5, lounge: 0.4, "cool jazz": 0.4 } },
    character: { w: 0.1, labels: { warm: 1, soft: 1, rich: 0.5 } },
  },
  city: {
    moods: { w: 0.5, labels: { upbeat: 1, groovy: 1, energetic: 0.9, playful: 0.8, cheerful: 0.8, happy: 0.7, uplifting: 0.6, dreamy: -0.2, meditative: -0.6 } },
    styles: { w: 0.3, labels: { "jazz funk": 1, "acid jazz": 1, "contemporary jazz": 0.8, "jazz fusion": 0.7, lounge: 0.6, "lounge jazz": 0.6, "bossa nova": 0.6, "relaxation music": -0.4 } },
    genres: { w: 0.2, labels: { electronic: 1, "funk soul": 0.8, pop: 0.7, latin: 0.6, jazz: 0.3, "new age": -0.4 } },
    character: { w: 0.1, labels: { bright: 1, punchy: 1 } },
  },
  classic: {
    genres: { w: 0.35, labels: { jazz: 1, classical: 0.8, blues: 0.5 } },
    styles: { w: 0.35, labels: { swing: 1, bebop: 1, "cool jazz": 1, "vocal jazz": 0.8, "smooth jazz": 0.5, "~jazz": 0.4 } },
    instruments: { w: 0.3, labels: { saxophone: 1, trumpet: 1, "double bass": 1, "upright bass": 1, "grand piano": 0.8, brushes: 0.8, vibraphone: 0.8, piano: 0.7 } },
  },
  evening: {
    moods: { w: 0.5, labels: { romantic: 1, sensual: 1, mellow: 0.9, dreamy: 0.8, mysterious: 0.7, melancholic: 0.5, calm: 0.4, energetic: -0.4 } },
    styles: { w: 0.3, labels: { "smooth jazz": 1, "lounge jazz": 0.9, lounge: 0.8, "dark jazz": 0.8, "cool jazz": 0.6 } },
    instruments: { w: 0.2, labels: { saxophone: 1, "electric piano": 0.6, trumpet: 0.6, "double bass": 0.6 } },
    character: { w: 0.1, labels: { dark: 0.6, warm: 0.5, rich: 0.5 } },
  },
};

function ruleWeight(rule: LabelRule, label: string): number {
  if (label in rule) return rule[label];
  let best = 0;
  for (const [key, w] of Object.entries(rule)) {
    if (key.startsWith("~") && label.includes(key.slice(1)) && Math.abs(w) > Math.abs(best)) best = w;
  }
  return best;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** 0..1 affinity of one track to one target; categories the passport lacks do not count. */
function targetAffinity(f: GuestCoffeeSoundFeatures, rule: TargetRule): number {
  let sum = 0;
  let weights = 0;
  for (const [cat, spec] of Object.entries(rule) as [Category, { w: number; labels: LabelRule }][]) {
    const labels: GuestCoffeeLabelWeight[] = f[cat];
    if (labels.length === 0) continue;
    const contribution = labels.reduce((acc, l) => acc + ruleWeight(spec.labels, l.label) * l.weight, 0);
    sum += spec.w * clamp(contribution, -0.5, 1);
    weights += spec.w;
  }
  return weights > 0 ? clamp(sum / weights / GUEST_COFFEE_PASSPORT_FULL_FIT, 0, 1) : 0;
}

function inRange(v: number | null, lo: number, hi: number): boolean {
  return v !== null && v >= lo && v <= hi;
}

/** Hidden affinities of one track from its passport features. */
export function guestCoffeeTrackAffinity(f: GuestCoffeeSoundFeatures): GuestCoffeeAffinity {
  const bpm = f.bpm; // reliable only (see passport-features.ts) – never a candidate
  const e = f.energy === null ? 0 : f.energy - 0.5;
  const adj = (v: number, delta: number) => round(clamp(v + delta, 0, 1));
  const sound = {
    jazz: adj(targetAffinity(f, SOUND_RULES.jazz), 0),
    calm: adj(targetAffinity(f, SOUND_RULES.calm), (inRange(bpm, 0, 89.99) ? 0.1 : 0) - (inRange(bpm, 120.01, 999) ? 0.2 : 0) - 0.4 * e),
    rhythm: adj(targetAffinity(f, SOUND_RULES.rhythm), (inRange(bpm, 95, 135) ? 0.15 : 0) - (inRange(bpm, 0, 79.99) ? 0.15 : 0) + 0.4 * e),
    melodic: adj(targetAffinity(f, SOUND_RULES.melodic), 0),
  };
  const morning = adj(targetAffinity(f, PART_RULES.morning), inRange(bpm, 80, 115) ? 0.05 : 0);
  const day = adj(targetAffinity(f, PART_RULES.day), (inRange(bpm, 95, 130) ? 0.1 : 0) + 0.2 * e);
  const evening = adj(targetAffinity(f, PART_RULES.evening), (inRange(bpm, 0, 94.99) ? 0.05 : 0) - (inRange(bpm, 125.01, 999) ? 0.1 : 0) - 0.2 * e);
  const parts = [morning, day, evening];
  const character = {
    cozy: adj(targetAffinity(f, CHARACTER_RULES.cozy), (inRange(bpm, 0, 94.99) ? 0.05 : 0) - 0.2 * e),
    city: adj(targetAffinity(f, CHARACTER_RULES.city), (inRange(bpm, 100.01, 999) ? 0.1 : 0) + 0.2 * e),
    classic: adj(targetAffinity(f, CHARACTER_RULES.classic), 0),
    evening: adj(targetAffinity(f, CHARACTER_RULES.evening), 0),
  };
  return {
    sound,
    daypart: { morning, day, evening, allday: round(0.5 * (parts.reduce((a, b) => a + b, 0) / 3) + 0.5 * Math.min(...parts)) },
    character,
  };
}

// ------------------------------------------------------------------ album aggregation

export type GuestCoffeeAlbumBasis = "passport" | "editorial";

export type GuestCoffeeAlbumRanking = {
  id: string;
  basis: GuestCoffeeAlbumBasis;
  /** Shelf tracks of the album / of them with a usable passport. */
  total: number;
  covered: number;
  coverage: number;
  /** Weight of the passport basis in the blend (0 = editorial only). */
  passportWeight: number;
  editorial: GuestCoffeeAffinity;
  passport: GuestCoffeeAffinity | null;
  /** What the album fits (yes / no from GUEST_COFFEE_FIT_THRESHOLD). */
  affinity: GuestCoffeeAffinity;
  /** Score multiplier: 1 with a passport basis, the reserve factor with hand tags alone. */
  evidence: number;
  /** Hidden affinities of the album's covered tracks, by audioItemId. */
  tracks: Map<string, GuestCoffeeAffinity>;
};

function mapAffinity(parts: GuestCoffeeAffinity[], fn: (values: number[]) => number): GuestCoffeeAffinity {
  const pick = <K extends keyof GuestCoffeeAffinity>(axis: K, key: keyof GuestCoffeeAffinity[K]) =>
    round(fn(parts.map((p) => p[axis][key] as number)));
  const out = { sound: {}, daypart: {}, character: {} } as GuestCoffeeAffinity;
  for (const s of GUEST_COFFEE_DIRECTIONS) out.sound[s.id] = pick("sound", s.id);
  for (const d of GUEST_COFFEE_DAYPARTS) out.daypart[d.id] = pick("daypart", d.id);
  for (const c of GUEST_COFFEE_CHARACTERS) out.character[c.id] = pick("character", c.id);
  return out;
}

function blend(a: GuestCoffeeAffinity, b: GuestCoffeeAffinity, wB: number): GuestCoffeeAffinity {
  const parts = [a, b];
  return mapAffinity(parts, ([x, y]) => (1 - wB) * x + wB * y);
}

export function guestCoffeePassportWeight(covered: number, total: number): number {
  if (total <= 0 || covered <= 0) return 0;
  const coverage = covered / total;
  if (coverage < GUEST_COFFEE_MIN_COVERAGE || covered < Math.min(2, total)) return 0;
  return round(0.4 + 0.4 * coverage);
}

export function buildGuestCoffeeAlbumRankings(
  playlists: readonly GuestCoffeePlaylist[],
  features: ReadonlyMap<string, GuestCoffeeSoundFeatures> = new Map(),
): GuestCoffeeAlbumRanking[] {
  return playlists.map((p) => {
    const editorial = guestCoffeeEditorialAffinity(p);
    const tracks = new Map<string, GuestCoffeeAffinity>();
    for (const t of p.tracks) {
      const f = features.get(t.audioItemId);
      if (f) tracks.set(t.audioItemId, guestCoffeeTrackAffinity(f));
    }
    const total = p.tracks.length;
    const covered = tracks.size;
    const passport = covered > 0 ? mapAffinity([...tracks.values()], (v) => v.reduce((a, b) => a + b, 0) / v.length) : null;
    const passportWeight = passport ? guestCoffeePassportWeight(covered, total) : 0;
    return {
      id: p.id,
      basis: passportWeight > 0 ? "passport" : "editorial",
      total,
      covered,
      coverage: total > 0 ? round(covered / total) : 0,
      passportWeight,
      editorial,
      passport,
      affinity: passport && passportWeight > 0 ? blend(editorial, passport, passportWeight) : editorial,
      evidence: passportWeight > 0 ? 1 : GUEST_COFFEE_EDITORIAL_RESERVE_FACTOR,
      tracks,
    };
  });
}

// ------------------------------------------------------------------ ranking and the client-safe plan

export function guestCoffeeAffinityScore(a: GuestCoffeeAffinity, profile: GuestCoffeeProfile): number {
  return (
    GUEST_COFFEE_SCORE_WEIGHTS.sound * a.sound[profile.direction] +
    GUEST_COFFEE_SCORE_WEIGHTS.daypart * a.daypart[profile.daypart] +
    GUEST_COFFEE_SCORE_WEIGHTS.character * a.character[profile.character]
  );
}

export type GuestCoffeeFits = { sound: boolean; daypart: boolean; character: boolean };

export type GuestCoffeeRankedAlbum = {
  id: string;
  score: number;
  fits: GuestCoffeeFits;
  /** Preferred order of the album's tracks (indices), null = the album's own order. */
  order: number[] | null;
};

function fitsOf(a: GuestCoffeeAffinity, profile: GuestCoffeeProfile): GuestCoffeeFits {
  return {
    sound: a.sound[profile.direction] >= GUEST_COFFEE_FIT_THRESHOLD,
    daypart: a.daypart[profile.daypart] >= GUEST_COFFEE_FIT_THRESHOLD,
    character: a.character[profile.character] >= GUEST_COFFEE_FIT_THRESHOLD,
  };
}

function trackOrder(p: GuestCoffeePlaylist, r: GuestCoffeeAlbumRanking, profile: GuestCoffeeProfile): number[] | null {
  if (r.tracks.size === 0) return null;
  // One scale for all tracks of the album: its own sound basis (blend or hand tags, undiscounted).
  const baseline = guestCoffeeAffinityScore(r.basis === "passport" ? r.affinity : r.editorial, profile);
  const scored = p.tracks.map((t, i) => {
    const own = r.tracks.get(t.audioItemId);
    return { i, s: own ? 0.7 * guestCoffeeAffinityScore(own, profile) + 0.3 * baseline : baseline };
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const order = scored.map((x) => x.i);
  return order.every((v, i) => v === i) ? null : order;
}

/**
 * All albums ranked for one profile: albums fitting the sound type first (by score), then the
 * closest ones (by score). Deterministic: ties keep the shelf order.
 */
export function rankGuestCoffeeAlbums(
  playlists: readonly GuestCoffeePlaylist[],
  rankings: readonly GuestCoffeeAlbumRanking[],
  profile: GuestCoffeeProfile,
): GuestCoffeeRankedAlbum[] {
  const byId = new Map(rankings.map((r) => [r.id, r]));
  const rows = playlists.flatMap((p, index) => {
    if (p.tracks.length === 0) return [];
    const r = byId.get(p.id) ?? buildGuestCoffeeAlbumRankings([p])[0];
    const score = round(guestCoffeeAffinityScore(r.affinity, profile) * r.evidence);
    return [{ index, ranked: { id: p.id, score, fits: fitsOf(r.affinity, profile), order: trackOrder(p, r, profile) } }];
  });
  rows.sort((a, b) => Number(b.ranked.fits.sound) - Number(a.ranked.fits.sound) || b.ranked.score - a.ranked.score || a.index - b.index);
  return rows.map((r) => r.ranked);
}

export function guestCoffeeProfileKey(profile: GuestCoffeeProfile): string {
  return `${profile.character}|${profile.direction}|${profile.daypart}`;
}

export function allGuestCoffeeProfiles(): GuestCoffeeProfile[] {
  return GUEST_COFFEE_CHARACTERS.flatMap((c) =>
    GUEST_COFFEE_DIRECTIONS.flatMap((d) => GUEST_COFFEE_DAYPARTS.map((t) => ({ character: c.id, direction: d.id, daypart: t.id }))),
  );
}

/**
 * One plan entry: EVERY album of the plan in rank order (indices into `plan.albums`), «sdc» fit
 * flags ("1" / "0", three per ranked album, concatenated) and the preferred track order of
 * each ranked album: positions into its track list, one base-36 digit per track ("" = album
 * order, e.g. no covered tracks or more than 36 tracks).
 */
export type GuestCoffeePlanEntry = {
  rank: number[];
  fits: string;
  order: string[];
};

/**
 * The client-safe result of the server ranking for all 64 settings. Contains ONLY album ids,
 * a fingerprint of each album's ordered track ids (to reject stale entries), positions and
 * yes / no matches – no passport labels, scores or coverage.
 */
export type GuestCoffeeRecommendationPlan = {
  version: 2;
  albums: string[];
  tracks: string[];
  entries: Record<string, GuestCoffeePlanEntry>;
};

const ORDER_RADIX = 36;

function encodeOrder(order: number[] | null): string {
  return order && order.length <= ORDER_RADIX ? order.map((i) => i.toString(ORDER_RADIX)).join("") : "";
}

function decodeOrder(order: unknown, n: number): number[] | null {
  if (typeof order !== "string" || order.length !== n || n === 0) return null;
  const out = [...order].map((c) => parseInt(c, ORDER_RADIX));
  return new Set(out).size === n && out.every((i) => Number.isInteger(i) && i >= 0 && i < n) ? out : null;
}

/** Short stable fingerprint of an album's ordered track ids (FNV-1a, 32 bit). */
export function guestCoffeeTrackFingerprint(p: Pick<GuestCoffeePlaylist, "tracks">): string {
  let h = 0x811c9dc5;
  const text = p.tracks.map((t) => t.audioItemId).join("\n");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${p.tracks.length}.${h.toString(36)}`;
}

export function buildGuestCoffeeRecommendationPlan(
  playlists: readonly GuestCoffeePlaylist[],
  features: ReadonlyMap<string, GuestCoffeeSoundFeatures> = new Map(),
): GuestCoffeeRecommendationPlan {
  const rankings = buildGuestCoffeeAlbumRankings(playlists, features);
  const albums = playlists.map((p) => p.id);
  const index = new Map(albums.map((id, i) => [id, i]));
  const entries: Record<string, GuestCoffeePlanEntry> = {};
  for (const profile of allGuestCoffeeProfiles()) {
    const ranked = rankGuestCoffeeAlbums(playlists, rankings, profile);
    entries[guestCoffeeProfileKey(profile)] = {
      rank: ranked.map((r) => index.get(r.id)!),
      fits: ranked.map((r) => `${Number(r.fits.sound)}${Number(r.fits.daypart)}${Number(r.fits.character)}`).join(""),
      order: ranked.map((r) => encodeOrder(r.order)),
    };
  }
  return { version: 2, albums, tracks: playlists.map(guestCoffeeTrackFingerprint), entries };
}

/** Album ids of one plan entry in rank order (tests and server diagnostics). */
export function guestCoffeePlanAlbumIds(plan: GuestCoffeeRecommendationPlan, key: string): string[] {
  return (plan.entries[key]?.rank ?? []).map((i) => plan.albums[i]);
}

export type GuestCoffeeRecommendedAlbum = {
  playlist: GuestCoffeePlaylist;
  fits: GuestCoffeeFits;
  /** Tracks in the preferred order. */
  tracks: GuestCoffeePlaylist["tracks"];
};

/**
 * The ranked albums for one profile. Uses the server plan when it is valid; an album the plan
 * does not know, or whose track list changed since the plan was built (fingerprint), and a
 * missing / invalid plan are ranked by the editorial reserve basis. Every available album with
 * tracks is returned and nothing outside `available` ever is.
 */
export function guestCoffeeRecommendation(
  available: readonly GuestCoffeePlaylist[],
  profile: GuestCoffeeProfile,
  plan?: GuestCoffeeRecommendationPlan | null,
): { albums: GuestCoffeeRecommendedAlbum[]; soundFallback: boolean } {
  const withTracks = available.filter((p) => p.tracks.length > 0);
  const byId = new Map(withTracks.map((p) => [p.id, p]));
  const out: GuestCoffeeRecommendedAlbum[] = [];
  const used = new Set<string>();
  const valid =
    !!plan && plan.version === 2 && Array.isArray(plan.albums) && Array.isArray(plan.tracks) && plan.albums.length === plan.tracks.length;
  const entry = valid ? plan.entries?.[guestCoffeeProfileKey(profile)] : undefined;
  const usable = !!entry && Array.isArray(entry.rank) && typeof entry.fits === "string" && entry.fits.length === entry.rank.length * 3;
  if (usable) {
    entry.rank.forEach((albumIndex, pos) => {
      const id = Number.isInteger(albumIndex) ? plan!.albums[albumIndex] : undefined;
      const p = id === undefined ? undefined : byId.get(id);
      if (!p || used.has(p.id) || plan!.tracks[albumIndex] !== guestCoffeeTrackFingerprint(p)) return;
      const f = entry.fits.slice(pos * 3, pos * 3 + 3);
      const order = decodeOrder(Array.isArray(entry.order) ? entry.order[pos] : null, p.tracks.length);
      used.add(p.id);
      out.push({
        playlist: p,
        fits: { sound: f[0] === "1", daypart: f[1] === "1", character: f[2] === "1" },
        tracks: order ? order.map((k) => p.tracks[k]) : p.tracks,
      });
    });
  }
  const rest = withTracks.filter((p) => !used.has(p.id));
  if (rest.length > 0) {
    const ranked = rankGuestCoffeeAlbums(rest, buildGuestCoffeeAlbumRankings(rest), profile);
    // Plan albums keep their places; new or changed albums follow, sound fits first overall.
    for (const r of ranked) {
      const p = byId.get(r.id)!;
      out.push({ playlist: p, fits: r.fits, tracks: p.tracks });
    }
    if (out.length > ranked.length) out.sort((a, b) => Number(b.fits.sound) - Number(a.fits.sound));
  }
  return { albums: out, soundFallback: out.length > 0 && !out.some((a) => a.fits.sound) };
}

export type GuestCoffeeSelection = {
  playlists: GuestCoffeePlaylist[];
  /** true when no album fits the chosen sound type – the closest are shown honestly. */
  directionFallback: boolean;
};

/** Shelf of albums for one profile (no hard filter, never empty while albums exist). */
export function selectGuestCoffeePlaylists(
  available: readonly GuestCoffeePlaylist[],
  profile: GuestCoffeeProfile,
  plan?: GuestCoffeeRecommendationPlan | null,
  limit = GUEST_COFFEE_MAX_RESULTS,
): GuestCoffeeSelection {
  const { albums, soundFallback } = guestCoffeeRecommendation(available, profile, plan);
  return { playlists: albums.slice(0, limit).map((a) => a.playlist), directionFallback: soundFallback };
}

export type GuestCoffeeCoverageRow = { id: string; total: number; covered: number; coverage: number; basis: GuestCoffeeAlbumBasis };

/** Server-side diagnostics only (logs, reports) – never sent to the browser. */
export function guestCoffeePassportCoverage(rankings: readonly GuestCoffeeAlbumRanking[]): GuestCoffeeCoverageRow[] {
  return rankings.map((r) => ({ id: r.id, total: r.total, covered: r.covered, coverage: r.coverage, basis: r.basis }));
}

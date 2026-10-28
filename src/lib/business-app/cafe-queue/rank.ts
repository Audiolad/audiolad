/**
 * Cafe queue order. Pure.
 *
 * The candidate pool is an input. This module only reorders it:
 * it never adds a track and never drops one.
 *
 * A track with a passport and analyzer energy is ranked by
 *   energy distance to the daypart target
 *   + mood-tag match (guest-coffee affinities, no BPM and no voice)
 *   + loudness sanity.
 * Calm / lively shifts that target by ±15.
 * "More / less like this" reorders by passport similarity to the voted track:
 * more brings the closest tracks forward, less sends them backward.
 * A track without a passport stays neutral. Tempo counts only when both
 * passports have a reliable BPM.
 * Tracks without a passport or without energy keep their relative order and are
 * appended after the ranked ones, until a vote reorders the whole pool.
 * The same album is not placed twice in a row when another ranked track can split them.
 * A numeric seed instead mixes the whole pool: better passport fits tend to come
 * earlier, and the same album is kept apart around the loop when the counts allow it.
 */
import type { GuestCoffeeCharacter, GuestCoffeeDirection } from "@/lib/business-app/guest-coffee/catalog";
import {
  guestCoffeeAffinityScore,
  guestCoffeeTrackAffinity,
} from "@/lib/business-app/guest-coffee/recommend";
import type { GuestCoffeeSoundFeatures } from "@/lib/business-app/guest-coffee/passport-features";

import type { CafeDaypart, CafeQueueFeedback } from "./prefs";
import { CAFE_ENERGY_OFFSET_STEP } from "./prefs";
import { mulberry32, weightedAlbumOrder } from "./shuffle";
import type { CafeTrackSignals } from "./signals";

/** Cafe targets on the analyzer's 0–100 energy scale. */
export const CAFE_DAYPART_ENERGY_TARGET: Record<CafeDaypart, number> = {
  morning: 40,
  day: 62,
  evening: 28,
};

/** Background music that will not jump out or disappear in a room. */
export const CAFE_LOUDNESS_SANE_MIN = -24;
export const CAFE_LOUDNESS_SANE_MAX = -8;

const ENERGY_WEIGHT = 0.62;
const MOOD_WEIGHT = 0.3;
const LOUDNESS_WEIGHT = 0.08;
/** Guest-coffee affinity at a full fit: 10 + 4 + 2. */
const MOOD_SCALE = 16;
/** Similarity scores inside one band are shuffled, not frozen in score order. */
const SIMILARITY_BAND = 0.05;

export type CafeQueueTrack = {
  audioItemId: string;
  albumKey: string;
};

export type CafeQueueRanking = {
  character: GuestCoffeeCharacter;
  direction: GuestCoffeeDirection;
  daypart: CafeDaypart;
  energyOffset: number;
  feedback?: readonly CafeQueueFeedback[];
  /** When set, the order is a seeded mix. Omit it for the stable score sort. */
  seed?: number;
  /** Album already playing when this playlist is rebuilt. Kept off the first slot when possible. */
  boundaryAlbumKey?: string | null;
};

/** Tracks without a usable passport still enter the mix, behind a typical fit. */
const UNRANKED_SCORE = 25;

export function cafeAlbumKey(track: {
  audioItemId: string;
  authorId?: string | null;
  albumTitle?: string | null;
}): string {
  const album = track.albumTitle?.trim() ?? "";
  if (!album) return track.audioItemId;
  return `${track.authorId ?? ""}:${album}`;
}

export function cafeEnergyTarget(daypart: CafeDaypart, offset: number): number {
  const shift = Number.isFinite(offset)
    ? Math.max(-CAFE_ENERGY_OFFSET_STEP, Math.min(CAFE_ENERGY_OFFSET_STEP, offset))
    : 0;
  return Math.max(0, Math.min(100, CAFE_DAYPART_ENERGY_TARGET[daypart] + shift));
}

function loudnessSanity(lufs: number | null): number {
  if (lufs === null) return 100;
  if (lufs >= CAFE_LOUDNESS_SANE_MIN && lufs <= CAFE_LOUDNESS_SANE_MAX) return 100;
  const distance = lufs < CAFE_LOUDNESS_SANE_MIN ? CAFE_LOUDNESS_SANE_MIN - lufs : lufs - CAFE_LOUDNESS_SANE_MAX;
  return Math.max(0, 100 - distance * 8);
}

function weightedOverlap(
  left: readonly { label: string; weight: number }[],
  right: readonly { label: string; weight: number }[],
): number | null {
  if (left.length === 0 || right.length === 0) return null;
  const rightWeights = new Map(right.map((item) => [item.label, item.weight]));
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const item of left) leftNorm += item.weight * item.weight;
  for (const item of right) rightNorm += item.weight * item.weight;
  for (const item of left) {
    const weight = rightWeights.get(item.label);
    if (weight) dot += item.weight * weight;
  }
  const scale = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return scale > 0 ? dot / scale : 0;
}

function unitCloseness(left: number | null | undefined, right: number | null | undefined, span: number): number | null {
  if (left == null || right == null || span <= 0) return null;
  return 1 - Math.min(span, Math.abs(left - right)) / span;
}

/**
 * 0–1 match of one track to the voted track.
 * Genre, mood, instrumentation, style and character use the passport label weights.
 * Energy and BPM count only when both tracks have them. No passport is neutral (0.5).
 */
export function passportSimilarity(
  reference: CafeTrackSignals | undefined,
  candidate: CafeTrackSignals | undefined,
): number {
  const left = reference?.hasPassport ? reference.sound : null;
  const right = candidate?.hasPassport ? candidate.sound : null;
  if (!left || !right) return 0.5;
  const parts: { weight: number; score: number }[] = [];
  const labels: { weight: number; left: typeof left.genres; right: typeof right.genres }[] = [
    { weight: 0.26, left: left.genres, right: right.genres },
    { weight: 0.24, left: left.moods, right: right.moods },
    { weight: 0.2, left: left.instruments, right: right.instruments },
    { weight: 0.12, left: left.styles, right: right.styles },
    { weight: 0.08, left: left.character, right: right.character },
  ];
  for (const part of labels) {
    const score = weightedOverlap(part.left, part.right);
    if (score !== null) parts.push({ weight: part.weight, score });
  }
  const energy = unitCloseness(reference?.energy, candidate?.energy, 100);
  if (energy !== null) parts.push({ weight: 0.07, score: energy });
  const tempo = unitCloseness(reference?.bpm, candidate?.bpm, 80);
  if (tempo !== null) parts.push({ weight: 0.03, score: tempo });
  if (parts.length === 0) return 0.5;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.weight * part.score, 0) / weight;
}

function voteSeed(audioItemId: string, kind: string, seed: number | undefined): number {
  if (seed !== undefined) return seed;
  let hash = 2166136261;
  const text = `${kind}|${audioItemId}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Move tracks that sound like the voted one.
 * More: closest first. Less: closest last. The voted track is scored like any other
 * (it matches itself). Tracks without a passport stay in the neutral band.
 * The same album is still split, and nothing is added or removed.
 */
export function applyPassportFeedback<T extends CafeQueueTrack>(
  pool: readonly T[],
  signals: ReadonlyMap<string, CafeTrackSignals>,
  feedback: readonly CafeQueueFeedback[],
  seed?: number,
): T[] {
  const vote = [...feedback].reverse().find((item) => pool.some((track) => track.audioItemId === item.audioItemId));
  if (!vote) return [...pool];
  const reference = signals.get(vote.audioItemId);
  const scored = pool.map((track, index) => {
    const similarity = passportSimilarity(reference, signals.get(track.audioItemId));
    const directed = vote.kind === "more" ? similarity : 1 - similarity;
    return { track, index, directed };
  });
  const rng = mulberry32(voteSeed(vote.audioItemId, vote.kind, seed));
  const bands = new Map<number, typeof scored>();
  for (const row of scored) {
    const band = Math.round(row.directed / SIMILARITY_BAND);
    const group = bands.get(band) ?? [];
    group.push(row);
    bands.set(band, group);
  }
  const ordered: T[] = [];
  for (const band of [...bands.keys()].sort((left, right) => right - left)) {
    const group = bands.get(band)!;
    group.sort((left, right) => right.directed - left.directed || left.index - right.index);
    for (let index = group.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      const current = group[index]!;
      group[index] = group[swap]!;
      group[swap] = current;
    }
    ordered.push(...group.map((row) => row.track));
  }
  return separateAlbums(ordered);
}

function moodScore(
  sound: GuestCoffeeSoundFeatures,
  ranking: CafeQueueRanking,
): number {
  const affinity = guestCoffeeTrackAffinity(sound);
  const score = guestCoffeeAffinityScore(affinity, {
    character: ranking.character,
    direction: ranking.direction,
    daypart: ranking.daypart,
  });
  return Math.max(0, Math.min(100, (score / MOOD_SCALE) * 100));
}

function canRank(signals: CafeTrackSignals | undefined): signals is CafeTrackSignals {
  return Boolean(signals?.hasPassport && signals.energy !== null && signals.sound);
}

function separateAlbums<T extends { albumKey: string }>(items: readonly T[]): T[] {
  const pending = [...items];
  const out: T[] = [];
  while (pending.length > 0) {
    const last = out.length > 0 ? out[out.length - 1]!.albumKey : null;
    let pick = 0;
    if (last && pending[0]!.albumKey === last) {
      const other = pending.findIndex((item) => item.albumKey !== last);
      if (other > 0) pick = other;
    }
    const [next] = pending.splice(pick, 1);
    out.push(next!);
  }
  return out;
}

export function rankCafeQueue<T extends CafeQueueTrack>(
  pool: readonly T[],
  signals: ReadonlyMap<string, CafeTrackSignals>,
  ranking: CafeQueueRanking,
): T[] {
  const target = cafeEnergyTarget(ranking.daypart, ranking.energyOffset);
  const feedback = ranking.feedback ?? [];
  const signalById = new Map<string, CafeTrackSignals>();
  for (const track of pool) {
    const row = signals.get(track.audioItemId);
    if (row) signalById.set(track.audioItemId, row);
  }

  const ranked: { track: T; index: number; score: number }[] = [];
  const fallback: T[] = [];
  pool.forEach((track, index) => {
    const row = signalById.get(track.audioItemId);
    if (!canRank(row)) {
      fallback.push(track);
      return;
    }
    const score = ENERGY_WEIGHT * (100 - Math.abs(row.energy! - target))
      + MOOD_WEIGHT * moodScore(row.sound!, ranking)
      + LOUDNESS_WEIGHT * loudnessSanity(row.loudnessLufs);
    ranked.push({ track, index, score });
  });

  ranked.sort((left, right) => right.score - left.score || left.index - right.index);
  const base = ranking.seed === undefined
    ? [...separateAlbums(ranked.map((row) => row.track)), ...fallback]
    : weightedAlbumOrder(
      [
        ...ranked.map((row) => ({ track: row.track, albumKey: row.track.albumKey, score: row.score })),
        ...fallback.map((track, index) => ({ track, albumKey: track.albumKey, score: UNRANKED_SCORE - index * 0.01 })),
      ],
      ranking.seed,
      ranking.boundaryAlbumKey,
    ).map((row) => row.track);
  return applyPassportFeedback(base, signals, feedback, ranking.seed);
}

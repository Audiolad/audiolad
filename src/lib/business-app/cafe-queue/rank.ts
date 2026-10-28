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
 * "More / less like this" nudges the session by tag overlap and energy proximity.
 * Tracks without a passport or without energy keep their relative order and are
 * appended after the ranked ones.
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
import { weightedAlbumOrder } from "./shuffle";
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
const FEEDBACK_POINTS = 36;
const FEEDBACK_CAP = 72;

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

function tagSet(sound: GuestCoffeeSoundFeatures | null): Set<string> {
  if (!sound) return new Set();
  const labels = [
    ...sound.genres,
    ...sound.styles,
    ...sound.moods,
    ...sound.instruments,
    ...sound.character,
  ].map((item) => item.label);
  return new Set(labels);
}

function tagOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const label of left) if (right.has(label)) shared += 1;
  const union = left.size + right.size - shared;
  return union > 0 ? shared / union : 0;
}

function similarity(left: CafeTrackSignals, right: CafeTrackSignals): number {
  const tags = tagOverlap(tagSet(left.sound), tagSet(right.sound));
  if (left.energy === null || right.energy === null) return tags;
  const proximity = 1 - Math.abs(left.energy - right.energy) / 100;
  return 0.7 * tags + 0.3 * proximity;
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
  const byId = new Map(pool.map((track) => [track.audioItemId, track]));
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
    let score = ENERGY_WEIGHT * (100 - Math.abs(row.energy! - target))
      + MOOD_WEIGHT * moodScore(row.sound!, ranking)
      + LOUDNESS_WEIGHT * loudnessSanity(row.loudnessLufs);
    let nudge = 0;
    for (const vote of feedback) {
      const reference = signalById.get(vote.audioItemId);
      const voted = byId.get(vote.audioItemId);
      if (!reference || !voted) continue;
      const weight = similarity(reference, row);
      nudge += vote.kind === "more" ? FEEDBACK_POINTS * weight : -FEEDBACK_POINTS * weight;
    }
    score += Math.max(-FEEDBACK_CAP, Math.min(FEEDBACK_CAP, nudge));
    ranked.push({ track, index, score });
  });

  ranked.sort((left, right) => right.score - left.score || left.index - right.index);
  if (ranking.seed === undefined) {
    return [...separateAlbums(ranked.map((row) => row.track)), ...fallback];
  }
  const mixed = [
    ...ranked.map((row) => ({ track: row.track, albumKey: row.track.albumKey, score: row.score })),
    ...fallback.map((track, index) => ({ track, albumKey: track.albumKey, score: UNRANKED_SCORE - index * 0.01 })),
  ];
  return weightedAlbumOrder(mixed, ranking.seed, ranking.boundaryAlbumKey).map((row) => row.track);
}

/**
 * Paid personal-collection mix (t1640u). Pure.
 * After payment the venue keeps the collection as the base and adds the closest
 * closed-catalog tracks. Trial (strict) never calls this. The hall player engine
 * is not involved: only the catalog pool changes.
 *
 * K = round(N * (100 - p) / p), capped at 80 and the remaining admitted pool.
 * A soft floor of 8 applies only when p < 90 and using it would not drop the
 * collection's share more than 5 points below p. Short collections therefore
 * keep the chosen ratio (5 tracks at 50/50 stay 5+5, not 5+8).
 */

export const COLLECTION_SHARE_MIN = 50;
export const COLLECTION_SHARE_MAX = 95;
export const COLLECTION_SHARE_DEFAULT = 50;
export const COLLECTION_SHARE_PRESETS = [50, 60, 70, 80, 90, 95];
export const SIMILAR_COUNT_CAP = 80;
export const ENERGY_WINDOW_MARGIN = 8;
export const SIMILAR_COUNT_SOFT_FLOOR = 8;
export const SIMILAR_COUNT_SOFT_FLOOR_SLACK = 5;
export const CLAP_VECTOR_SIZE = 512;

export function normalizeCollectionSharePercent(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < COLLECTION_SHARE_MIN || n > COLLECTION_SHARE_MAX) {
    return COLLECTION_SHARE_DEFAULT;
  }
  return n;
}

export function collectionShareLabel(percent) {
  const p = normalizeCollectionSharePercent(percent);
  return `${p} на ${100 - p}`;
}

/** How many similar tracks to add so the collection keeps share p. */
export function similarCount(collectionSize, sharePercent, remaining) {
  const p = normalizeCollectionSharePercent(sharePercent);
  const size = Math.max(0, Math.floor(Number(collectionSize)) || 0);
  const left = Math.max(0, Math.floor(Number(remaining)) || 0);
  if (size === 0 || left === 0) return 0;
  let k = Math.round(size * (100 - p) / p);
  k = Math.min(Math.max(0, k), SIMILAR_COUNT_CAP, left);
  if (p < 90 && k < SIMILAR_COUNT_SOFT_FLOOR && left >= SIMILAR_COUNT_SOFT_FLOOR) {
    const shareWithFloor = (100 * size) / (size + SIMILAR_COUNT_SOFT_FLOOR);
    if (shareWithFloor >= p - SIMILAR_COUNT_SOFT_FLOOR_SLACK) {
      k = Math.min(SIMILAR_COUNT_SOFT_FLOOR, left);
    }
  }
  return k;
}

export function energyWindow(energies, margin = ENERGY_WINDOW_MARGIN) {
  const values = (Array.isArray(energies) ? energies : []).filter((value) =>
    typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  const pad = Number.isFinite(margin) ? margin : ENERGY_WINDOW_MARGIN;
  return { lo: Math.min(...values) - pad, hi: Math.max(...values) + pad };
}

export function readClapVector(normalized) {
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  const embedding = /** @type {{vector?: unknown}} */ (normalized).embedding;
  if (!embedding || typeof embedding !== "object" || Array.isArray(embedding)) return null;
  const vector = embedding.vector;
  if (!Array.isArray(vector) || vector.length !== CLAP_VECTOR_SIZE) return null;
  const out = new Float64Array(CLAP_VECTOR_SIZE);
  for (let index = 0; index < CLAP_VECTOR_SIZE; index += 1) {
    const value = vector[index];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    out[index] = value;
  }
  return out;
}

/** Average of L2-friendly vectors, then L2-normalise. Null when none are usable. */
export function clapCentroid(vectors) {
  const list = (Array.isArray(vectors) ? vectors : []).filter((row) =>
    row && row.length === CLAP_VECTOR_SIZE);
  if (!list.length) return null;
  const acc = new Float64Array(CLAP_VECTOR_SIZE);
  for (const vector of list) {
    for (let index = 0; index < CLAP_VECTOR_SIZE; index += 1) acc[index] += vector[index];
  }
  const scale = 1 / list.length;
  let norm = 0;
  for (let index = 0; index < CLAP_VECTOR_SIZE; index += 1) {
    acc[index] *= scale;
    norm += acc[index] * acc[index];
  }
  if (!(norm > 0)) return null;
  const inv = 1 / Math.sqrt(norm);
  for (let index = 0; index < CLAP_VECTOR_SIZE; index += 1) acc[index] *= inv;
  return acc;
}

export function cosineSimilarity(left, right) {
  if (!left || !right || left.length !== CLAP_VECTOR_SIZE || right.length !== CLAP_VECTOR_SIZE) {
    return null;
  }
  let sum = 0;
  for (let index = 0; index < CLAP_VECTOR_SIZE; index += 1) sum += left[index] * right[index];
  return Number.isFinite(sum) ? sum : null;
}

/**
 * Closest admitted tracks, not already in the collection.
 * @template {{audioItemId: string}} T
 * @param {{
 *   collection: readonly T[],
 *   candidates: readonly T[],
 *   sharePercent?: unknown,
 *   vectors: ReadonlyMap<string, Float64Array>,
 *   energy: ReadonlyMap<string, number|null>,
 *   tagSimilarity?: (referenceId: string, candidateId: string) => number,
 * }} input
 * @returns {T[]}
 */
export function pickSimilarTracks(input) {
  const collection = Array.isArray(input.collection) ? input.collection : [];
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const collected = new Set(collection.map((track) => track.audioItemId));
  const pool = candidates.filter((track) => !collected.has(track.audioItemId));
  const k = similarCount(collection.length, input.sharePercent, pool.length);
  if (k === 0 || collection.length === 0) return [];

  const vectors = input.vectors ?? new Map();
  const energy = input.energy ?? new Map();
  const tagSimilarity = input.tagSimilarity;
  const center = clapCentroid(collection.map((track) => vectors.get(track.audioItemId)).filter(Boolean));
  const window = energyWindow(collection.map((track) => energy.get(track.audioItemId) ?? null));

  const scored = [];
  for (const track of pool) {
    if (window) {
      const value = energy.get(track.audioItemId);
      if (typeof value !== "number" || value < window.lo || value > window.hi) continue;
    }
    const vector = vectors.get(track.audioItemId);
    let score = center && vector ? cosineSimilarity(center, vector) : null;
    if (score === null && typeof tagSimilarity === "function") {
      let best = null;
      for (const item of collection) {
        const next = tagSimilarity(item.audioItemId, track.audioItemId);
        if (typeof next === "number" && Number.isFinite(next) && (best === null || next > best)) best = next;
      }
      score = best;
    }
    if (score === null) continue;
    scored.push({ track, score, id: track.audioItemId });
  }
  scored.sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return scored.slice(0, k).map((row) => row.track);
}

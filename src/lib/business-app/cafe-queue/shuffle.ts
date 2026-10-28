/**
 * Seedable mix for the cafe playlist.
 *
 * Higher fit scores are more likely to be drawn early. The draw is still random,
 * so two builds with different seeds do not look like the same album blocks.
 * A circular playlist never places the same album on both sides of a join when
 * another album can sit there. Same artist next to itself is allowed.
 *
 * When one album has more tracks than the others can separate (more than
 * floor(n / 2) in a circle), some same-album joins are unavoidable. Those
 * leftovers are spread as evenly as the counts allow. A previous playlist's
 * album is kept off the first slot when any other album remains.
 */

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many same-album joins a circle must have, given the album sizes. */
export function minimumCircularAlbumAdjacencies(counts: readonly number[]): number {
  const n = counts.reduce((sum, count) => sum + count, 0);
  if (n <= 1) return 0;
  return counts.reduce((sum, count) => sum + Math.max(0, 2 * count - n), 0);
}

export function circularAlbumAdjacencies<T extends { albumKey: string }>(items: readonly T[]): number {
  if (items.length <= 1) return 0;
  let joins = 0;
  for (let index = 0; index < items.length; index += 1) {
    const next = items[(index + 1) % items.length]!;
    if (items[index]!.albumKey === next.albumKey) joins += 1;
  }
  return joins;
}

function weight(score: number): number {
  return Math.exp(Math.max(-20, Math.min(120, score)) / 16);
}

function pickIndex<T>(items: readonly T[], score: (item: T) => number, rng: () => number): number {
  let total = 0;
  const weights: number[] = [];
  for (const item of items) {
    const value = weight(score(item));
    weights.push(value);
    total += value;
  }
  let ticket = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    ticket -= weights[index]!;
    if (ticket <= 0) return index;
  }
  return items.length - 1;
}

function repairWrap<T extends { albumKey: string }>(items: T[]): void {
  if (items.length < 3) return;
  const before = circularAlbumAdjacencies(items);
  if (before === 0) return;
  for (let index = 0; index < items.length - 1; index += 1) {
    const trial = items.slice();
    const end = trial.length - 1;
    const swapped = trial[index]!;
    trial[index] = trial[end]!;
    trial[end] = swapped;
    if (circularAlbumAdjacencies(trial) < before) {
      items.splice(0, items.length, ...trial);
      return;
    }
  }
}

export function weightedAlbumOrder<T extends { albumKey: string; score: number }>(
  items: readonly T[],
  seed: number,
  avoidFirstAlbum?: string | null,
): T[] {
  const rng = mulberry32(seed);
  const pending = [...items];
  const out: T[] = [];
  while (pending.length > 0) {
    const last = out.length > 0 ? out[out.length - 1]!.albumKey : null;
    const albums = [...new Set(pending.map((item) => item.albumKey))];
    let open = albums.filter((album) => album !== last);
    if (open.length === 0) open = albums;
    if (out.length === 0 && avoidFirstAlbum && open.some((album) => album !== avoidFirstAlbum)) {
      open = open.filter((album) => album !== avoidFirstAlbum);
    }
    const fullest = Math.max(...open.map((album) => pending.filter((item) => item.albumKey === album).length));
    const choices = open.filter((album) => pending.filter((item) => item.albumKey === album).length === fullest);
    const album = choices[pickIndex(choices, (key) => {
      const best = Math.max(...pending.filter((item) => item.albumKey === key).map((item) => item.score));
      return best;
    }, rng)]!;
    const tracks = pending.filter((item) => item.albumKey === album);
    const picked = tracks[pickIndex(tracks, (item) => item.score, rng)]!;
    pending.splice(pending.indexOf(picked), 1);
    out.push(picked);
  }
  repairWrap(out);
  return out;
}

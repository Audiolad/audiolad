/** Intersect an already eligible workspace pool; never introduce preview-only tracks.
 * Empty/revoked assignments fall back to the ordinary eligible atmosphere, unless the venue is a
 * personal-link venue without a paid period (`strict`): then it gets "collection_unavailable"
 * and plays nothing rather than the whole closed catalog (t1616u).
 * A live collection on an unpaid venue stays collection-only. After payment (`strict` is false)
 * the pool is the collection plus similar admitted tracks from `loadSimilar` (t1640u).
 * A failed similar lookup must not widen the pool: the collection itself is kept.
 * Lookup errors for the collection ids or the unpaid/paid status still propagate so the caller
 * returns unavailable rather than widening the pool.
 * @template {{audioItemId: string}} T
 * @param {T[]} tracks
 * @param {()=>Promise<string[]>} loadIds
 * @param {()=>Promise<boolean>} [strict]
 * @param {(selected: T[], pool: T[])=>Promise<T[]>} [loadSimilar]
 * @returns {Promise<T[] | "collection_unavailable">}
 */
export async function selectPersonalVenuePool(tracks, loadIds, strict = async () => false, loadSimilar = null) {
  const ids = new Set(await loadIds());
  const selected = tracks.filter((track) => ids.has(track.audioItemId));
  if (!selected.length) return (await strict()) ? "collection_unavailable" : tracks;
  if (await strict()) return selected;
  if (typeof loadSimilar !== "function") return selected;
  try {
    const extra = await loadSimilar(selected, tracks);
    if (!Array.isArray(extra) || extra.length === 0) return selected;
    const allowed = new Set(tracks.map((track) => track.audioItemId));
    const seen = new Set(selected.map((track) => track.audioItemId));
    const mixed = [...selected];
    for (const track of extra) {
      if (!track || !allowed.has(track.audioItemId) || seen.has(track.audioItemId)) continue;
      seen.add(track.audioItemId);
      mixed.push(track);
    }
    return mixed;
  } catch {
    return selected;
  }
}

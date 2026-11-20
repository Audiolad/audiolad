/** Intersect an already eligible workspace pool; never introduce preview-only tracks.
 * Empty/revoked assignments fall back to the ordinary eligible atmosphere, unless the venue is a
 * personal-link venue without a paid period (`strict`): then it gets "collection_unavailable"
 * and plays nothing rather than the whole closed catalog (t1616u).
 * Lookup errors propagate so the caller returns unavailable rather than widening the pool.
 * @template {{audioItemId: string}} T
 * @param {T[]} tracks
 * @param {()=>Promise<string[]>} loadIds
 * @param {()=>Promise<boolean>} [strict]
 * @returns {Promise<T[] | "collection_unavailable">}
 */
export async function selectPersonalVenuePool(tracks, loadIds, strict = async () => false) {
  const ids = new Set(await loadIds());
  const selected = tracks.filter((track) => ids.has(track.audioItemId));
  if (selected.length) return selected;
  return (await strict()) ? "collection_unavailable" : tracks;
}

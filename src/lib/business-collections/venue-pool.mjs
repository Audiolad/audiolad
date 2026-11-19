/** Intersect an already eligible workspace pool; never introduce preview-only tracks.
 * Empty/revoked assignments fall back to the ordinary eligible atmosphere.
 * Lookup errors propagate so the caller returns unavailable rather than widening the pool.
 * @template {{audioItemId: string}} T
 * @param {T[]} tracks
 * @param {()=>Promise<string[]>} loadIds
 * @returns {Promise<T[]>}
 */
export async function selectPersonalVenuePool(tracks, loadIds) {
  const ids = new Set(await loadIds());
  const selected = tracks.filter((track) => ids.has(track.audioItemId));
  return selected.length ? selected : tracks;
}

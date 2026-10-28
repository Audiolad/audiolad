/**
 * Seam for manual B2B admissions (task 28d2b5bb).
 *
 * The cabinet asks this adapter for the tracks that may play. Ranking only
 * orders that list and must not add a track the adapter did not return.
 * Until the admission tables exist, the adapter returns the cabinet pool
 * unchanged: same tracks, same order. Who plays stays the cabinet's current
 * list. Do not hardcode artists, albums, or projects here.
 */

export type CafeAdmissionPool<T extends { audioItemId: string }> = {
  tracks: readonly T[];
};

export type CafeAdmissionAdapter<T extends { audioItemId: string }> = {
  loadPool(input: { cabinetTracks: readonly T[] }): CafeAdmissionPool<T>;
};

/** Today's pool: the cabinet list, untouched. */
export function currentCabinetAdmissionFor<T extends { audioItemId: string }>(): CafeAdmissionAdapter<T> {
  return {
    loadPool({ cabinetTracks }) {
      return { tracks: cabinetTracks };
    },
  };
}

export const currentCabinetAdmission = currentCabinetAdmissionFor<{ audioItemId: string }>();

/**
 * Adapter output intersected with the cabinet list.
 * An id the cabinet did not already allow is dropped, even if a future adapter
 * returns it by mistake. Order follows the adapter. Duplicates are dropped.
 */
export function restrictCafePool<T extends { audioItemId: string }>(
  cabinetTracks: readonly T[],
  adapter: CafeAdmissionAdapter<T> = currentCabinetAdmissionFor<T>(),
): T[] {
  const allowed = new Set(cabinetTracks.map((track) => track.audioItemId));
  const seen = new Set<string>();
  const pool: T[] = [];
  const admitted = adapter.loadPool({ cabinetTracks }).tracks;
  for (const track of admitted) {
    if (!allowed.has(track.audioItemId) || seen.has(track.audioItemId)) continue;
    seen.add(track.audioItemId);
    pool.push(track);
  }
  return pool;
}

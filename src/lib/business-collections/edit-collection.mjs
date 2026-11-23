/** Pure planners for admin add/remove album and collection delete. No I/O. */

export const COLLECTION_TRACK_LIMIT = 500;

/**
 * @param {{ audioItemId: string, albumId: string, albumTitle: string }[]} tracks
 * @param {string[]} collectionTrackIds
 */
export function albumsFromTracks(tracks, collectionTrackIds) {
  const wanted = new Set(collectionTrackIds);
  /** @type {Map<string, { albumId: string, albumTitle: string, trackCount: number }>} */
  const byAlbum = new Map();
  for (const track of tracks) {
    if (!wanted.has(track.audioItemId)) continue;
    const current = byAlbum.get(track.albumId);
    if (current) current.trackCount += 1;
    else byAlbum.set(track.albumId, { albumId: track.albumId, albumTitle: track.albumTitle, trackCount: 1 });
  }
  return [...byAlbum.values()];
}

/**
 * @param {{ catalogTracks: { audioItemId: string, albumId: string }[], collectionTrackIds: string[], albumId: string, revoked: boolean, limit?: number }} input
 * @returns {{ ok: true, addIds: string[] } | { ok: false, reason: "revoked" | "invalid" | "not_admitted" | "already_in" | "limit" }}
 */
export function planAddAlbum(input) {
  if (input.revoked) return { ok: false, reason: "revoked" };
  const albumId = typeof input.albumId === "string" ? input.albumId : "";
  if (!albumId) return { ok: false, reason: "invalid" };
  const catalog = Array.isArray(input.catalogTracks) ? input.catalogTracks : [];
  const admitted = catalog.filter((track) => track && track.albumId === albumId && typeof track.audioItemId === "string");
  if (!admitted.length) return { ok: false, reason: "not_admitted" };
  const existing = new Set(Array.isArray(input.collectionTrackIds) ? input.collectionTrackIds : []);
  if (admitted.some((track) => existing.has(track.audioItemId))) return { ok: false, reason: "already_in" };
  const addIds = [...new Set(admitted.map((track) => track.audioItemId))];
  const limit = Number.isInteger(input.limit) ? input.limit : COLLECTION_TRACK_LIMIT;
  if (existing.size + addIds.length > limit) return { ok: false, reason: "limit" };
  return { ok: true, addIds };
}

/**
 * Existing albums come from every linked audio_item, including tracks that later
 * lost admission. Admission is applied only when adding albums and during playback.
 *
 * @param {{ linkedTracks: { audioItemId: string, albumId: string }[], collectionTrackIds: string[], albumId: string, revoked: boolean }} input
 * @returns {{ ok: true, removeIds: string[] } | { ok: false, reason: "revoked" | "invalid" | "not_in" | "last_album" }}
 */
export function planRemoveAlbum(input) {
  if (input.revoked) return { ok: false, reason: "revoked" };
  const albumId = typeof input.albumId === "string" ? input.albumId : "";
  if (!albumId) return { ok: false, reason: "invalid" };
  const linked = Array.isArray(input.linkedTracks) ? input.linkedTracks : [];
  const existing = new Set(Array.isArray(input.collectionTrackIds) ? input.collectionTrackIds : []);
  const removeIds = [...new Set(linked
    .filter((track) => track && track.albumId === albumId && typeof track.audioItemId === "string" && existing.has(track.audioItemId))
    .map((track) => track.audioItemId))];
  if (!removeIds.length) return { ok: false, reason: "not_in" };
  if (existing.size - removeIds.length < 1) return { ok: false, reason: "last_album" };
  return { ok: true, removeIds };
}

/**
 * Plan and apply in one step, the way the SQL function does under an advisory lock.
 * @param {{ audioItemId: string, albumId: string }[]} linkedTracks
 * @param {string} albumId
 * @param {boolean} revoked
 */
export function applyRemoveAlbumExclusive(linkedTracks, albumId, revoked) {
  const tracks = Array.isArray(linkedTracks) ? linkedTracks : [];
  const plan = planRemoveAlbum({
    linkedTracks: tracks,
    collectionTrackIds: tracks.map((track) => track.audioItemId),
    albumId,
    revoked,
  });
  if (!plan.ok) return { ok: false, reason: plan.reason, tracks };
  const drop = new Set(plan.removeIds);
  return { ok: true, removeIds: plan.removeIds, tracks: tracks.filter((track) => !drop.has(track.audioItemId)) };
}

/** @param {number} maxPosition @param {number} count */
export function nextPositions(maxPosition, count) {
  const start = Number.isInteger(maxPosition) ? maxPosition + 1 : 0;
  return Array.from({ length: Math.max(0, count) }, (_, index) => start + index);
}

/**
 * @param {{ confirmPaid: boolean, paidVenueCount: number }} input
 * @returns {{ ok: true } | { ok: false, reason: "unavailable" | "needs_paid_confirm", paidVenueCount?: number }}
 */
export function planDeleteCollection(input) {
  const paidVenueCount = input.paidVenueCount;
  if (!Number.isInteger(paidVenueCount) || paidVenueCount < 0) return { ok: false, reason: "unavailable" };
  if (paidVenueCount > 0 && !input.confirmPaid) return { ok: false, reason: "needs_paid_confirm", paidVenueCount };
  return { ok: true };
}

/** Same rule as business_venue_paid_until in the cabinet: a future timestamp means paid. */
export function isVenuePaid(paidUntil, now = Date.now()) {
  return typeof paidUntil === "string" && Date.parse(paidUntil) > now;
}

/**
 * @param {string[]} currentIds
 * @param {{ ok: boolean, addIds?: string[], removeIds?: string[] }} plan
 */
export function applyCollectionTrackChange(currentIds, plan) {
  if (!plan || !plan.ok) return currentIds;
  if (Array.isArray(plan.addIds)) {
    const seen = new Set(currentIds);
    const next = [...currentIds];
    for (const id of plan.addIds) {
      if (typeof id !== "string" || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    return next;
  }
  if (Array.isArray(plan.removeIds)) {
    const drop = new Set(plan.removeIds);
    return currentIds.filter((id) => !drop.has(id));
  }
  return currentIds;
}

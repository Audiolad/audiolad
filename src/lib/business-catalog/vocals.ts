/** Manual closed-catalog «С вокалом» label. Independent of analyzer vocal_role. */

export const VOCAL_ALBUM_LABEL = 'С вокалом';
export const INSTRUMENTAL_ALBUM_LABEL = 'Без вокала';
export const SET_ALBUM_VOCALS_ROUTE = '/api/admin/business-catalog/albums/vocals';

export function parseHasVocalsFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

/** General catalog drops vocal tracks. A live personal collection keeps the operator's selection. */
export function applyClosedCatalogVocalPolicy<T>(
  tracks: readonly T[],
  collectionApplied: boolean,
): T[] {
  if (collectionApplied) return [...tracks];
  return tracks.filter((track) => (track as { hasVocals?: boolean }).hasVocals !== true);
}

export function albumHasVocals(value: unknown): boolean {
  return value === true;
}

/** Album checkbox versus the artist decision. null means «как у артиста». */

export type SectorDecision = { artist: boolean | null; album: boolean | null };

export function sectorChecked(state: SectorDecision): boolean {
  if (typeof state.album === "boolean") return state.album;
  return state.artist === true;
}

export function sectorInherited(state: SectorDecision): boolean {
  return state.album == null && state.artist === true;
}

/**
 * Value to store on the album row.
 * Unchecking while the artist allows writes an explicit false.
 * A reset stores null.
 */
export function sectorNextValue(state: SectorDecision, checked: boolean, reset = false): boolean | null | undefined {
  if (reset) return state.album == null ? undefined : null;
  const next = checked ? true : state.artist === true || state.album === true ? false : state.album === false ? false : null;
  if (state.album === next || (state.album == null && next == null)) return undefined;
  return next;
}

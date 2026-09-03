/**
 * Catalog / PDP Play may toggle pause only after a from-beginning Play CTA
 * already mounted this product. A restored last-session match must not
 * short-circuit into handlePlayPause (which no-ops without src and keeps
 * stale resume position).
 */
export function shouldToggleActiveCatalogPlay(input: {
  sessionMatchesProduct: boolean;
  hasEngine: boolean;
  isPlaying: boolean;
  forceStartAtBeginning: boolean;
}): boolean {
  if (!input.sessionMatchesProduct || !input.hasEngine) {
    return false;
  }

  if (input.isPlaying) {
    return true;
  }

  return input.forceStartAtBeginning === true;
}

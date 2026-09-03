export type SameKeySessionAction =
  | "noop"
  | "autoplay_intent_bump"
  | "same_key_bump"
  | "preserve_playback";

/**
 * Decide how loadSession treats a second payload for the same session key.
 *
 * Catalog / PDP Play send forceStartAtBeginning. A restored desktop session
 * for the same practice must remount (same_key_bump) so track 0 / position 0
 * win over leftover engine state. Autoplay-only bumps stay mounted.
 */
export function resolveSameKeySessionAction(input: {
  trackSelectionChanged: boolean;
  requestAutoplay: boolean;
  currentRequestAutoplay: boolean;
  preservePlayback: boolean;
  forceStartAtBeginning: boolean;
  currentForceStartAtBeginning: boolean;
}): SameKeySessionAction {
  if (input.preservePlayback) {
    return "preserve_playback";
  }

  if (input.trackSelectionChanged) {
    return "same_key_bump";
  }

  if (input.forceStartAtBeginning && !input.currentForceStartAtBeginning) {
    return "same_key_bump";
  }

  if (input.requestAutoplay && !input.currentRequestAutoplay) {
    return "autoplay_intent_bump";
  }

  return "noop";
}

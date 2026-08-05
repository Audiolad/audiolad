export type ProductPlaybackClickAction =
  | { type: "noop" }
  | { type: "toggle_pause_resume" }
  | { type: "play_at_index"; index: number }
  | { type: "load_session" };

/**
 * Pure click resolver for product-page playback controls that share the
 * global player. Keeps page buttons synchronized with mini/full player.
 */
export function resolveProductPlaybackClickAction(input: {
  enabled: boolean;
  isSameProduct: boolean;
  trackIndex: number;
  currentTrackId: string | null | undefined;
  clickedTrackId: string;
}): ProductPlaybackClickAction {
  if (!input.enabled) {
    return { type: "noop" };
  }

  if (!input.isSameProduct || input.trackIndex < 0) {
    return { type: "load_session" };
  }

  if (input.currentTrackId === input.clickedTrackId) {
    return { type: "toggle_pause_resume" };
  }

  return { type: "play_at_index", index: input.trackIndex };
}

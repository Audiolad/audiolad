/** Coordinate page-level <audio> players with the single Global Player. */

export const STOP_LOCAL_AUDIO_EVENT = "audiolad:stop-local-audio";

/** Pause any PersonalMaterialAudioPlayer (or similar) local HTMLAudioElement. */
export function requestStopLocalAudioPlayers(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(STOP_LOCAL_AUDIO_EVENT));
}

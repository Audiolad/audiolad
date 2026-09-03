/**
 * Restore an internally warmed shared audio element to an audible state before
 * normal playback. The player currently has no user-facing element mute
 * control; preserve non-zero volume values so future volume preferences are
 * not overwritten.
 */
export function ensureSharedAudioAudible(audio: HTMLAudioElement): void {
  if (audio.muted) {
    audio.muted = false;
  }

  if (!Number.isFinite(audio.volume) || audio.volume <= 0) {
    audio.volume = 1;
  }
}

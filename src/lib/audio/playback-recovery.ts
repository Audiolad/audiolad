export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Confirms the element is actually advancing playback, not just reporting play state.
 */
export async function verifyRealPlayback(
  audio: HTMLAudioElement,
  waitDurationMs = 750,
): Promise<boolean> {
  if (audio.paused || audio.ended) {
    return false;
  }

  const before = audio.currentTime;
  await waitMs(waitDurationMs);

  if (audio.paused || audio.ended) {
    return false;
  }

  return audio.currentTime > before + 0.04;
}

export function isAudioSourceBroken(audio: HTMLAudioElement): boolean {
  if (audio.error) {
    return true;
  }

  if (audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
    return true;
  }

  return false;
}

export function syncMediaSessionPositionState(
  duration: number,
  playbackRate: number,
  position: number,
): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  if (typeof navigator.mediaSession.setPositionState !== "function") {
    return;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }

  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate,
      position: Math.min(Math.max(position, 0), duration),
    });
  } catch {
    // Safari may reject partial position state updates.
  }
}

export function syncMediaSessionPlaybackState(isActuallyPlaying: boolean): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  try {
    navigator.mediaSession.playbackState = isActuallyPlaying ? "playing" : "paused";
  } catch {
    // Safari may reject updates in some states.
  }
}

export function waitForPlayingEvent(
  audio: HTMLAudioElement,
  timeoutMs = 2500,
): Promise<boolean> {
  if (!audio.paused && !audio.ended) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timerId = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onPlaying = () => {
      cleanup();
      resolve(true);
    };

    const onPause = () => {
      cleanup();
      resolve(false);
    };

    function cleanup() {
      window.clearTimeout(timerId);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
    }

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
  });
}

export function clearMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler("play", null);
    navigator.mediaSession.setActionHandler("pause", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
  } catch {
    // Ignore partial Media Session support.
  }
}

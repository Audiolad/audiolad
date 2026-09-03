type SharedAudioWarmupElement = Pick<
  HTMLAudioElement,
  "currentSrc" | "muted" | "paused" | "pause" | "play"
> & {
  getAttribute(name: string): string | null;
};

function hasRealSource(audio: SharedAudioWarmupElement): boolean {
  return Boolean(audio.currentSrc || audio.getAttribute("src"));
}

/**
 * Keeps the iOS/WebKit user-gesture warm-up confined to an idle shared audio
 * element. Completion of an old warm-up is never allowed to alter a real
 * source or a newer session.
 */
export function createSharedAudioWarmupController() {
  let epoch = 0;

  return {
    invalidate() {
      epoch += 1;
    },

    prepare(audio: SharedAudioWarmupElement) {
      if (hasRealSource(audio) || !audio.paused) {
        return;
      }

      const warmupEpoch = epoch + 1;
      epoch = warmupEpoch;
      const wasMuted = audio.muted;

      try {
        audio.muted = true;
        const playAttempt = audio.play();
        // The user gesture has been issued while muted. Restore immediately:
        // a delayed or permanently pending WebKit promise cannot mute real
        // playback that starts after this call returns.
        audio.muted = wasMuted;

        if (playAttempt && typeof playAttempt.then === "function") {
          void playAttempt
            .then(() => {
              if (
                epoch !== warmupEpoch ||
                hasRealSource(audio) ||
                !audio.paused
              ) {
                return;
              }

              audio.pause();
            })
            .catch(() => {});
        }
      } catch {
        audio.muted = wasMuted;
      }
    },
  };
}

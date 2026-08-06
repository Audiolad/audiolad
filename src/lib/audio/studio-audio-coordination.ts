export const STUDIO_AUDIO_CONTROL_CHANNEL = "audiolad:studio-audio-control";
export const STUDIO_AUDIO_STOP_STORAGE_KEY =
  "audiolad:studio-audio-control:stop-platform-audio";

export const STUDIO_AUDIO_STOP_MESSAGE = {
  type: "stop-platform-audio",
} as const;

export function isStudioAudioStopMessage(
  value: unknown,
): value is typeof STUDIO_AUDIO_STOP_MESSAGE {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === STUDIO_AUDIO_STOP_MESSAGE.type
  );
}

export function requestPlatformAudioStopFromStudio(): void {
  if (typeof window === "undefined") {
    return;
  }

  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(STUDIO_AUDIO_CONTROL_CHANNEL);
    channel.postMessage(STUDIO_AUDIO_STOP_MESSAGE);
    channel.close();
  }

  try {
    window.localStorage.setItem(
      STUDIO_AUDIO_STOP_STORAGE_KEY,
      `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
  } catch {
    // Private browsing or a blocked storage policy must not prevent Studio use.
  }
}

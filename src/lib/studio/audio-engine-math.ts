export function clampStudioAudioPosition(
  position: number,
  duration: number,
): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.min(Math.max(position, 0), duration);
}

export function getStudioAudioPlaybackPosition({
  startedAtContextTime,
  startedAtPosition,
  contextTime,
  duration,
}: {
  startedAtContextTime: number;
  startedAtPosition: number;
  contextTime: number;
  duration: number;
}): number {
  return clampStudioAudioPosition(
    startedAtPosition + Math.max(contextTime - startedAtContextTime, 0),
    duration,
  );
}

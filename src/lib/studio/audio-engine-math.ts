export function clampStudioAudioPosition(
  position: number,
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  if (!Number.isFinite(position)) {
    return position === Number.POSITIVE_INFINITY ? duration : 0;
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

export function getStudioAudioRelativeSeekPosition(
  position: number,
  offset: number,
  duration: number,
): number {
  return clampStudioAudioPosition(position + offset, duration);
}

export function getStudioProjectDuration(
  tracks: Iterable<{ startTime?: number; duration: number }>,
): number {
  let longest = 0;
  for (const track of tracks) {
    const startTime =
      Number.isFinite(track.startTime) && (track.startTime ?? 0) > 0
        ? track.startTime ?? 0
        : 0;
    const duration = Number.isFinite(track.duration) && track.duration > 0
      ? track.duration
      : 0;
    if (startTime + duration > longest) {
      longest = startTime + duration;
    }
  }
  return longest;
}

export function getStudioTrackGain({
  volume,
  muted,
}: {
  volume: number;
  muted: boolean;
}): number {
  if (muted) {
    return 0;
  }

  return Math.min(Math.max(volume, 0), 1);
}

export function getStudioReplacementProjectSize(
  projectSize: number,
  replacedFileSize: number,
  replacementFileSize: number,
): number {
  return Math.max(projectSize - replacedFileSize, 0) + replacementFileSize;
}

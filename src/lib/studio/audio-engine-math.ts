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
  tracks: Iterable<{ duration: number }>,
): number {
  let longest = 0;
  for (const track of tracks) {
    if (Number.isFinite(track.duration) && track.duration > longest) {
      longest = track.duration;
    }
  }
  return longest;
}

export function getStudioTrackGain({
  volume,
  muted,
  solo,
  hasSolo,
}: {
  volume: number;
  muted: boolean;
  solo: boolean;
  hasSolo: boolean;
}): number {
  if (muted || (hasSolo && !solo)) {
    return 0;
  }

  return Math.min(Math.max(volume, 0), 1);
}

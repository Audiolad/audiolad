import {
  AUDIO_PROGRESS_MILESTONES,
  type AudioProgressMilestoneEvent,
} from "@/lib/analytics/constants";
import {
  PLAYBACK_USAGE_IMPOSSIBLE_ABS_MS,
  PLAYBACK_USAGE_MAX_RATE,
} from "@/lib/listen/playback-usage";

const SEEK_JUMP_THRESHOLD_SECONDS = 12;

/** Final zone: min(30s, 10% of duration) before the end of the track. */
export const COMPLETION_ZONE_MAX_SECONDS = 30;
export const COMPLETION_ZONE_RATIO = 0.1;

export type ListeningProgressState = {
  listenedSeconds: number;
  maxContinuousPosition: number;
  reachedMilestones: Set<AudioProgressMilestoneEvent>;
  /**
   * Last playhead accepted as the baseline for seek-vs-playback.
   * A seek rebases this anchor and does not count as reaching the zone.
   */
  playbackAnchorSeconds: number;
  hasPlaybackAnchor: boolean;
  /** Sticky: real playback has crossed into the final zone once. */
  completionReached: boolean;
};

export function completionToleranceSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }

  return Math.min(
    COMPLETION_ZONE_MAX_SECONDS,
    durationSeconds * COMPLETION_ZONE_RATIO,
  );
}

export function completionThresholdSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return durationSeconds - completionToleranceSeconds(durationSeconds);
}

/**
 * Same "clearly impossible" jump as playback-usage MEDIA-TIME:
 * farther than wall × 1.5 by more than 2s, and more than twice that ceiling.
 * A sparse but real playhead advance (lock screen) still counts; a scrub does not.
 */
export function isClearlyImpossiblePlaybackJump(
  positionDeltaSeconds: number,
  wallDeltaSeconds: number,
): boolean {
  if (!Number.isFinite(positionDeltaSeconds) || positionDeltaSeconds <= 0) {
    return false;
  }

  const wallSeconds = Number.isFinite(wallDeltaSeconds)
    ? Math.max(0, wallDeltaSeconds)
    : 0;
  const wallCap = wallSeconds * PLAYBACK_USAGE_MAX_RATE;
  const slopSeconds = PLAYBACK_USAGE_IMPOSSIBLE_ABS_MS / 1000;

  return (
    positionDeltaSeconds > wallCap + slopSeconds &&
    positionDeltaSeconds > wallCap * 2
  );
}

export function createListeningProgressState(): ListeningProgressState {
  return {
    listenedSeconds: 0,
    maxContinuousPosition: 0,
    reachedMilestones: new Set(),
    playbackAnchorSeconds: 0,
    hasPlaybackAnchor: false,
    completionReached: false,
  };
}

export function updateListeningProgressState(
  state: ListeningProgressState,
  input: {
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    deltaSeconds: number;
    /** Uncapped wall time since the previous tick. Seek detection uses this, not the 5s listened cap. */
    wallDeltaSeconds?: number;
  },
): ListeningProgressState {
  const next: ListeningProgressState = {
    listenedSeconds: state.listenedSeconds,
    maxContinuousPosition: state.maxContinuousPosition,
    reachedMilestones: new Set(state.reachedMilestones),
    playbackAnchorSeconds: state.playbackAnchorSeconds,
    hasPlaybackAnchor: state.hasPlaybackAnchor,
    completionReached: state.completionReached,
  };

  if (!input.isPlaying || input.duration <= 0) {
    return next;
  }

  const position = Math.max(0, input.currentTime);
  const positionDelta = position - state.maxContinuousPosition;

  if (positionDelta >= 0 && positionDelta <= SEEK_JUMP_THRESHOLD_SECONDS) {
    next.maxContinuousPosition = position;
  } else if (positionDelta > SEEK_JUMP_THRESHOLD_SECONDS) {
    // Large seek — do not advance natural progress baseline automatically.
    next.maxContinuousPosition = Math.max(state.maxContinuousPosition, position);
  }

  next.listenedSeconds += Math.max(0, input.deltaSeconds);

  const naturalRatio = next.maxContinuousPosition / input.duration;
  const listenedRatio = next.listenedSeconds / input.duration;

  for (const milestone of AUDIO_PROGRESS_MILESTONES) {
    if (next.reachedMilestones.has(milestone.event)) {
      continue;
    }

    if (naturalRatio >= milestone.ratio && listenedRatio >= milestone.ratio * 0.85) {
      next.reachedMilestones.add(milestone.event);
    }
  }

  if (!Number.isFinite(position)) {
    return next;
  }

  const wallDeltaSeconds = Number.isFinite(input.wallDeltaSeconds)
    ? Math.max(0, input.wallDeltaSeconds ?? 0)
    : Math.max(0, input.deltaSeconds);
  const threshold = completionThresholdSeconds(input.duration);

  if (!state.hasPlaybackAnchor) {
    next.hasPlaybackAnchor = true;
    next.playbackAnchorSeconds = position;
    // First sample is a baseline. Completing it requires a plausible step
    // from 0 that actually enters the zone (not a resume/seek into the tail).
    if (
      !isClearlyImpossiblePlaybackJump(position, wallDeltaSeconds) &&
      position >= threshold
    ) {
      next.completionReached = true;
    }
    return next;
  }

  const anchorDelta = position - state.playbackAnchorSeconds;
  const seek =
    anchorDelta < 0 ||
    isClearlyImpossiblePlaybackJump(anchorDelta, wallDeltaSeconds);

  next.playbackAnchorSeconds = position;

  if (
    !seek &&
    !state.completionReached &&
    state.playbackAnchorSeconds < threshold &&
    position >= threshold
  ) {
    next.completionReached = true;
  }

  return next;
}

export function isListeningCompleted(
  state: ListeningProgressState,
  input: {
    currentTime: number;
    duration: number;
    programCompleted: boolean;
  },
): boolean {
  // `ended` / program completion still counts, including a seek that fires ended.
  if (input.programCompleted) {
    return true;
  }

  if (!(input.duration > 0)) {
    return false;
  }

  // Sticky for this play: pause, seek-back, or leaving the zone does not undo it.
  // A seek into the zone does not set the flag; only a real playhead crossing does.
  return state.completionReached;
}

export function getNewlyReachedMilestones(
  previous: ListeningProgressState,
  next: ListeningProgressState,
): AudioProgressMilestoneEvent[] {
  const events: AudioProgressMilestoneEvent[] = [];

  for (const milestone of AUDIO_PROGRESS_MILESTONES) {
    if (
      !previous.reachedMilestones.has(milestone.event) &&
      next.reachedMilestones.has(milestone.event)
    ) {
      events.push(milestone.event);
    }
  }

  return events;
}

import {
  AUDIO_PROGRESS_MILESTONES,
  type AudioProgressMilestoneEvent,
} from "@/lib/analytics/constants";

const SEEK_JUMP_THRESHOLD_SECONDS = 12;

export type ListeningProgressState = {
  listenedSeconds: number;
  maxContinuousPosition: number;
  reachedMilestones: Set<AudioProgressMilestoneEvent>;
};

export function createListeningProgressState(): ListeningProgressState {
  return {
    listenedSeconds: 0,
    maxContinuousPosition: 0,
    reachedMilestones: new Set(),
  };
}

export function updateListeningProgressState(
  state: ListeningProgressState,
  input: {
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    deltaSeconds: number;
  },
): ListeningProgressState {
  const next = {
    listenedSeconds: state.listenedSeconds,
    maxContinuousPosition: state.maxContinuousPosition,
    reachedMilestones: new Set(state.reachedMilestones),
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
  if (input.programCompleted) {
    return true;
  }

  if (input.duration <= 0) {
    return false;
  }

  const nearEnd = input.currentTime >= input.duration - 2;
  const listenedEnough = state.listenedSeconds >= input.duration * 0.85;

  return nearEnd && listenedEnough;
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

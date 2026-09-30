import {
  captureRecoveryPosition,
  decideMediaErrorRecovery,
  settleSignedUrlRecoveryFailure,
  shouldApplySignedUrlRecovery,
  type MediaErrorRecoveryDecision,
} from "@/lib/audio/signed-url-media-error-recovery";

export function clampMaxSeek(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return seconds;
  }

  return Math.min(seconds, duration);
}

export function skipMaxPlayback(
  currentTime: number,
  deltaSeconds: number,
  duration: number,
): number {
  return clampMaxSeek(currentTime + deltaSeconds, duration);
}

export function isStaleMaxAudioRequest(
  requestGeneration: number,
  liveGeneration: number,
): boolean {
  return requestGeneration !== liveGeneration;
}

export function shouldAcceptMaxAudioResponse(input: {
  aborted: boolean;
  requestGeneration: number;
  liveGeneration: number;
}): boolean {
  return !input.aborted && input.requestGeneration === input.liveGeneration;
}

export function captureMaxRecoveryPosition(currentTime: number): number {
  return captureRecoveryPosition(0, currentTime);
}

export function decideMaxSignedUrlRecovery(input: {
  mediaErrorCode: number | null;
  hadSuccessfulPlaying: boolean;
  recoveryUrlAttempted: boolean;
  currentTrackId: string | null;
  hasSrc: boolean;
}): MediaErrorRecoveryDecision {
  return decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: input.hasSrc,
    currentTrackId: input.currentTrackId,
    mediaErrorCode: input.mediaErrorCode,
    hadSuccessfulPlaying: input.hadSuccessfulPlaying,
    recoveryUrlAttempted: input.recoveryUrlAttempted,
    foregroundRecoveryInFlight: false,
  });
}

export function shouldResumeAfterMaxResign(wasIntendedPlaying: boolean): boolean {
  return wasIntendedPlaying;
}

export function hasMaxAudioElementSource(audio: {
  getAttribute: (name: string) => string | null;
  currentSrc: string;
}): boolean {
  return Boolean(audio.getAttribute("src") || audio.currentSrc);
}

export function shouldIgnoreMaxTeardownMediaError(audio: {
  getAttribute: (name: string) => string | null;
  currentSrc: string;
}): boolean {
  return !hasMaxAudioElementSource(audio);
}

export function shouldPlayMaxAppliedSource(input: {
  requestedShouldPlay: boolean;
  liveIntendedPlaying: boolean;
}): boolean {
  return input.requestedShouldPlay && input.liveIntendedPlaying;
}

export function maxTrackSwitchVisibleReset(): {
  isPlaying: false;
  currentTime: 0;
  duration: 0;
  isPreparing: true;
} {
  return {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isPreparing: true,
  };
}

export function shouldStartMaxPrimaryPlayFetch(input: {
  isPreparing: boolean;
  hasSource: boolean;
}): boolean {
  return !input.hasSource && !input.isPreparing;
}

export function shouldDisableMaxPrimaryPlayWhilePreparing(isPreparing: boolean): boolean {
  return isPreparing;
}

export function isMaxPreviewPlaybackMode(mode: string | null | undefined): boolean {
  return mode === "preview";
}

export function shouldShowMaxTrackNavigation(mode: string | null | undefined): boolean {
  return !isMaxPreviewPlaybackMode(mode);
}

export function shouldAdvanceAfterMaxPreviewEnd(mode: string | null | undefined): boolean {
  return !isMaxPreviewPlaybackMode(mode);
}

export function shouldReplayMaxPreviewFromStart(input: {
  playbackMode: string | null | undefined;
  previewEnded: boolean;
  hasSource: boolean;
}): boolean {
  return (
    isMaxPreviewPlaybackMode(input.playbackMode) &&
    input.previewEnded &&
    input.hasSource
  );
}

/**
 * After a natural preview end, seeking/skipping backward must drop the
 * "preview finished" state. Staying at the clip end (e.g. +15 there)
 * must not clear it.
 */
export function shouldClearMaxPreviewEndedAfterSeek(input: {
  previewEnded: boolean;
  nextTime: number;
  currentTime: number;
  duration: number;
}): boolean {
  if (!input.previewEnded) {
    return false;
  }

  const end =
    Number.isFinite(input.duration) && input.duration > 0
      ? input.duration
      : input.currentTime;
  const next = clampMaxSeek(input.nextTime, end);
  return next < end;
}

export function isMaxBlobObjectUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("blob:");
}

export function shouldRevokeMaxAudioObjectUrl(url: string | null | undefined): boolean {
  return isMaxBlobObjectUrl(url);
}

export function settleMaxResignFailure(reason: "stale" | "aborted" | "failed") {
  return settleSignedUrlRecoveryFailure({ ok: false, reason });
}

export function isCurrentMaxRecovery(input: {
  recoveredTrackId: string;
  recoveredGeneration: number;
  currentTrackId: string | null;
  currentGeneration: number;
}): boolean {
  return shouldApplySignedUrlRecovery(input);
}

export function nextMaxTrackIndex(current: number, length: number): number | null {
  if (length <= 0 || current + 1 >= length) {
    return null;
  }
  return current + 1;
}

/** Previous / Next for a playlist queue. Album playback does not use this. */
export type MaxExternalQueueNavigation = {
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  /** Zero-based index in the external queue, not in the narrowed session. */
  index: number;
  length: number;
};

export function formatMaxQueuePositionLabel(index: number, length: number): string | null {
  if (!Number.isInteger(index) || !Number.isInteger(length)) {
    return null;
  }
  if (length <= 0 || index < 0 || index >= length) {
    return null;
  }
  return `Трек ${index + 1} из ${length}`;
}

/**
 * Playlist position wins when an external queue is connected.
 * Album mode counts session tracks and stays hidden for a single track or preview.
 */
export function visibleMaxQueuePositionLabel(input: {
  externalIndex: number | null;
  externalLength: number | null;
  trackIndex: number;
  trackCount: number;
  showInternalNavigation: boolean;
}): string | null {
  if (input.externalIndex != null && input.externalLength != null) {
    return formatMaxQueuePositionLabel(input.externalIndex, input.externalLength);
  }
  if (!input.showInternalNavigation || input.trackCount <= 1) {
    return null;
  }
  return formatMaxQueuePositionLabel(input.trackIndex, input.trackCount);
}

/** Session track index for a content row. Ids outside the authorized session are not playable. */
export function resolveMaxAuthorizedTrackIndex(
  tracks: readonly { trackId: string }[],
  audioItemId: string,
): number | null {
  const id = audioItemId.trim();
  if (!id) {
    return null;
  }
  const index = tracks.findIndex((track) => track.trackId === id);
  return index >= 0 ? index : null;
}

export type MaxProductTrackPressAction =
  | { type: "ignore" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "select"; index: number };

/**
 * Product rows may start only a track already present on the authorized session.
 * Preview sessions contain the single returned preview track, so other rows do nothing.
 */
export function decideMaxProductTrackAction(input: {
  tracks: readonly { trackId: string }[];
  audioItemId: string;
  activeTrackId: string | null;
  listenArmed: boolean;
  isPlaying: boolean;
}): MaxProductTrackPressAction {
  const index = resolveMaxAuthorizedTrackIndex(input.tracks, input.audioItemId);
  if (index == null) {
    return { type: "ignore" };
  }
  const trackId = input.tracks[index]?.trackId;
  if (!trackId) {
    return { type: "ignore" };
  }
  if (input.listenArmed && input.activeTrackId === trackId) {
    return input.isPlaying ? { type: "pause" } : { type: "resume" };
  }
  return { type: "select", index };
}

export function previousMaxTrackIndex(current: number, length: number): number | null {
  if (length <= 0 || current <= 0) {
    return null;
  }
  return current - 1;
}

export function canGoToNextMaxTrack(current: number, length: number): boolean {
  return nextMaxTrackIndex(current, length) !== null;
}

export function canGoToPreviousMaxTrack(current: number, length: number): boolean {
  return previousMaxTrackIndex(current, length) !== null;
}

export function shouldAdvanceAfterMaxTrackEnd(current: number, length: number): boolean {
  return nextMaxTrackIndex(current, length) !== null;
}

export function shouldResetMaxRecoveryCycle(event: "playing" | "play" | "src" | "fetch"): boolean {
  return event === "playing";
}

export function shouldApplyMaxSeekRestore(input: {
  listenerGeneration: number;
  liveGeneration: number;
  listenerTrackId: string;
  liveTrackId: string | null;
}): boolean {
  return (
    input.listenerGeneration === input.liveGeneration &&
    input.liveTrackId !== null &&
    input.listenerTrackId === input.liveTrackId
  );
}

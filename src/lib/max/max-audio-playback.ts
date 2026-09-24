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

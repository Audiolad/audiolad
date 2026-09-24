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

export function nextMaxTrackIndex(current: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(current + 1, length - 1);
}

export function previousMaxTrackIndex(current: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(current - 1, 0);
}

/**
 * Test-only signed-URL recovery state machine.
 * Production player imports the lean helper, not this harness.
 */
import {
  captureRecoveryPosition,
  decideMediaErrorRecovery,
  settleSignedUrlRecoveryFailure,
  shouldApplySignedUrlRecovery,
  visibleErrorForSignedUrlRecoveryFailure,
  visibleListenPlayerError,
  type LoadSignedUrlRecoveryResult,
} from "../../src/lib/audio/signed-url-media-error-recovery";

function applyRecoveredStart(input: {
  pendingStartPosition: number;
  duration: number;
}): { currentTime: number; pendingStartPosition: number } {
  if (
    !(input.pendingStartPosition > 0) ||
    !Number.isFinite(input.duration) ||
    input.duration <= 0
  ) {
    return {
      currentTime: 0,
      pendingStartPosition: input.pendingStartPosition,
    };
  }

  const next = Math.min(Math.max(input.pendingStartPosition, 0), input.duration);
  return { currentTime: next, pendingStartPosition: 0 };
}

export type SignedUrlRecoveryState = {
  trackId: string | null;
  src: string | null;
  sessionGeneration: number;
  currentTime: number;
  pendingStartPosition: number;
  userWantsPlayback: boolean;
  hadSuccessfulPlaying: boolean;
  recoveryUrlAttempted: boolean;
  foregroundRecoveryInFlight: boolean;
  isLoading: boolean;
  isUrlLoading: boolean;
  playerError: string | null;
  urlError: string | null;
  playCalls: number;
  fetchCalls: Array<{ trackId: string; generation: number }>;
  fetchInFlight: boolean;
  inFlightTrackId: string | null;
  inFlightGeneration: number | null;
};

export type SignedUrlRecoveryEvent =
  | { type: "media_error"; code: number; currentTime?: number }
  | { type: "loadedmetadata"; duration: number }
  | { type: "playing" }
  | { type: "canplay"; duration: number }
  | { type: "signed_url_ok"; trackId: string; url: string; generation: number }
  | {
      type: "signed_url_fail";
      trackId: string;
      generation: number;
      status?: number | null;
    }
  | { type: "track_switch"; trackId: string; startPosition?: number }
  | { type: "session_generation"; generation: number }
  | { type: "foreground_recovery_start" }
  | { type: "foreground_resign_attempt" }
  | { type: "seek_target"; position: number }
  | { type: "set_play_intent"; wantsPlayback: boolean }
  | { type: "retry" };

export function createSignedUrlRecoveryState(
  partial?: Partial<SignedUrlRecoveryState>,
): SignedUrlRecoveryState {
  return {
    trackId: "track-a",
    src: "https://cdn.example/expired.mp3",
    sessionGeneration: 1,
    currentTime: 0,
    pendingStartPosition: 0,
    userWantsPlayback: false,
    hadSuccessfulPlaying: false,
    recoveryUrlAttempted: false,
    foregroundRecoveryInFlight: false,
    isLoading: false,
    isUrlLoading: false,
    playerError: null,
    urlError: null,
    playCalls: 0,
    fetchCalls: [],
    fetchInFlight: false,
    inFlightTrackId: null,
    inFlightGeneration: null,
    ...partial,
  };
}

function resetCycleGuards(): Pick<
  SignedUrlRecoveryState,
  | "hadSuccessfulPlaying"
  | "recoveryUrlAttempted"
  | "foregroundRecoveryInFlight"
  | "fetchInFlight"
  | "inFlightTrackId"
  | "inFlightGeneration"
> {
  return {
    hadSuccessfulPlaying: false,
    recoveryUrlAttempted: false,
    foregroundRecoveryInFlight: false,
    fetchInFlight: false,
    inFlightTrackId: null,
    inFlightGeneration: null,
  };
}

export function reduceSignedUrlRecovery(
  state: SignedUrlRecoveryState,
  event: SignedUrlRecoveryEvent,
): SignedUrlRecoveryState {
  switch (event.type) {
    case "set_play_intent":
      return { ...state, userWantsPlayback: event.wantsPlayback };

    case "seek_target":
      return { ...state, pendingStartPosition: event.position };

    case "loadedmetadata":
      return event.duration > 0 ? { ...state, isLoading: false } : state;

    case "playing":
      return {
        ...state,
        hadSuccessfulPlaying: true,
        recoveryUrlAttempted: false,
        isLoading: false,
        playerError: null,
      };

    case "canplay": {
      const applied = applyRecoveredStart({
        pendingStartPosition: state.pendingStartPosition,
        duration: event.duration,
      });
      return {
        ...state,
        currentTime:
          applied.pendingStartPosition === 0
            ? applied.currentTime
            : state.currentTime,
        pendingStartPosition: applied.pendingStartPosition,
        playCalls: state.userWantsPlayback ? state.playCalls + 1 : state.playCalls,
        isLoading: false,
      };
    }

    case "media_error": {
      const decision = decideMediaErrorRecovery({
        isHandlerCurrent: true,
        hasSrc: Boolean(state.src),
        currentTrackId: state.trackId,
        mediaErrorCode: event.code,
        hadSuccessfulPlaying: state.hadSuccessfulPlaying,
        recoveryUrlAttempted: state.recoveryUrlAttempted,
        foregroundRecoveryInFlight:
          state.foregroundRecoveryInFlight || state.fetchInFlight,
      });

      if (decision.action === "ignore") {
        return state;
      }

      if (decision.action === "format_error" || decision.action === "load_error") {
        return {
          ...state,
          isLoading: false,
          isUrlLoading: false,
          playerError: decision.errorMessage,
        };
      }

      const position = captureRecoveryPosition(
        state.pendingStartPosition,
        event.currentTime ?? state.currentTime,
      );

      return {
        ...state,
        recoveryUrlAttempted: true,
        pendingStartPosition: position,
        currentTime: position,
        playerError: null,
        urlError: null,
        isLoading: true,
        isUrlLoading: true,
        fetchInFlight: true,
        inFlightTrackId: state.trackId,
        inFlightGeneration: state.sessionGeneration,
        fetchCalls: state.trackId
          ? [
              ...state.fetchCalls,
              {
                trackId: state.trackId,
                generation: state.sessionGeneration,
              },
            ]
          : state.fetchCalls,
      };
    }

    case "signed_url_ok": {
      if (
        !shouldApplySignedUrlRecovery({
          recoveredTrackId: event.trackId,
          recoveredGeneration: event.generation,
          currentTrackId: state.trackId,
          currentGeneration: state.sessionGeneration,
        })
      ) {
        return state;
      }

      return {
        ...state,
        src: event.url,
        isUrlLoading: false,
        fetchInFlight: false,
        inFlightTrackId: null,
        inFlightGeneration: null,
      };
    }

    case "signed_url_fail": {
      if (
        !shouldApplySignedUrlRecovery({
          recoveredTrackId: event.trackId,
          recoveredGeneration: event.generation,
          currentTrackId: state.trackId,
          currentGeneration: state.sessionGeneration,
        })
      ) {
        return state;
      }

      const result: LoadSignedUrlRecoveryResult = {
        ok: false,
        reason: "failed",
        status: event.status ?? null,
      };
      const settled = settleSignedUrlRecoveryFailure(result);
      const playerError = visibleErrorForSignedUrlRecoveryFailure(result);

      return {
        ...state,
        src: null,
        isLoading: settled.hangLoading ? state.isLoading : false,
        isUrlLoading: settled.hangLoading ? state.isUrlLoading : false,
        fetchInFlight: false,
        inFlightTrackId: null,
        inFlightGeneration: null,
        urlError: playerError,
        playerError,
        recoveryUrlAttempted: true,
      };
    }

    case "track_switch":
      return {
        ...state,
        ...resetCycleGuards(),
        trackId: event.trackId,
        src: null,
        currentTime: event.startPosition ?? 0,
        pendingStartPosition: event.startPosition ?? 0,
        playerError: null,
        urlError: null,
        isLoading: true,
      };

    case "session_generation":
      return {
        ...state,
        ...resetCycleGuards(),
        sessionGeneration: event.generation,
        playerError: null,
        urlError: null,
      };

    case "foreground_recovery_start":
      return { ...state, foregroundRecoveryInFlight: true };

    case "foreground_resign_attempt":
      if (state.recoveryUrlAttempted || state.fetchInFlight) {
        return state;
      }

      return {
        ...state,
        recoveryUrlAttempted: true,
        fetchInFlight: true,
        inFlightTrackId: state.trackId,
        inFlightGeneration: state.sessionGeneration,
        fetchCalls: state.trackId
          ? [
              ...state.fetchCalls,
              {
                trackId: state.trackId,
                generation: state.sessionGeneration,
              },
            ]
          : state.fetchCalls,
      };

    case "retry":
      return {
        ...state,
        ...resetCycleGuards(),
        playerError: null,
        urlError: null,
        isLoading: true,
        isUrlLoading: true,
      };

    default:
      return state;
  }
}

export function visibleRecoveryError(state: SignedUrlRecoveryState): string | null {
  return visibleListenPlayerError(state.playerError, state.urlError);
}

/**
 * Signed-URL TTL media-error recovery.
 *
 * Verdict (docs + browser behavior, no production TTL change):
 * MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) is NOT format-only.
 *
 * HTML spec user-facing text for code 4 is: the media could not be loaded
 * "either because the server or network failed or because the format is not
 * supported." Resource-selection failure — HTTP 400/403/404, an unusable
 * body, or an expired signed URL on a fresh load() — is reported as code 4.
 * MEDIA_ERR_NETWORK (code 2) is a network error after the resource was already
 * established as usable (typical Chrome/Firefox Range 403 after expiry).
 *
 * WHATWG html#4999: code 4 alone cannot distinguish 403/5xx from an
 * unsupported codec. Chromium maps failed-to-load / unresolvable URLs to
 * code 4. Safari/WebKit commonly surfaces HTTP media failures as code 4.
 *
 * Policy:
 * - After a successful `playing` event in this cycle: code 2 or 4 → one
 *   transparent re-sign.
 * - Primary load, no successful playing yet: code 4 → format/source error,
 *   no re-sign. Code 2 may still re-sign once (network flake).
 * - After that re-sign, any later media error → final player error, no loop.
 */

export const MEDIA_ERR_ABORTED = 1;
export const MEDIA_ERR_NETWORK = 2;
export const MEDIA_ERR_DECODE = 3;
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export const FORMAT_AUDIO_ERROR =
  "Формат аудио не поддерживается на этом устройстве.";
export const LOAD_AUDIO_ERROR =
  "Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз.";

export type MediaErrorRecoveryAction =
  | "ignore"
  | "resign"
  | "format_error"
  | "load_error";

export type MediaErrorRecoveryDecision = {
  action: MediaErrorRecoveryAction;
  errorMessage: string | null;
};

export type MediaErrorRecoveryInput = {
  isHandlerCurrent: boolean;
  hasSrc: boolean;
  currentTrackId: string | null;
  mediaErrorCode: number | null;
  hadSuccessfulPlaying: boolean;
  recoveryUrlAttempted: boolean;
  foregroundRecoveryInFlight: boolean;
};

export function decideMediaErrorRecovery(
  input: MediaErrorRecoveryInput,
): MediaErrorRecoveryDecision {
  if (!input.isHandlerCurrent || !input.hasSrc) {
    return { action: "ignore", errorMessage: null };
  }

  if (input.foregroundRecoveryInFlight) {
    return { action: "ignore", errorMessage: null };
  }

  const isCode4 = input.mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED;
  const firstSrcFormatFailure = isCode4 && !input.hadSuccessfulPlaying;

  if (firstSrcFormatFailure) {
    return { action: "format_error", errorMessage: FORMAT_AUDIO_ERROR };
  }

  if (input.currentTrackId && !input.recoveryUrlAttempted) {
    return { action: "resign", errorMessage: null };
  }

  if (isCode4) {
    return { action: "format_error", errorMessage: FORMAT_AUDIO_ERROR };
  }

  return { action: "load_error", errorMessage: LOAD_AUDIO_ERROR };
}

export function captureRecoveryPosition(
  pendingStartPosition: number,
  audioCurrentTime: number,
): number {
  if (Number.isFinite(pendingStartPosition) && pendingStartPosition > 0) {
    return pendingStartPosition;
  }

  return Number.isFinite(audioCurrentTime) && audioCurrentTime > 0
    ? audioCurrentTime
    : 0;
}

export function shouldApplySignedUrlRecovery(input: {
  recoveredTrackId: string;
  recoveredGeneration: number;
  currentTrackId: string | null;
  currentGeneration: number;
}): boolean {
  return (
    input.currentTrackId === input.recoveredTrackId &&
    input.currentGeneration === input.recoveredGeneration
  );
}

export function clampRecoveryPosition(
  position: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(position, min), max);
}

export function applyRecoveredStartPosition(input: {
  pendingStartPosition: number;
  duration: number;
  previewMin?: number;
  previewMax?: number;
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

  const min = input.previewMin ?? 0;
  const max =
    typeof input.previewMax === "number"
      ? Math.min(input.previewMax, input.duration)
      : input.duration;

  return {
    currentTime: clampRecoveryPosition(input.pendingStartPosition, min, max),
    pendingStartPosition: 0,
  };
}

export type LoadSignedUrlRecoveryResult =
  | { ok: true; url: string }
  | { ok: false; reason: "stale" | "aborted" | "failed"; status?: number | null };

export function messageForSignedUrlHttpStatus(
  status?: number | null,
): string {
  if (status === 401 || status === 403) {
    return "Доступ к прослушиванию не открыт.";
  }

  if (status === 404) {
    return "Аудиофайл не найден.";
  }

  return LOAD_AUDIO_ERROR;
}

export function settleSignedUrlRecoveryFailure(result: {
  ok: boolean;
  reason?: "stale" | "aborted" | "failed";
}): {
  hangLoading: boolean;
  showError: boolean;
  allowAnotherResign: boolean;
} {
  if (result.ok) {
    return {
      hangLoading: false,
      showError: false,
      allowAnotherResign: false,
    };
  }

  if (result.reason === "stale" || result.reason === "aborted") {
    return {
      hangLoading: false,
      showError: false,
      allowAnotherResign: false,
    };
  }

  return {
    hangLoading: false,
    showError: true,
    allowAnotherResign: false,
  };
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
      const applied = applyRecoveredStartPosition({
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

      const settled = settleSignedUrlRecoveryFailure({
        ok: false,
        reason: "failed",
      });
      const errorMessage = messageForSignedUrlHttpStatus(event.status);

      return {
        ...state,
        src: null,
        isLoading: settled.hangLoading ? state.isLoading : false,
        isUrlLoading: settled.hangLoading ? state.isUrlLoading : false,
        fetchInFlight: false,
        inFlightTrackId: null,
        inFlightGeneration: null,
        urlError: settled.showError ? errorMessage : state.urlError,
        playerError: settled.showError ? errorMessage : state.playerError,
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

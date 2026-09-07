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
 * Policy A (codes are not interchangeable):
 * - code 2 (MEDIA_ERR_NETWORK) → one transparent re-sign.
 * - code 4 AFTER a successful `playing` event → one transparent re-sign.
 * - Primary load, no successful playing yet: code 4 → format/source error,
 *   no re-sign.
 * - code 1 (aborted), code 3 (decode), unknown/null → ordinary final error,
 *   no automatic re-sign. Decode/abort are not treated as expired-URL.
 * - After that re-sign, any later media error → final player error, no loop.
 * - Adopting already-playing shared audio (queue handoff after play() +
 *   waitForPlayingEvent, or same-session prefetch already !paused) counts as
 *   successful playing even if this engine instance never saw the event.
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

  const code = input.mediaErrorCode;
  const isCode2 = code === MEDIA_ERR_NETWORK;
  const isCode4 = code === MEDIA_ERR_SRC_NOT_SUPPORTED;
  const canResign = Boolean(input.currentTrackId) && !input.recoveryUrlAttempted;

  if (isCode4 && !input.hadSuccessfulPlaying) {
    return { action: "format_error", errorMessage: FORMAT_AUDIO_ERROR };
  }

  if (isCode2 && canResign) {
    return { action: "resign", errorMessage: null };
  }

  if (isCode4 && input.hadSuccessfulPlaying && canResign) {
    return { action: "resign", errorMessage: null };
  }

  if (isCode4) {
    return { action: "format_error", errorMessage: FORMAT_AUDIO_ERROR };
  }

  return { action: "load_error", errorMessage: LOAD_AUDIO_ERROR };
}

/**
 * Shared audio already in a live playing state. Queue handoff is created
 * after play() + waitForPlayingEvent(); prefetch may already be playing
 * before this engine instance attaches listeners.
 */
export function isAdoptedAudioAlreadyPlaying(input: {
  paused: boolean;
  ended: boolean;
}): boolean {
  return !input.paused && !input.ended;
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

export type SignedUrlSourceType = "catalog" | "private_audio";

export const PRIVATE_ACCESS_ERROR = "Нет доступа к этому аудиоматериалу.";
export const CATALOG_ACCESS_ERROR = "Доступ к прослушиванию не открыт.";
export const AUDIO_NOT_FOUND_ERROR = "Аудиофайл не найден.";

export type LoadSignedUrlRecoveryResult =
  | { ok: true; url: string }
  | { ok: false; reason: "stale" | "aborted" }
  | {
      ok: false;
      reason: "failed";
      status?: number | null;
      sourceType?: SignedUrlSourceType;
      visibleError?: string | null;
    };

/**
 * Single source of truth for signed-URL HTTP failure copy.
 * loadSignedUrl attaches this as `visibleError`; recovery must reuse it.
 */
export function messageForSignedUrlLoadFailure(input: {
  status?: number | null;
  sourceType?: SignedUrlSourceType | null;
}): string {
  if (input.status === 401 || input.status === 403) {
    return input.sourceType === "private_audio"
      ? PRIVATE_ACCESS_ERROR
      : CATALOG_ACCESS_ERROR;
  }

  if (input.status === 404) {
    return AUDIO_NOT_FOUND_ERROR;
  }

  return LOAD_AUDIO_ERROR;
}

export function failedSignedUrlLoadResult(input: {
  status?: number | null;
  sourceType: SignedUrlSourceType;
}): Extract<LoadSignedUrlRecoveryResult, { reason: "failed" }> {
  return {
    ok: false,
    reason: "failed",
    status: input.status ?? null,
    sourceType: input.sourceType,
    visibleError: messageForSignedUrlLoadFailure(input),
  };
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

/**
 * Visible listen-player error. Matches `playerError: playerError ?? urlError`.
 */
export function visibleListenPlayerError(
  playerError: string | null,
  urlError: string | null,
): string | null {
  return playerError ?? urlError;
}

export function visibleErrorForSignedUrlRecoveryFailure(
  result: LoadSignedUrlRecoveryResult,
): string | null {
  const settled = settleSignedUrlRecoveryFailure(result);

  if (!settled.showError || result.ok || result.reason !== "failed") {
    return null;
  }

  if (typeof result.visibleError === "string" && result.visibleError.length > 0) {
    return result.visibleError;
  }

  return messageForSignedUrlLoadFailure({
    status: result.status,
    sourceType: result.sourceType,
  });
}

/**
 * Pure helpers for PersonalMaterialAudioPlayer.
 * Keep free of React / DOM side effects so unit tests can import them.
 */

import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

export type SignedAudioPayload = {
  url: string;
  expiresAt: string;
};

/** Refresh when missing or less than this many ms remain before expiry. */
export const SIGNED_URL_REFRESH_MARGIN_MS = 60_000;

export const PERSONAL_AUDIO_COPY = {
  preparing: "Подготавливаем аудио…",
  needsGesture: `Аудио готово. Нажмите «${PLAY_ACTION_LABEL}» ещё раз.`,
  playFailed: "Не удалось включить аудио",
  notSupported: "Не удалось воспроизвести этот аудиофайл.",
  authRequired: "Нужно снова войти в аккаунт или обновить доступ к материалу.",
  unavailable: "Доступ к материалу больше недоступен.",
  network: "Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз.",
  rateLimited: "Слишком много запросов. Попробуйте позже.",
  retry: "Попробовать снова",
  iosSafariFallback:
    "Если воспроизведение не запускается, откройте эту страницу в Safari.",
} as const;

export type PersonalAudioErrorKind =
  | "not_allowed"
  | "not_supported"
  | "auth"
  | "unavailable"
  | "rate_limited"
  | "network"
  | "abort"
  | "play_failed";

export type ClassifiedPersonalAudioError = {
  kind: PersonalAudioErrorKind;
  /** Null means: do not surface a critical UI error. */
  message: string | null;
};

export function getSignedUrlRemainingMs(
  expiresAt: string,
  nowMs: number = Date.now(),
): number | null {
  const expiresMs = Date.parse(expiresAt);

  if (Number.isNaN(expiresMs)) {
    return null;
  }

  return expiresMs - nowMs;
}

export function isSignedUrlFresh(
  signed: SignedAudioPayload | null | undefined,
  nowMs: number = Date.now(),
  marginMs: number = SIGNED_URL_REFRESH_MARGIN_MS,
): boolean {
  if (!signed?.url || !signed.expiresAt) {
    return false;
  }

  const remainingMs = getSignedUrlRemainingMs(signed.expiresAt, nowMs);

  if (remainingMs === null) {
    return false;
  }

  return remainingMs > marginMs;
}

/**
 * Host + pathname only — never include query (signed token lives there).
 */
export function toSafeAudioSrcPath(url: string | null | undefined): string {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url, "https://audiolad.ru");
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    const withoutQuery = url.split("?")[0] ?? "";
    return withoutQuery.slice(0, 180);
  }
}

export function classifyPlayError(error: unknown): ClassifiedPersonalAudioError {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  if (name === "AbortError") {
    return { kind: "abort", message: null };
  }

  if (name === "NotAllowedError") {
    return {
      kind: "not_allowed",
      message: PERSONAL_AUDIO_COPY.needsGesture,
    };
  }

  if (name === "NotSupportedError") {
    return {
      kind: "not_supported",
      message: PERSONAL_AUDIO_COPY.notSupported,
    };
  }

  return {
    kind: "play_failed",
    message: PERSONAL_AUDIO_COPY.playFailed,
  };
}

export function classifyFetchStatus(status: number): ClassifiedPersonalAudioError {
  if (status === 401 || status === 403) {
    return { kind: "auth", message: PERSONAL_AUDIO_COPY.authRequired };
  }

  if (status === 404) {
    return { kind: "unavailable", message: PERSONAL_AUDIO_COPY.unavailable };
  }

  if (status === 429) {
    return { kind: "rate_limited", message: PERSONAL_AUDIO_COPY.rateLimited };
  }

  return { kind: "network", message: PERSONAL_AUDIO_COPY.network };
}

/** MediaError.code → UI classification. */
export function classifyMediaErrorCode(
  code: number | null | undefined,
): ClassifiedPersonalAudioError {
  // 1 = MEDIA_ERR_ABORTED
  if (code === 1) {
    return { kind: "abort", message: null };
  }

  // 3 = DECODE, 4 = SRC_NOT_SUPPORTED
  if (code === 3 || code === 4) {
    return {
      kind: "not_supported",
      message: PERSONAL_AUDIO_COPY.notSupported,
    };
  }

  // 2 = NETWORK and unknown
  return { kind: "network", message: PERSONAL_AUDIO_COPY.network };
}

export function isLikelyIosUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

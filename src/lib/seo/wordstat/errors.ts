import type { WordstatErrorCode, WordstatErrorResult } from "@/lib/seo/wordstat/types";

export const WORDSTAT_ERROR_MESSAGES: Record<WordstatErrorCode, string> = {
  WORDSTAT_DISABLED:
    "Подбор запросов временно недоступен. Вы можете заполнить запрос вручную.",
  NOT_CONFIGURED:
    "Подбор запросов временно недоступен. Вы можете заполнить запрос вручную.",
  RATE_LIMITED: "Слишком много запросов подряд. Попробуйте немного позже.",
  TIMEOUT:
    "Не удалось получить данные Яндекса вовремя. Попробуйте ещё раз или заполните запрос вручную.",
  UPSTREAM_ERROR:
    "Не удалось получить данные Яндекса. Попробуйте ещё раз или заполните запрос вручную.",
  NO_RESULTS:
    "Яндекс не нашёл подходящих фраз. Попробуйте другую формулировку или напишите запрос сами.",
  INVALID_PHRASE:
    "Введите поисковую фразу — не длиннее 400 символов.",
  INVALID_QUERY:
    "Яндекс не смог обработать эту формулировку. Попробуйте сделать запрос короче или изменить его.",
};

export function wordstatClientErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return WORDSTAT_ERROR_MESSAGES.UPSTREAM_ERROR;
  }

  const record = payload as { error?: unknown; code?: unknown };
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }

  const code = record.code;
  if (
    typeof code === "string" &&
    Object.prototype.hasOwnProperty.call(WORDSTAT_ERROR_MESSAGES, code)
  ) {
    return WORDSTAT_ERROR_MESSAGES[code as WordstatErrorCode];
  }

  return WORDSTAT_ERROR_MESSAGES.UPSTREAM_ERROR;
}

export function wordstatError(
  code: WordstatErrorCode,
): WordstatErrorResult {
  return {
    ok: false,
    error: {
      code,
      message: WORDSTAT_ERROR_MESSAGES[code],
    },
  };
}

export function wordstatHttpStatus(code: WordstatErrorCode): number {
  switch (code) {
    case "INVALID_PHRASE":
      return 400;
    case "INVALID_QUERY":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "WORDSTAT_DISABLED":
    case "NOT_CONFIGURED":
      return 503;
    case "TIMEOUT":
    case "UPSTREAM_ERROR":
      return 502;
    case "NO_RESULTS":
      return 200;
    default:
      return 502;
  }
}

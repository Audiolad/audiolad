import type { PrimaryQueryAiErrorCode } from "@/lib/seo/primary-query-suggestions/types";

export const PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY =
  "Не удалось автоматически подобрать другую формулировку. Попробуйте написать поисковый запрос своими словами.";

export const PRIMARY_QUERY_AI_ERROR_MESSAGES: Record<
  PrimaryQueryAiErrorCode,
  string
> = {
  AI_DISABLED: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  NOT_CONFIGURED: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  UNSUPPORTED_PROVIDER: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  RATE_LIMITED: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  TIMEOUT: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  PROVIDER_ERROR: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  INVALID_OUTPUT: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  INVALID_INPUT: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
};

export function primaryQueryAiHttpStatus(code: PrimaryQueryAiErrorCode): number {
  switch (code) {
    case "INVALID_INPUT":
    case "INVALID_OUTPUT":
      return 400;
    case "RATE_LIMITED":
      return 429;
    case "AI_DISABLED":
    case "NOT_CONFIGURED":
    case "UNSUPPORTED_PROVIDER":
      return 503;
    case "TIMEOUT":
    case "PROVIDER_ERROR":
    default:
      return 502;
  }
}

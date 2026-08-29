import type {
  ProductSeoAiErrorCode,
  ProductSeoAiErrorResult,
} from "@/lib/seo/product-autofill/types";

export const PRODUCT_SEO_AI_ERROR_MESSAGE =
  "Не удалось подготовить SEO. Вы можете заполнить поля вручную или попробовать ещё раз позже.";

export const PRODUCT_SEO_AI_ERROR_MESSAGES: Record<
  ProductSeoAiErrorCode,
  string
> = {
  AI_DISABLED: PRODUCT_SEO_AI_ERROR_MESSAGE,
  NOT_CONFIGURED: PRODUCT_SEO_AI_ERROR_MESSAGE,
  RATE_LIMITED: "Слишком много попыток подряд. Попробуйте немного позже.",
  TIMEOUT: PRODUCT_SEO_AI_ERROR_MESSAGE,
  PROVIDER_ERROR: PRODUCT_SEO_AI_ERROR_MESSAGE,
  INVALID_OUTPUT: PRODUCT_SEO_AI_ERROR_MESSAGE,
  INVALID_PRIMARY: "Сначала выберите основной поисковый запрос.",
  MISSING_PRIMARY: "Сначала выберите основной поисковый запрос.",
  INVALID_STYLE_PROFILE: "Некорректные настройки стиля текста.",
};

export function productSeoAiError(
  code: ProductSeoAiErrorCode,
  issues?: string[],
): ProductSeoAiErrorResult {
  return {
    ok: false,
    error: {
      code,
      message: PRODUCT_SEO_AI_ERROR_MESSAGES[code],
      ...(issues && issues.length > 0 ? { issues } : {}),
    },
  };
}

export function productSeoAiHttpStatus(code: ProductSeoAiErrorCode): number {
  switch (code) {
    case "INVALID_PRIMARY":
    case "MISSING_PRIMARY":
    case "INVALID_STYLE_PROFILE":
    case "INVALID_OUTPUT":
      return 400;
    case "RATE_LIMITED":
      return 429;
    case "AI_DISABLED":
    case "NOT_CONFIGURED":
      return 503;
    case "TIMEOUT":
    case "PROVIDER_ERROR":
    default:
      return 502;
  }
}

import type {
  ProductSeoAiErrorCode,
  ProductSeoAiErrorResult,
  ProductSeoInvalidOutputDiagnostic,
} from "@/lib/seo/product-autofill/types";
import { normalizeProductSeoValidationIssues } from "@/lib/seo/product-autofill/validate";

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
  code: Exclude<ProductSeoAiErrorCode, "INVALID_OUTPUT">,
): ProductSeoAiErrorResult {
  return {
    ok: false,
    error: {
      code,
      message: PRODUCT_SEO_AI_ERROR_MESSAGES[code],
    },
  };
}

export function productSeoAiInvalidOutputError(
  diagnostic: ProductSeoInvalidOutputDiagnostic,
): ProductSeoAiErrorResult {
  const normalizedDiagnostic: ProductSeoInvalidOutputDiagnostic =
    diagnostic.stage === "provider_generate"
      ? diagnostic
      : diagnostic.stage === "provider_repair"
        ? {
            ...diagnostic,
            generateIssues: normalizeProductSeoValidationIssues(
              diagnostic.generateIssues,
            ),
          }
        : diagnostic.stage === "validation_repair"
          ? {
            ...diagnostic,
            generateIssues: normalizeProductSeoValidationIssues(
              diagnostic.generateIssues,
            ),
            repairIssues: normalizeProductSeoValidationIssues(
              diagnostic.repairIssues,
            ),
          }
          : diagnostic.stage === "validation_final_faq_repair"
            ? {
              ...diagnostic,
              generateIssues: normalizeProductSeoValidationIssues(
                diagnostic.generateIssues,
              ),
              repairIssues: normalizeProductSeoValidationIssues(
                diagnostic.repairIssues,
              ),
              finalFaqRepairIssues: normalizeProductSeoValidationIssues(
                diagnostic.finalFaqRepairIssues,
              ),
            }
            : {
              ...diagnostic,
              generateIssues: normalizeProductSeoValidationIssues(
                diagnostic.generateIssues,
              ),
              repairIssues: normalizeProductSeoValidationIssues(
                diagnostic.repairIssues,
              ),
              finalFaqRepairIssues: normalizeProductSeoValidationIssues(
                diagnostic.finalFaqRepairIssues,
              ),
              deterministicFaqFallbackIssues: normalizeProductSeoValidationIssues(
                diagnostic.deterministicFaqFallbackIssues,
              ),
            };

  return {
    ok: false,
    error: {
      code: "INVALID_OUTPUT",
      message: PRODUCT_SEO_AI_ERROR_MESSAGES.INVALID_OUTPUT,
      diagnostic: normalizedDiagnostic,
    },
  };
}

export function classifyProductSeoAiHttpError(
  status: number | null,
  requestError?: "timeout" | "network",
): Exclude<ProductSeoAiErrorCode, "INVALID_OUTPUT"> {
  if (requestError === "timeout") {
    return "TIMEOUT";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  return "PROVIDER_ERROR";
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

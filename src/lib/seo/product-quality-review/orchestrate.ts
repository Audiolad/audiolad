import { productSeoAiError } from "@/lib/seo/product-autofill/errors";
import type { ProductSeoAiErrorResult } from "@/lib/seo/product-autofill/types";
import { assertAuthorProductQualityReviewEnabled } from "@/lib/seo/product-quality-review/beta";
import { runProductQualityReviewModel } from "@/lib/seo/product-quality-review/provider";
import { reconcileProductQualityReviewResult } from "@/lib/seo/product-quality-review/reconcile";
import { buildProductQualityReviewSignals } from "@/lib/seo/product-quality-review/signals";
import type {
  ProductQualityReviewRequest,
  ProductQualityReviewResult,
} from "@/lib/seo/product-quality-review/types";
import {
  parseProductQualityReviewRequest,
  parseProductQualityReviewResult,
} from "@/lib/seo/product-quality-review/validate";

export {
  parseProductQualityReviewRequest,
  parseProductQualityReviewResult,
};

export type ProductQualityReviewOrchestrateResult =
  | { ok: true; result: ProductQualityReviewResult }
  | ProductSeoAiErrorResult
  | {
      ok: false;
      error: {
        code:
          | "invalid_request"
          | "missing_primary"
          | "product_quality_review_beta_disabled";
        message: string;
      };
    };

export async function reviewProductTextQuality(
  body: unknown,
  options?: Parameters<typeof runProductQualityReviewModel>[0]["options"],
): Promise<ProductQualityReviewOrchestrateResult> {
  const parsed = parseProductQualityReviewRequest(body);
  if (!parsed.ok) {
    if (parsed.code === "missing_primary") {
      return {
        ok: false,
        error: {
          code: "missing_primary",
          message: "Сначала выберите основной поисковый запрос.",
        },
      };
    }
    return {
      ok: false,
      error: { code: "invalid_request", message: "Некорректный запрос." },
    };
  }

  try {
    assertAuthorProductQualityReviewEnabled(parsed.request.authorId);
  } catch {
    return {
      ok: false,
      error: {
        code: "product_quality_review_beta_disabled",
        message: "Проверка текстов доступна только в закрытой бете.",
      },
    };
  }

  return reviewProductTextQualityForRequest(parsed.request, options);
}

export async function reviewProductTextQualityForRequest(
  request: ProductQualityReviewRequest,
  options?: Parameters<typeof runProductQualityReviewModel>[0]["options"],
): Promise<ProductQualityReviewOrchestrateResult> {
  const pkg = {
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    seoPrimaryQuery: request.seoPrimaryQuery,
    seoSecondaryQueries: request.seoSecondaryQueries,
    seoTitle: request.seoTitle,
    seoDescription: request.seoDescription,
    usageItems: request.usageItems,
    faqItems: request.faqItems,
  };
  const signals = buildProductQualityReviewSignals(pkg);
  const model = await runProductQualityReviewModel({
    package: pkg,
    signals,
    options,
  });
  if (!model.ok) {
    return model;
  }
  return {
    ok: true,
    result: reconcileProductQualityReviewResult(model.result, signals),
  };
}

/** Test helper: force a parsed fixture through the same validator path. */
export function coerceProductQualityReviewFixture(
  value: unknown,
): ProductQualityReviewResult | null {
  return parseProductQualityReviewResult(value);
}

export function failOpenProductQualityReview(): ProductSeoAiErrorResult {
  return productSeoAiError("PROVIDER_ERROR");
}

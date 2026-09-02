import type { ProductSeoStyleProfile } from "@/lib/seo/product-autofill/style-profile";

export const PRODUCT_SEO_AI_DEFAULT_PROVIDER = "openai";
export const PRODUCT_SEO_AI_DEFAULT_MODEL = "gpt-5.4-mini";
export const PRODUCT_SEO_AI_TIMEOUT_MS = 12_000;
export const PRODUCT_SEO_AI_ORIGIN = "https://api.openai.com";
export const PRODUCT_SEO_AI_RESPONSES_PATH = "/v1/responses";
export const PRODUCT_SEO_AI_RESPONSES_URL = `${PRODUCT_SEO_AI_ORIGIN}${PRODUCT_SEO_AI_RESPONSES_PATH}`;
export const PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS = 3000;
export const PRODUCT_SEO_AI_STORE = false;

export const PRODUCT_SEO_YANDEX_AI_DEFAULT_MODEL = "yandexgpt-lite";
export const PRODUCT_SEO_YANDEX_AI_ORIGIN = "https://llm.api.cloud.yandex.net";
export const PRODUCT_SEO_YANDEX_AI_COMPLETION_PATH =
  "/foundationModels/v1/completion";
export const PRODUCT_SEO_YANDEX_AI_COMPLETION_URL = `${PRODUCT_SEO_YANDEX_AI_ORIGIN}${PRODUCT_SEO_YANDEX_AI_COMPLETION_PATH}`;

export type ProductSeoAiProviderName = "openai" | "yandex";
export type ProductSeoAiResolvedProvider = ProductSeoAiProviderName | "unknown";

export const PRODUCT_SEO_USAGE_MIN = 3;
export const PRODUCT_SEO_USAGE_MAX = 3;
export const PRODUCT_SEO_FAQ_GENERATED_COUNT = 3;
export const PRODUCT_SEO_TITLE_SOFT_MIN = 50;
export const PRODUCT_SEO_TITLE_SOFT_MAX = 70;
export const PRODUCT_SEO_DESCRIPTION_SOFT_MIN = 120;
export const PRODUCT_SEO_DESCRIPTION_SOFT_MAX = 180;

export type ProductSeoGenerateMode = "full" | "field";

export type ProductSeoGenerateField =
  | "title"
  | "description"
  | "faq"
  | "usage";

export type ProductSeoFaqDraft = {
  question: string;
  answer: string;
  anchor: string;
};

export type ProductSeoUsageDraft = {
  content: string;
};

export type ProductSeoAutofillDraft = {
  seoSecondaryQueries: string[];
  seoTitle: string;
  seoDescription: string;
  usageItems: ProductSeoUsageDraft[];
  faqItems: ProductSeoFaqDraft[];
};

export type ProductSeoAutofillRequest = {
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
  seoPrimaryQuery: string;
  /** Author-entered phrases preserved by autofill after legacy-safe normalization. */
  seoSecondaryQueries?: string[];
  usageItems?: string[];
  styleProfile?: ProductSeoStyleProfile;
  mode?: ProductSeoGenerateMode;
  fields?: ProductSeoGenerateField[];
};

export type ProductSeoAiRawDraft = {
  seoTitle: string;
  seoDescription: string;
  usageItems: ProductSeoUsageDraft[];
  faqItems: ProductSeoFaqDraft[];
};

export type ProductSeoAccordionBadgeKind = "recommend" | "partial" | "ready";

export type ProductSeoAiErrorCode =
  | "AI_DISABLED"
  | "NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_OUTPUT"
  | "INVALID_PRIMARY"
  | "MISSING_PRIMARY"
  | "INVALID_STYLE_PROFILE";

export type ProductSeoInvalidOutputDiagnostic =
  | {
      stage: "provider_generate";
    }
  | {
      stage: "provider_repair";
      /** Category-only issues from the initial validation; never generated or user-provided text. */
      generateIssues: string[];
    }
  | {
      stage: "validation_repair";
      /** Category-only issues from the initial validation; never generated or user-provided text. */
      generateIssues: string[];
      /** Category-only issues from the repaired draft validation; never generated or user-provided text. */
      repairIssues: string[];
    }
  | {
      /** The safe local finalizer could not resolve all remaining issues. */
      stage: "validation_finalizer";
      /** Category-only issues from the initial validation; never generated or user-provided text. */
      generateIssues: string[];
      /** Category-only issues from the first repaired draft validation; never generated or user-provided text. */
      repairIssues: string[];
      /** Category-only issues after safe local finalization; never generated or user-provided text. */
      finalizerIssues: string[];
    }
  | {
      /** The generic third provider repair and its final safe pass were invalid. */
      stage: "validation_third_repair";
      /** Category-only issues from the initial validation; never generated or user-provided text. */
      generateIssues: string[];
      /** Category-only issues from the first repaired draft validation; never generated or user-provided text. */
      repairIssues: string[];
      /** Category-only issues after the first safe local finalization; never generated or user-provided text. */
      finalizerIssues: string[];
      /** Category-only issues after the generic third provider repair and final safe pass; never generated or user-provided text. */
      thirdRepairIssues: string[];
    };

export type ProductSeoAiErrorResult = {
  ok: false;
  error:
    | {
        code: Exclude<ProductSeoAiErrorCode, "INVALID_OUTPUT">;
        message: string;
      }
    | {
        code: "INVALID_OUTPUT";
        message: string;
        diagnostic: ProductSeoInvalidOutputDiagnostic;
      };
};

export type ProductSeoAiSuccessResult = {
  ok: true;
  data: ProductSeoAutofillDraft;
};

export type ProductSeoAiResult = ProductSeoAiSuccessResult | ProductSeoAiErrorResult;

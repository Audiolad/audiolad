export const PRODUCT_SEO_AI_DEFAULT_MODEL = "gpt-4o-mini";
export const PRODUCT_SEO_AI_TIMEOUT_MS = 12_000;
export const PRODUCT_SEO_AI_ORIGIN = "https://api.openai.com";
export const PRODUCT_SEO_AI_RESPONSES_PATH = "/v1/responses";
export const PRODUCT_SEO_AI_RESPONSES_URL = `${PRODUCT_SEO_AI_ORIGIN}${PRODUCT_SEO_AI_RESPONSES_PATH}`;

export const PRODUCT_SEO_SECONDARY_MIN = 3;
export const PRODUCT_SEO_SECONDARY_MAX = 5;
export const PRODUCT_SEO_USAGE_MIN = 3;
export const PRODUCT_SEO_USAGE_MAX = 5;
export const PRODUCT_SEO_FAQ_GENERATED_COUNT = 3;
export const PRODUCT_SEO_TITLE_SOFT_MIN = 50;
export const PRODUCT_SEO_TITLE_SOFT_MAX = 70;
export const PRODUCT_SEO_DESCRIPTION_SOFT_MIN = 120;
export const PRODUCT_SEO_DESCRIPTION_SOFT_MAX = 180;
export const PRODUCT_SEO_ABOUT_SOFT_MIN = 500;
export const PRODUCT_SEO_ABOUT_SOFT_MAX = 1500;

export type ProductSeoGenerateMode = "full" | "field";

export type ProductSeoGenerateField =
  | "title"
  | "description"
  | "about"
  | "faq"
  | "usage"
  | "secondaries";

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
  seoAbout: string;
  usageItems: ProductSeoUsageDraft[];
  faqItems: ProductSeoFaqDraft[];
};

export type ProductSeoAutofillRequest = {
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
  seoPrimaryQuery: string;
  usageItems?: string[];
  mode?: ProductSeoGenerateMode;
  fields?: ProductSeoGenerateField[];
};

export type ProductSeoAiRawDraft = {
  secondaryQueries: string[];
  seoTitle: string;
  seoDescription: string;
  seoAbout: string;
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
  | "MISSING_PRIMARY";

export type ProductSeoAiErrorResult = {
  ok: false;
  error: {
    code: ProductSeoAiErrorCode;
    message: string;
    issues?: string[];
  };
};

export type ProductSeoAiSuccessResult = {
  ok: true;
  data: ProductSeoAutofillDraft;
};

export type ProductSeoAiResult = ProductSeoAiSuccessResult | ProductSeoAiErrorResult;

export const PRODUCT_QUALITY_REVIEW_STATUSES = [
  "green",
  "yellow",
  "red",
] as const;

export type ProductQualityReviewStatus =
  (typeof PRODUCT_QUALITY_REVIEW_STATUSES)[number];

export const PRODUCT_QUALITY_REVIEW_ISSUE_SEVERITIES = [
  "warning",
  "critical",
] as const;

export type ProductQualityReviewIssueSeverity =
  (typeof PRODUCT_QUALITY_REVIEW_ISSUE_SEVERITIES)[number];

export const PRODUCT_QUALITY_REVIEW_FIELDS = [
  "title",
  "subtitle",
  "description",
  "seoTitle",
  "seoDescription",
  "usage",
  "faq",
  "whole_package",
] as const;

export type ProductQualityReviewField =
  (typeof PRODUCT_QUALITY_REVIEW_FIELDS)[number];

export type ProductQualityReviewFaqItem = {
  question: string;
  answer: string;
};

export type ProductQualityReviewPackage = {
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
  seoPrimaryQuery: string;
  seoSecondaryQueries: string[];
  seoTitle: string;
  seoDescription: string;
  usageItems: string[];
  faqItems: ProductQualityReviewFaqItem[];
};

export type ProductQualityReviewIssue = {
  severity: ProductQualityReviewIssueSeverity;
  field: ProductQualityReviewField;
  message: string;
  recommendation: string;
};

export type ProductQualityReviewResult = {
  status: ProductQualityReviewStatus;
  summary: string;
  issues: ProductQualityReviewIssue[];
  positiveNotes: string[];
};

export type ProductQualityReviewRequest = ProductQualityReviewPackage & {
  authorId: string;
};

export type ProductQualityReviewFieldCounts = {
  title: number;
  subtitle: number;
  description: number;
  seoTitle: number;
  seoDescription: number;
  usage: number;
  faq: number;
  total: number;
};

export type ProductQualityReviewPrimaryPresence = {
  title: boolean;
  subtitle: boolean;
  description: boolean;
  seoTitle: boolean;
  seoDescription: boolean;
  usage: boolean;
  faq: boolean;
};

export type ProductQualityReviewSecondaryCoverageSignals = {
  secondary1?: string;
  secondary2?: string;
  secondary1UsageCovered: boolean;
  secondary2FaqCovered: boolean;
};

export type ProductQualityReviewFieldStructuralStuffing = {
  material: boolean;
  exactPrimaryCount: number;
  neighboringSentenceRepeats: boolean;
  keywordListPattern: boolean;
  nearDuplicateChain: boolean;
};

export type ProductQualityReviewStructuralStuffing = {
  material: boolean;
  description: ProductQualityReviewFieldStructuralStuffing;
  seoDescription: ProductQualityReviewFieldStructuralStuffing;
  usage: ProductQualityReviewFieldStructuralStuffing;
  faq: ProductQualityReviewFieldStructuralStuffing;
};

export type ProductQualityReviewSignals = {
  primaryExactByField: ProductQualityReviewFieldCounts;
  /** Literal normalized phrase only. `false` is not semantic absence. */
  primaryPresentIn: ProductQualityReviewPrimaryPresence;
  /**
   * Exact phrase or a close same-order morphological variant.
   * Diagnostic only — never a green/yellow/red verdict by itself.
   */
  primaryThemePresentIn: ProductQualityReviewPrimaryPresence;
  titleEqualsPrimary: boolean;
  primaryOveruseSoft: boolean;
  secondaryCount: number;
  secondaryCoverage: ProductQualityReviewSecondaryCoverageSignals;
  emptyOptionalFields: string[];
  structuralStuffing: ProductQualityReviewStructuralStuffing;
};

export const PRODUCT_QUALITY_REVIEW_ISSUES_MAX = 5;
export const PRODUCT_QUALITY_REVIEW_POSITIVE_NOTES_MAX = 3;
export const PRODUCT_QUALITY_REVIEW_SCHEMA_NAME =
  "audiolad_product_quality_review_v1";

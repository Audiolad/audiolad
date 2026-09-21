import type { ProductQualityReviewPackage } from "@/lib/seo/product-quality-review/types";

/** Stable client/server fingerprint of the analyzed text package. No hashing crypto required. */
export function buildProductQualityReviewFingerprint(
  input: ProductQualityReviewPackage,
): string {
  const payload = {
    title: input.title.trim(),
    subtitle: input.subtitle.trim(),
    description: input.description.trim(),
    productKind: input.productKind.trim(),
    seoPrimaryQuery: input.seoPrimaryQuery.trim(),
    seoSecondaryQueries: input.seoSecondaryQueries.map((item) => item.trim()),
    seoTitle: input.seoTitle.trim(),
    seoDescription: input.seoDescription.trim(),
    usageItems: input.usageItems.map((item) => item.trim()),
    faqItems: input.faqItems.map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    })),
  };
  return JSON.stringify(payload);
}

export function isProductQualityReviewFingerprintCurrent(
  current: ProductQualityReviewPackage,
  reviewedFingerprint: string | null | undefined,
): boolean {
  if (!reviewedFingerprint) return false;
  return buildProductQualityReviewFingerprint(current) === reviewedFingerprint;
}

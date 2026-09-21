import {
  countExactNormalizedSeoPhrase,
  evaluatePrimaryQueryOveruse,
} from "@/lib/seo/primary-query-overuse";
import { normalizeSeoPhrase } from "@/lib/seo/product-metadata";
import type {
  ProductQualityReviewFieldCounts,
  ProductQualityReviewPackage,
  ProductQualityReviewSignals,
} from "@/lib/seo/product-quality-review/types";

/**
 * Deterministic category facts for the model and tests.
 * Never used alone as the final green/yellow/red verdict.
 */
export function buildProductQualityReviewSignals(
  input: ProductQualityReviewPackage,
): ProductQualityReviewSignals {
  const primary = input.seoPrimaryQuery.trim();
  const usageJoined = input.usageItems.join("\n");
  const faqJoined = input.faqItems
    .map((item) => `${item.question}\n${item.answer}`)
    .join("\n");

  const byField: ProductQualityReviewFieldCounts = {
    title: countExactNormalizedSeoPhrase(input.title, primary),
    subtitle: countExactNormalizedSeoPhrase(input.subtitle, primary),
    description: countExactNormalizedSeoPhrase(input.description, primary),
    seoTitle: countExactNormalizedSeoPhrase(input.seoTitle, primary),
    seoDescription: countExactNormalizedSeoPhrase(
      input.seoDescription,
      primary,
    ),
    usage: countExactNormalizedSeoPhrase(usageJoined, primary),
    faq: countExactNormalizedSeoPhrase(faqJoined, primary),
    total: 0,
  };
  byField.total =
    byField.title +
    byField.subtitle +
    byField.description +
    byField.seoTitle +
    byField.seoDescription +
    byField.usage +
    byField.faq;

  const overuse = evaluatePrimaryQueryOveruse({
    primaryQuery: primary,
    productTitle: input.title,
    usageItems: input.usageItems.map((content) => ({ content })),
    faqItems: input.faqItems,
  });

  const emptyOptionalFields: string[] = [];
  if (!input.subtitle.trim()) emptyOptionalFields.push("subtitle");
  if (!input.seoTitle.trim()) emptyOptionalFields.push("seoTitle");
  if (!input.seoDescription.trim()) emptyOptionalFields.push("seoDescription");
  if (input.seoSecondaryQueries.every((item) => !item.trim())) {
    emptyOptionalFields.push("seoSecondaryQueries");
  }
  if (input.usageItems.every((item) => !item.trim())) {
    emptyOptionalFields.push("usageItems");
  }
  if (
    input.faqItems.every(
      (item) => !item.question.trim() && !item.answer.trim(),
    )
  ) {
    emptyOptionalFields.push("faqItems");
  }

  return {
    primaryExactByField: byField,
    titleEqualsPrimary:
      Boolean(primary) &&
      normalizeSeoPhrase(input.title) === normalizeSeoPhrase(primary),
    primaryOveruseSoft: overuse.primaryOveruse,
    secondaryCount: input.seoSecondaryQueries.filter((item) => item.trim())
      .length,
    emptyOptionalFields,
  };
}

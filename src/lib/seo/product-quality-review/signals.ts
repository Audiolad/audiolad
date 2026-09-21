import {
  countExactNormalizedSeoPhrase,
  evaluatePrimaryQueryOveruse,
} from "@/lib/seo/primary-query-overuse";
import { normalizeSeoPhrase } from "@/lib/seo/product-metadata";
import {
  evaluateSecondaryQueryCoverage,
  selectActiveSecondaryQueries,
} from "@/lib/seo/secondary-query-coverage";
import { evaluateProductStructuralStuffing } from "@/lib/seo/product-quality-review/structural-stuffing";
import type {
  ProductQualityReviewFieldCounts,
  ProductQualityReviewPackage,
  ProductQualityReviewPrimaryPresence,
  ProductQualityReviewSignals,
} from "@/lib/seo/product-quality-review/types";

/**
 * Deterministic category facts for the model and tests.
 * Never used alone as the final green/yellow/red verdict.
 * Traffic light is a balance scale: underoptimization → balanced → overoptimization.
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

  const primaryPresentIn: ProductQualityReviewPrimaryPresence = {
    title: byField.title > 0,
    subtitle: byField.subtitle > 0,
    description: byField.description > 0,
    seoTitle: byField.seoTitle > 0,
    seoDescription: byField.seoDescription > 0,
    usage: byField.usage > 0,
    faq: byField.faq > 0,
  };

  const overuse = evaluatePrimaryQueryOveruse({
    primaryQuery: primary,
    productTitle: input.title,
    usageItems: input.usageItems.map((content) => ({ content })),
    faqItems: input.faqItems,
  });

  const activeSecondary = selectActiveSecondaryQueries(
    input.seoSecondaryQueries,
  );
  const secondaryCoverageRaw = evaluateSecondaryQueryCoverage({
    primaryQuery: primary,
    activeSecondaryQueries: activeSecondary,
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

  const structuralStuffing = evaluateProductStructuralStuffing({
    description: input.description,
    seoDescription: input.seoDescription,
    usageItems: input.usageItems,
    faqItems: input.faqItems,
    seoPrimaryQuery: primary,
    seoSecondaryQueries: input.seoSecondaryQueries,
  });

  return {
    primaryExactByField: byField,
    primaryPresentIn,
    titleEqualsPrimary:
      Boolean(primary) &&
      normalizeSeoPhrase(input.title) === normalizeSeoPhrase(primary),
    primaryOveruseSoft: overuse.primaryOveruse,
    secondaryCount: activeSecondary.length,
    secondaryCoverage: {
      ...(activeSecondary[0] ? { secondary1: activeSecondary[0] } : {}),
      ...(activeSecondary[1] ? { secondary2: activeSecondary[1] } : {}),
      secondary1UsageCovered: secondaryCoverageRaw.secondary1UsageCovered,
      secondary2FaqCovered: secondaryCoverageRaw.secondary2FaqCovered,
    },
    emptyOptionalFields,
    structuralStuffing,
  };
}

import { normalizeSeoPhrase } from "@/lib/seo/product-metadata";

export type PrimaryQueryOveruseFaqLocation = {
  index: number;
  field: "question" | "answer";
};

export type PrimaryQueryOveruseInput = {
  primaryQuery: string;
  productTitle: string;
  usageItems: ReadonlyArray<{ content: string }>;
  faqItems: ReadonlyArray<{ question: string; answer: string }>;
};

export type PrimaryQueryOveruse = {
  primaryOveruse: boolean;
  titleEqualsPrimary: boolean;
  overusedUsageIndexes: number[];
  overusedFaqLocations: PrimaryQueryOveruseFaqLocation[];
};

function countExactNormalizedSeoPhrase(haystack: string, phrase: string): number {
  const source = normalizeSeoPhrase(haystack);
  const needle = normalizeSeoPhrase(phrase);
  if (!needle || !source) {
    return 0;
  }

  let count = 0;
  let from = 0;
  while (from <= source.length - needle.length) {
    const index = source.indexOf(needle, from);
    if (index === -1) {
      return count;
    }
    count += 1;
    from = index + needle.length;
  }
  return count;
}

function fieldHasExactPrimary(text: string, primaryQuery: string): boolean {
  return countExactNormalizedSeoPhrase(text, primaryQuery) > 0;
}

/**
 * Soft quality signal: exact normalized primary (and the product title when
 * it normalizes equal to the primary) outside seoTitle, seoDescription and
 * Q1.question. Related words are ignored; this is not a hard validator.
 */
export function evaluatePrimaryQueryOveruse(
  input: PrimaryQueryOveruseInput,
): PrimaryQueryOveruse {
  const primary = input.primaryQuery.trim();
  const titleEqualsPrimary =
    Boolean(primary) &&
    Boolean(input.productTitle.trim()) &&
    normalizeSeoPhrase(input.productTitle) === normalizeSeoPhrase(primary);

  if (!primary) {
    return {
      primaryOveruse: false,
      titleEqualsPrimary: false,
      overusedUsageIndexes: [],
      overusedFaqLocations: [],
    };
  }

  const overusedUsageIndexes: number[] = [];
  input.usageItems.forEach((item, index) => {
    if (fieldHasExactPrimary(item.content, primary)) {
      overusedUsageIndexes.push(index);
    }
  });

  const overusedFaqLocations: PrimaryQueryOveruseFaqLocation[] = [];
  input.faqItems.forEach((item, index) => {
    if (index !== 0 && fieldHasExactPrimary(item.question, primary)) {
      overusedFaqLocations.push({ index, field: "question" });
    }
    if (fieldHasExactPrimary(item.answer, primary)) {
      overusedFaqLocations.push({ index, field: "answer" });
    }
  });

  return {
    primaryOveruse:
      overusedUsageIndexes.length > 0 || overusedFaqLocations.length > 0,
    titleEqualsPrimary,
    overusedUsageIndexes,
    overusedFaqLocations,
  };
}


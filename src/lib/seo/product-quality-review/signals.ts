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

const THEME_STOP_WORDS = new Set([
  "в",
  "во",
  "на",
  "для",
  "с",
  "со",
  "и",
  "или",
  "к",
  "ко",
  "по",
  "от",
  "из",
  "о",
  "об",
  "обо",
  "при",
  "за",
  "до",
  "не",
  "это",
  "как",
  "что",
  "чтобы",
  "а",
  "но",
  "же",
  "ли",
  "бы",
  "то",
]);

/** Longest-first. Mirrors secondary-query coverage so case endings collapse. */
const THEME_RUSSIAN_SUFFIXES = [
  "иями",
  "ями",
  "ами",
  "ениями",
  "аниями",
  "ениях",
  "аниях",
  "ением",
  "анием",
  "ения",
  "ания",
  "ение",
  "ание",
  "ого",
  "его",
  "ому",
  "ему",
  "ыми",
  "ими",
  "ых",
  "их",
  "ая",
  "яя",
  "ое",
  "ее",
  "ые",
  "ие",
  "ой",
  "ей",
  "ую",
  "юю",
  "ов",
  "ев",
  "ам",
  "ям",
  "ах",
  "ях",
  "ом",
  "ем",
  "ию",
  "ью",
  "ий",
  "ый",
  "ою",
  "ею",
  "ии",
  "а",
  "я",
  "у",
  "ю",
  "ы",
  "и",
  "е",
  "о",
];

function stemThemeToken(word: string): string {
  if (word.length <= 3) return word;
  for (const suffix of THEME_RUSSIAN_SUFFIXES) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function themeTokens(value: string): string[] {
  const normalized = normalizeSeoPhrase(value)
    .replace(/ё/g, "е")
    .replace(/[‐‑‒–—―]/g, "-");
  if (!normalized) return [];
  return normalized
    .split(/[^\p{L}\p{N}-]+/u)
    .flatMap((token) => token.split("-"))
    .map((token) => token.trim())
    .filter(Boolean);
}

function themeStems(value: string): string[] {
  return themeTokens(value).map(stemThemeToken);
}

function themeContentStems(value: string): string[] {
  return themeStems(value).filter(
    (stem) => stem.length >= 3 && !THEME_STOP_WORDS.has(stem),
  );
}

/** Inflection of the same stem, not a longer derived word. */
function themeStemsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const min = Math.min(left.length, right.length);
  const max = Math.max(left.length, right.length);
  if (min < 4 || max - min > 2) return false;
  return left.startsWith(right) || right.startsWith(left);
}

function containsOrderedTheme(textStems: string[], required: string[]): boolean {
  const maxGap = 4;
  for (let start = 0; start < textStems.length; start += 1) {
    if (!themeStemsMatch(textStems[start] ?? "", required[0] ?? "")) continue;
    let from = start + 1;
    let matched = true;
    for (let index = 1; index < required.length; index += 1) {
      const end = Math.min(textStems.length, from + maxGap);
      let found = -1;
      for (let cursor = from; cursor < end; cursor += 1) {
        if (themeStemsMatch(textStems[cursor] ?? "", required[index] ?? "")) {
          found = cursor;
          break;
        }
      }
      if (found < 0) {
        matched = false;
        break;
      }
      from = found + 1;
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Exact normalized phrase, or the same content stems in order with Russian
 * case endings (музыка → музыку). Not a verdict and not a density score.
 */
export function textHasPrimaryTheme(text: string, primary: string): boolean {
  if (countExactNormalizedSeoPhrase(text, primary) > 0) return true;
  const required = themeContentStems(primary);
  if (required.length === 0 || !text.trim()) return false;
  return containsOrderedTheme(themeStems(text), required);
}

/**
 * Deterministic category facts for the model and tests.
 * Never used alone as the final green/yellow/red verdict.
 * Traffic light is a balance scale: underoptimization → balanced → overoptimization.
 * primaryPresentIn is literal exact match only.
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

  const primaryThemePresentIn: ProductQualityReviewPrimaryPresence = {
    title: textHasPrimaryTheme(input.title, primary),
    subtitle: textHasPrimaryTheme(input.subtitle, primary),
    description: textHasPrimaryTheme(input.description, primary),
    seoTitle: textHasPrimaryTheme(input.seoTitle, primary),
    seoDescription: textHasPrimaryTheme(input.seoDescription, primary),
    usage: textHasPrimaryTheme(usageJoined, primary),
    faq: textHasPrimaryTheme(faqJoined, primary),
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
    primaryThemePresentIn,
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

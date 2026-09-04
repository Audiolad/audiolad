import { AUTHOR_SEO_SECONDARY_ACTIVE_MAX } from "@/lib/author-products/limits";
import type { ListenOnlineFaqIntent } from "@/lib/seo/listen-online-faq-intent";
import type { PrimaryQueryOveruse } from "@/lib/seo/primary-query-overuse";

const COVERAGE_STOP_WORDS = new Set([
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

const RUSSIAN_SUFFIXES = [
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

export type SecondaryQueryCoverageInput = {
  primaryQuery: string;
  activeSecondaryQueries: readonly string[];
  usageItems: ReadonlyArray<{ content: string }>;
  faqItems: ReadonlyArray<{ question: string; answer: string }>;
};

export type SecondaryQueryCoverage = {
  secondary1UsageCovered: boolean;
  secondary2FaqCovered: boolean;
};

export type ProductSeoQualityRepairInput = SecondaryQueryCoverage &
  PrimaryQueryOveruse &
  ListenOnlineFaqIntent & {
    secondary1?: string;
    secondary2?: string;
  };

export function selectActiveSecondaryQueries(
  queries: readonly string[] | null | undefined,
): string[] {
  return (queries ?? [])
    .filter((query) => query.trim())
    .slice(0, AUTHOR_SEO_SECONDARY_ACTIVE_MAX);
}

export function isSecondaryCoverageComplete(
  coverage: SecondaryQueryCoverage,
  activeCount: number,
): boolean {
  if (activeCount <= 0) {
    return true;
  }
  if (activeCount === 1) {
    return coverage.secondary1UsageCovered;
  }
  return coverage.secondary1UsageCovered && coverage.secondary2FaqCovered;
}

function normalizeCoverageText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stemRussianToken(word: string): string {
  if (word.length <= 3) {
    return word;
  }

  for (const suffix of RUSSIAN_SUFFIXES) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }

  return word;
}

function coverageTokens(value: string): string[] {
  return normalizeCoverageText(value)
    .split(" ")
    .filter((word) => word.length > 2 && !COVERAGE_STOP_WORDS.has(word));
}

function coverageStems(value: string): string[] {
  return coverageTokens(value).map(stemRussianToken);
}

function stemsOverlap(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const min = Math.min(left.length, right.length);
  if (min < 4) {
    return false;
  }
  return left.startsWith(right) || right.startsWith(left);
}

function textContainsNormalizedPhrase(text: string, phrase: string): boolean {
  const needle = normalizeCoverageText(phrase);
  const source = normalizeCoverageText(text);
  return Boolean(needle) && source.includes(needle);
}

function textHasStem(textStems: readonly string[], stem: string): boolean {
  return textStems.some((candidate) => stemsOverlap(stem, candidate));
}

/**
 * Stems that belong to the secondary and are not already supplied by the
 * primary. Primary-shared stems may appear in generated copy, but they never
 * prove secondary coverage by themselves.
 */
export function distinctiveQueryStems(
  query: string,
  primaryQuery: string,
): string[] {
  const queryStems = coverageStems(query);
  if (!primaryQuery.trim()) {
    return queryStems;
  }

  const primaryStems = coverageStems(primaryQuery);
  return queryStems.filter(
    (stem) => !primaryStems.some((primary) => stemsOverlap(stem, primary)),
  );
}

function fallbackQueryCoverage(
  queryStems: readonly string[],
  textStems: readonly string[],
): boolean {
  if (!queryStems.length) {
    return false;
  }

  const hits = queryStems.filter((stem) => textHasStem(textStems, stem));
  if (queryStems.length <= 2) {
    return hits.length === queryStems.length;
  }

  return hits.length >= 2 && hits.length / queryStems.length >= 0.5;
}

function textCoversQuery(
  text: string,
  query: string,
  primaryQuery: string,
): boolean {
  if (!query.trim() || !text.trim()) {
    return false;
  }

  if (textContainsNormalizedPhrase(text, query)) {
    return true;
  }

  const textStems = coverageStems(text);
  if (!textStems.length) {
    return false;
  }

  const distinctiveStems = distinctiveQueryStems(query, primaryQuery);
  if (distinctiveStems.length > 0) {
    return distinctiveStems.some((stem) => textHasStem(textStems, stem));
  }

  return fallbackQueryCoverage(coverageStems(query), textStems);
}

export function evaluateSecondaryQueryCoverage(
  input: SecondaryQueryCoverageInput,
): SecondaryQueryCoverage {
  const active = selectActiveSecondaryQueries(input.activeSecondaryQueries);
  const primary = input.primaryQuery.trim();
  const usageTexts = input.usageItems.map((item) => item.content);
  const secondary2Slot = input.faqItems[1];
  const faqSlotTexts = secondary2Slot
    ? [secondary2Slot.question, secondary2Slot.answer]
    : [];

  const secondary1 = active[0] ?? "";
  const secondary2 = active[1] ?? "";

  return {
    secondary1UsageCovered: secondary1
      ? usageTexts.some((text) => textCoversQuery(text, secondary1, primary))
      : true,
    secondary2FaqCovered: secondary2
      ? faqSlotTexts.some((text) => textCoversQuery(text, secondary2, primary))
      : true,
  };
}

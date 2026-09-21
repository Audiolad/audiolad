import { countExactNormalizedSeoPhrase } from "@/lib/seo/primary-query-overuse";
import { normalizeSeoPhrase } from "@/lib/seo/product-metadata";

/**
 * Deterministic structural SEO-stuffing signals.
 * No percentage thresholds and no fixed "N% = red" scores.
 * Looks for query lists, near-duplicate chains, and neighboring repeats.
 */

const RU_STOPWORDS = new Set([
  "для",
  "и",
  "в",
  "на",
  "с",
  "по",
  "к",
  "от",
  "из",
  "а",
  "или",
  "чтобы",
  "как",
  "это",
  "the",
  "a",
  "an",
  "to",
  "of",
  "online",
  "слушать",
]);

export type FieldStructuralStuffing = {
  material: boolean;
  exactPrimaryCount: number;
  neighboringSentenceRepeats: boolean;
  keywordListPattern: boolean;
  nearDuplicateChain: boolean;
};

export type ProductStructuralStuffingSignals = {
  material: boolean;
  description: FieldStructuralStuffing;
  seoDescription: FieldStructuralStuffing;
  usage: FieldStructuralStuffing;
  faq: FieldStructuralStuffing;
};

function contentTokens(text: string): string[] {
  const normalized = normalizeSeoPhrase(text);
  if (!normalized) return [];
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !RU_STOPWORDS.has(token));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function sharesPrimaryCore(segment: string, primaryTokens: string[]): boolean {
  if (primaryTokens.length === 0) return false;
  const tokens = contentTokens(segment);
  if (tokens.length === 0) return false;
  const hit = primaryTokens.filter((token) => tokens.includes(token)).length;
  // Most of the distinctive primary tokens must appear.
  return hit >= Math.max(2, Math.ceil(primaryTokens.length * 0.7));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitListSegments(text: string): string[] {
  return text
    .split(/\s*[,;|/•·]\s*|\s+[—–-]\s+|\n+\s*[-•*]\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8 && part.length <= 120);
}

function hasNeighboringSentenceRepeats(
  text: string,
  primary: string,
): boolean {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return false;
  let streak = 0;
  let pairs = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    const hasPrimary =
      countExactNormalizedSeoPhrase(sentences[i] ?? "", primary) > 0;
    if (hasPrimary) {
      streak += 1;
      if (streak >= 2) pairs += 1;
      if (streak >= 3) return true;
    } else {
      streak = 0;
    }
  }
  return pairs >= 2;
}

function hasKeywordListPattern(
  text: string,
  primary: string,
  primaryTokens: string[],
  secondaryQueries: readonly string[],
): boolean {
  const segments = splitListSegments(text);
  if (segments.length < 4) return false;
  let queryLike = 0;
  for (const segment of segments) {
    const exact = countExactNormalizedSeoPhrase(segment, primary) > 0;
    const nearPrimary = sharesPrimaryCore(segment, primaryTokens);
    const nearSecondary = secondaryQueries.some((secondary) => {
      const secondaryTokens = contentTokens(secondary);
      return (
        countExactNormalizedSeoPhrase(segment, secondary) > 0 ||
        sharesPrimaryCore(segment, secondaryTokens)
      );
    });
    // Short list-like segments that echo the query family.
    if ((exact || nearPrimary || nearSecondary) && segment.split(/\s+/).length <= 12) {
      queryLike += 1;
    }
  }
  return queryLike >= 4;
}

function collectQueryLikePhrases(
  text: string,
  primary: string,
  primaryTokens: string[],
  secondaryQueries: readonly string[],
): string[] {
  const fromLists = splitListSegments(text);
  const fromSentences = splitSentences(text).filter((sentence) => {
    const words = sentence.trim().split(/\s+/).length;
    return sentence.length <= 140 && words <= 14;
  });
  const candidates = [...fromLists, ...fromSentences];
  const out: string[] = [];
  for (const candidate of candidates) {
    const exactPrimary = countExactNormalizedSeoPhrase(candidate, primary) > 0;
    const exactSecondary = secondaryQueries.some(
      (secondary) => countExactNormalizedSeoPhrase(candidate, secondary) > 0,
    );
    const wordCount = candidate.trim().split(/\s+/).length;
    const nearPrimary =
      wordCount <= 12 && sharesPrimaryCore(candidate, primaryTokens);
    const nearSecondary = secondaryQueries.some((secondary) => {
      const secondaryTokens = contentTokens(secondary);
      return (
        wordCount <= 12 &&
        secondaryTokens.length > 0 &&
        sharesPrimaryCore(candidate, secondaryTokens)
      );
    });
    if (exactPrimary || exactSecondary || nearPrimary || nearSecondary) {
      out.push(normalizeSeoPhrase(candidate));
    }
  }
  return out;
}

function hasNearDuplicateChain(
  text: string,
  primary: string,
  primaryTokens: string[],
  secondaryQueries: readonly string[],
): boolean {
  const phrases = collectQueryLikePhrases(
    text,
    primary,
    primaryTokens,
    secondaryQueries,
  );
  if (phrases.length < 3) return false;

  const unique = [...new Set(phrases)];
  let nearPairs = 0;
  for (let i = 0; i < unique.length; i += 1) {
    const leftTokens = contentTokens(unique[i] ?? "");
    for (let j = i + 1; j < unique.length; j += 1) {
      const rightTokens = contentTokens(unique[j] ?? "");
      const score = jaccard(leftTokens, rightTokens);
      // Near-duplicate SEO variants, not unrelated sentences.
      if (score >= 0.55 && leftTokens.length >= 2 && rightTokens.length >= 2) {
        nearPairs += 1;
      }
    }
  }
  return nearPairs >= 2 || unique.length >= 4;
}

function evaluateFieldStructuralStuffing(
  text: string,
  primary: string,
  secondaryQueries: readonly string[],
): FieldStructuralStuffing {
  const trimmed = text.trim();
  const primaryTokens = contentTokens(primary);
  if (!trimmed || !primary.trim() || primaryTokens.length === 0) {
    return {
      material: false,
      exactPrimaryCount: 0,
      neighboringSentenceRepeats: false,
      keywordListPattern: false,
      nearDuplicateChain: false,
    };
  }

  const exactPrimaryCount = countExactNormalizedSeoPhrase(trimmed, primary);
  const neighboringSentenceRepeats = hasNeighboringSentenceRepeats(
    trimmed,
    primary,
  );
  const keywordListPattern = hasKeywordListPattern(
    trimmed,
    primary,
    primaryTokens,
    secondaryQueries,
  );
  const nearDuplicateChain = hasNearDuplicateChain(
    trimmed,
    primary,
    primaryTokens,
    secondaryQueries,
  );

  // Structural patterns decide material stuffing. Exact multi-word primary
  // hammered 4+ times in one body field is also material (not a % threshold).
  const material =
    keywordListPattern ||
    nearDuplicateChain ||
    neighboringSentenceRepeats ||
    exactPrimaryCount >= 4;

  return {
    material,
    exactPrimaryCount,
    neighboringSentenceRepeats,
    keywordListPattern,
    nearDuplicateChain,
  };
}

export function evaluateProductStructuralStuffing(input: {
  description: string;
  seoDescription: string;
  usageItems: readonly string[];
  faqItems: ReadonlyArray<{ question: string; answer: string }>;
  seoPrimaryQuery: string;
  seoSecondaryQueries: readonly string[];
}): ProductStructuralStuffingSignals {
  const primary = input.seoPrimaryQuery.trim();
  const secondaries = input.seoSecondaryQueries
    .map((item) => item.trim())
    .filter(Boolean);

  const description = evaluateFieldStructuralStuffing(
    input.description,
    primary,
    secondaries,
  );
  const seoDescription = evaluateFieldStructuralStuffing(
    input.seoDescription,
    primary,
    secondaries,
  );
  const usage = evaluateFieldStructuralStuffing(
    input.usageItems.join("\n"),
    primary,
    secondaries,
  );
  const faq = evaluateFieldStructuralStuffing(
    input.faqItems
      .map((item) => `${item.question}\n${item.answer}`)
      .join("\n"),
    primary,
    secondaries,
  );

  return {
    material:
      description.material ||
      seoDescription.material ||
      usage.material ||
      faq.material,
    description,
    seoDescription,
    usage,
    faq,
  };
}

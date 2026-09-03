import type { ProductSeoAiRawDraft } from "@/lib/seo/product-autofill/types";

const RUSSIAN_NAME_QUOTE_PAIRS: readonly [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
];

function normalizeRussianNameQuotes(value: string): string {
  let normalized = value;
  for (const [openingQuote, closingQuote] of RUSSIAN_NAME_QUOTE_PAIRS) {
    const pattern = new RegExp(
      `${openingQuote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^${openingQuote}${closingQuote}\\n]*\\p{Script=Cyrillic}[^${openingQuote}${closingQuote}\\n]*)${closingQuote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "gu",
    );
    normalized = normalized.replace(pattern, "«$1»");
  }
  return normalized;
}

export function applyProductSeoRussianTypography(
  value: string,
  protectedPhrases: readonly string[] = [],
): string {
  const protectedParts = protectedPhrases
    .filter(Boolean)
    .map((phrase, index) => ({
      phrase,
      token: `\uE000${index}\uE001`,
    }));
  const protectedValue = protectedParts.reduce(
    (result, { phrase, token }) => result.replaceAll(phrase, token),
    value,
  );
  const normalized = normalizeRussianNameQuotes(protectedValue).replaceAll("—", "–");

  return protectedParts.reduce(
    (result, { phrase, token }) => result.replaceAll(token, phrase),
    normalized,
  );
}

/**
 * Applies presentation typography solely to AI-generated copy. Author-owned
 * request fields and FAQ anchors deliberately pass through unchanged.
 */
export function applyProductSeoDraftRussianTypography(
  draft: ProductSeoAiRawDraft,
  protectedPhrases: readonly string[] = [],
): ProductSeoAiRawDraft {
  return {
    ...draft,
    seoTitle: applyProductSeoRussianTypography(draft.seoTitle, protectedPhrases),
    seoDescription: applyProductSeoRussianTypography(draft.seoDescription, protectedPhrases),
    usageItems: draft.usageItems.map(({ content }) => ({
      content: applyProductSeoRussianTypography(content, protectedPhrases),
    })),
    faqItems: draft.faqItems.map(({ question, answer, anchor }) => ({
      question: applyProductSeoRussianTypography(question, protectedPhrases),
      answer: applyProductSeoRussianTypography(answer, protectedPhrases),
      anchor,
    })),
  };
}

// Pack checks that must fail before any paid call. FAQ hints and forbidden words need no
// site checkout. Reused expert quotes are compared with quotations already published
// in the site repo (the same sets the gate reads from content/articles).
import { forbiddenLexiconHits, normalize, quoteText } from "./rules.mjs";

export const quotationKey = (text) => normalize(quoteText(text));

/** Map value → slug. Keys may be the raw quote or an already normalized gate key. */
export function findPublishedQuote(quote, quotations) {
  const key = quotationKey(quote);
  if (!key || !quotations) return null;
  for (const [stored, slug] of quotations) {
    if (quotationKey(stored) === key) return slug;
  }
  return null;
}

/** Quote library rows whose `usedIn` names the article that already printed the quote. */
export function quotationsFromLibrary(entries) {
  const map = new Map();
  for (const entry of entries ?? []) {
    const quote = String(entry?.quote ?? "").trim();
    const slug = String(entry?.usedIn ?? "").trim();
    if (quote && slug) map.set(quote, slug);
  }
  return map;
}

const INSTRUCTION_FIELDS = ["title", "query", "intent", "audience", "storyHint", "tableHint"];

/** Texts the model is told to copy or that the assembler pastes verbatim. The ban list itself is excluded. */
export function briefInstructionRecords(article) {
  const records = [];
  const push = (field, text) => {
    const value = String(text ?? "").trim();
    if (value) records.push({ field, text: value });
  };
  for (const field of INSTRUCTION_FIELDS) push(field, article?.[field]);
  for (const [index, item] of (article?.sectionsHint ?? []).entries()) push(`sectionsHint[${index}]`, item);
  for (const [index, item] of (article?.facts ?? []).entries()) push(`facts[${index}]`, item);
  for (const [index, item] of (article?.commonMistakes ?? []).entries()) push(`commonMistakes[${index}]`, item);
  for (const [index, item] of (article?.extraInstructions ?? []).entries()) push(`extraInstructions[${index}]`, item);
  for (const [index, item] of (article?.faqHints ?? []).entries()) push(`faqHints[${index}].match`, item?.match);
  for (const [index, item] of (article?.links?.anchors ?? []).entries()) push(`links.anchors[${index}]`, item?.anchor);
  for (const [index, expert] of (article?.experts ?? []).entries()) push(`experts[${index}].quote`, expert?.quote);
  return records;
}

/** Question hints: faqHints.match and every «…?» the extra instructions tell the model to ask. */
export function faqQuestionHints(article) {
  const hints = [];
  for (const item of article?.faqHints ?? []) {
    const match = String(item?.match ?? "").trim();
    if (match) hints.push({ kind: "match", text: match });
  }
  for (const line of article?.extraInstructions ?? []) {
    for (const match of String(line).matchAll(/«([^»]{3,}\?)»/gu)) hints.push({ kind: "question", text: match[1].trim() });
  }
  return hints;
}

export function sharedFaqHintProblems(articles) {
  const seen = new Map();
  const problems = [];
  for (const article of articles ?? []) {
    const slug = article?.slug ?? "?";
    for (const hint of faqQuestionHints(article)) {
      const key = `${hint.kind}:${normalize(hint.text)}`;
      const other = seen.get(key);
      if (other && other !== slug) problems.push(`${slug}: подсказка FAQ «${hint.text}» повторяет статью ${other}`);
      else if (!other) seen.set(key, slug);
    }
  }
  return problems;
}

export function briefForbiddenProblems(article) {
  const phrases = article?.forbiddenPhrases ?? [];
  const slug = article?.slug ?? "?";
  const problems = [];
  for (const record of briefInstructionRecords(article)) {
    for (const hit of forbiddenLexiconHits(record.text, phrases)) {
      problems.push(`${slug}: ${record.field}: «${hit.text}» – то же запрещённое слово, что ловит гейт (${hit.kind})`);
    }
  }
  return problems;
}

export function reusedQuoteProblems(articles, quotations) {
  const problems = [];
  for (const article of articles ?? []) {
    for (const expert of article?.experts ?? []) {
      const owner = findPublishedQuote(expert?.quote, quotations);
      if (owner && owner !== article.slug) problems.push(`${article.slug}: цитата «${expert.name}» уже есть в статье ${owner}`);
    }
  }
  return problems;
}

/** FAQ hints and forbidden words. Quotes are separate: they need the site's published articles. */
export function packInstructionProblems(articles) {
  return [
    ...sharedFaqHintProblems(articles),
    ...(articles ?? []).flatMap((article) => briefForbiddenProblems(article)),
  ];
}

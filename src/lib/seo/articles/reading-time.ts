import type { ArticleDefinition } from "./types";

const WORDS_PER_MINUTE = 180;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function estimateArticleReadingTimeMinutes(
  article: ArticleDefinition,
): number {
  const chunks = [
    article.leadBeforeAudio,
    article.captionAfterAudio,
    article.shortAnswer,
    ...article.introAfterAudio,
    ...article.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
    article.finalAudioLead,
    article.closingSection.title,
    ...article.closingSection.paragraphs,
    ...article.faq.flatMap((item) => [item.question, item.answer]),
  ];

  const words = chunks.reduce((sum, chunk) => sum + countWords(chunk), 0);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

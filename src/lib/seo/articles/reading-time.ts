import {
  isCreatorPathsArticleDefinition,
  type ArticleDefinition,
} from "./types";

const WORDS_PER_MINUTE = 180;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function sectionBlockText(section: ArticleDefinition["sections"][number]): string[] {
  return (
    section.blocks?.flatMap((block) => {
      switch (block.kind) {
        case "paragraph":
          return [block.text];
        case "rich_paragraph":
          return block.segments.map((segment) =>
            "text" in segment
              ? segment.text
              : "strong" in segment
                ? segment.strong
                : segment.label,
          );
        case "heading":
          return [block.title];
        case "list":
          return block.items;
      }
    }) ?? []
  );
}

export function estimateArticleReadingTimeMinutes(
  article: ArticleDefinition,
): number {
  const chunks = [
    article.leadBeforeAudio,
    article.shortAnswer ?? "",
    ...article.introAfterAudio,
    ...article.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...(section.links ?? []).flatMap((item) => [
        item.before,
        item.linkLabel ?? "",
        item.after ?? "",
      ]),
      ...sectionBlockText(section),
    ]),
    ...article.seeAlsoLinks.flatMap((item) => [item.title, item.description]),
    article.closingSection.title,
    ...article.closingSection.paragraphs,
    ...sectionBlockText(article.closingSection),
    ...article.faq.flatMap((item) => [item.question, item.answer]),
  ];

  if (!isCreatorPathsArticleDefinition(article)) {
    chunks.push(
      article.captionAfterAudio,
      article.primaryPracticeEyebrow,
      article.primaryPracticeIntro,
      article.finalAudioLead,
      ...(article.afterFinalAudio ?? []).flatMap((item) => [
        item.before,
        item.linkLabel ?? "",
        item.after ?? "",
      ]),
      article.brandNote ?? "",
    );
  }

  return estimateReadingTimeMinutesFromChunks(chunks);
}

export function estimateReadingTimeMinutesFromChunks(
  chunks: readonly string[],
): number {
  const words = chunks.reduce((sum, chunk) => sum + countWords(chunk), 0);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

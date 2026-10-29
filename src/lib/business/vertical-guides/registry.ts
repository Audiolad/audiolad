import { KOFE_V_ZERNAH_DLYA_KOFEYNI } from "./articles/kofe-v-zernah-dlya-kofeyni";
import type { GuideParagraph, TextPart, VerticalGuideArticle } from "./types";
import { getVertical } from "./verticals";

const ARTICLES: readonly VerticalGuideArticle[] = [KOFE_V_ZERNAH_DLYA_KOFEYNI];

export function listVerticalArticles(verticalId?: string): VerticalGuideArticle[] {
  return ARTICLES.filter((article) => !verticalId || article.verticalId === verticalId);
}

export function getVerticalArticle(verticalId: string, slug: string): VerticalGuideArticle | null {
  return (
    ARTICLES.find((article) => article.verticalId === verticalId && article.slug === slug) ?? null
  );
}

export function buildVerticalArticlePath(verticalId: string, slug: string): string | null {
  const vertical = getVertical(verticalId);
  if (!vertical || vertical.status !== "active") {
    return null;
  }
  return `${vertical.path}/${slug}`;
}

export function articlePath(article: VerticalGuideArticle): string {
  const path = buildVerticalArticlePath(article.verticalId, article.slug);
  if (!path) {
    throw new Error(`Article ${article.slug} has no active vertical path`);
  }
  return path;
}

function walkParagraphs(blocks: readonly GuideParagraph[], onPart: (part: TextPart) => void): void {
  for (const paragraph of blocks) {
    for (const part of paragraph) {
      onPart(part);
    }
  }
}

function articleParagraphBlocks(article: VerticalGuideArticle): GuideParagraph[] {
  const blocks: GuideParagraph[] = [];
  for (const section of [...article.partOne, ...article.partTwo]) {
    blocks.push(...section.paragraphs);
    for (const subsection of section.subsections ?? []) {
      blocks.push(...subsection.paragraphs);
    }
  }
  blocks.push(...article.table.intro, ...article.table.after);
  for (const slot of [article.expertOne, article.expertTwo]) {
    blocks.push(...slot.lead, ...slot.after);
  }
  return blocks;
}

/** Every editorial string of the article (for typography and wording checks). */
export function collectArticleText(article: VerticalGuideArticle): string[] {
  const parts: string[] = [
    article.title,
    article.seoTitle,
    article.description,
    article.question,
    article.hero.caption,
    article.hero.alt,
    ...article.intro,
    ...[...article.partOne, ...article.partTwo].flatMap((section) => [
      section.heading,
      ...(section.subsections ?? []).map((subsection) => subsection.heading),
    ]),
    article.table.heading,
    article.table.caption,
    ...article.table.columns,
    ...article.table.rows.flat(),
    ...[article.expertOne, article.expertTwo].flatMap((slot) =>
      [slot.heading, slot.translation].filter((item): item is string => Boolean(item)),
    ),
    article.steps.heading,
    article.steps.intro,
    ...article.steps.items.flatMap((step) => [step.title, step.text]),
    article.checklist.title,
    article.checklist.note,
    article.checklist.doneNote,
    ...article.checklist.items.map((item) => item.text),
    ...article.faq.flatMap((item) => [item.question, item.answer]),
    article.finalQuestion,
    ...article.readMore.map((link) => link.label),
  ];
  walkParagraphs(articleParagraphBlocks(article), (part) => {
    parts.push(typeof part === "string" ? part : part.label);
  });
  return parts;
}

/** Every link target the article renders from its data (must all be internal). */
export function collectArticleHrefs(article: VerticalGuideArticle): string[] {
  const hrefs = article.readMore.map((link) => link.href);
  walkParagraphs(articleParagraphBlocks(article), (part) => {
    if (typeof part !== "string") {
      hrefs.push(part.href);
    }
  });
  return hrefs;
}

import { MUZYKA_DLYA_KOFEYNI } from "./articles/muzyka-dlya-kofeyni";
import type { TextPart, VerticalGuideArticle } from "./types";
import { getVertical } from "./verticals";

const ARTICLES: readonly VerticalGuideArticle[] = [MUZYKA_DLYA_KOFEYNI];

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

export function collectArticleText(article: VerticalGuideArticle): string[] {
  const parts: string[] = [
    article.title,
    article.seoTitle,
    article.description,
    article.leadIn,
    article.question,
    article.hero.caption,
    article.hero.alt,
    article.checklistTitle,
    ...article.story,
    ...article.cups.flatMap((cup) => [cup.title, cup.text]),
    ...article.checklist.map((item) => item.text),
    ...article.experts.flatMap((slot) =>
      [slot.bridge, slot.secondBridge, slot.translation].filter((item): item is string => Boolean(item)),
    ),
    ...article.faq.flatMap((item) => [item.question, item.answer]),
    ...article.further.map((link) => link.label),
  ];

  const walk = (blocks: TextPart[][]) => {
    for (const paragraph of blocks) {
      for (const part of paragraph) {
        parts.push(typeof part === "string" ? part : part.label);
      }
    }
  };

  walk([article.playerLead]);
  for (const section of article.sections) {
    parts.push(section.heading);
    walk(section.paragraphs);
    for (const subsection of section.subsections ?? []) {
      parts.push(subsection.heading);
      walk(subsection.paragraphs);
    }
  }

  return parts;
}

export function collectArticleHrefs(article: VerticalGuideArticle): string[] {
  const hrefs = [...article.further.map((link) => link.href), article.trackPagePath];
  const walk = (blocks: TextPart[][]) => {
    for (const paragraph of blocks) {
      for (const part of paragraph) {
        if (typeof part !== "string") {
          hrefs.push(part.href);
        }
      }
    }
  };
  walk([article.playerLead]);
  for (const section of article.sections) {
    walk(section.paragraphs);
    for (const subsection of section.subsections ?? []) {
      walk(subsection.paragraphs);
    }
  }
  return hrefs;
}

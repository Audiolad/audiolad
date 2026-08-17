import { helpArticlePath } from "@/lib/help/paths";
import { collectHelpRichTexts } from "@/lib/help/rich-text";
import type { HelpArticle, HelpSearchHit } from "@/lib/help/types";

export type HelpSearchDocument = {
  articleId: string;
  slug: string;
  category: HelpArticle["category"];
  title: string;
  description: string;
  titleTokens: string[];
  keywordTokens: string[];
  sectionTitleTokens: string[];
  bodyTokens: string[];
  href: string;
};

const PUNCTUATION_RE = /[^\p{L}\p{N}\s]+/gu;
const WHITESPACE_RE = /\s+/g;

export function normalizeHelpSearchText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(PUNCTUATION_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

export function tokenizeHelpSearchText(value: string): string[] {
  const normalized = normalizeHelpSearchText(value);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function collectSectionText(article: HelpArticle): {
  sectionTitles: string[];
  body: string[];
} {
  const sectionTitles: string[] = [];
  const body: string[] = [];

  for (const section of article.sections) {
    if (section.title) sectionTitles.push(section.title);
    body.push(...collectHelpRichTexts(section.paragraphs));
    body.push(...collectHelpRichTexts(section.steps));
    body.push(...collectHelpRichTexts(section.notes));
    for (const figure of section.figures ?? []) {
      body.push(figure.alt, figure.caption);
    }
    for (const item of section.faq ?? []) {
      sectionTitles.push(item.question);
      body.push(item.question, ...collectHelpRichTexts([item.answer]));
    }
  }

  return { sectionTitles, body };
}

export function buildHelpSearchDocument(article: HelpArticle): HelpSearchDocument {
  const { sectionTitles, body } = collectSectionText(article);
  return {
    articleId: article.id,
    slug: article.slug,
    category: article.category,
    title: article.title,
    description: article.description,
    titleTokens: tokenizeHelpSearchText(
      [
        article.title,
        article.heading,
        article.description,
        article.seoTitle,
        article.seoDescription,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    keywordTokens: tokenizeHelpSearchText(article.keywords.join(" ")),
    sectionTitleTokens: tokenizeHelpSearchText(sectionTitles.join(" ")),
    bodyTokens: tokenizeHelpSearchText(body.join(" ")),
    href: helpArticlePath(article),
  };
}

export function buildHelpSearchIndex(
  articles: readonly HelpArticle[],
): HelpSearchDocument[] {
  return articles.map(buildHelpSearchDocument);
}

function tokenMatches(haystack: string[], needle: string): boolean {
  if (!needle) return false;
  return haystack.some(
    (token) => token === needle || token.startsWith(needle) || needle.startsWith(token),
  );
}

function scoreDocument(
  document: HelpSearchDocument,
  queryTokens: string[],
): number {
  if (queryTokens.length === 0) return 0;

  let score = 0;
  let matchedTokens = 0;

  for (const token of queryTokens) {
    let tokenScore = 0;
    if (tokenMatches(document.titleTokens, token)) tokenScore += 12;
    if (tokenMatches(document.keywordTokens, token)) tokenScore += 10;
    if (tokenMatches(document.sectionTitleTokens, token)) tokenScore += 5;
    if (tokenMatches(document.bodyTokens, token)) tokenScore += 2;
    if (tokenScore > 0) {
      matchedTokens += 1;
      score += tokenScore;
    }
  }

  // Require all query tokens to match somewhere for multi-word queries.
  if (matchedTokens < queryTokens.length) return 0;
  return score;
}

export function searchHelpArticles(
  index: readonly HelpSearchDocument[],
  query: string,
  options?: { limit?: number },
): HelpSearchHit[] {
  const queryTokens = tokenizeHelpSearchText(query);
  if (queryTokens.length === 0) return [];

  const limit = options?.limit ?? 20;
  const hits: HelpSearchHit[] = [];

  for (const document of index) {
    const score = scoreDocument(document, queryTokens);
    if (score <= 0) continue;
    hits.push({
      articleId: document.articleId,
      slug: document.slug,
      category: document.category,
      title: document.title,
      description: document.description,
      score,
      href: document.href,
    });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title, "ru");
  });

  return hits.slice(0, limit);
}

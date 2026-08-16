import { buildListenPagePath } from "@/lib/seo/listens/paths";
import { listIndexableListenPageDefinitions } from "@/lib/seo/listens/registry";
import type { ListenPageDefinition, ListenSection } from "@/lib/seo/listens/types";
import {
  buildTopicHubPath,
  listTopicHubDefinitions,
  type TopicHubDefinition,
} from "@/lib/seo/topic-hubs";
import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";

import { buildArticlePath, isValidArticleSlug } from "./paths";
import {
  estimateArticleReadingTimeMinutes,
  estimateReadingTimeMinutesFromChunks,
} from "./reading-time";
import { listArticleDefinitions } from "./registry";
import type { ArticleDefinition } from "./types";

export const ARTICLES_DIRECTORY_PATH = "/articles";

export const ARTICLES_DIRECTORY_H1 = "Полезные материалы";

export const ARTICLES_DIRECTORY_INTRO =
  "Статьи о медитациях, внутреннем состоянии, отношениях с собой, деньгах и других темах, которые помогают лучше понять практики и выбрать подходящий материал.";

export const ARTICLES_DIRECTORY_SEO_TITLE =
  "Полезные материалы об аудиопрактиках и медитациях – АудиоЛад";

export const ARTICLES_DIRECTORY_META_DESCRIPTION =
  "Статьи АудиоЛада о медитациях, внутреннем состоянии, отношениях с собой, деньгах и выборе аудиопрактик.";

/** Optional future draft / noindex gates. Absent fields mean “listed”. */
export type ArticleDirectoryEligibilityInput = ArticleDefinition & {
  status?: "published" | "draft";
  indexable?: boolean;
};

export type ArticleDirectoryCard = {
  slug: string;
  title: string;
  href: string;
  description: string;
  topicSlug: string | null;
  topicTitle: string | null;
  topicHref: string | null;
  readingTimeMinutes: number;
  publishedAt?: string;
};

export type ArticleDirectoryTopicHubCard = {
  slug: string;
  title: string;
  href: string;
  description: string;
};

export type ArticleDirectoryPageData = {
  path: string;
  canonicalUrl: string;
  h1: string;
  intro: string;
  hubs: readonly ArticleDirectoryTopicHubCard[];
  articles: readonly ArticleDirectoryCard[];
};

const SHORT_ANSWER_MAX_CHARS = 220;
const FALLBACK_MAX_CHARS = 180;

function trimDescription(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxChars - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const base = lastSpace >= 80 ? sliced.slice(0, lastSpace) : sliced;

  return `${base.replace(/[.,;:!?–-]+$/u, "")}…`;
}

/**
 * Presence in the central article registry is the publication signal today.
 * Incomplete / corrupt rows are excluded so one bad entry cannot break the catalog.
 * Optional `status` / `indexable` support future draft and noindex gates.
 */
export function isArticleDirectoryListed(
  article: ArticleDirectoryEligibilityInput,
): boolean {
  if (article.status === "draft") {
    return false;
  }

  if (article.indexable === false) {
    return false;
  }

  const slug = article.slug?.trim().toLowerCase() ?? "";

  if (!slug || !isValidArticleSlug(slug)) {
    return false;
  }

  if (!article.title?.trim()) {
    return false;
  }

  const publishedAt = article.publishedAt?.trim() ?? "";

  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
    return false;
  }

  return true;
}

export function resolveArticleDirectoryDescription(
  article: Pick<
    ArticleDefinition,
    "metaDescription" | "shortAnswer" | "leadBeforeAudio" | "title"
  >,
): string {
  const meta = article.metaDescription?.replace(/\s+/g, " ").trim() ?? "";

  if (meta) {
    return meta;
  }

  const shortAnswer = article.shortAnswer?.replace(/\s+/g, " ").trim() ?? "";

  if (
    shortAnswer &&
    shortAnswer.length <= SHORT_ANSWER_MAX_CHARS &&
    shortAnswer !== meta
  ) {
    return shortAnswer;
  }

  const lead = article.leadBeforeAudio?.replace(/\s+/g, " ").trim() ?? "";

  if (lead) {
    return trimDescription(lead, FALLBACK_MAX_CHARS);
  }

  return `Статья «${article.title.trim()}» на АудиоЛаде.`;
}

function resolvePrimaryTopic(
  article: ArticleDefinition,
): Pick<ArticleDirectoryCard, "topicSlug" | "topicTitle" | "topicHref"> {
  const topicSlug = article.topicSlug?.trim().toLowerCase() || null;
  const topicTitle = article.topicTitle?.trim() || null;
  const topicHref = article.topicHref?.trim() || null;

  if (!topicSlug || !topicTitle || !topicHref) {
    return {
      topicSlug: null,
      topicTitle: null,
      topicHref: null,
    };
  }

  return {
    topicSlug,
    topicTitle,
    topicHref,
  };
}

export function compareArticlesByPublishedAtDesc(
  left: Pick<ArticleDefinition, "publishedAt" | "slug">,
  right: Pick<ArticleDefinition, "publishedAt" | "slug">,
): number {
  const leftTime = Date.parse(left.publishedAt);
  const rightTime = Date.parse(right.publishedAt);

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return left.slug.localeCompare(right.slug, "en");
}

export function toArticleDirectoryCard(
  article: ArticleDefinition,
): ArticleDirectoryCard {
  const topic = resolvePrimaryTopic(article);

  return {
    slug: article.slug.trim().toLowerCase(),
    title: article.title.trim(),
    href: buildArticlePath(article.slug),
    description: resolveArticleDirectoryDescription(article),
    topicSlug: topic.topicSlug,
    topicTitle: topic.topicTitle,
    topicHref: topic.topicHref,
    readingTimeMinutes: estimateArticleReadingTimeMinutes(article),
    publishedAt: article.publishedAt.trim(),
  };
}

/**
 * Single selector over the central article registry.
 * New published registry entries appear here automatically after build/deploy.
 */
export function listArticleDirectoryCards(
  articles: readonly ArticleDirectoryEligibilityInput[] = listArticleDefinitions(),
): ArticleDirectoryCard[] {
  const listed = articles.filter(isArticleDirectoryListed);
  const sorted = [...listed].sort(compareArticlesByPublishedAtDesc);
  const seen = new Set<string>();
  const cards: ArticleDirectoryCard[] = [];

  for (const article of sorted) {
    const slug = article.slug.trim().toLowerCase();

    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    cards.push(toArticleDirectoryCard(article));
  }

  return cards;
}

function listenSectionBlockText(section: ListenSection): string[] {
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

export function estimateListenDirectoryReadingTimeMinutes(
  page: ListenPageDefinition,
): number {
  const chunks = [
    ...page.intro,
    ...page.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...listenSectionBlockText(section),
    ]),
    ...page.faq.flatMap((item) => [item.question, item.answer]),
  ];

  return estimateReadingTimeMinutesFromChunks(chunks);
}

export function toListenDirectoryCard(
  page: ListenPageDefinition,
): ArticleDirectoryCard {
  return {
    slug: page.slug.trim().toLowerCase(),
    title: page.title.trim(),
    href: buildListenPagePath(page.slug),
    description: page.description.trim(),
    topicSlug: null,
    topicTitle: null,
    topicHref: null,
    readingTimeMinutes: estimateListenDirectoryReadingTimeMinutes(page),
  };
}

export function listListenDirectoryCards(
  pages: readonly ListenPageDefinition[] = listIndexableListenPageDefinitions(),
): ArticleDirectoryCard[] {
  return [...pages]
    .filter((page) => page.indexable !== false && page.slug.trim() && page.title.trim())
    .sort((left, right) => left.slug.localeCompare(right.slug, "en"))
    .map(toListenDirectoryCard);
}

function mergeDirectoryCardsByHref(
  articleCards: readonly ArticleDirectoryCard[],
  listenCards: readonly ArticleDirectoryCard[],
): ArticleDirectoryCard[] {
  const seen = new Set<string>();
  const cards: ArticleDirectoryCard[] = [];

  for (const card of [...articleCards, ...listenCards]) {
    if (seen.has(card.href)) {
      continue;
    }

    seen.add(card.href);
    cards.push(card);
  }

  return cards;
}

export function isTopicHubDirectoryListed(hub: TopicHubDefinition): boolean {
  const slug = hub.slug?.trim().toLowerCase() ?? "";

  // Editorial hubs in the registry are public entry points.
  return Boolean(slug && hub.title?.trim());
}

export function listArticleDirectoryTopicHubs(
  hubs: readonly TopicHubDefinition[] = listTopicHubDefinitions(),
): ArticleDirectoryTopicHubCard[] {
  return hubs.filter(isTopicHubDirectoryListed).map((hub) => ({
    slug: hub.slug.trim().toLowerCase(),
    title: hub.title.trim(),
    href: buildTopicHubPath(hub.slug),
    description: hub.intro.replace(/\s+/g, " ").trim(),
  }));
}

export function loadArticleDirectoryPageData(
  articles: readonly ArticleDirectoryEligibilityInput[] = listArticleDefinitions(),
  hubs: readonly TopicHubDefinition[] = listTopicHubDefinitions(),
  listens: readonly ListenPageDefinition[] = listIndexableListenPageDefinitions(),
): ArticleDirectoryPageData {
  return {
    path: ARTICLES_DIRECTORY_PATH,
    canonicalUrl: buildSiteCanonicalUrl(ARTICLES_DIRECTORY_PATH),
    h1: ARTICLES_DIRECTORY_H1,
    intro: ARTICLES_DIRECTORY_INTRO,
    hubs: listArticleDirectoryTopicHubs(hubs),
    articles: mergeDirectoryCardsByHref(
      listArticleDirectoryCards(articles),
      listListenDirectoryCards(listens),
    ),
  };
}

export function formatArticleReadingTimeLabel(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes)
    ? Math.max(1, Math.round(minutes))
    : 1;
  const mod10 = safeMinutes % 10;
  const mod100 = safeMinutes % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${safeMinutes} минута чтения`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${safeMinutes} минуты чтения`;
  }

  return `${safeMinutes} минут чтения`;
}

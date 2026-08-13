import type { CatalogProduct } from "@/lib/products/catalog";

export type ArticleFaqItem = {
  question: string;
  answer: string;
};

export type ArticleSection = {
  id: string;
  title: string;
  paragraphs: string[];
  links?: readonly ArticleCrossLinkParagraph[];
};

/**
 * Stable catalog identity for an editorial practice slot.
 * Current registry uses the public practice slug as `practiceKey`.
 * A future DB/CMS row can store the same key (or map UUID → key) without
 * rewriting article renderer / audio components.
 */
export type ArticlePracticeSlot = {
  practiceKey: string;
};

export type ArticleRelatedPracticeSlot = ArticlePracticeSlot & {
  blurb: string;
};

/** Inline text or link segment for multi-link editorial paragraphs. */
export type ArticleInlineSegment =
  | { text: string }
  | { href: string; label: string };

/**
 * Cross-link paragraph after the final audio CTA.
 * When `segments` is set, it is rendered as mixed text/links.
 * Otherwise: when `href` is set, `linkLabel` is rendered as an inline link
 * between `before` and `after`. When `href` is omitted, the full plain
 * `before` string is shown (for future articles mentioned without a live URL).
 */
export type ArticleCrossLinkParagraph = {
  before: string;
  after?: string;
  linkLabel?: string;
  href?: string;
  segments?: readonly ArticleInlineSegment[];
};

export type ArticleSeeAlsoLink = {
  href: string;
  title: string;
  description: string;
};

/** Fields shared by every serializable SEO article document. */
type ArticleDefinitionBase = {
  slug: string;
  title: string;
  /** Shorter label for breadcrumbs / compact UI */
  breadcrumbTitle: string;
  metaTitle: string;
  metaDescription: string;
  /** Opening paragraph of the article body. */
  leadBeforeAudio: string;
  shortAnswer: string;
  authorLabel: string;
  topicSlug: string;
  topicTitle: string;
  topicHref: string;
  faq: readonly ArticleFaqItem[];
  /** Body sections after short answer / TOC (each becomes h2) */
  sections: readonly ArticleSection[];
  /**
   * Body paragraphs after the top product continuation, when one is shown.
   * Template prepends leadBeforeAudio before these paragraphs.
   */
  introAfterAudio: readonly string[];
  /** Footer “Смотрите также” cards (topic hub + related hubs) */
  seeAlsoLinks: readonly ArticleSeeAlsoLink[];
  /** Closing h2 section after the product continuation. */
  closingSection: ArticleSection;
  publishedAt: string;
  updatedAt: string;
};

export type ArticleCreatorPathsContinuation = {
  kind: "creator_paths";
  emphasis: "balanced" | "studio" | "school";
};

/** Existing listener article funnel with an embedded catalog practice. */
export type PracticeArticleDefinition = ArticleDefinitionBase & {
  productContinuation?: undefined;
  /** Caption under top audio block */
  captionAfterAudio: string;
  /**
   * Small heading above the primary audio card.
   * Article-specific copy that frames the practice as part of the material.
   */
  primaryPracticeEyebrow: string;
  /** Short intro paragraph immediately before the primary audio card */
  primaryPracticeIntro: string;
  primaryPractice: ArticlePracticeSlot;
  relatedPractices: readonly ArticleRelatedPracticeSlot[];
  finalAudioLead: string;
  /**
   * Optional editorial cross-links after the final audio block
   * (other articles in the cluster; omit href for not-yet-published titles).
   */
  afterFinalAudio?: readonly ArticleCrossLinkParagraph[];
  /**
   * Optional branded editorial note after the practice CTA / cross-links
   * (Audiolad positioning; not a second H2).
   */
  brandNote?: string;
};

/** Author-focused funnel with Studio and School as equal product paths. */
export type CreatorPathsArticleDefinition = ArticleDefinitionBase & {
  productContinuation: ArticleCreatorPathsContinuation;
};

export type ArticleDefinition =
  | PracticeArticleDefinition
  | CreatorPathsArticleDefinition;

export function isCreatorPathsArticleDefinition(
  article: ArticleDefinition,
): article is CreatorPathsArticleDefinition {
  return article.productContinuation?.kind === "creator_paths";
}

type ArticlePageDataBase = {
  article: ArticleDefinition;
  path: string;
  canonicalUrl: string;
  readingTimeMinutes: number;
};

export type PracticeArticlePageData = ArticlePageDataBase & {
  kind: "practice";
  article: PracticeArticleDefinition;
  primaryPractice: CatalogProduct;
  relatedPractices: Array<{
    product: CatalogProduct;
    blurb: string;
  }>;
  libraryAction: "sign_in" | "add" | "in_library" | "hidden";
};

export type CreatorPathsArticlePageData = ArticlePageDataBase & {
  kind: "creator_paths";
  article: CreatorPathsArticleDefinition;
};

export type ArticlePageData =
  | PracticeArticlePageData
  | CreatorPathsArticlePageData;

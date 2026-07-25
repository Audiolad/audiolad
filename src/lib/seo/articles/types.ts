import type { CatalogProduct } from "@/lib/products/catalog";

export type ArticleFaqItem = {
  question: string;
  answer: string;
};

export type ArticleSection = {
  id: string;
  title: string;
  paragraphs: string[];
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

/**
 * Cross-link paragraph after the final audio CTA.
 * When `href` is set, `linkLabel` is rendered as an inline link between
 * `before` and `after`. When `href` is omitted, the full plain `before`
 * string is shown (for future articles mentioned without a live URL).
 */
export type ArticleCrossLinkParagraph = {
  before: string;
  after?: string;
  linkLabel?: string;
  href?: string;
};

export type ArticleSeeAlsoLink = {
  href: string;
  title: string;
  description: string;
};

/**
 * Serializable article document. Safe to load from registry today and from DB later.
 * Keep this shape free of React nodes and runtime-only fields.
 */
export type ArticleDefinition = {
  slug: string;
  title: string;
  /** Shorter label for breadcrumbs / compact UI */
  breadcrumbTitle: string;
  metaTitle: string;
  metaDescription: string;
  /** Short lead before top audio block */
  leadBeforeAudio: string;
  /** Caption under top audio block */
  captionAfterAudio: string;
  /**
   * Small heading above the primary audio card.
   * Article-specific copy that frames the practice as part of the material.
   */
  primaryPracticeEyebrow: string;
  /** Short intro paragraph immediately before the primary audio card */
  primaryPracticeIntro: string;
  shortAnswer: string;
  authorLabel: string;
  topicSlug: string;
  topicTitle: string;
  topicHref: string;
  primaryPractice: ArticlePracticeSlot;
  relatedPractices: readonly ArticleRelatedPracticeSlot[];
  faq: readonly ArticleFaqItem[];
  /** Body sections after short answer / TOC (each becomes h2) */
  sections: readonly ArticleSection[];
  /** Intro paragraphs after top audio (continuation; no duplicate of leadBeforeAudio) */
  introAfterAudio: readonly string[];
  finalAudioLead: string;
  /**
   * Optional editorial cross-links after the final audio block
   * (other articles in the cluster; omit href for not-yet-published titles).
   */
  afterFinalAudio?: readonly ArticleCrossLinkParagraph[];
  /** Footer “Смотрите также” cards (topic hub + related hubs) */
  seeAlsoLinks: readonly ArticleSeeAlsoLink[];
  /** Closing h2 section after the final audio block */
  closingSection: ArticleSection;
  publishedAt: string;
  updatedAt: string;
};

export type ArticlePageData = {
  article: ArticleDefinition;
  path: string;
  canonicalUrl: string;
  readingTimeMinutes: number;
  primaryPractice: CatalogProduct;
  relatedPractices: Array<{
    product: CatalogProduct;
    blurb: string;
  }>;
  libraryAction: "sign_in" | "add" | "in_library" | "hidden";
};

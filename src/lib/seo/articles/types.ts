import type { CatalogProduct } from "@/lib/products/catalog";

export type ArticleFaqItem = {
  question: string;
  answer: string;
};

/** Inline content supported inside an editorial rich paragraph. */
export type ArticleInlineSegment =
  | { text: string }
  | { strong: string }
  | { href: string; label: string };

export type ArticleSectionBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "rich_paragraph"; segments: readonly ArticleInlineSegment[] }
  | { kind: "heading"; level: 3; title: string }
  | { kind: "list"; items: readonly string[] };

export type ArticleSection = {
  id: string;
  title: string;
  /** Optional canonical URL for a linked section heading. */
  titleHref?: string;
  paragraphs: string[];
  links?: readonly ArticleCrossLinkParagraph[];
  /** Ordered content for articles that need H3, lists, or multi-link paragraphs. */
  blocks?: readonly ArticleSectionBlock[];
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
  /** Optional inline editorial links immediately following the introduction. */
  introAfterAudioLinks?: readonly ArticleCrossLinkParagraph[];
  /** Footer “Смотрите также” cards (topic hub + related hubs) */
  seeAlsoLinks: readonly ArticleSeeAlsoLink[];
  /** Closing h2 section after the product continuation. */
  closingSection: ArticleSection;
  publishedAt: string;
  updatedAt: string;
};

export type ArticlePracticeContinuation = {
  kind: "practice";
};

export type ArticleCreatorPathsContinuation = {
  kind: "creator_paths";
  emphasis: "balanced" | "studio" | "school";
};

/** Existing listener article funnel with an embedded catalog practice. */
export type PracticeArticleDefinition = ArticleDefinitionBase & {
  productContinuation: ArticlePracticeContinuation;
  shortAnswer: string;
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

/** Author-focused funnel with Studio and the 25 solutions product as equal paths. */
export type CreatorArticleDefinition = ArticleDefinitionBase & {
  productContinuation: ArticleCreatorPathsContinuation;
  /** Optional editorial summary; omit when the authoritative copy has no summary. */
  shortAnswer?: string;
  captionAfterAudio?: never;
  primaryPracticeEyebrow?: never;
  primaryPracticeIntro?: never;
  primaryPractice?: never;
  relatedPractices?: never;
  finalAudioLead?: never;
  afterFinalAudio?: never;
  brandNote?: never;
};

export type ArticleDefinition =
  | PracticeArticleDefinition
  | CreatorArticleDefinition;

/** Backward-compatible alias for the creator product continuation variant. */
export type CreatorPathsArticleDefinition = CreatorArticleDefinition;

export function isCreatorArticleDefinition(
  article: ArticleDefinition,
): article is CreatorArticleDefinition {
  return article.productContinuation.kind === "creator_paths";
}

export const isCreatorPathsArticleDefinition = isCreatorArticleDefinition;

export function isPracticeArticleDefinition(
  article: ArticleDefinition,
): article is PracticeArticleDefinition {
  return article.productContinuation.kind === "practice";
}

type ArticlePageDataBase<TArticle extends ArticleDefinition> = {
  article: TArticle;
  path: string;
  canonicalUrl: string;
  readingTimeMinutes: number;
};

export type PracticeArticlePageData = ArticlePageDataBase<PracticeArticleDefinition> & {
  article: PracticeArticleDefinition;
  primaryPractice: CatalogProduct;
  relatedPractices: Array<{
    product: CatalogProduct;
    blurb: string;
  }>;
  libraryAction: "sign_in" | "add" | "in_library" | "hidden";
};

export type CreatorArticlePageData = ArticlePageDataBase<CreatorArticleDefinition> & {
  /**
   * Viewer-specific entry URL for the 25 meditation solutions product.
   * It is calculated per request and may include the existing `?promo=` token.
   */
  solutionsPromoHref: string;
};

/** Backward-compatible alias for the creator product continuation page data. */
export type CreatorPathsArticlePageData = CreatorArticlePageData;

export type ArticlePageData =
  | PracticeArticlePageData
  | CreatorArticlePageData;

export function isCreatorArticlePageData(
  data: ArticlePageData,
): data is CreatorArticlePageData {
  return data.article.productContinuation.kind === "creator_paths";
}

export const isCreatorPathsArticlePageData = isCreatorArticlePageData;

export function isPracticeArticlePageData(
  data: ArticlePageData,
): data is PracticeArticlePageData {
  return data.article.productContinuation.kind === "practice";
}

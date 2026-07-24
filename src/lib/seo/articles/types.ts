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

export type ArticleRelatedPracticeRef = {
  slug: string;
  blurb: string;
};

export type ArticleDefinition = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  /** Short lead before top audio block */
  leadBeforeAudio: string;
  /** Caption under top audio block */
  captionAfterAudio: string;
  shortAnswer: string;
  authorLabel: string;
  topicSlug: string;
  topicTitle: string;
  topicHref: string;
  primaryPracticeSlug: string;
  relatedPractices: readonly ArticleRelatedPracticeRef[];
  faq: readonly ArticleFaqItem[];
  /** Body sections after short answer / TOC (each becomes h2) */
  sections: readonly ArticleSection[];
  /** Intro paragraphs after top audio (continuation; no duplicate of leadBeforeAudio) */
  introAfterAudio: readonly string[];
  finalAudioLead: string;
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

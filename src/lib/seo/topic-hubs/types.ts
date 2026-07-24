import type { CatalogProduct } from "@/lib/products/catalog";

export type TopicHubFaqItem = {
  question: string;
  answer: string;
};

export type TopicHubRelatedLink = {
  href: string;
  title: string;
  description?: string;
};

/**
 * Editorial SEO topic hub.
 * Practices are collected from published catalog via topicKey and/or freeOnly,
 * then optionally narrowed/ordered by practiceSlugAllowlist.
 */
export type TopicHubDefinition = {
  /** Public URL slug: /topics/{slug} */
  slug: string;
  /**
   * Optional platform `topics.key`.
   * Omit for cross-topic hubs (e.g. free entry) – do not invent a fake key.
   */
  topicKey?: string;
  /** When true, keep only free published catalog practices */
  freeOnly?: boolean;
  /** H1 and primary SEO title stem */
  title: string;
  /** Meta description (unique per hub) */
  metaDescription: string;
  /** Short lead under H1 */
  intro: string;
  /** Longer editorial body paragraphs */
  body: string[];
  faq: TopicHubFaqItem[];
  relatedLinks: TopicHubRelatedLink[];
  /**
   * Optional editorial subset + order of practice slugs.
   * Applied after topicKey / freeOnly filters. Order is preserved.
   */
  practiceSlugAllowlist?: readonly string[];
  /**
   * When true (default), ProductTopicLinks resolve this topicKey to the hub.
   * Requires topicKey. Set false for secondary / cross-topic hubs.
   */
  resolveTopicChips?: boolean;
  /** Index only when at least one published catalog practice is assigned */
  indexWhenEmpty?: boolean;
};

export type TopicHubPageData = {
  hub: TopicHubDefinition;
  path: string;
  canonicalUrl: string;
  products: CatalogProduct[];
  freeProducts: CatalogProduct[];
  paidProducts: CatalogProduct[];
  platformTopicTitle: string | null;
};

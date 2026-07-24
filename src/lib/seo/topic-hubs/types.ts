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
 * Practices are collected via platform `topicKey` (topics.key), not via hub slug.
 */
export type TopicHubDefinition = {
  /** Public URL slug: /topics/{slug} */
  slug: string;
  /**
   * Platform `topics.key` used to load published catalog practices
   * and as analytics `topic_key`.
   */
  topicKey: string;
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
   * Optional editorial subset of practice slugs after topicKey filter.
   * Used when one platform topic powers several SEO hubs (anti-cannibalization).
   */
  practiceSlugAllowlist?: readonly string[];
  /**
   * When true (default), ProductTopicLinks resolve this topicKey to the hub.
   * Set false for secondary hubs that share a topicKey with a primary hub.
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

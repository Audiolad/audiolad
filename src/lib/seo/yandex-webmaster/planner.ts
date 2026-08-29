import { isListedCatalogVisibility } from "@/lib/products/catalog-visibility";
import { buildPracticeCanonicalUrl } from "@/lib/products/paths";

export const YANDEX_RECRAWL_REASONS = {
  practice_published: "practice_published",
  practice_republished: "practice_republished",
  practice_seo_updated: "practice_seo_updated",
  practice_content_updated: "practice_content_updated",
} as const;

export type YandexRecrawlReason =
  (typeof YANDEX_RECRAWL_REASONS)[keyof typeof YANDEX_RECRAWL_REASONS];

export type YandexRecrawlPlan = {
  reason: YandexRecrawlReason;
  url: string;
};

/**
 * Search-significant practice fields for Webmaster Recrawl quota.
 * Narrower than IndexNow: price/cover/notice/promo do not spend quota.
 */
export const PRACTICE_YANDEX_RECRAWL_FIELDS = [
  "title",
  "subtitle",
  "description",
  "seo_primary_query",
  "seo_secondary_queries",
  "seo_title",
  "seo_description",
  "seo_about",
  "seo_usage_items",
  "seo_faq_items",
  "related_products",
  "related_listens",
  "slug",
] as const;

export type PracticeYandexRecrawlField =
  (typeof PRACTICE_YANDEX_RECRAWL_FIELDS)[number];

const PRACTICE_YANDEX_FIELD_SET = new Set<string>(PRACTICE_YANDEX_RECRAWL_FIELDS);

const PRACTICE_YANDEX_SEO_FIELDS = new Set([
  "seo_primary_query",
  "seo_secondary_queries",
  "seo_title",
  "seo_description",
  "seo_about",
  "seo_usage_items",
  "seo_faq_items",
  "related_products",
  "related_listens",
]);

export function hasPracticeYandexRecrawlChanges(
  updates: Readonly<Record<string, unknown>>,
): boolean {
  return Object.keys(updates).some((key) => PRACTICE_YANDEX_FIELD_SET.has(key));
}

function isPublicListed(input: {
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
}): boolean {
  return isListedCatalogVisibility(input.catalogVisibility, input.isCatalogListed);
}

/**
 * Pure planner: quota-worthy Yandex Recrawl for a public listed product.
 * Returns null when the event is not search-significant or not public.
 */
export function planPracticeYandexRecrawl(input: {
  previousStatus?: string | null;
  nextStatus: string;
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
  changedFields?: ReadonlyArray<string>;
  authorSlug: string;
  practiceSlug: string;
}): YandexRecrawlPlan | null {
  const authorSlug = input.authorSlug.trim();
  const practiceSlug = input.practiceSlug.trim();

  if (!authorSlug || !practiceSlug) {
    return null;
  }

  if (input.nextStatus !== "published") {
    return null;
  }

  if (
    !isPublicListed({
      catalogVisibility: input.catalogVisibility,
      isCatalogListed: input.isCatalogListed,
    })
  ) {
    return null;
  }

  const previousStatus = input.previousStatus ?? null;
  const becamePublished = previousStatus !== "published";
  const url = buildPracticeCanonicalUrl(authorSlug, practiceSlug);

  if (becamePublished) {
    return {
      reason:
        previousStatus === "unpublished"
          ? YANDEX_RECRAWL_REASONS.practice_republished
          : YANDEX_RECRAWL_REASONS.practice_published,
      url,
    };
  }

  const changed = (input.changedFields ?? []).filter((field) => field !== "updated_at");

  if (!changed.some((field) => PRACTICE_YANDEX_FIELD_SET.has(field))) {
    return null;
  }

  const seoChanged = changed.some((field) => PRACTICE_YANDEX_SEO_FIELDS.has(field));

  return {
    reason: seoChanged
      ? YANDEX_RECRAWL_REASONS.practice_seo_updated
      : YANDEX_RECRAWL_REASONS.practice_content_updated,
    url,
  };
}

import { planPracticePublishIndexNow } from "@/lib/seo/indexnow/planner";
import {
  planPracticeYandexRecrawl,
  type YandexRecrawlPlan,
} from "@/lib/seo/yandex-webmaster/planner";
import type { IndexNowReason } from "@/lib/seo/indexnow/reasons";

export type PracticePublishedSearchPlan = {
  indexNow: Array<{ reason: IndexNowReason; urls: string[] }>;
  yandex: YandexRecrawlPlan | null;
};

export type ClaimedScheduledPublication = {
  practiceId: string;
  authorId: string;
  practiceSlug: string;
  authorSlug: string;
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
  publishedAt: string;
  /** Other products of this author that already had published_at set. */
  priorPublicCount: number;
};

/**
 * One search-notification plan per row returned by the idempotent claim.
 * An empty claim plans nothing, so a second call does not notify again.
 * author_became_public stays on the earliest release when several products
 * of a new author become public in the same claim.
 */
export function planClaimedPublicationNotifications(
  rows: readonly ClaimedScheduledPublication[],
): PracticePublishedSearchInput[] {
  const byAuthor = new Map<string, ClaimedScheduledPublication[]>();

  for (const row of rows) {
    if (!row.authorSlug.trim() || !row.practiceSlug.trim()) {
      continue;
    }

    const list = byAuthor.get(row.authorId) ?? [];
    list.push(row);
    byAuthor.set(row.authorId, list);
  }

  const plans: PracticePublishedSearchInput[] = [];

  for (const list of byAuthor.values()) {
    const ordered = [...list].sort((left, right) => {
      const delta = Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
      if (delta !== 0 && Number.isFinite(delta)) {
        return delta;
      }

      return left.practiceId.localeCompare(right.practiceId);
    });

    ordered.forEach((row, index) => {
      plans.push({
        authorSlug: row.authorSlug,
        practiceSlug: row.practiceSlug,
        previousStatus: "published",
        nextStatus: "published",
        catalogVisibility: row.catalogVisibility,
        isCatalogListed: row.isCatalogListed,
        isFirstPublishOfPractice: true,
        publishedCountBefore: row.priorPublicCount + index,
        publiclyAvailable: true,
        firstPublicGoLive: true,
      });
    });
  }

  return plans;
}

export type PracticePublishedSearchInput = {
  authorSlug: string;
  practiceSlug: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
  isFirstPublishOfPractice: boolean;
  publishedCountBefore: number;
  /** When false, the product is approved but not publicly available yet. */
  publiclyAvailable?: boolean;
  /** Schedule elapsed after approval. Status was already published. */
  firstPublicGoLive?: boolean;
};

/**
 * Pure combined planner for a successful domain publish.
 * IndexNow and Yandex stay independent; both are fail-open at schedule time.
 */
export function planPracticePublishedSearchNotifications(
  input: PracticePublishedSearchInput,
): PracticePublishedSearchPlan {
  const nextStatus = input.nextStatus ?? "published";

  if (input.publiclyAvailable === false) {
    return { indexNow: [], yandex: null };
  }

  return {
    indexNow: planPracticePublishIndexNow({
      authorSlug: input.authorSlug,
      practiceSlug: input.practiceSlug,
      isFirstPublishOfPractice: input.isFirstPublishOfPractice,
      publishedCountBefore: input.publishedCountBefore,
      catalogVisibility: input.catalogVisibility,
      isCatalogListed: input.isCatalogListed,
    }),
    yandex: planPracticeYandexRecrawl({
      previousStatus: input.previousStatus,
      nextStatus,
      catalogVisibility: input.catalogVisibility,
      isCatalogListed: input.isCatalogListed,
      authorSlug: input.authorSlug,
      practiceSlug: input.practiceSlug,
      firstPublicGoLive: input.firstPublicGoLive,
    }),
  };
}

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

export type PracticePublishedSearchInput = {
  authorSlug: string;
  practiceSlug: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
  isFirstPublishOfPractice: boolean;
  publishedCountBefore: number;
};

/**
 * Pure combined planner for a successful domain publish.
 * IndexNow and Yandex stay independent; both are fail-open at schedule time.
 */
export function planPracticePublishedSearchNotifications(
  input: PracticePublishedSearchInput,
): PracticePublishedSearchPlan {
  const nextStatus = input.nextStatus ?? "published";

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
    }),
  };
}

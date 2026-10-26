import {
  scheduleIndexNowNotification,
  type ScheduleIndexNowOptions,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import { scheduleYandexRecrawlNotification } from "@/lib/seo/yandex-webmaster/hooks";
import { YANDEX_RECRAWL_REASONS } from "@/lib/seo/yandex-webmaster/planner";
import {
  planPracticePublishedSearchNotifications,
  type PracticePublishedSearchInput,
  type PracticePublishedSearchPlan,
} from "@/lib/seo/practice-publish-plan";

export {
  planPracticePublishedSearchNotifications,
  type PracticePublishedSearchInput,
  type PracticePublishedSearchPlan,
} from "@/lib/seo/practice-publish-plan";

/**
 * After a successful publish / approve-and-publish write:
 * existing IndexNow, then Yandex Recrawl. Never throws.
 */
export function schedulePracticePublishedSearchNotifications(
  input: PracticePublishedSearchInput,
  options: ScheduleIndexNowOptions & { authorId?: string | null } = {},
): PracticePublishedSearchPlan {
  const plan = planPracticePublishedSearchNotifications(input);

  try {
    for (const event of plan.indexNow) {
      scheduleIndexNowNotification(event.urls, event.reason, options);

      if (event.reason === INDEXNOW_REASONS.author_became_public) {
        for (const url of event.urls) {
          scheduleYandexRecrawlNotification(
            url,
            YANDEX_RECRAWL_REASONS.author_became_public,
            {
              syncForTests: options.syncForTests,
              entityType: "author",
              entityId: options.authorId ?? null,
              enqueueImpl: options.enqueueImpl,
            },
          );
        }
      }
    }
  } catch {
    // Fail-open: IndexNow must not change the publish HTTP response.
  }

  try {
    if (plan.yandex) {
      scheduleYandexRecrawlNotification(plan.yandex.url, plan.yandex.reason, {
        syncForTests: options.syncForTests,
        fetchImpl: options.fetchImpl,
        sleepImpl: options.sleepImpl,
        env: options.env,
        dryRun: options.dryRun,
        entityType: options.entityType ?? "practice",
        entityId: options.entityId ?? null,
        enqueueImpl: options.enqueueImpl,
      });
    }
  } catch {
    // Fail-open: a Yandex error must not cancel publish or roll back the write.
  }

  return plan;
}

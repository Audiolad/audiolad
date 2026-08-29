import {
  scheduleIndexNowNotification,
  type ScheduleIndexNowOptions,
} from "@/lib/seo/indexnow/hooks";
import { scheduleYandexRecrawlNotification } from "@/lib/seo/yandex-webmaster/hooks";
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
  options: ScheduleIndexNowOptions = {},
): PracticePublishedSearchPlan {
  const plan = planPracticePublishedSearchNotifications(input);

  try {
    for (const event of plan.indexNow) {
      scheduleIndexNowNotification(event.urls, event.reason, options);
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
      });
    }
  } catch {
    // Fail-open: a Yandex error must not cancel publish or roll back the write.
  }

  return plan;
}

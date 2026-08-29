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

  for (const event of plan.indexNow) {
    scheduleIndexNowNotification(event.urls, event.reason, options);
  }

  if (plan.yandex) {
    scheduleYandexRecrawlNotification(plan.yandex.url, plan.yandex.reason, {
      syncForTests: options.syncForTests,
      fetchImpl: options.fetchImpl,
      sleepImpl: options.sleepImpl,
      env: options.env,
      dryRun: options.dryRun,
    });
  }

  return plan;
}

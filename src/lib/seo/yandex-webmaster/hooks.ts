import { after } from "next/server";

import {
  notifyYandexRecrawlUrl,
  type NotifyYandexRecrawlOptions,
  type NotifyYandexRecrawlResult,
} from "@/lib/seo/yandex-webmaster/notify";
import type { YandexRecrawlReason } from "@/lib/seo/yandex-webmaster/planner";

export type ScheduleYandexRecrawlOptions = NotifyYandexRecrawlOptions & {
  /**
   * When true, run inline (for unit tests) instead of Next.js `after()`.
   * Never enables network by itself — still gated by env.
   */
  syncForTests?: boolean;
};

/**
 * Fire-and-forget Webmaster Recrawl after a successful domain write.
 * Uses Next.js `after()` so the API response is not blocked.
 * Never throws to callers.
 */
export function scheduleYandexRecrawlNotification(
  url: string | null | undefined,
  reason: YandexRecrawlReason,
  options: ScheduleYandexRecrawlOptions = {},
): void {
  const cleaned = url?.trim() ?? "";

  if (!cleaned) {
    return;
  }

  const run = () => {
    void notifyYandexRecrawlUrl(cleaned, reason, options).catch(() => {
      // notifyYandexRecrawlUrl already swallows errors.
    });
  };

  if (options.syncForTests) {
    run();
    return;
  }

  try {
    after(run);
  } catch {
    // Outside a request context (scripts/tests): do not block, still non-fatal.
    run();
  }
}

export async function notifyYandexRecrawlForTests(
  url: string,
  reason: YandexRecrawlReason,
  options: NotifyYandexRecrawlOptions = {},
): Promise<NotifyYandexRecrawlResult> {
  return notifyYandexRecrawlUrl(url, reason, options);
}

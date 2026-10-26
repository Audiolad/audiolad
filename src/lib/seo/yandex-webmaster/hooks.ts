import { after } from "next/server";

import { enqueueSearchRecrawl } from "@/lib/seo/search-recrawl/enqueue";
import type {
  EnqueueSearchRecrawlInput,
  EnqueueSearchRecrawlResult,
} from "@/lib/seo/search-recrawl/memory";
import {
  notifyYandexRecrawlUrl,
  type NotifyYandexRecrawlOptions,
  type NotifyYandexRecrawlResult,
} from "@/lib/seo/yandex-webmaster/notify";
import type { YandexRecrawlReason } from "@/lib/seo/yandex-webmaster/planner";

export type ScheduleYandexRecrawlOptions = NotifyYandexRecrawlOptions & {
  /**
   * When true, enqueue inline (for unit tests) instead of Next.js `after()`.
   * Never enables network by itself.
   */
  syncForTests?: boolean;
  entityType?: string | null;
  entityId?: string | null;
  enqueueImpl?: (
    input: EnqueueSearchRecrawlInput,
  ) => Promise<EnqueueSearchRecrawlResult>;
};

/**
 * Enqueue Webmaster Recrawl after a successful domain write.
 * The worker sends the request. Never throws to callers.
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
    const enqueue = options.enqueueImpl ?? enqueueSearchRecrawl;
    void enqueue({
      url: cleaned,
      engine: "yandex",
      reason,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
    }).catch(() => {
      // enqueueSearchRecrawl already swallows errors.
    });
  };

  if (options.syncForTests) {
    run();
    return;
  }

  try {
    after(run);
  } catch {
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

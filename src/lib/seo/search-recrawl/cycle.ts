import type { NotifyIndexNowResult } from "@/lib/seo/indexnow/notify";
import { notifyIndexNowUrls } from "@/lib/seo/indexnow/notify";
import { notifyYandexRecrawlUrl } from "@/lib/seo/yandex-webmaster/notify";
import type { SearchRecrawlRow } from "@/lib/seo/search-recrawl/memory";
import {
  disposeIndexNowAttempt,
  disposeYandexAttempt,
  recrawlBackoffMs,
  SEARCH_RECRAWL_BATCH_LIMIT,
  SEARCH_RECRAWL_QUOTA_DELAY_MS,
  shouldAlertYandexStale,
  yandexSendBudget,
} from "@/lib/seo/search-recrawl/policy";

export type SearchRecrawlLog = (
  level: "info" | "error",
  event: string,
  fields: Record<string, string | number | boolean | null>,
) => void;

export type SearchRecrawlCycleDeps = {
  now: () => number;
  claimDueScheduled: () => Promise<void>;
  handoffScheduled: () => Promise<void>;
  takeDue: (limit: number) => Promise<SearchRecrawlRow[]>;
  complete: (
    row: SearchRecrawlRow,
    attempts: number,
    httpStatus: number | null,
  ) => Promise<void>;
  retry: (
    row: SearchRecrawlRow,
    attempts: number,
    error: string,
    httpStatus: number | null,
    nextAttemptAt: number,
  ) => Promise<void>;
  dead: (
    row: SearchRecrawlRow,
    attempts: number,
    error: string,
    httpStatus: number | null,
  ) => Promise<void>;
  reject: (row: SearchRecrawlRow, error: string) => Promise<void>;
  health: () => Promise<{
    pendingCount: number;
    oldestPendingAt: number | null;
    lastDeliveredAt: number | null;
  }>;
  readQuota: () => Promise<{ ok: boolean; remainder: number | null }>;
  sendYandex: (
    url: string,
    reason: string,
  ) => Promise<{
    status: string;
    errorCode?: string | null;
    httpStatus?: number | null;
  }>;
  sendIndexNow: (url: string, reason: string) => Promise<{ status: string }>;
  log: SearchRecrawlLog;
};

export type SearchRecrawlCycleResult = {
  claimed: boolean;
  handedOff: boolean;
  delivered: number;
  retried: number;
  dead: number;
  rejected: number;
  alerted: boolean;
};

async function settle(
  deps: SearchRecrawlCycleDeps,
  row: SearchRecrawlRow,
  disposition: ReturnType<typeof disposeYandexAttempt>,
  httpStatus: number | null,
): Promise<"delivered" | "retried" | "dead" | "rejected"> {
  if (disposition.action === "delivered") {
    await deps.complete(row, row.attempts + 1, httpStatus);
    return "delivered";
  }

  if (disposition.action === "rejected") {
    await deps.reject(row, disposition.error);
    return "rejected";
  }

  if (disposition.action === "dead") {
    await deps.dead(row, row.attempts + 1, disposition.error, httpStatus);
    return "dead";
  }

  const attempts = disposition.countAttempt ? row.attempts + 1 : row.attempts;
  await deps.retry(
    row,
    attempts,
    disposition.error,
    httpStatus,
    deps.now() + disposition.delayMs,
  );
  return "retried";
}

/**
 * One worker tick: claim due publications, move their outbox rows onto this
 * queue, then send due URLs. Public page reads do not call this.
 */
export async function runSearchRecrawlCycle(
  deps: SearchRecrawlCycleDeps,
): Promise<SearchRecrawlCycleResult> {
  const result: SearchRecrawlCycleResult = {
    claimed: false,
    handedOff: false,
    delivered: 0,
    retried: 0,
    dead: 0,
    rejected: 0,
    alerted: false,
  };

  try {
    await deps.claimDueScheduled();
    result.claimed = true;
  } catch {
    deps.log("error", "claim_failed", {});
  }

  try {
    await deps.handoffScheduled();
    result.handedOff = true;
  } catch {
    deps.log("error", "handoff_failed", {});
  }

  let rows: SearchRecrawlRow[] = [];

  try {
    rows = await deps.takeDue(SEARCH_RECRAWL_BATCH_LIMIT);
  } catch {
    deps.log("error", "take_failed", {});
    return result;
  }

  let quota: { ok: boolean; remainder: number | null } = { ok: false, remainder: null };

  if (rows.some((row) => row.engine === "yandex")) {
    try {
      quota = await deps.readQuota();
    } catch {
      quota = { ok: false, remainder: null };
    }
  }

  let yandexBudget = yandexSendBudget({
    quotaOk: quota.ok,
    quotaRemainder: quota.remainder,
  });
  let quotaHeld = quota.ok && yandexBudget === 0;

  for (const row of rows) {
    try {
      if (row.engine === "indexnow") {
        const sent = await deps.sendIndexNow(row.url, row.reason);
        const outcome = await settle(
          deps,
          row,
          disposeIndexNowAttempt({
            status: sent.status,
            attemptsAfter: row.attempts + 1,
          }),
          null,
        );
        result[outcome] += 1;
        continue;
      }

      if (quotaHeld || yandexBudget <= 0) {
        await deps.retry(
          row,
          row.attempts,
          "quota_exhausted",
          null,
          deps.now() + SEARCH_RECRAWL_QUOTA_DELAY_MS,
        );
        result.retried += 1;
        continue;
      }

      const sent = await deps.sendYandex(row.url, row.reason);
      yandexBudget -= 1;

      if (sent.status === "quota_exhausted" || sent.httpStatus === 429) {
        quotaHeld = true;
      }

      const outcome = await settle(
        deps,
        row,
        disposeYandexAttempt({
          status: sent.status,
          errorCode: sent.errorCode,
          httpStatus: sent.httpStatus,
          attemptsAfter: row.attempts + 1,
        }),
        sent.httpStatus ?? null,
      );
      result[outcome] += 1;
    } catch {
      result.retried += 1;
      deps.log("error", "row_failed", { engine: row.engine });

      try {
        await deps.retry(
          row,
          row.attempts + 1,
          "unexpected_error",
          null,
          deps.now() + recrawlBackoffMs(row.attempts + 1),
        );
      } catch {
        deps.log("error", "retry_failed", { engine: row.engine });
      }
    }
  }

  try {
    const health = await deps.health();
    result.alerted = shouldAlertYandexStale({
      pendingCount: health.pendingCount,
      oldestPendingAt: health.oldestPendingAt,
      lastDeliveredAt: health.lastDeliveredAt,
      now: deps.now(),
    });

    if (result.alerted) {
      deps.log("error", "alert_no_success", {
        pending: health.pendingCount,
        oldestPendingAt: health.oldestPendingAt,
        lastDeliveredAt: health.lastDeliveredAt,
      });
    }
  } catch {
    deps.log("error", "health_failed", {});
  }

  deps.log("info", "cycle", {
    delivered: result.delivered,
    retried: result.retried,
    dead: result.dead,
    rejected: result.rejected,
    alerted: result.alerted,
    quotaOk: quota.ok,
    quotaRemainder: quota.remainder,
  });

  return result;
}

export function yandexNotifyFields(result: {
  status: string;
  http: { status: number | null; errorCode?: string | null } | null;
}): {
  status: string;
  errorCode: string | null;
  httpStatus: number | null;
} {
  return {
    status: result.status,
    errorCode: result.http?.errorCode ?? null,
    httpStatus: result.http?.status ?? null,
  };
}

export function indexNowNotifyFields(result: NotifyIndexNowResult): { status: string } {
  return { status: result.status };
}

export async function sendQueuedYandexUrl(
  url: string,
  reason: string,
): Promise<{
  status: string;
  errorCode?: string | null;
  httpStatus?: number | null;
}> {
  const result = await notifyYandexRecrawlUrl(url, reason);
  return yandexNotifyFields(result);
}

export async function sendQueuedIndexNowUrl(
  url: string,
  reason: string,
): Promise<{ status: string }> {
  const result = await notifyIndexNowUrls([url], reason);
  return indexNowNotifyFields(result);
}

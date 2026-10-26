import type { SupabaseClient } from "@supabase/supabase-js";

import { checkYandexRecrawlQuota } from "@/lib/seo/yandex-webmaster/client";
import { classifyYandexQuotaRead } from "@/lib/seo/search-recrawl/policy";
import {
  runSearchRecrawlCycle,
  sendQueuedIndexNowUrl,
  sendQueuedYandexUrl,
  type SearchRecrawlCycleDeps,
} from "@/lib/seo/search-recrawl/cycle";
import type { SearchRecrawlRow } from "@/lib/seo/search-recrawl/memory";
import { handoffScheduledPublishOutbox } from "@/lib/seo/search-recrawl/scheduled-handoff";

type DueRow = {
  id?: unknown;
  url?: unknown;
  engine?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  reason?: unknown;
  attempts?: unknown;
  lease_token?: unknown;
  created_at?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseDueRow(row: DueRow): SearchRecrawlRow | null {
  const id = readString(row.id);
  const url = readString(row.url);
  const engine = readString(row.engine);
  const reason = readString(row.reason);
  const leaseToken = readString(row.lease_token);
  const createdAt = readString(row.created_at);

  if (!id || !url || (engine !== "yandex" && engine !== "indexnow") || !reason || !leaseToken) {
    return null;
  }

  return {
    id,
    url,
    engine,
    entityType: readString(row.entity_type),
    entityId: readString(row.entity_id),
    reason,
    status: "leased",
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    lastError: null,
    lastHttpStatus: null,
    nextAttemptAt: 0,
    createdAt: createdAt ? Date.parse(createdAt) : Date.now(),
    updatedAt: Date.now(),
    deliveredAt: null,
    leaseToken,
    leasedUntil: null,
  };
}

async function expectWrite(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    throw error;
  }
}

export function createSupabaseSearchRecrawlDeps(
  supabase: SupabaseClient,
): SearchRecrawlCycleDeps {
  return {
    now: () => Date.now(),
    claimDueScheduled: async () => {
      const { error } = await supabase.rpc("claim_due_scheduled_practice_publications");
      if (error) {
        throw error;
      }
    },
    handoffScheduled: () => handoffScheduledPublishOutbox(supabase),
    takeDue: async (limit) => {
      const { data, error } = await supabase.rpc("take_due_search_recrawl", {
        p_limit: limit,
      });

      if (error || !Array.isArray(data)) {
        return [];
      }

      return data
        .map((row) => parseDueRow(row as DueRow))
        .filter((row): row is SearchRecrawlRow => row != null);
    },
    complete: (row, attempts, httpStatus) =>
      expectWrite(supabase, "complete_search_recrawl", {
        p_id: row.id,
        p_token: row.leaseToken,
        p_attempts: attempts,
        p_http_status: httpStatus,
      }),
    retry: (row, attempts, error, httpStatus, nextAttemptAt) =>
      expectWrite(supabase, "retry_search_recrawl", {
        p_id: row.id,
        p_token: row.leaseToken,
        p_attempts: attempts,
        p_last_error: error,
        p_last_http_status: httpStatus,
        p_next_attempt_at: new Date(nextAttemptAt).toISOString(),
      }),
    dead: (row, attempts, error, httpStatus) =>
      expectWrite(supabase, "dead_letter_search_recrawl", {
        p_id: row.id,
        p_token: row.leaseToken,
        p_attempts: attempts,
        p_last_error: error,
        p_last_http_status: httpStatus,
      }),
    reject: (row, error) =>
      expectWrite(supabase, "reject_search_recrawl", {
        p_id: row.id,
        p_token: row.leaseToken,
        p_last_error: error,
      }),
    health: async () => {
      const { data, error } = await supabase.rpc("search_recrawl_yandex_health");
      const row = Array.isArray(data) ? data[0] : data;

      if (error || !row || typeof row !== "object") {
        return { pendingCount: 0, oldestPendingAt: null, lastDeliveredAt: null };
      }

      const record = row as {
        pending_count?: unknown;
        oldest_pending_at?: unknown;
        last_delivered_at?: unknown;
      };

      return {
        pendingCount:
          typeof record.pending_count === "number" ? record.pending_count : 0,
        oldestPendingAt:
          typeof record.oldest_pending_at === "string"
            ? Date.parse(record.oldest_pending_at)
            : null,
        lastDeliveredAt:
          typeof record.last_delivered_at === "string"
            ? Date.parse(record.last_delivered_at)
            : null,
      };
    },
    readQuota: async () => {
      const quota = await checkYandexRecrawlQuota();
      return classifyYandexQuotaRead({
        ok: quota.ok,
        remainder: quota.quotaRemainder ?? null,
        errorCode: quota.errorCode ?? null,
      });
    },
    sendYandex: (url, reason) => sendQueuedYandexUrl(url, reason),
    sendIndexNow: (url, reason) => sendQueuedIndexNowUrl(url, reason),
    log: (level, event, fields) => {
      const line = `[search-recrawl] ${new Date().toISOString()} ${event}`;
      if (level === "error") {
        console.error(line, fields);
        return;
      }

      console.info(line, fields);
    },
  };
}

export async function runSupabaseSearchRecrawlCycle(supabase: SupabaseClient) {
  return runSearchRecrawlCycle(createSupabaseSearchRecrawlDeps(supabase));
}

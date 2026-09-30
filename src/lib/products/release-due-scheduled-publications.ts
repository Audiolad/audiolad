import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deliverPendingScheduledPublishEvents,
  yandexDeliveryOutcome,
  type ScheduledPublishDeliveryOutcome,
  type ScheduledPublishOutboxEvent,
} from "@/lib/products/scheduled-publish-outbox";
import { notifyIndexNowUrls } from "@/lib/seo/indexnow/notify";
import {
  planClaimedPublicationNotifications,
  planPracticePublishedSearchNotifications,
} from "@/lib/seo/practice-publish-plan";
import { notifyYandexRecrawlUrl } from "@/lib/seo/yandex-webmaster/notify";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type OutboxRow = {
  id?: unknown;
  practice_id?: unknown;
  author_id?: unknown;
  practice_slug?: unknown;
  author_slug?: unknown;
  catalog_visibility?: unknown;
  is_catalog_listed?: unknown;
  published_at?: unknown;
  prior_public_count?: unknown;
  lease_token?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value;
}

function parseOutboxRow(row: OutboxRow): ScheduledPublishOutboxEvent | null {
  const id = readString(row.id);
  const practiceId = readString(row.practice_id);
  const authorId = readString(row.author_id);
  const practiceSlug = readString(row.practice_slug);
  const authorSlug = readString(row.author_slug);
  const publishedAt = readString(row.published_at);
  const leaseToken = readString(row.lease_token);
  const prior =
    typeof row.prior_public_count === "number" && Number.isFinite(row.prior_public_count)
      ? row.prior_public_count
      : 0;

  if (
    !id ||
    !practiceId ||
    !authorId ||
    !practiceSlug ||
    !authorSlug ||
    !publishedAt ||
    !leaseToken
  ) {
    return null;
  }

  return {
    id,
    practiceId,
    authorId,
    practiceSlug,
    authorSlug,
    catalogVisibility:
      typeof row.catalog_visibility === "string" ? row.catalog_visibility : null,
    isCatalogListed:
      typeof row.is_catalog_listed === "boolean" ? row.is_catalog_listed : null,
    publishedAt,
    priorPublicCount: prior,
    leaseToken,
  };
}

function indexNowSettled(status: string): boolean {
  return status === "disabled" || status === "no_urls" || status === "submitted";
}

async function notifyOutboxEvent(
  event: ScheduledPublishOutboxEvent,
): Promise<ScheduledPublishDeliveryOutcome> {
  const [plan] = planClaimedPublicationNotifications([
    {
      practiceId: event.practiceId,
      authorId: event.authorId,
      practiceSlug: event.practiceSlug,
      authorSlug: event.authorSlug,
      catalogVisibility: event.catalogVisibility,
      isCatalogListed: event.isCatalogListed,
      publishedAt: event.publishedAt,
      priorPublicCount: event.priorPublicCount,
    },
  ]);

  if (!plan) {
    return "delivered";
  }

  const searchPlan = planPracticePublishedSearchNotifications(plan);

  for (const indexEvent of searchPlan.indexNow) {
    const result = await notifyIndexNowUrls(indexEvent.urls, indexEvent.reason);

    if (!indexNowSettled(result.status)) {
      return "retry";
    }
  }

  if (searchPlan.yandex) {
    const result = await notifyYandexRecrawlUrl(
      searchPlan.yandex.url,
      searchPlan.yandex.reason,
    );

    return yandexDeliveryOutcome(result.status);
  }

  return "delivered";
}

async function rpcLease(
  supabase: SupabaseClient,
  fn: string,
  events: ScheduledPublishOutboxEvent[],
) {
  const { error } = await supabase.rpc(fn, {
    p_ids: events.map((event) => event.id),
    p_tokens: events.map((event) => event.leaseToken),
  });

  if (error) {
    throw error;
  }
}

async function drainScheduledPublishOutbox(supabase: SupabaseClient): Promise<void> {
  await deliverPendingScheduledPublishEvents({
    take: async () => {
      const { data, error } = await supabase.rpc(
        "take_pending_scheduled_publish_notifications",
      );

      if (error || !Array.isArray(data)) {
        return [];
      }

      return data
        .map((row) => parseOutboxRow(row as OutboxRow))
        .filter((row): row is ScheduledPublishOutboxEvent => row != null);
    },
    complete: (events) =>
      rpcLease(supabase, "complete_scheduled_publish_notifications", events),
    abandon: (events) =>
      rpcLease(supabase, "abandon_scheduled_publish_notifications", events),
    deadLetter: (events) =>
      rpcLease(supabase, "dead_letter_scheduled_publish_notifications", events),
    notify: notifyOutboxEvent,
  });
}

/**
 * Stamp due schedules before the public read returns.
 * Search delivery runs after the response. If that callback never runs,
 * pending outbox rows stay for the next server run.
 * Fail-open: a missing key or a write error must not break the public read.
 */
export async function releaseDueScheduledPublications(): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const claim = await supabase.rpc("claim_due_scheduled_practice_publications");

    if (claim.error) {
      return;
    }

    try {
      after(() => {
        void drainScheduledPublishOutbox(supabase).catch(() => {
          // An unfinished drain leaves the row pending or leased for retry.
        });
      });
    } catch {
      // No request context: do not call IndexNow or Yandex on this turn.
    }
  } catch {
    // Public pages stay available when the service claim cannot run.
  }
}

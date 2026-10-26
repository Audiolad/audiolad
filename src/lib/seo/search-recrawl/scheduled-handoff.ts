import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deliverPendingScheduledPublishEvents,
  type ScheduledPublishDeliveryOutcome,
  type ScheduledPublishOutboxEvent,
} from "@/lib/products/scheduled-publish-outbox";
import {
  planClaimedPublicationNotifications,
  planPracticePublishedSearchNotifications,
} from "@/lib/seo/practice-publish-plan";
import { enqueueSearchRecrawl } from "@/lib/seo/search-recrawl/enqueue";

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

/**
 * Move a leased scheduled-publish outbox row onto the durable recrawl queue.
 * External APIs are not called here. A failed insert leaves the outbox pending.
 */
export async function enqueueScheduledPublishEvent(
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
    for (const url of indexEvent.urls) {
      const queued = await enqueueSearchRecrawl({
        url,
        engine: "indexnow",
        reason: indexEvent.reason,
        entityType: "practice",
        entityId: event.practiceId,
      });

      if (queued.outcome === "failed") {
        return "retry";
      }
    }
  }

  if (searchPlan.yandex) {
    const queued = await enqueueSearchRecrawl({
      url: searchPlan.yandex.url,
      engine: "yandex",
      reason: searchPlan.yandex.reason,
      entityType: "practice",
      entityId: event.practiceId,
    });

    if (queued.outcome === "failed") {
      return "retry";
    }
  }

  return "delivered";
}

/**
 * Drain the scheduled-publish outbox into search_recrawl_queue.
 * The worker calls this. Public page reads do not.
 */
export async function handoffScheduledPublishOutbox(
  supabase: SupabaseClient,
): Promise<void> {
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
    notify: enqueueScheduledPublishEvent,
  });
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deliverPendingScheduledPublishEvents,
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
  const prior =
    typeof row.prior_public_count === "number" && Number.isFinite(row.prior_public_count)
      ? row.prior_public_count
      : 0;

  if (!id || !practiceId || !authorId || !practiceSlug || !authorSlug || !publishedAt) {
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
  };
}

function indexNowSettled(status: string): boolean {
  return status === "disabled" || status === "no_urls" || status === "submitted";
}

function yandexSettled(status: string): boolean {
  return (
    status === "disabled" ||
    status === "submitted" ||
    status === "already_queued" ||
    status === "auth_failed" ||
    status === "invalid_user_id" ||
    status === "host_not_verified" ||
    status === "quota_exhausted"
  );
}

async function notifyOutboxEvent(event: ScheduledPublishOutboxEvent): Promise<boolean> {
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
    return true;
  }

  const searchPlan = planPracticePublishedSearchNotifications(plan);

  for (const indexEvent of searchPlan.indexNow) {
    const result = await notifyIndexNowUrls(indexEvent.urls, indexEvent.reason);

    if (!indexNowSettled(result.status)) {
      return false;
    }
  }

  if (searchPlan.yandex) {
    const result = await notifyYandexRecrawlUrl(
      searchPlan.yandex.url,
      searchPlan.yandex.reason,
    );

    if (!yandexSettled(result.status)) {
      return false;
    }
  }

  return true;
}

async function rpcIds(supabase: SupabaseClient, fn: string, ids: string[]) {
  const { error } = await supabase.rpc(fn, { p_ids: ids });

  if (error) {
    throw error;
  }
}

/**
 * Stamp due schedules and drain the durable notification outbox.
 * Uses the service-role client. The caller session is not allowed to claim.
 * Fail-open: a missing key or a write error must not break the public read.
 */
export async function releaseDueScheduledPublications(): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const claim = await supabase.rpc("claim_due_scheduled_practice_publications");

    if (claim.error) {
      return;
    }

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
      complete: (ids) => rpcIds(supabase, "complete_scheduled_publish_notifications", ids),
      abandon: (ids) => rpcIds(supabase, "abandon_scheduled_publish_notifications", ids),
      notify: notifyOutboxEvent,
    });
  } catch {
    // Public pages stay available when the service claim cannot run.
  }
}

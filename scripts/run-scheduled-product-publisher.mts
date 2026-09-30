/**
 * Publishes approved author products when scheduled_publish_at becomes due.
 * The DB RPC owns locking/idempotency; this loop only provides low-latency
 * polling and post-publish search notifications.
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { schedulePracticePublishedSearchNotifications } from "../src/lib/seo/practice-publish-notifications";

const silentNextEnvLog = {
  info() {},
  error() {},
};

type ScheduledPublicationRow = {
  practice_id: string;
  author_id: string;
  practice_slug: string | null;
  author_slug: string | null;
  previous_status: string | null;
  catalog_visibility: string | null;
  is_catalog_listed: boolean | null;
  was_first_publish: boolean | null;
  published_count_before: number | string | null;
  scheduled_at: string | null;
  published_at: string | null;
  result_status: "published" | "failed";
  error_code: string | null;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 5000 ? value : fallback;
}

function normalizeCatalogVisibility(
  value: string | null,
): "listed" | "unlisted" | "selected_users" {
  if (value === "unlisted" || value === "selected_users") return value;
  return "listed";
}

async function main() {
  loadEnvConfig(
    process.cwd(),
    process.env.NODE_ENV !== "production",
    silentNextEnvLog,
    true,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("scheduled_product_publisher_environment_missing");
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const intervalMs = envNumber(
    "SCHEDULED_PRODUCT_PUBLISH_INTERVAL_MS",
    15_000,
  );

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  console.log(
    JSON.stringify({
      event: "scheduled_product_publisher_started",
      intervalMs,
    }),
  );

  while (!stopping) {
    const cycleStartedAt = Date.now();

    try {
      const { data, error } = await service.rpc(
        "publish_due_scheduled_practices",
        { p_limit: 50 },
      );

      if (error) {
        throw new Error(`scheduled_publish_rpc_failed:${error.code ?? "unknown"}`);
      }

      const rows = (data ?? []) as ScheduledPublicationRow[];
      const published = rows.filter((row) => row.result_status === "published");
      const failed = rows.filter((row) => row.result_status === "failed");

      for (const row of published) {
        if (!row.author_slug || !row.practice_slug) continue;

        schedulePracticePublishedSearchNotifications({
          authorSlug: row.author_slug,
          practiceSlug: row.practice_slug,
          previousStatus: row.previous_status,
          nextStatus: "published",
          catalogVisibility: normalizeCatalogVisibility(row.catalog_visibility),
          isCatalogListed: row.is_catalog_listed !== false,
          isFirstPublishOfPractice: row.was_first_publish === true,
          publishedCountBefore: Number(row.published_count_before ?? 0),
        });
      }

      if (published.length > 0 || failed.length > 0) {
        console.log(
          JSON.stringify({
            event: "scheduled_product_publish_cycle",
            published: published.length,
            failed: failed.length,
            failedItems: failed.map((row) => ({
              practiceId: row.practice_id,
              errorCode: row.error_code,
            })),
          }),
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "scheduled_product_publish_cycle_failed",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }

    const elapsed = Date.now() - cycleStartedAt;
    const sleepMs = Math.max(1000, intervalMs - elapsed);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  console.log(JSON.stringify({ event: "scheduled_product_publisher_stopped" }));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "scheduled_product_publisher_fatal",
      error: error instanceof Error ? error.message : "unknown",
    }),
  );
  process.exitCode = 1;
});

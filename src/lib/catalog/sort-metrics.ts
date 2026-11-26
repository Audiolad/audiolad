import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isGuestRatingsIncludedInPublicAggregate } from "@/lib/ratings/guest/feature";
import { aggregateActivePracticeRatings } from "@/lib/ratings/aggregate";
import { chunkIds } from "@/lib/topics/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export { CATALOG_QUALIFIED_LISTEN_MIN_MS } from "@/lib/catalog/sort-metrics-pure";
export { countQualifiedListenSessions } from "@/lib/catalog/sort-metrics-pure";

export const CATALOG_LISTING_METRICS_CHUNK_SIZE = 80;

export type CatalogListingSortMetrics = {
  popularListenCount: number;
  totalStars: number;
};

export type CatalogListingCandidateMetrics = {
  publication_id: string;
  sortTimestamp: number;
};

type ListenCountRow = {
  practice_id: string;
  qualified_listen_count: number | string | null;
};

type RatingRow = {
  practice_id: string;
  stars: number | string;
};

type GuestRatingRow = RatingRow;

function parseNonNegativeInt(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return 0;
}

async function loadQualifiedListenCounts(
  client: SupabaseClient,
  practiceIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (practiceIds.length === 0) {
    return counts;
  }

  for (const chunk of chunkIds([...practiceIds], CATALOG_LISTING_METRICS_CHUNK_SIZE)) {
    const { data, error } = await client.rpc("catalog_practice_qualified_listen_counts", {
      p_practice_ids: chunk,
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as ListenCountRow[]) {
      counts.set(
        row.practice_id,
        parseNonNegativeInt(row.qualified_listen_count),
      );
    }
  }

  return counts;
}

async function loadRegisteredRatingTotals(
  client: SupabaseClient,
  practiceIds: readonly string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();

  if (practiceIds.length === 0) {
    return totals;
  }

  for (const chunk of chunkIds([...practiceIds], CATALOG_LISTING_METRICS_CHUNK_SIZE)) {
    const { data, error } = await client
      .from("practice_ratings")
      .select("practice_id, stars")
      .in("practice_id", chunk)
      .is("excluded_at", null);

    if (error) {
      throw new Error(error.message);
    }

    const grouped = new Map<string, Array<{ stars: number }>>();

    for (const row of (data ?? []) as RatingRow[]) {
      const list = grouped.get(row.practice_id) ?? [];
      list.push({ stars: parseNonNegativeInt(row.stars) });
      grouped.set(row.practice_id, list);
    }

    for (const practiceId of chunk) {
      const aggregate = aggregateActivePracticeRatings(grouped.get(practiceId) ?? []);
      totals.set(practiceId, aggregate.totalStars);
    }
  }

  return totals;
}

async function loadGuestRatingTotals(
  client: SupabaseClient,
  practiceIds: readonly string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();

  if (!isGuestRatingsIncludedInPublicAggregate() || practiceIds.length === 0) {
    return totals;
  }

  for (const chunk of chunkIds([...practiceIds], CATALOG_LISTING_METRICS_CHUNK_SIZE)) {
    const { data, error } = await client
      .from("guest_practice_ratings")
      .select("practice_id, stars")
      .in("practice_id", chunk)
      .is("excluded_at", null)
      .is("superseded_at", null)
      .is("claimed_by_user_id", null);

    if (error) {
      throw new Error(error.message);
    }

    const grouped = new Map<string, Array<{ stars: number }>>();

    for (const row of (data ?? []) as GuestRatingRow[]) {
      const list = grouped.get(row.practice_id) ?? [];
      list.push({ stars: parseNonNegativeInt(row.stars) });
      grouped.set(row.practice_id, list);
    }

    for (const practiceId of chunk) {
      const aggregate = aggregateActivePracticeRatings(grouped.get(practiceId) ?? []);
      if (aggregate.totalStars > 0) {
        totals.set(practiceId, aggregate.totalStars);
      }
    }
  }

  return totals;
}

export async function loadCatalogListingSortMetrics(
  practiceIds: readonly string[],
  sorts: { popular: boolean; rating: boolean },
  client: SupabaseClient = createServiceRoleClient(),
): Promise<Map<string, CatalogListingSortMetrics>> {
  const metrics = new Map<string, CatalogListingSortMetrics>();

  for (const practiceId of practiceIds) {
    metrics.set(practiceId, { popularListenCount: 0, totalStars: 0 });
  }

  const [popularCounts, registeredStars, guestStars] = await Promise.all([
    sorts.popular ? loadQualifiedListenCounts(client, practiceIds) : Promise.resolve(new Map()),
    sorts.rating ? loadRegisteredRatingTotals(client, practiceIds) : Promise.resolve(new Map()),
    sorts.rating ? loadGuestRatingTotals(client, practiceIds) : Promise.resolve(new Map()),
  ]);

  for (const practiceId of practiceIds) {
    const current = metrics.get(practiceId) ?? {
      popularListenCount: 0,
      totalStars: 0,
    };

    metrics.set(practiceId, {
      popularListenCount: popularCounts.get(practiceId) ?? 0,
      totalStars:
        (registeredStars.get(practiceId) ?? 0) + (guestStars.get(practiceId) ?? 0),
    });
  }

  return metrics;
}

export function attachCatalogListingSortMetrics<
  T extends CatalogListingCandidateMetrics,
>(
  items: T[],
  metricsById: ReadonlyMap<string, CatalogListingSortMetrics>,
): Array<
  T & {
    popularListenCount: number;
    totalStars: number;
  }
> {
  return items.map((item) => {
    const metrics = metricsById.get(item.publication_id);

    return {
      ...item,
      popularListenCount: metrics?.popularListenCount ?? 0,
      totalStars: metrics?.totalStars ?? 0,
    };
  });
}
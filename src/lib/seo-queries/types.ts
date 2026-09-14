export type SeoQueryLifecycle =
  | "available"
  | "in_progress"
  | "moderation"
  | "published";

export type SeoQueryOpportunity = {
  id: string;
  queryText: string;
  source: string;
  frequency: number | null;
  clusterName: string | null;
  intent: string | null;
  recommendedFormat: string | null;
  audioFit: string | null;
  lifecycle: SeoQueryLifecycle;
  reservationId: string | null;
  expiresAt: string | null;
  productId: string | null;
  productTitle: string | null;
};

export function lifecycleLabel(value: SeoQueryLifecycle): string {
  switch (value) {
    case "in_progress":
      return "В работе";
    case "moderation":
      return "На модерации";
    case "published":
      return "Опубликован";
    default:
      return "Свободен";
  }
}

/** Canonical active SEO reservation count for an author workspace.
 * Matches /seo-opportunities: own reservationId present and lifecycle !== published.
 * Published (used / product published) does not consume the 5-slot active limit.
 */
export function countActiveAuthorSeoReservations(
  opportunities: ReadonlyArray<Pick<SeoQueryOpportunity, "reservationId" | "lifecycle">>,
): number {
  return opportunities.filter(
    (item) => Boolean(item.reservationId) && item.lifecycle !== "published",
  ).length;
}

/** Soft UI limit — server remains authoritative. */
export const SEO_ACTIVE_RESERVATION_LIMIT = 5;

export function isSeoActiveReservationLimitReached(
  activeCount: number,
  limit: number = SEO_ACTIVE_RESERVATION_LIMIT,
): boolean {
  return activeCount >= limit;
}

/** Local count after a reserve attempt: bump only on success. */
export function nextActiveReservationCountAfterReserve(
  current: number,
  reserveSucceeded: boolean,
): number {
  return reserveSucceeded ? current + 1 : current;
}

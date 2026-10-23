import { aggregateActivePracticeRatings } from "@/lib/ratings/aggregate";
import type { PracticeRatingAggregate } from "@/lib/ratings/types";
import { EMPTY_RATING_AGGREGATE } from "@/lib/ratings/types";

export function combineRatingAggregates(
  registered: PracticeRatingAggregate,
  guest: PracticeRatingAggregate,
): PracticeRatingAggregate {
  const totalStars = registered.totalStars + guest.totalStars;
  const ratingCount = registered.ratingCount + guest.ratingCount;
  if (ratingCount === 0) {
    return EMPTY_RATING_AGGREGATE;
  }
  return { totalStars, ratingCount };
}

/**
 * Public mean stays the registered arithmetic mean unless inclusion is on.
 * Guest totals are returned only when the separate display flag is on.
 * Claimed and superseded guest rows must already be filtered out of `guest`.
 */
export function resolveDisplayedRatingAggregates(input: {
  registered: PracticeRatingAggregate;
  guest: PracticeRatingAggregate;
  includeInPublic: boolean;
  showGuestSeparately: boolean;
}): {
  aggregate: PracticeRatingAggregate;
  guestAggregate: PracticeRatingAggregate | null;
} {
  return {
    aggregate: input.includeInPublic
      ? combineRatingAggregates(input.registered, input.guest)
      : input.registered,
    guestAggregate: input.showGuestSeparately ? input.guest : null,
  };
}

export function aggregateGuestRatingRows(
  rows: Array<{ stars: number; supersededAt?: string | null; excludedAt?: string | null; claimedByUserId?: string | null }>,
): PracticeRatingAggregate {
  return aggregateActivePracticeRatings(
    rows
      .filter(
        (row) =>
          row.supersededAt == null &&
          row.claimedByUserId == null &&
          row.excludedAt == null,
      )
      .map((row) => ({ stars: row.stars })),
  );
}

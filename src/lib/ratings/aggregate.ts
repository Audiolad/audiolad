import {
  EMPTY_RATING_AGGREGATE,
  type PracticeRatingAggregate,
} from "@/lib/ratings/types";

export function aggregateActivePracticeRatings(
  rows: Array<{ stars: number; excludedAt?: string | null }>,
): PracticeRatingAggregate {
  let totalStars = 0;
  let ratingCount = 0;

  for (const row of rows) {
    if (row.excludedAt != null) {
      continue;
    }

    if (!Number.isInteger(row.stars) || row.stars < 1 || row.stars > 5) {
      continue;
    }

    totalStars += row.stars;
    ratingCount += 1;
  }

  if (ratingCount === 0) {
    return EMPTY_RATING_AGGREGATE;
  }

  return { totalStars, ratingCount };
}

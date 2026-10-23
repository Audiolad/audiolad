/**
 * Sergey, task 612f9c76: music/sounds and audio practices are counted
 * separately. Music products stay in the music segment. Practices and
 * audio posts stay in the practice segment. Means are never pooled
 * across segments; each product keeps its own arithmetic mean.
 */
export type GuestRatingSegment = "music" | "practice";

export function guestRatingSegmentForProductKind(
  productKind: string | null | undefined,
): GuestRatingSegment {
  return productKind === "music" ? "music" : "practice";
}

export type GuestRatingSegmentTotals = {
  totalStars: number;
  ratingCount: number;
  average: number | null;
};

export function emptyGuestRatingSegmentTotals(): GuestRatingSegmentTotals {
  return { totalStars: 0, ratingCount: 0, average: null };
}

export function addGuestRatingSegmentStar(
  totals: GuestRatingSegmentTotals,
  stars: number,
): GuestRatingSegmentTotals {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return totals;
  }

  const totalStars = totals.totalStars + stars;
  const ratingCount = totals.ratingCount + 1;
  return {
    totalStars,
    ratingCount,
    average: totalStars / ratingCount,
  };
}

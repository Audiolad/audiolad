export const MIN_PRACTICE_RATING_STARS = 1;
export const MAX_PRACTICE_RATING_STARS = 5;

export function parsePracticeRatingStars(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < MIN_PRACTICE_RATING_STARS || value > MAX_PRACTICE_RATING_STARS) {
    return null;
  }

  return value;
}

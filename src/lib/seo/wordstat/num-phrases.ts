import {
  WORDSTAT_API_NUM_PHRASES_MAX,
  WORDSTAT_API_NUM_PHRASES_MIN,
  WORDSTAT_NUM_PHRASES,
} from "@/lib/seo/wordstat/types";

/**
 * Fail-closed official GetTop numPhrases.
 * undefined → default 20. Invalid / out of 1..2000 → null (do not call API).
 */
export function resolveWordstatNumPhrases(value: unknown): number | null {
  if (value === undefined) {
    return WORDSTAT_NUM_PHRASES;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (
    value < WORDSTAT_API_NUM_PHRASES_MIN ||
    value > WORDSTAT_API_NUM_PHRASES_MAX
  ) {
    return null;
  }
  return value;
}

import { RATING_ELIGIBILITY_LISTEN_MS } from "@/lib/listen/listen-stats-constants";

/** Fragments shorter than the 30s floor use this share of the fragment. */
export const GUEST_SHORT_FRAGMENT_RATIO = 0.8;

/**
 * Below this length the guest must hear the whole fragment.
 * A longer short fragment still requires at least this much media time.
 */
export const GUEST_SHORT_FRAGMENT_FLOOR_MS = 5_000;

export type GuestListenAccessKind = "preview" | "full";

/**
 * Threshold for a known accessible length.
 * At least 30s when the fragment is that long. Shorter previews and
 * genuinely short products use 80% of the fragment (the whole fragment
 * when it is under 5s). Never asks for more media time than exists.
 */
export function guestRatingListenThresholdMs(
  accessibleTotalMs: number | null | undefined,
): number {
  if (
    accessibleTotalMs == null ||
    !Number.isFinite(accessibleTotalMs) ||
    accessibleTotalMs <= 0
  ) {
    return RATING_ELIGIBILITY_LISTEN_MS;
  }

  const duration = Math.floor(accessibleTotalMs);
  if (duration >= RATING_ELIGIBILITY_LISTEN_MS) {
    return RATING_ELIGIBILITY_LISTEN_MS;
  }

  if (duration <= GUEST_SHORT_FRAGMENT_FLOOR_MS) {
    return duration;
  }

  const ratioThreshold = Math.ceil(duration * GUEST_SHORT_FRAGMENT_RATIO);
  return Math.min(
    duration,
    Math.max(GUEST_SHORT_FRAGMENT_FLOOR_MS, ratioThreshold),
  );
}

/**
 * How much unique audio the guest can actually hear.
 * Preview uses the preview window only. Full listening uses the sum of
 * known track lengths. Unknown lengths stay null so the threshold stays
 * 30s and is not lowered by a guess.
 */
export function resolveGuestAccessibleTotalMs(input: {
  kind: GuestListenAccessKind;
  previewDurationMs: number | null;
  trackDurationMs: Array<number | null>;
}): number | null {
  if (input.kind === "preview") {
    if (
      input.previewDurationMs == null ||
      !Number.isFinite(input.previewDurationMs) ||
      input.previewDurationMs <= 0
    ) {
      return null;
    }
    return Math.floor(input.previewDurationMs);
  }

  if (input.trackDurationMs.length === 0) {
    return null;
  }

  let total = 0;
  for (const value of input.trackDurationMs) {
    if (value == null || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    total += Math.floor(value);
  }
  return total;
}

export function positiveDurationMs(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

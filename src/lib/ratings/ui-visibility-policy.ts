import { isListenStatsProductKind } from "@/lib/listen/listen-stats-access";

import { isRatingsUiEnabled } from "./feature";

/**
 * PDP / mini-app rating block visibility. Eligibility gates stay on the server
 * at PUT time; this only decides whether the stars UI is rendered.
 *
 * Public listenables (practice / music / audio_post) always show the block when
 * the feature flag is on — not gated by publication_class, price, purchase, or
 * course_lessons.
 */
export function resolvePracticeRatingsUiEnabled(input: {
  productKind: string | null | undefined;
  env?: { [key: string]: string | undefined };
}): boolean {
  if (!isRatingsUiEnabled(input.env)) {
    return false;
  }

  return isListenStatsProductKind(input.productKind);
}
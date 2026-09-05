import {
  canBecomeRatingEligible,
  isListenStatsProductKind,
} from "@/lib/listen/listen-stats-access";
import { isFullListenAccessMode } from "@/lib/listen/preview-access";
import type { ListenAccess } from "@/lib/listen/types";

export type RatingGateError =
  | "unauthorized"
  | "rating_not_eligible"
  | "author_cannot_rate_own_product";

export type RatingGateResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: RatingGateError };

/**
 * Server-only rating gate. Never trust client eligibility, preview, or stars.
 * Eligibility is Stage 1 `rating_eligible_at IS NOT NULL`.
 */
export function evaluatePracticeRatingGate(input: {
  userId: string | null | undefined;
  access: ListenAccess | null;
  isCourse: boolean;
  productKind?: string | null;
  isAuthorOwner: boolean;
  ratingEligibleAt: string | null | undefined;
}): RatingGateResult {
  if (!input.userId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  if (input.isAuthorOwner || input.access?.mode === "author_preview") {
    return {
      ok: false,
      status: 403,
      error: "author_cannot_rate_own_product",
    };
  }

  if (input.isCourse || !isListenStatsProductKind(input.productKind)) {
    return { ok: false, status: 403, error: "rating_not_eligible" };
  }

  if (!input.access || !isFullListenAccessMode(input.access.mode)) {
    return { ok: false, status: 403, error: "rating_not_eligible" };
  }

  if (!canBecomeRatingEligible(input.access)) {
    return { ok: false, status: 403, error: "rating_not_eligible" };
  }

  if (input.ratingEligibleAt == null || input.ratingEligibleAt === "") {
    return { ok: false, status: 403, error: "rating_not_eligible" };
  }

  return { ok: true };
}

export function isActiveRatingEligibleAt(
  ratingEligibleAt: string | null | undefined,
): boolean {
  return ratingEligibleAt != null && ratingEligibleAt !== "";
}

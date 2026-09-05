import {
  putOwnPracticeRating,
  RATING_AUTHOR_DENIED_COPY,
  RATING_NOT_ELIGIBLE_COPY,
  RATING_THANKS_COPY,
} from "@/lib/ratings/client";
import type { PracticeRatingPutState } from "@/lib/ratings/types";

export type PracticeRatingStarClickAction = "sign_in" | "put" | "ignore";

export type PracticeRatingUiState = {
  stars: number | null;
  ratingEligible: boolean;
  message: string | null;
  pendingStars: number | null;
};

/**
 * Click decision for PDP stars.
 * Authenticated users always PUT. Local GET `ratingEligible` is advisory only
 * and must not block a click after listen-stats becomes eligible on this page.
 */
export function resolvePracticeRatingStarClick(input: {
  isAuthenticated: boolean;
  isPending: boolean;
}): PracticeRatingStarClickAction {
  if (input.isPending) {
    return "ignore";
  }

  if (!input.isAuthenticated) {
    return "sign_in";
  }

  return "put";
}

export function messageForPracticeRatingError(
  error: string | undefined,
): string {
  if (error === "rating_not_eligible") {
    return RATING_NOT_ELIGIBLE_COPY;
  }

  if (error === "author_cannot_rate_own_product") {
    return RATING_AUTHOR_DENIED_COPY;
  }

  return "Не удалось сохранить оценку. Попробуйте ещё раз.";
}

export function applyOptimisticPracticeRating(
  state: PracticeRatingUiState,
  nextStars: number,
): PracticeRatingUiState {
  return {
    ...state,
    pendingStars: nextStars,
    stars: nextStars,
    message: null,
  };
}

export function applyPracticeRatingPutSuccess(
  stars: number,
): PracticeRatingUiState {
  return {
    stars,
    ratingEligible: true,
    message: RATING_THANKS_COPY,
    pendingStars: null,
  };
}

export function applyPracticeRatingPutFailure(
  previousStars: number | null,
  previousEligible: boolean,
  error: string | undefined,
): PracticeRatingUiState {
  return {
    stars: previousStars,
    ratingEligible: previousEligible,
    message: messageForPracticeRatingError(error),
    pendingStars: null,
  };
}

export type PracticeRatingPutFn = (
  apiPath: string,
  stars: number,
) => Promise<PracticeRatingPutState>;

/**
 * Authenticated star click: always PUT. Server re-checks eligibility.
 */
export async function runAuthenticatedPracticeRatingClick(input: {
  apiPath: string;
  currentStars: number | null;
  ratingEligible: boolean;
  nextStars: number;
  put?: PracticeRatingPutFn;
}): Promise<PracticeRatingUiState> {
  try {
    const put = input.put ?? putOwnPracticeRating;
    const result = await put(input.apiPath, input.nextStars);
    return applyPracticeRatingPutSuccess(result.stars);
  } catch (error) {
    const code =
      error && typeof error === "object" && "error" in error
        ? String((error as { error?: string }).error)
        : undefined;
    return applyPracticeRatingPutFailure(
      input.currentStars,
      input.ratingEligible,
      code,
    );
  }
}

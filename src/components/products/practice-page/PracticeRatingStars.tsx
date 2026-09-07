"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  buildPracticeRatingApiPath,
  fetchOwnPracticeRating,
  RATING_THANKS_COPY,
} from "@/lib/ratings/client";
import {
  applyOptimisticPracticeRating,
  resolvePracticeRatingStarClick,
  runAuthenticatedPracticeRatingClick,
  type PracticeRatingUiState,
} from "@/lib/ratings/star-click";
import { MAX_PRACTICE_RATING_STARS } from "@/lib/ratings/stars";
import type { PracticeRatingAggregate } from "@/lib/ratings/types";

type PracticeRatingStarsProps = {
  authorSlug: string;
  productSlug: string;
  signInReturnPath: string;
  isAuthenticated: boolean;
  initialAggregate: PracticeRatingAggregate;
};

function emptyRatingUi(
  aggregate: PracticeRatingAggregate,
): PracticeRatingUiState {
  return {
    stars: null,
    ratingEligible: false,
    message: null,
    pendingStars: null,
    aggregate,
  };
}

function RatingAggregateStarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function RatingAggregateUserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
    </svg>
  );
}

export default function PracticeRatingStars({
  authorSlug,
  productSlug,
  signInReturnPath,
  isAuthenticated,
  initialAggregate,
}: PracticeRatingStarsProps) {
  const router = useRouter();
  const apiPath = buildPracticeRatingApiPath(authorSlug, productSlug);
  const [ui, setUi] = useState<PracticeRatingUiState>(() =>
    emptyRatingUi(initialAggregate),
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;

    void fetchOwnPracticeRating(apiPath)
      .then((state) => {
        if (cancelled) {
          return;
        }

        setUi({
          stars: state.stars,
          ratingEligible: state.ratingEligible,
          message: state.stars != null ? RATING_THANKS_COPY : null,
          pendingStars: null,
          aggregate: state.aggregate,
        });
      })
      .catch(() => {
        // GET is advisory for UI; PUT re-checks eligibility on the server.
      });

    return () => {
      cancelled = true;
    };
  }, [apiPath, isAuthenticated]);

  const displayStars = ui.pendingStars ?? ui.stars;
  const isPending = ui.pendingStars != null;

  async function onSelectStar(nextStars: number) {
    const action = resolvePracticeRatingStarClick({
      isAuthenticated,
      isPending,
    });

    if (action === "ignore") {
      return;
    }

    if (action === "sign_in") {
      router.push(buildAuthRouteHref("/auth/sign-in", signInReturnPath));
      return;
    }

    const previousStars = ui.stars;
    const previousEligible = ui.ratingEligible;
    const previousAggregate = ui.aggregate;
    setUi(applyOptimisticPracticeRating(ui, nextStars));

    const next = await runAuthenticatedPracticeRatingClick({
      apiPath,
      currentStars: previousStars,
      ratingEligible: previousEligible,
      currentAggregate: previousAggregate,
      nextStars,
    });
    setUi(next);
  }

  return (
    <section
      className="mt-5"
      data-practice-section="rating"
      data-practice-rating
      data-practice-rating-eligible={ui.ratingEligible ? "true" : "false"}
      data-practice-rating-value={displayStars ?? ""}
    >
      <p className="text-sm font-medium text-[#25135c]">Насколько вам откликнулось?</p>
      <div className="mt-2 flex items-center gap-1" role="group" aria-label="Оценка от 1 до 5">
        {Array.from({ length: MAX_PRACTICE_RATING_STARS }, (_, index) => {
          const value = index + 1;
          const filled = displayStars != null && value <= displayStars;

          return (
            <button
              key={value}
              type="button"
              data-practice-rating-star={value}
              aria-label={`Оценка ${value} из 5`}
              aria-pressed={displayStars === value}
              disabled={isPending}
              onClick={() => {
                void onSelectStar(value);
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-[22px] leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60 ${
                filled ? "text-[#7042c5]" : "text-[#c8bddc]"
              }`}
            >
              <span aria-hidden="true">{filled ? "★" : "☆"}</span>
            </button>
          );
        })}
      </div>
      <div
        className="mt-2 flex items-center gap-4 text-sm leading-5 text-[#65577f]"
        data-practice-rating-public-aggregate=""
        data-practice-rating-total-stars={ui.aggregate.totalStars}
        data-practice-rating-count={ui.aggregate.ratingCount}
      >
        <span className="inline-flex items-center gap-1">
          <span>{ui.aggregate.totalStars}</span>
          <RatingAggregateStarIcon />
        </span>
        <span className="inline-flex items-center gap-1">
          <span>{ui.aggregate.ratingCount}</span>
          <RatingAggregateUserIcon />
        </span>
      </div>
      {ui.message ? (
        <p
          className="mt-2 text-sm leading-5 text-[#65577f]"
          role="status"
          aria-live="polite"
          data-practice-rating-message=""
        >
          {ui.message}
        </p>
      ) : null}
    </section>
  );
}

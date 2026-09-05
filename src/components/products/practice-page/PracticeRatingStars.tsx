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

type PracticeRatingStarsProps = {
  authorSlug: string;
  productSlug: string;
  signInReturnPath: string;
  isAuthenticated: boolean;
  isAuthorOwner: boolean;
};

const EMPTY_RATING_UI: PracticeRatingUiState = {
  stars: null,
  ratingEligible: false,
  message: null,
  pendingStars: null,
};

export default function PracticeRatingStars({
  authorSlug,
  productSlug,
  signInReturnPath,
  isAuthenticated,
  isAuthorOwner,
}: PracticeRatingStarsProps) {
  const router = useRouter();
  const apiPath = buildPracticeRatingApiPath(authorSlug, productSlug);
  const [ui, setUi] = useState<PracticeRatingUiState>(EMPTY_RATING_UI);

  useEffect(() => {
    if (!isAuthenticated || isAuthorOwner) {
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
        });
      })
      .catch(() => {
        // GET is advisory for UI; PUT re-checks eligibility on the server.
      });

    return () => {
      cancelled = true;
    };
  }, [apiPath, isAuthenticated, isAuthorOwner]);

  if (isAuthorOwner) {
    return null;
  }

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
    setUi(applyOptimisticPracticeRating(ui, nextStars));

    const next = await runAuthenticatedPracticeRatingClick({
      apiPath,
      currentStars: previousStars,
      ratingEligible: previousEligible,
      nextStars,
    });
    setUi(next);
  }

  return (
    <section
      className="mt-5"
      data-practice-rating
      data-practice-rating-eligible={ui.ratingEligible ? "true" : "false"}
      data-practice-rating-value={displayStars ?? ""}
    >
      <p className="text-sm font-medium text-[#25135c]">Оценка</p>
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

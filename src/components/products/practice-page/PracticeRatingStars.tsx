"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  buildPracticeRatingApiPath,
  fetchOwnPracticeRating,
  putOwnPracticeRating,
  RATING_AUTHOR_DENIED_COPY,
  RATING_NOT_ELIGIBLE_COPY,
  RATING_THANKS_COPY,
} from "@/lib/ratings/client";
import { MAX_PRACTICE_RATING_STARS } from "@/lib/ratings/stars";

type PracticeRatingStarsProps = {
  authorSlug: string;
  productSlug: string;
  signInReturnPath: string;
  isAuthenticated: boolean;
  isAuthorOwner: boolean;
};

function messageForRatingError(error: string | undefined): string {
  if (error === "rating_not_eligible") {
    return RATING_NOT_ELIGIBLE_COPY;
  }

  if (error === "author_cannot_rate_own_product") {
    return RATING_AUTHOR_DENIED_COPY;
  }

  return "Не удалось сохранить оценку. Попробуйте ещё раз.";
}

export default function PracticeRatingStars({
  authorSlug,
  productSlug,
  signInReturnPath,
  isAuthenticated,
  isAuthorOwner,
}: PracticeRatingStarsProps) {
  const router = useRouter();
  const apiPath = buildPracticeRatingApiPath(authorSlug, productSlug);
  const [stars, setStars] = useState<number | null>(null);
  const [ratingEligible, setRatingEligible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingStars, setPendingStars] = useState<number | null>(null);

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

        setStars(state.stars);
        setRatingEligible(state.ratingEligible);
        if (state.stars != null) {
          setMessage(RATING_THANKS_COPY);
        }
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

  const displayStars = pendingStars ?? stars;
  const isPending = pendingStars != null;

  async function onSelectStar(nextStars: number) {
    if (isPending) {
      return;
    }

    if (!isAuthenticated) {
      router.push(buildAuthRouteHref("/auth/sign-in", signInReturnPath));
      return;
    }

    if (!ratingEligible && stars == null) {
      setMessage(RATING_NOT_ELIGIBLE_COPY);
      return;
    }

    const previous = stars;
    setPendingStars(nextStars);
    setStars(nextStars);
    setMessage(null);

    try {
      const result = await putOwnPracticeRating(apiPath, nextStars);
      setStars(result.stars);
      setRatingEligible(true);
      setMessage(RATING_THANKS_COPY);
    } catch (error) {
      setStars(previous);
      const code =
        error && typeof error === "object" && "error" in error
          ? String((error as { error?: string }).error)
          : undefined;
      setMessage(messageForRatingError(code));
    } finally {
      setPendingStars(null);
    }
  }

  return (
    <section
      className="mt-5"
      data-practice-rating
      data-practice-rating-eligible={ratingEligible ? "true" : "false"}
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
      {message ? (
        <p
          className="mt-2 text-sm leading-5 text-[#65577f]"
          role="status"
          aria-live="polite"
          data-practice-rating-message=""
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";

import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_RATING_PATH } from "@/lib/max/host";
import {
  formatPracticeRatingAggregateCountSr,
  formatPracticeRatingAggregateStarsSr,
  RATING_THANKS_COPY,
} from "@/lib/ratings/client";
import {
  applyOptimisticPracticeRating,
  runAuthenticatedPracticeRatingClick,
  type PracticeRatingUiState,
} from "@/lib/ratings/star-click";
import { MAX_PRACTICE_RATING_STARS } from "@/lib/ratings/stars";
import type {
  PracticeRatingAggregate,
  PracticeRatingPutState,
} from "@/lib/ratings/types";

type MaxProductRatingProps = {
  authorSlug: string;
  productSlug: string;
  enabled: boolean;
  initialAggregate: PracticeRatingAggregate;
};

function emptyRatingUi(aggregate: PracticeRatingAggregate): PracticeRatingUiState {
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
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function RatingAggregateUserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
    </svg>
  );
}

async function postMaxRating(input: {
  authorSlug: string;
  productSlug: string;
  stars?: number;
}) {
  const initData = readMaxInitData();
  if (!initData) {
    throw Object.assign(new Error("unauthorized"), { error: "unauthorized" });
  }
  const response = await fetch(MAX_RATING_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      initData,
      authorSlug: input.authorSlug,
      productSlug: input.productSlug,
      ...(input.stars === undefined ? {} : { stars: input.stars }),
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    reason?: string;
    stars?: number | null;
    ratingEligible?: boolean;
    changed?: boolean;
    aggregate?: PracticeRatingAggregate;
  } | null;
  if (!response.ok || !payload || payload.aggregate == null) {
    throw Object.assign(new Error(payload?.reason ?? "rating_failed"), {
      error: payload?.reason ?? "rating_failed",
    });
  }
  return payload;
}

export default function MaxProductRating({
  authorSlug,
  productSlug,
  enabled,
  initialAggregate,
}: MaxProductRatingProps) {
  const [ui, setUi] = useState<PracticeRatingUiState>(() => emptyRatingUi(initialAggregate));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void postMaxRating({ authorSlug, productSlug })
      .then((payload) => {
        if (cancelled) return;
        setUi({
          stars: payload.stars ?? null,
          ratingEligible: payload.ratingEligible === true,
          message: payload.stars != null ? RATING_THANKS_COPY : null,
          pendingStars: null,
          aggregate: payload.aggregate ?? initialAggregate,
        });
      })
      .catch(() => {
        // GET is advisory; the write re-checks eligibility on the server.
      });
    return () => {
      cancelled = true;
    };
  }, [authorSlug, enabled, initialAggregate, productSlug]);

  if (!enabled) return null;

  const displayStars = ui.pendingStars ?? ui.stars;
  const isPending = ui.pendingStars != null;

  async function onSelectStar(nextStars: number) {
    if (isPending) return;
    const previousStars = ui.stars;
    const previousEligible = ui.ratingEligible;
    const previousAggregate = ui.aggregate;
    setUi(applyOptimisticPracticeRating(ui, nextStars));
    const next = await runAuthenticatedPracticeRatingClick({
      apiPath: MAX_RATING_PATH,
      currentStars: previousStars,
      ratingEligible: previousEligible,
      currentAggregate: previousAggregate,
      nextStars,
      put: async (_apiPath, stars) => {
        const payload = await postMaxRating({ authorSlug, productSlug, stars });
        if (typeof payload.stars !== "number" || !payload.aggregate) {
          throw Object.assign(new Error("rating_put_failed"), { error: "rating_put_failed" });
        }
        const result: PracticeRatingPutState = {
          stars: payload.stars,
          createdAt: "",
          updatedAt: "",
          changed: payload.changed === true,
          aggregate: payload.aggregate,
        };
        return result;
      },
    });
    setUi(next);
  }

  return (
    <section
      className="mt-5"
      data-practice-section="rating"
      data-max-product-rating=""
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
        className="mt-2"
        data-practice-rating-public-aggregate=""
        data-practice-rating-total-stars={ui.aggregate.totalStars}
        data-practice-rating-count={ui.aggregate.ratingCount}
      >
        <p className="sr-only">{formatPracticeRatingAggregateStarsSr(ui.aggregate.totalStars)}</p>
        <p className="sr-only">{formatPracticeRatingAggregateCountSr(ui.aggregate.ratingCount)}</p>
        <div aria-hidden="true" className="flex items-center gap-4 text-sm leading-5 text-[#65577f]">
          <span className="inline-flex items-center gap-1">
            <span>{ui.aggregate.totalStars}</span>
            <RatingAggregateStarIcon />
          </span>
          <span className="inline-flex items-center gap-1">
            <span>{ui.aggregate.ratingCount}</span>
            <RatingAggregateUserIcon />
          </span>
        </div>
      </div>
      {ui.message ? (
        <p className="mt-2 text-sm leading-5 text-[#65577f]" role="status" aria-live="polite">
          {ui.message}
        </p>
      ) : null}
    </section>
  );
}

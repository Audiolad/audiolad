"use client";

import { useState } from "react";

import {
  formatPracticeRatingAggregateCountSr,
  formatPracticeRatingAggregateStarsSr,
  buildPracticeRatingApiPath,
} from "@/lib/ratings/client";
import { useGuestPracticeRating } from "@/lib/ratings/guest/use-guest-rating";
import { MAX_PRACTICE_RATING_STARS } from "@/lib/ratings/stars";
import type { PracticeRatingAggregate } from "@/lib/ratings/types";

/**
 * Five stars + the canonical public aggregate for a viewer without a verified
 * AudioLad identity in the mini-app (unlinked MAX guest, VK).
 *
 * The block is never hidden: a tap explains what is required and offers the
 * existing sign-in / link action. It sends no rating request, stores nothing
 * and never pretends a rating was saved.
 */
export type MiniAppRatingSignInAction = {
  message: string;
  label: string;
  onPress: () => void;
};

type MiniAppGuestRatingProps = {
  enabled: boolean;
  aggregate: PracticeRatingAggregate;
  signInAction: MiniAppRatingSignInAction;
  surface: "max" | "vk";
  guestCollect?: boolean;
  authorSlug?: string;
  productSlug?: string;
};

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

export default function MiniAppGuestRating({
  enabled,
  aggregate,
  signInAction,
  surface,
  guestCollect = false,
  authorSlug = "",
  productSlug = "",
}: MiniAppGuestRatingProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const canRate = guestCollect && authorSlug.length > 0 && productSlug.length > 0;
  const guest = useGuestPracticeRating({
    enabled: enabled && canRate,
    apiPath: buildPracticeRatingApiPath(authorSlug || "guest", productSlug || "guest"),
    initialAggregate: aggregate,
  });

  if (!enabled) return null;

  const displayStars = canRate ? (guest.ui.pendingStars ?? guest.ui.stars) : null;
  const shownAggregate = canRate ? guest.ui.aggregate : aggregate;

  return (
    <section
      className="mt-5"
      data-practice-section="rating"
      data-mini-app-guest-rating={surface}
      data-practice-rating-guest="true"
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
              onClick={() => {
                if (canRate) {
                  void guest.onSelectStar(value);
                  return;
                }
                setPromptOpen(true);
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-[22px] leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
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
        data-practice-rating-total-stars={shownAggregate.totalStars}
        data-practice-rating-count={shownAggregate.ratingCount}
      >
        <p className="sr-only">{formatPracticeRatingAggregateStarsSr(shownAggregate.totalStars)}</p>
        <p className="sr-only">{formatPracticeRatingAggregateCountSr(shownAggregate.ratingCount)}</p>
        <div aria-hidden="true" className="flex items-center gap-4 text-sm leading-5 text-[#65577f]">
          <span className="inline-flex items-center gap-1">
            <span>{shownAggregate.totalStars}</span>
            <RatingAggregateStarIcon />
          </span>
          <span className="inline-flex items-center gap-1">
            <span>{shownAggregate.ratingCount}</span>
            <RatingAggregateUserIcon />
          </span>
        </div>
      </div>
      {canRate && guest.ui.notice ? (
        <p className="mt-2 text-sm leading-5 text-[#65577f]">{guest.ui.notice}</p>
      ) : null}
      {canRate && guest.ui.message ? (
        <p className="mt-2 text-sm leading-5 text-[#65577f]" role="status" aria-live="polite">
          {guest.ui.message}
        </p>
      ) : null}
      {!canRate && promptOpen ? (
        <div className="mt-2" role="status" aria-live="polite" data-practice-rating-sign-in="">
          <p className="text-sm leading-5 text-[#65577f]">{signInAction.message}</p>
          <button
            type="button"
            onClick={signInAction.onPress}
            className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full border border-[#7042c5] px-5 py-2 text-sm font-semibold text-[#7042c5]"
          >
            {signInAction.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}

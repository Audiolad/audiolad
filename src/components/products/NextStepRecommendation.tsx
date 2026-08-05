"use client";

import Link from "next/link";
import { useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import type { PublicPromoRecommendation } from "@/lib/products/promo-recommendation";

export type NextStepRecommendationAnalyticsContext = {
  practiceId: string;
  productKind: string;
  authorId?: string | null;
  authorSlug?: string | null;
  sourcePage: string;
};

type NextStepRecommendationProps = {
  recommendation: PublicPromoRecommendation;
  analytics?: NextStepRecommendationAnalyticsContext | null;
  className?: string;
};

export default function NextStepRecommendation({
  recommendation,
  analytics = null,
  className = "",
}: NextStepRecommendationProps) {
  const clickedRef = useRef(false);

  const handleClick = () => {
    if (!analytics || clickedRef.current) {
      return;
    }

    clickedRef.current = true;
    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId) {
      return;
    }

    void trackPlatformEvent({
      sessionId,
      event_name: "product_promo_clicked",
      path: analytics.sourcePage,
      practice_id: analytics.practiceId,
      author_id: analytics.authorId ?? null,
      properties: {
        product_kind: analytics.productKind,
        author_slug: analytics.authorSlug ?? null,
        promo_url: recommendation.target.href,
        promo_button_text: recommendation.buttonText,
        source_page: analytics.sourcePage,
        destination_kind: recommendation.target.kind,
      },
    });
  };

  const buttonClassName =
    "mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-[16px] bg-[#7042c5] px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:w-auto";

  return (
    <section
      className={`rounded-[26px] border border-[#eadff8] bg-[#fbf8ff] px-5 py-5 shadow-[0_10px_28px_rgba(91,62,145,0.06)] sm:px-6 ${className}`.trim()}
      aria-label="Рекомендация после прослушивания"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9485b4]">
        Следующий шаг
      </p>
      <h2 className="mt-2 text-[20px] font-semibold leading-snug text-[#25135c] sm:text-[22px]">
        {recommendation.title}
      </h2>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
        {recommendation.text}
      </p>

      {recommendation.target.kind === "internal" ? (
        <Link
          href={recommendation.target.href}
          className={buttonClassName}
          onClick={handleClick}
        >
          {recommendation.buttonText}
        </Link>
      ) : (
        <a
          href={recommendation.target.href}
          className={buttonClassName}
          target={recommendation.openInNewTab ? "_blank" : undefined}
          rel={recommendation.openInNewTab ? "noopener noreferrer" : undefined}
          onClick={handleClick}
        >
          {recommendation.buttonText}
        </a>
      )}
    </section>
  );
}

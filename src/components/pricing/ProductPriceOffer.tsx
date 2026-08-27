"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  buildPersonalTimerOfferCopy,
  isPersonalTimerPromotionType,
} from "@/lib/pricing/personal-timer-copy";
import { formatRubles } from "@/lib/products/price-format";

type ProductPriceOfferProps = {
  basePrice: number;
  salePrice: number | null;
  endsAt: string | null;
  expiresAt: string | null;
  promotionType: "calendar" | "personal_countdown" | null;
  aboveTimerText?: string | null;
  belowButtonText?: string | null;
  children?: ReactNode;
};

function formatUntilDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProductPriceOffer({
  basePrice,
  salePrice,
  endsAt,
  expiresAt,
  promotionType,
  aboveTimerText,
  belowButtonText,
  children,
}: ProductPriceOfferProps) {
  const router = useRouter();
  const deadline = expiresAt ?? endsAt;
  const [remainingMs, setRemainingMs] = useState(() => {
    if (!deadline) {
      return 0;
    }

    return new Date(deadline).getTime() - Date.now();
  });

  useEffect(() => {
    if (!deadline) {
      return;
    }

    const tick = () => {
      const next = new Date(deadline).getTime() - Date.now();
      setRemainingMs(next);

      if (next <= 0) {
        router.refresh();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, router]);

  const offerActive =
    typeof salePrice === "number" &&
    salePrice > 0 &&
    salePrice < basePrice &&
    remainingMs > 0;

  if (!offerActive) {
    return (
      <>
        <p data-product-price-offer="regular" className="text-[22px] font-semibold leading-tight text-[#25135c]">
          {formatRubles(basePrice)}
        </p>
        {children}
      </>
    );
  }

  const untilLabel = endsAt ? formatUntilDate(endsAt) : "";
  const personalTimerCopy = isPersonalTimerPromotionType(promotionType)
    ? buildPersonalTimerOfferCopy({
        remainingMs,
        basePrice,
        aboveTimerText,
        belowButtonText,
      })
    : null;

  return (
    <div data-product-price-offer="promo">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-[#7d70a2] line-through">
          {formatRubles(basePrice)}
        </span>
        <span className="text-[22px] font-semibold leading-tight text-[#25135c]">
          {formatRubles(salePrice)}
        </span>
      </p>
      {personalTimerCopy ? (
        <div data-product-price-offer-countdown>
          <p
            data-product-price-offer-headline
            className="mt-2 text-sm text-[#7d70a2]"
          >
            {personalTimerCopy.above}
          </p>
          {children}
          <p
            data-product-price-offer-explanation
            className="mt-2 text-sm leading-5 text-[#7d70a2]"
          >
            {personalTimerCopy.below}
          </p>
        </div>
      ) : (
        <>
          {untilLabel ? (
            <p className="mt-2 text-sm text-[#7d70a2]">
              Акция до {untilLabel}
            </p>
          ) : null}
          {children}
        </>
      )}
    </div>
  );
}

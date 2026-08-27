"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { formatRubles } from "@/lib/products/price-format";

type ProductPriceOfferProps = {
  basePrice: number;
  salePrice: number | null;
  endsAt: string | null;
  expiresAt: string | null;
  promotionType: "calendar" | "personal_countdown" | null;
};

function formatRemaining(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

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
      <p data-product-price-offer="regular" className="text-[22px] font-semibold leading-tight text-[#25135c]">
        {formatRubles(basePrice)}
      </p>
    );
  }

  const untilLabel = endsAt ? formatUntilDate(endsAt) : "";

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
      {promotionType === "personal_countdown" ? (
        <div data-product-price-offer-countdown>
          <p className="mt-2 text-sm text-[#7d70a2]">
            Предложение действует ещё:
          </p>
          <p className="mt-1 flex items-baseline gap-1.5 text-[#25135c]">
            <span className="text-sm font-semibold tabular-nums leading-none tracking-wide">
              {formatRemaining(remainingMs)}
            </span>
            <span className="text-sm font-medium leading-none">мин.</span>
          </p>
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            Это предложение показывается вам один раз. После окончания таймера
            продукт останется доступен по полной цене {formatRubles(basePrice)}.
          </p>
        </div>
      ) : untilLabel ? (
        <p className="mt-2 text-sm text-[#7d70a2]">
          Акция до {untilLabel}
        </p>
      ) : null}
    </div>
  );
}

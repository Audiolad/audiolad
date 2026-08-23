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
      <p className="text-[28px] font-semibold leading-8 text-[#25135c]">
        {formatRubles(basePrice)}
      </p>
    );
  }

  const untilLabel = endsAt ? formatUntilDate(endsAt) : "";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[#9a8bb8] line-through">
        {formatRubles(basePrice)}
      </p>
      <p className="text-[32px] font-semibold leading-8 text-[#7042c5]">
        {formatRubles(salePrice)}
      </p>
      {promotionType === "personal_countdown" ? (
        <p className="text-sm font-medium text-[#5f4a8f]">
          Предложение действует ещё {formatRemaining(remainingMs)}
        </p>
      ) : untilLabel ? (
        <p className="text-sm font-medium text-[#5f4a8f]">
          Акция до {untilLabel}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type PricePromotionStartHandlerProps = {
  token: string;
};

const PROMOTION_START_TIMEOUT_MS = 8_000;

export default function PricePromotionStartHandler({
  token,
}: PricePromotionStartHandlerProps) {
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) {
      return;
    }

    startedRef.current = true;

    void (async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        PROMOTION_START_TIMEOUT_MS,
      );

      try {
        await fetch("/api/price-promotions/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("price_promotion_start_error", error);
        }
      } finally {
        window.clearTimeout(timeoutId);
        const url = new URL(window.location.href);
        url.searchParams.delete("promo");
        url.searchParams.delete("price_promo");
        router.replace(url.pathname + url.search + url.hash);
        router.refresh();
      }
    })();
  }, [router, token]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type PricePromotionStartHandlerProps = {
  token: string;
};

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
      try {
        await fetch("/api/price-promotions/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } finally {
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

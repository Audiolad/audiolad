"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  MEDITATION_SOLUTIONS_BASE_PRICE_RUB,
  MEDITATION_SOLUTIONS_SALE_PRICE_RUB,
  type MeditationSolutionsPractice,
} from "@/lib/landings/25-meditation-solutions/content";
import {
  resolveMeditationSolutionsOfferDisplay,
  type MeditationSolutionsOfferDisplay,
} from "@/lib/landings/25-meditation-solutions/offer";

type WindowResponse = {
  expires_at?: string | null;
  sale_price?: number | null;
  base_price?: number | null;
  reused?: boolean;
};

type OfferContextValue = {
  practice: MeditationSolutionsPractice | null;
  display: MeditationSolutionsOfferDisplay;
};

const OfferContext = createContext<OfferContextValue | null>(null);

export function useMeditationSolutionsOffer(): OfferContextValue {
  const value = useContext(OfferContext);

  if (!value) {
    throw new Error("MeditationSolutionsOfferProvider is required");
  }

  return value;
}

type MeditationSolutionsOfferProviderProps = {
  practice: MeditationSolutionsPractice | null;
  initialExpiresAt: string | null;
  initialSalePrice: number | null;
  initialBasePrice: number | null;
  children: ReactNode;
};

export default function MeditationSolutionsOfferProvider({
  practice,
  initialExpiresAt,
  initialSalePrice,
  initialBasePrice,
  children,
}: MeditationSolutionsOfferProviderProps) {
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [salePrice, setSalePrice] = useState<number | null>(initialSalePrice);
  const [basePrice, setBasePrice] = useState<number | null>(initialBasePrice);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncWindow() {
      try {
        const response = await fetch(
          "/api/landings/25-meditation-solutions/window",
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | WindowResponse
          | null;

        if (cancelled || !response.ok || !payload) {
          return;
        }

        if (typeof payload.expires_at === "string") {
          setExpiresAt(payload.expires_at);
        } else if (payload.expires_at === null) {
          setExpiresAt(null);
        }

        if (typeof payload.sale_price === "number") {
          setSalePrice(payload.sale_price);
        }

        if (typeof payload.base_price === "number") {
          setBasePrice(payload.base_price);
        }
      } catch {
        // Keep the last known server window. Do not invent a local timer.
      }
    }

    void syncWindow();

    return () => {
      cancelled = true;
    };
  }, []);

  const display = useMemo(
    () =>
      resolveMeditationSolutionsOfferDisplay({
        nowMs,
        expiresAt,
        basePrice: basePrice ?? MEDITATION_SOLUTIONS_BASE_PRICE_RUB,
        salePrice: salePrice ?? MEDITATION_SOLUTIONS_SALE_PRICE_RUB,
      }),
    [basePrice, expiresAt, nowMs, salePrice],
  );

  const value = useMemo(
    () => ({
      practice,
      display,
    }),
    [display, practice],
  );

  return <OfferContext.Provider value={value}>{children}</OfferContext.Provider>;
}

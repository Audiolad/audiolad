"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { trackPromoEvent } from "@/lib/promo/analytics-client";
import {
  parsePromoAttributionFromSearchParams,
  resolvePromoAttribution,
} from "@/lib/promo/attribution";

type PromoPageTrackerProps = {
  practiceId: string;
  practiceSlug: string;
};

export default function PromoPageTracker({
  practiceId,
  practiceSlug,
}: PromoPageTrackerProps) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const attribution = resolvePromoAttribution(
      parsePromoAttributionFromSearchParams(searchParams),
    );

    void trackPromoEvent("promo_practice_viewed", {
      practiceId,
      trackId: null,
      attribution,
    });
  }, [practiceId, practiceSlug, searchParams]);

  return null;
}

"use client";

import { Suspense } from "react";

import PromoPageTracker from "@/components/promo/PromoPageTracker";

type PromoPracticeTrackerProps = {
  practiceId: string;
  practiceSlug: string;
};

export default function PromoPracticeTracker(props: PromoPracticeTrackerProps) {
  return (
    <Suspense fallback={null}>
      <PromoPageTracker {...props} />
    </Suspense>
  );
}

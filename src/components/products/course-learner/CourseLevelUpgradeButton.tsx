"use client";

import { useState } from "react";

import {
  COURSE_UPGRADE_BOUNDARY_HEADER,
  COURSE_UPGRADE_MARKER_HEADER,
  COURSE_UPGRADE_REQUEST_ID_HEADER,
  COURSE_UPGRADE_STAGE_HEADER,
  interpretCourseUpgradeCheckoutResponse,
} from "@/lib/course-content/course-upgrade-client-errors";

type CourseLevelUpgradeButtonProps = {
  practiceId: string;
  targetAccessLevel: number;
  label: string;
};

export default function CourseLevelUpgradeButton({
  practiceId,
  targetAccessLevel,
  label,
}: CourseLevelUpgradeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorView, setErrorView] = useState<{
    message: string;
    diagnostic: string;
  } | null>(null);

  async function handleUpgrade() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setErrorView(null);

    try {
      const response = await fetch("/api/checkout/course-upgrade", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          practiceId,
          targetAccessLevel,
        }),
      });

      let body: unknown = null;
      let unexpectedResponse = false;

      try {
        body = await response.json();
      } catch {
        unexpectedResponse = true;
      }

      const outcome = interpretCourseUpgradeCheckoutResponse({
        httpStatus: response.status,
        body,
        unexpectedResponse,
        markerHeader: response.headers.get(COURSE_UPGRADE_MARKER_HEADER),
        boundaryHeader: response.headers.get(COURSE_UPGRADE_BOUNDARY_HEADER),
        requestIdHeader: response.headers.get(COURSE_UPGRADE_REQUEST_ID_HEADER),
        stageHeader: response.headers.get(COURSE_UPGRADE_STAGE_HEADER),
      });

      if (outcome.kind === "error") {
        setErrorView({
          message: outcome.message,
          diagnostic: outcome.diagnostic,
        });
        return;
      }

      window.location.assign(outcome.paymentUrl);
    } catch {
      const outcome = interpretCourseUpgradeCheckoutResponse({
        httpStatus: 0,
        networkFailed: true,
      });

      if (outcome.kind === "error") {
        setErrorView({
          message: outcome.message,
          diagnostic: outcome.diagnostic,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={isLoading}
        aria-busy={isLoading}
        data-course-upgrade-cta="true"
        className="inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isLoading ? "Открываем оплату…" : label}
      </button>
      {errorView ? (
        <div className="space-y-1" role="alert">
          <p className="text-sm text-[#b42318]">{errorView.message}</p>
          <p className="text-xs text-[#b42318]">{errorView.diagnostic}</p>
        </div>
      ) : null}
    </div>
  );
}

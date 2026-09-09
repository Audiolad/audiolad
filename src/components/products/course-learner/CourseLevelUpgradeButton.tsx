"use client";

import { useState } from "react";

import { resolveCourseUpgradeUiError } from "@/lib/course-content/course-upgrade-client-errors";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleUpgrade() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

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

      const body: unknown = await response.json().catch(() => null);
      const errorCode =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : undefined;

      const paymentUrl =
        body &&
        typeof body === "object" &&
        "payment" in body &&
        (body as { payment?: { payment_url?: unknown } }).payment &&
        typeof (body as { payment: { payment_url?: unknown } }).payment
          .payment_url === "string"
          ? (body as { payment: { payment_url: string } }).payment.payment_url
          : null;

      const uiError = resolveCourseUpgradeUiError({
        httpStatus: response.status,
        errorCode,
        paymentUrl,
      });

      if (uiError) {
        setErrorMessage(uiError);
        return;
      }

      window.location.assign(paymentUrl as string);
    } catch {
      setErrorMessage(resolveCourseUpgradeUiError({ httpStatus: 0, networkFailed: true }));
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
      {errorMessage ? (
        <p className="text-sm text-[#b42318]" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

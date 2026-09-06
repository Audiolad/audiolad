"use client";

import { useState } from "react";

type CourseLevelUpgradeButtonProps = {
  practiceId: string;
  targetAccessLevel: number;
  label: string;
};

function mapUpgradeError(code: string | undefined): string {
  switch (code) {
    case "unauthorized":
      return "Войдите, чтобы открыть следующий уровень.";
    case "not_entitled":
      return "Сначала нужен доступ к текущему уровню.";
    case "upgrade_not_configured":
    case "invalid_target_access_level":
      return "Следующий уровень сейчас недоступен.";
    case "already_at_target":
      return "Этот уровень уже открыт.";
    case "pending_order_exists":
      return "Есть незавершённый платёж. Дождитесь завершения или повторите позже.";
    case "author_finance_not_ready":
      return "Оплата временно недоступна. Попробуйте позже.";
    case "payments_not_configured":
      return "Оплата сейчас недоступна.";
    default:
      return "Не удалось начать оплату. Попробуйте ещё раз.";
  }
}

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

      if (response.status === 401) {
        setErrorMessage(mapUpgradeError("unauthorized"));
        return;
      }

      const paymentUrl =
        body &&
        typeof body === "object" &&
        "payment" in body &&
        (body as { payment?: { payment_url?: unknown } }).payment &&
        typeof (body as { payment: { payment_url?: unknown } }).payment
          .payment_url === "string"
          ? (body as { payment: { payment_url: string } }).payment.payment_url
          : null;

      if (!response.ok || !paymentUrl) {
        setErrorMessage(mapUpgradeError(errorCode));
        return;
      }

      window.location.assign(paymentUrl);
    } catch {
      setErrorMessage(mapUpgradeError(undefined));
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

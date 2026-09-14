"use client";

import { useEffect, useId, useState } from "react";

import {
  AUTHOR_PROJECT_CAPACITY_PACKAGES,
  formatCapacityRublesFromMinor,
  type AuthorProjectCapacitySku,
} from "@/lib/author-projects/capacity-catalog";
import { trackAuthorProjectCapacityEvent } from "@/lib/author-projects/capacity-analytics";

type AuthorProjectCapacityOfferDialogProps = {
  open: boolean;
  onClose: () => void;
  surface?: string;
};

type CheckoutState =
  | { kind: "idle" }
  | { kind: "busy"; sku: AuthorProjectCapacitySku }
  | { kind: "error"; message: string };

export default function AuthorProjectCapacityOfferDialog({
  open,
  onClose,
  surface = "author_dashboard",
}: AuthorProjectCapacityOfferDialogProps) {
  const titleId = useId();
  const [state, setState] = useState<CheckoutState>({ kind: "idle" });

  useEffect(() => {
    if (!open) {
      return;
    }

    void trackAuthorProjectCapacityEvent(
      "author_project_capacity_offer_viewed",
      { surface },
    );
  }, [open, surface]);

  function handleClose() {
    setState({ kind: "idle" });
    onClose();
  }

  if (!open) {
    return null;
  }

  async function startCheckout(sku: AuthorProjectCapacitySku) {
    const pack = AUTHOR_PROJECT_CAPACITY_PACKAGES[sku];
    setState({ kind: "busy", sku });

    void trackAuthorProjectCapacityEvent(
      "author_project_capacity_package_selected",
      {
        package: pack.slots,
        amount: pack.amountMinor,
        currency: pack.currency,
        surface,
      },
    );
    void trackAuthorProjectCapacityEvent(
      "author_project_capacity_checkout_started",
      {
        package: pack.slots,
        amount: pack.amountMinor,
        currency: pack.currency,
        surface,
      },
    );

    try {
      const response = await fetch("/api/checkout/author-project-capacity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ sku }),
      });

      const payload = (await response.json()) as {
        error?: string;
        payment?: { payment_url?: string };
        order?: { slots?: number };
      };

      if (!response.ok || !payload.payment?.payment_url) {
        // Do not treat a successful redirect to the provider as failure.
        // Only API/network failures count as purchase_failed.
        void trackAuthorProjectCapacityEvent(
          "author_project_capacity_purchase_failed",
          {
            package: pack.slots,
            amount: pack.amountMinor,
            currency: pack.currency,
            surface,
            error: payload.error ?? "checkout_start_failed",
          },
        );
        setState({
          kind: "error",
          message:
            payload.error === "payments_not_configured"
              ? "Оплата временно недоступна. Попробуйте позже."
              : payload.error === "unlimited_account"
                ? "Для этого аккаунта лимит проектов не применяется."
                : payload.error === "pending_order_exists"
                  ? "У вас уже есть незавершённая оплата. Завершите её или подождите."
                  : "Не удалось начать оплату. Попробуйте ещё раз.",
        });
        return;
      }

      window.location.assign(payload.payment.payment_url);
    } catch {
      void trackAuthorProjectCapacityEvent(
        "author_project_capacity_purchase_failed",
        {
          package: pack.slots,
          amount: pack.amountMinor,
          currency: pack.currency,
          surface,
          error: "network_error",
        },
      );
      setState({
        kind: "error",
        message: "Не удалось начать оплату. Попробуйте ещё раз.",
      });
    }
  }

  const pack1 = AUTHOR_PROJECT_CAPACITY_PACKAGES.author_project_slot_1;
  const pack5 = AUTHOR_PROJECT_CAPACITY_PACKAGES.author_project_slots_5;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleClose}
    >
      <div
        className="max-h-[min(92dvh,720px)] w-full max-w-lg overflow-y-auto rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_24px_60px_rgba(40,20,80,0.22)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[18px] font-semibold text-[#25135c]">
          Добавить проекты
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#5f5484]">
          Расширьте кабинет автора. Оплата производится один раз, без подписки и
          без ограничений по времени.
        </p>
        <p className="mt-2 text-xs font-medium text-[#8a7daf]">
          Оплата один раз • без подписки
        </p>

        <div className="mt-5 grid gap-3">
          <article className="rounded-[20px] border border-[#eadff8] bg-white p-4">
            <h3 className="text-[16px] font-semibold text-[#25135c]">
              {pack1.title}
            </h3>
            <p className="mt-2 text-[22px] font-semibold text-[#25135c]">
              {formatCapacityRublesFromMinor(pack1.amountMinor)}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#8a7daf]">
              Разовая оплата
              <br />
              Без ограничений по времени
            </p>
            <button
              type="button"
              disabled={state.kind === "busy"}
              onClick={() => void startCheckout(pack1.sku)}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#c6afe6] bg-white px-4 text-sm font-semibold text-[#7042c5] transition hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
            >
              {state.kind === "busy" && state.sku === pack1.sku
                ? "Переходим к оплате…"
                : `Добавить 1 проект — ${formatCapacityRublesFromMinor(pack1.amountMinor)}`}
            </button>
          </article>

          <article className="relative rounded-[20px] border-2 border-[#7042c5] bg-[#faf6ff] p-4 shadow-[0_10px_24px_rgba(91,62,145,0.08)]">
            <span className="absolute right-4 top-4 rounded-full bg-[#7042c5] px-2.5 py-1 text-[11px] font-semibold text-white">
              −50%
            </span>
            <h3 className="pr-14 text-[16px] font-semibold text-[#25135c]">
              {pack5.title}
            </h3>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <p className="text-[22px] font-semibold text-[#25135c]">
                {formatCapacityRublesFromMinor(pack5.amountMinor)}
              </p>
              {pack5.displayAmountMinor != null ? (
                <p className="text-sm text-[#8a7daf] line-through">
                  {formatCapacityRublesFromMinor(pack5.displayAmountMinor)}
                </p>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-[#8a7daf]">
              Разовая оплата
              <br />
              Без ограничений по времени
            </p>
            <button
              type="button"
              disabled={state.kind === "busy"}
              onClick={() => void startCheckout(pack5.sku)}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white transition hover:bg-[#5e32ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
            >
              {state.kind === "busy" && state.sku === pack5.sku
                ? "Переходим к оплате…"
                : `Добавить 5 проектов — ${formatCapacityRublesFromMinor(pack5.amountMinor)}`}
            </button>
          </article>
        </div>

        {state.kind === "error" ? (
          <p className="mt-4 rounded-[16px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
            {state.message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleClose}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#e4d7f4] px-4 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

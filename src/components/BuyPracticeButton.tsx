"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { buildBuyClickedProperties } from "@/lib/analytics/buy-clicked";
import { readCheckoutOriginPathFromWindow } from "@/lib/analytics/checkout-origin";
import {
  getCachedAnalyticsSessionId,
  getCurrentAnalyticsIdentity,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { createClientEventId } from "@/lib/analytics/event-id";
import {
  normalizePurchaseSurface,
  type PurchaseSurface,
} from "@/lib/analytics/purchase-surface";

type BuyPracticeButtonProps = {
  practiceSlug: string;
  practiceId?: string | null;
  authorId?: string | null;
  productPriceMinorSnapshot?: number | null;
  currency?: string | null;
  purchaseSurface?: PurchaseSurface | string | null;
  quickOfferId?: string | null;
  label: string;
  className?: string;
  signInReturnPath?: string;
  pendingLabel?: string;
};

type ApiErrorBody = {
  error?: string;
  message?: string;
  current_amount_minor?: number;
};

type OrderSuccessBody = {
  order: {
    id: string;
  };
};

type PendingOrderBody = {
  order: {
    id: string;
  } | null;
};

type PaymentSuccessBody = {
  payment: {
    payment_url: string;
  };
};

function isOrderSuccessBody(body: unknown): body is OrderSuccessBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "order" in body &&
    typeof (body as OrderSuccessBody).order?.id === "string"
  );
}

function isPendingOrderBody(body: unknown): body is PendingOrderBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "order" in body &&
    ((body as PendingOrderBody).order === null ||
      typeof (body as PendingOrderBody).order?.id === "string")
  );
}

function isPaymentSuccessBody(body: unknown): body is PaymentSuccessBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "payment" in body &&
    typeof (body as PaymentSuccessBody).payment?.payment_url === "string"
  );
}

export default function BuyPracticeButton({
  practiceSlug,
  practiceId = null,
  authorId = null,
  productPriceMinorSnapshot = null,
  currency = "RUB",
  purchaseSurface = "practice_page",
  quickOfferId = null,
  label,
  className,
  signInReturnPath,
  pendingLabel = "Продолжить оплату",
}: BuyPracticeButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingPending, setIsCheckingPending] = useState(true);
  const [hasPendingOrder, setHasPendingOrder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const surface = normalizePurchaseSurface(purchaseSurface);

  useEffect(() => {
    let isMounted = true;

    async function checkPendingOrder() {
      try {
        const response = await fetch(
          `/api/orders/pending?practice_slug=${encodeURIComponent(practiceSlug)}`,
        );

        if (!isMounted) {
          return;
        }

        if (response.status === 401) {
          setHasPendingOrder(false);
          return;
        }

        const body: unknown = await response.json().catch(() => null);

        if (!response.ok || !isPendingOrderBody(body)) {
          return;
        }

        setHasPendingOrder(body.order !== null);
      } catch {
        // Pending state is optional UI; purchase flow still works without it.
      } finally {
        if (isMounted) {
          setIsCheckingPending(false);
        }
      }
    }

    void checkPendingOrder();

    return () => {
      isMounted = false;
    };
  }, [practiceSlug]);

  async function handleBuy() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const identity = getCurrentAnalyticsIdentity();
      const sessionId = identity?.sessionId ?? getCachedAnalyticsSessionId();
      const buyClickClientEventId = createClientEventId();
      const path = readCheckoutOriginPathFromWindow();

      if (sessionId && practiceId) {
        const properties = buildBuyClickedProperties({
          authorId,
          productPriceMinorSnapshot,
          currency,
          path,
          purchaseSurface: surface,
          clientEventId: buyClickClientEventId,
        });

        await trackPlatformEvent({
          sessionId,
          event_name: "buy_clicked",
          path,
          practice_id: practiceId,
          client_event_id: buyClickClientEventId,
          properties,
        });

        console.info(
          JSON.stringify({
            event: "buy_click_recorded",
            practice_id: practiceId.slice(0, 8),
            surface,
          }),
        );
      }

      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          practice_slug: practiceSlug,
          analytics_session_id: identity?.sessionId ?? null,
          analytics_anonymous_id: identity?.anonymousId ?? null,
          checkout_origin_path: path,
          buy_click_client_event_id:
            sessionId && practiceId ? buyClickClientEventId : null,
          quick_offer_id: quickOfferId,
          expected_amount_minor: quickOfferId
            ? null
            : productPriceMinorSnapshot,
        }),
      });

      if (orderResponse.status === 401) {
        const returnPath =
          signInReturnPath ??
          (typeof window !== "undefined" ? window.location.pathname : "/");
        router.push(
          `/auth/sign-in?next=${encodeURIComponent(returnPath)}`,
        );
        return;
      }

      const orderBody: unknown = await orderResponse.json().catch(() => null);

      if (!orderResponse.ok || !isOrderSuccessBody(orderBody)) {
        const apiError =
          typeof orderBody === "object" &&
          orderBody !== null &&
          "error" in orderBody
            ? (orderBody as ApiErrorBody)
            : null;

        if (apiError?.error === "price_changed") {
          setErrorMessage(
            apiError.message?.trim() ||
              "Цена изменилась или акция закончилась. Обновите страницу.",
          );
          window.setTimeout(() => {
            window.location.reload();
          }, 1200);
          return;
        }

        setErrorMessage(mapOrderError(apiError));
        return;
      }

      const paymentResponse = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: orderBody.order.id,
        }),
      });

      const paymentBody: unknown = await paymentResponse.json().catch(() => null);

      if (!paymentResponse.ok || !isPaymentSuccessBody(paymentBody)) {
        setErrorMessage(
          mapPaymentError(
            typeof paymentBody === "object" &&
              paymentBody !== null &&
              "error" in paymentBody
              ? (paymentBody as ApiErrorBody)
              : null,
          ),
        );
        return;
      }

      window.location.assign(paymentBody.payment.payment_url);
    } catch {
      setErrorMessage("Не удалось начать оплату. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }

  const buttonLabel = hasPendingOrder ? pendingLabel : label;

  return (
    <div>
      {hasPendingOrder ? (
        <p className="mb-3 rounded-[16px] border border-[#e7ddf7] bg-[#f8f3ff] px-4 py-3 text-center text-sm leading-5 text-[#5f4a8f]">
          У вас есть незавершённый заказ. Вы можете продолжить оплату.
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleBuy}
        disabled={isLoading || isCheckingPending}
        aria-busy={isLoading}
        className={className}
      >
        {isLoading
          ? "Подготавливаем оплату…"
          : isCheckingPending
            ? "Проверяем заказ…"
            : buttonLabel}
      </button>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-3 rounded-[16px] border border-[#f2d4d8] bg-[#fff7f8] px-4 py-3 text-center text-sm leading-5 text-[#8d4d57]"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function mapOrderError(body: ApiErrorBody | null): string {
  switch (body?.error) {
    case "already_owned":
      return "Эта аудиолекция уже есть в вашем доступе.";
    case "pending_order_exists":
      return "У вас есть незавершённый заказ. Вы можете продолжить оплату.";
    case "practice_not_found":
      return "Товар временно недоступен. Напишите нам на 1@audiolad.ru.";
    case "practice_not_for_sale":
      return "Этот продукт сейчас недоступен для покупки.";
    case "price_changed":
      return (
        body.message?.trim() ||
        "Цена изменилась или акция закончилась. Обновите страницу."
      );
    default:
      return "Не удалось создать заказ. Попробуйте ещё раз.";
  }
}

function mapPaymentError(body: ApiErrorBody | null): string {
  switch (body?.error) {
    case "payments_not_configured":
      return "Оплата временно недоступна. Мы завершаем подключение приёма платежей.";
    case "order_already_paid":
      return "Заказ уже оплачен. Проверьте доступ в личном кабинете.";
    case "order_not_payable":
      return "Этот заказ больше нельзя оплатить. Создайте новый заказ.";
    case "order_not_found":
      return "Заказ не найден. Попробуйте начать покупку заново.";
    default:
      return "Не удалось перейти к оплате. Попробуйте ещё раз.";
  }
}

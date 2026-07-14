"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type OrderStatus = "pending" | "paid" | "cancelled" | "failed" | "refunded";

type OrderResponse = {
  order?: {
    id: string;
    practice_slug: string;
    status: OrderStatus;
    amount_minor: number;
    currency: string;
    paid_at: string | null;
  };
  error?: string;
};

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120000;

export default function CheckoutResultClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const initialStatus = searchParams.get("status");

  const [order, setOrder] = useState<OrderResponse["order"] | null>(null);
  const [fetchErrorMessage, setFetchErrorMessage] = useState<string | null>(
    null,
  );
  const [isPolling, setIsPolling] = useState(Boolean(orderId));

  const missingOrderMessage = !orderId ? "Не указан номер заказа." : null;
  const errorMessage = missingOrderMessage ?? fetchErrorMessage;

  const listenHref = useMemo(() => {
    if (!order?.practice_slug) {
      return null;
    }

    return `/listen/${order.practice_slug}`;
  }, [order?.practice_slug]);

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function pollOrderStatus() {
      setIsPolling(true);

      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as OrderResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || !body.order) {
          setFetchErrorMessage("Не удалось проверить статус заказа.");
          setIsPolling(false);
          return;
        }

        setOrder(body.order);

        if (body.order.status === "paid") {
          setIsPolling(false);
          return;
        }

        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          setIsPolling(false);
          return;
        }

        timeoutId = setTimeout(pollOrderStatus, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          setFetchErrorMessage("Не удалось проверить статус заказа.");
          setIsPolling(false);
        }
      }
    }

    void pollOrderStatus();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [orderId]);

  if (!orderId) {
    return (
      <ResultCard
        title="Заказ не найден"
        description={errorMessage ?? "Проверьте ссылку или начните покупку заново."}
        actionHref="/first-audio-course"
        actionLabel="Вернуться к аудиолекции"
      />
    );
  }

  if (errorMessage) {
    return (
      <ResultCard
        title="Не удалось проверить оплату"
        description={errorMessage}
        actionHref="/first-audio-course"
        actionLabel="Вернуться к аудиолекции"
      />
    );
  }

  if (!order) {
    return (
      <ResultCard
        title="Проверяем оплату…"
        description="Подождите несколько секунд — мы подтверждаем платёж и открываем доступ."
        isLoading
      />
    );
  }

  if (order.status === "paid") {
    return (
      <ResultCard
        title="Оплата прошла успешно"
        description="Аудиолекция уже доступна для прослушивания в вашем личном кабинете."
        actionHref={listenHref ?? `/practice/${order.practice_slug}`}
        actionLabel="Слушать аудиолекцию"
        secondaryHref="/first-audio-course"
        secondaryLabel="Вернуться на страницу продукта"
      />
    );
  }

  if (initialStatus === "failed") {
    return (
      <ResultCard
        title="Оплата не завершена"
        description="Платёж не был завершён. Вы можете попробовать снова."
        actionHref="/first-audio-course"
        actionLabel="Попробовать снова"
      />
    );
  }

  return (
    <ResultCard
      title={isPolling ? "Проверяем оплату…" : "Оплата обрабатывается"}
      description={
        isPolling
          ? "Если вы только что оплатили заказ, доступ откроется автоматически в течение минуты."
          : "Платёж ещё обрабатывается. Обновите страницу через минуту или напишите на 1@audiolad.ru, если доступ не появился."
      }
      actionHref="/first-audio-course"
      actionLabel="Вернуться к аудиолекции"
      isLoading={isPolling}
    />
  );
}

type ResultCardProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  isLoading?: boolean;
};

function ResultCard({
  title,
  description,
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel,
  isLoading = false,
}: ResultCardProps) {
  return (
    <div className="rounded-[24px] border border-[#eadff8] bg-white px-6 py-8 text-center shadow-[0_18px_44px_rgba(96,59,168,0.08)]">
      <h1 className="text-[24px] font-semibold text-[#25135c]">{title}</h1>
      <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">{description}</p>

      {isLoading ? (
        <p className="mt-5 text-sm text-[#8c7dab]">Пожалуйста, подождите…</p>
      ) : null}

      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-6 inline-flex w-full items-center justify-center rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[16px] font-semibold text-white"
        >
          {actionLabel}
        </Link>
      ) : null}

      {secondaryHref && secondaryLabel ? (
        <Link
          href={secondaryHref}
          className="mt-3 inline-flex w-full items-center justify-center rounded-[20px] border border-[#e2d7f2] bg-[#faf6ff] px-5 py-4 text-[15px] font-semibold text-[#7042c5]"
        >
          {secondaryLabel}
        </Link>
      ) : null}
    </div>
  );
}

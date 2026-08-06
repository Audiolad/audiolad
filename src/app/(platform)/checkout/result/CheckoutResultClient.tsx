"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isTerminalCheckoutStatus,
  type CheckoutOrderStatus,
  type CheckoutStatusResponseBody,
} from "@/lib/payments/checkout-status-api";

type ViewState =
  | "checking"
  | "invalid_token"
  | "paid_authenticated"
  | "paid_unauthenticated"
  | "processing"
  | "failed"
  | "cancelled"
  | "refunded";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 45000;
const AUTO_REDIRECT_MS = 1500;
const MAX_TRANSIENT_RETRIES = 5;

function buildLibraryHref(practiceSlug: string | null): string {
  if (practiceSlug) {
    return `/my-practices?purchased=${encodeURIComponent(practiceSlug)}`;
  }

  return "/my-practices";
}

function buildSignInHref(practiceSlug: string | null): string {
  const nextPath = buildLibraryHref(practiceSlug);
  return `/auth/sign-in?next=${encodeURIComponent(nextPath)}`;
}

function resolveViewState(
  status: CheckoutStatusResponseBody | null,
  pollingTimedOut: boolean,
): ViewState {
  if (!status) {
    return pollingTimedOut ? "processing" : "checking";
  }

  if (status.status === "paid") {
    return status.authenticated ? "paid_authenticated" : "paid_unauthenticated";
  }

  if (status.status === "failed") {
    return "failed";
  }

  if (status.status === "cancelled") {
    return "cancelled";
  }

  if (status.status === "refunded") {
    return "refunded";
  }

  return pollingTimedOut ? "processing" : "checking";
}

export default function CheckoutResultClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const checkoutToken = searchParams.get("token");
  const hasCheckoutParams = Boolean(orderId && checkoutToken);

  const [status, setStatus] = useState<CheckoutStatusResponseBody | null>(null);
  const [viewState, setViewState] = useState<ViewState>(
    hasCheckoutParams ? "checking" : "invalid_token",
  );
  const [isPolling, setIsPolling] = useState(hasCheckoutParams);
  const [pollGeneration, setPollGeneration] = useState(0);

  const inFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const libraryHref = useMemo(
    () => buildLibraryHref(status?.practiceSlug ?? null),
    [status?.practiceSlug],
  );
  const signInHref = useMemo(
    () => buildSignInHref(status?.practiceSlug ?? null),
    [status?.practiceSlug],
  );

  const restartPolling = useCallback(() => {
    setStatus(null);
    setViewState("checking");
    setIsPolling(true);
    setPollGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!hasCheckoutParams || !orderId || !checkoutToken) {
      return;
    }

    let cancelled = false;
    let transientFailures = 0;
    const startedAt = Date.now();

    async function pollCheckoutStatus() {
      if (cancelled || inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      setIsPolling(true);
      setViewState("checking");

      try {
        const params = new URLSearchParams({
          order_id: orderId!,
          token: checkoutToken!,
        });
        const response = await fetch(`/api/checkout/status?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | CheckoutStatusResponseBody
          | { error?: string }
          | null;

        if (cancelled) {
          return;
        }

        if (response.status === 400) {
          setViewState("invalid_token");
          setIsPolling(false);
          return;
        }

        if (!response.ok || !body || !("status" in body)) {
          transientFailures += 1;

          if (
            Date.now() - startedAt >= POLL_TIMEOUT_MS ||
            transientFailures >= MAX_TRANSIENT_RETRIES
          ) {
            setViewState("processing");
            setIsPolling(false);
            return;
          }

          timeoutRef.current = setTimeout(pollCheckoutStatus, POLL_INTERVAL_MS);
          return;
        }

        transientFailures = 0;
        const nextStatus = body as CheckoutStatusResponseBody;
        setStatus(nextStatus);

        if (nextStatus.status === "paid" || isTerminalCheckoutStatus(nextStatus.status)) {
          setViewState(resolveViewState(nextStatus, false));
          setIsPolling(false);
          return;
        }

        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          setViewState("processing");
          setIsPolling(false);
          return;
        }

        timeoutRef.current = setTimeout(pollCheckoutStatus, POLL_INTERVAL_MS);
      } catch {
        if (cancelled) {
          return;
        }

        transientFailures += 1;

        if (
          Date.now() - startedAt >= POLL_TIMEOUT_MS ||
          transientFailures >= MAX_TRANSIENT_RETRIES
        ) {
          setViewState("processing");
          setIsPolling(false);
          return;
        }

        timeoutRef.current = setTimeout(pollCheckoutStatus, POLL_INTERVAL_MS);
      } finally {
        inFlightRef.current = false;
      }
    }

    void pollCheckoutStatus();

    return () => {
      cancelled = true;
      inFlightRef.current = false;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [checkoutToken, hasCheckoutParams, orderId, pollGeneration]);

  useEffect(() => {
    if (viewState !== "paid_authenticated") {
      if (autoRedirectRef.current) {
        clearTimeout(autoRedirectRef.current);
        autoRedirectRef.current = null;
      }
      return;
    }

    autoRedirectRef.current = setTimeout(() => {
      router.push(libraryHref);
    }, AUTO_REDIRECT_MS);

    return () => {
      if (autoRedirectRef.current) {
        clearTimeout(autoRedirectRef.current);
      }
    };
  }, [libraryHref, router, viewState]);

  if (viewState === "invalid_token") {
    return (
      <ResultCard
        title="Не удалось открыть информацию об этом заказе"
        description="Проверьте ссылку после оплаты или откройте Аудиотеку после входа в аккаунт."
        actionHref="/auth/sign-in?next=%2Fmy-practices"
        actionLabel="Войти и открыть Аудиотеку"
      />
    );
  }

  if (viewState === "checking") {
    return (
      <ResultCard
        title="Проверяем оплату…"
        description="Проверяем поступление платежа. Обычно это занимает несколько секунд."
        isLoading
      />
    );
  }

  if (viewState === "paid_authenticated") {
    return (
      <ResultCard
        title="Оплата получена"
        description="Практика уже добавлена в вашу Аудиотеку."
        actionHref={libraryHref}
        actionLabel="Перейти в Аудиотеку"
      />
    );
  }

  if (viewState === "paid_unauthenticated") {
    return (
      <ResultCard
        title="Оплата получена"
        description="Практика добавлена в ваш аккаунт. Войдите, чтобы открыть её в Аудиотеке."
        actionHref={signInHref}
        actionLabel="Войти и открыть Аудиотеку"
      />
    );
  }

  if (viewState === "processing") {
    return (
      <ResultCard
        title="Платёж обрабатывается"
        description="Банк уже принял платёж. Иногда подтверждение занимает немного больше времени. После подтверждения практика автоматически появится в вашей Аудиотеке."
        actionLabel="Проверить ещё раз"
        onActionClick={restartPolling}
        secondaryHref={libraryHref}
        secondaryLabel="Перейти в Аудиотеку"
        isLoading={isPolling}
      />
    );
  }

  return (
    <TerminalFailureCard status={viewState as Exclude<CheckoutOrderStatus, "pending" | "paid">} />
  );
}

type ResultCardProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
  isLoading?: boolean;
};

function ResultCard({
  title,
  description,
  actionHref,
  actionLabel,
  onActionClick,
  secondaryHref,
  secondaryLabel,
  isLoading = false,
}: ResultCardProps) {
  return (
    <div className="overflow-x-hidden rounded-[24px] border border-[#eadff8] bg-white px-6 py-8 text-center shadow-[0_18px_44px_rgba(96,59,168,0.08)]">
      <h1 className="text-[24px] font-semibold text-[#25135c]">{title}</h1>
      <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">{description}</p>

      {isLoading ? (
        <p className="mt-5 text-sm text-[#8c7dab]">Пожалуйста, подождите…</p>
      ) : null}

      {actionLabel ? (
        onActionClick ? (
          <button
            type="button"
            onClick={onActionClick}
            className="mt-6 inline-flex w-full items-center justify-center rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[16px] font-semibold text-white"
          >
            {actionLabel}
          </button>
        ) : actionHref ? (
          <Link
            href={actionHref}
            className="mt-6 inline-flex w-full items-center justify-center rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[16px] font-semibold text-white"
          >
            {actionLabel}
          </Link>
        ) : null
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

function TerminalFailureCard({
  status,
}: {
  status: "failed" | "cancelled" | "refunded";
}) {
  const copy =
    status === "cancelled"
      ? {
          title: "Оплата отменена",
          description: "Платёж не был завершён. Вы можете попробовать снова из каталога.",
        }
      : status === "refunded"
        ? {
            title: "Оплата возвращена",
            description:
              "По этому заказу оформлен возврат. Если нужна помощь, напишите на 1@audiolad.ru.",
          }
        : {
            title: "Оплата не завершена",
            description: "Платёж не был завершён. Вы можете попробовать снова из каталога.",
          };

  return (
    <ResultCard
      title={copy.title}
      description={copy.description}
      actionHref="/catalog"
      actionLabel="Перейти в каталог"
    />
  );
}

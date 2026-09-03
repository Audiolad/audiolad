"use client";

import { useEffect, useId, useState } from "react";

import { FEATURED_CARD_PRIMARY_CTA_CLASS } from "@/components/home/FeaturedProductCard";
import { formatRubles } from "@/lib/products/price-format";

const QUICK_AMOUNTS = [100, 300, 500, 1000] as const;
const APPRECIATION_CTA_LABEL = "❤️ Поблагодарить автора";
const APPRECIATION_CTA_HEART = "❤️";

type AuthorAppreciationPrototypeProps = {
  authorName: string;
  authorId: string;
  practiceId: string | null;
  isAuthenticated: boolean;
  surface: "author" | "product";
};

function parseAppreciationAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function resolveAmountLabel(amount: number | null): string {
  return amount && amount > 0 ? formatRubles(amount) : "выбранную сумму";
}

export default function AuthorAppreciationPrototype({
  authorName,
  authorId,
  practiceId,
  isAuthenticated,
  surface,
}: AuthorAppreciationPrototypeProps) {
  const titleId = useId();
  const emailId = useId();
  const amountId = useId();
  const [open, setOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("500");
  const [guestEmail, setGuestEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAmount = parseAppreciationAmount(amountInput);
  const isValidAmount = selectedAmount !== null;

  async function submitCheckout() {
    if (!isValidAmount || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/author-appreciation/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          author_id: authorId,
          practice_id: practiceId,
          surface,
          amount_minor: selectedAmount * 100,
          guest_email: isAuthenticated ? undefined : guestEmail,
        }),
      });
      const payload = (await response.json()) as {
        payment_link?: unknown;
      };
      if (!response.ok || typeof payload.payment_link !== "string") {
        throw new Error("checkout_failed");
      }
      window.location.assign(payload.payment_link);
    } catch {
      setError("Не удалось перейти к оплате. Попробуйте ещё раз.");
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isProductSurface = surface === "product";

  return (
    <>
      <section
        className={
          isProductSurface
            ? "rounded-[20px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4"
            : "rounded-[20px] border border-[#eadff8] bg-white px-4 py-4 shadow-sm"
        }
        aria-label="Поддержка автора"
      >
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className={`${FEATURED_CARD_PRIMARY_CTA_CLASS} author-appreciation-cta max-w-full justify-center text-center hover:bg-[#6338b0] active:bg-[#5a32a3]`}
        >
          <span className="author-appreciation-cta__heart">
            {APPRECIATION_CTA_HEART}
          </span>
          {APPRECIATION_CTA_LABEL.slice(
            APPRECIATION_CTA_LABEL.indexOf(APPRECIATION_CTA_HEART) +
              APPRECIATION_CTA_HEART.length,
          )}
        </button>
        <p className="mt-2.5 text-sm leading-5 text-[#7d70a2]">
          Благодарность возвращается изобилием 🙏
        </p>
      </section>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#1f1633]/55 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-[calc(100dvh-env(safe-area-inset-bottom))] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:max-h-[90vh] sm:rounded-[28px] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[22px] font-semibold leading-tight text-[#25135c]">
                  Поблагодарить автора
                </h2>
                <p className="mt-2 break-words text-sm leading-6 text-[#7d70a2]">
                  {authorName}
                </p>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ddcfef] text-lg text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                ×
              </button>
            </div>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-[#25135c]">
                Выберите сумму
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {QUICK_AMOUNTS.map((quickAmount) => {
                  const selected = selectedAmount === quickAmount;

                  return (
                    <button
                      key={quickAmount}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setAmountInput(String(quickAmount));
                      }}
                      className={`min-h-11 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                        selected
                          ? "border-[#7042c5] bg-[#7042c5] text-white"
                          : "border-[#ddcfef] bg-white text-[#7042c5]"
                      }`}
                    >
                      {formatRubles(quickAmount)}
                    </button>
                  );
                })}
              </div>

              <label
                htmlFor={amountId}
                className="mt-3 block text-sm font-semibold text-[#25135c]"
              >
                Сумма
              </label>
              <div className="mt-2 flex items-center rounded-2xl border border-[#ddcfef] bg-white px-4 focus-within:border-[#7042c5] focus-within:ring-2 focus-within:ring-[#e8ddf7]">
                <input
                  id={amountId}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="Введите сумму"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="min-h-11 w-full bg-transparent text-sm text-[#25135c] outline-none placeholder:text-[#a496bd]"
                />
                <span className="text-sm text-[#7d70a2]">₽</span>
              </div>
            </fieldset>

            {!isAuthenticated ? (
              <label
                htmlFor={emailId}
                className="mt-5 block text-sm font-semibold text-[#25135c]"
              >
                Email для получения чека
                <input
                  id={emailId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="mail@example.ru"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-2xl border border-[#ddcfef] bg-white px-4 text-sm text-[#25135c] outline-none placeholder:text-[#a496bd] focus:border-[#7042c5] focus:ring-2 focus:ring-[#e8ddf7]"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={submitCheckout}
              disabled={!isValidAmount || isSubmitting || (!isAuthenticated && !guestEmail.trim())}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Переходим к оплате…"
                : <>Поблагодарить на {resolveAmountLabel(selectedAmount)}</>}
            </button>
            {error ? <p role="alert" className="mt-3 text-center text-sm text-[#b42318]">{error}</p> : null}
            <p className="mt-3 text-center text-xs leading-5 text-[#8c7dab]">
              Вы перейдёте на защищённую страницу оплаты.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

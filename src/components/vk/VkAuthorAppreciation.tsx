"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { FEATURED_CARD_PRIMARY_CTA_CLASS } from "@/components/home/FeaturedProductCard";
import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import { formatRubles } from "@/lib/products/price-format";
import { openVkExternalHttps } from "@/lib/vk/bridge";

const QUICK_AMOUNTS = [100, 300, 500, 1000] as const;
const APPRECIATION_CTA_LABEL = "❤️ Поблагодарить автора";
const APPRECIATION_CTA_HEART = "❤️";

type VkAuthorAppreciationProps = {
  authorName: string;
  authorSlug: string;
  productSlug: string;
};

function parseAppreciationAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

function resolveAmountLabel(amount: number | null): string {
  return amount && amount > 0 ? formatRubles(amount) : "выбранную сумму";
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export default function VkAuthorAppreciation({
  authorName,
  authorSlug,
  productSlug,
}: VkAuthorAppreciationProps) {
  const titleId = useId();
  const amountId = useId();
  const emailId = useId();
  const [open, setOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("500");
  const [guestEmail, setGuestEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const selectedAmount = parseAppreciationAmount(amountInput);
  const email = validateEmailFormat(guestEmail);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function submitCheckout() {
    if (!selectedAmount || !email.ok || isSubmitting) return;
    const idempotencyKey = globalThis.crypto?.randomUUID?.();
    if (!idempotencyKey) {
      setError("Не удалось перейти к оплате. Попробуйте ещё раз.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setPaymentLink(null);
    try {
      const response = await fetch("/api/vk/appreciation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          authorSlug,
          productSlug,
          amountMinor: selectedAmount * 100,
          guestEmail: email.normalizedEmail,
          idempotencyKey,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        paymentLink?: unknown;
        status?: unknown;
      } | null;
      const link = typeof payload?.paymentLink === "string" ? payload.paymentLink : "";
      if (!response.ok || payload?.status !== "pending" || !isHttpsUrl(link)) {
        throw new Error("checkout_failed");
      }
      setPaymentLink(link);
      openVkExternalHttps(link);
    } catch {
      setError("Не удалось перейти к оплате. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1f1633]/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-vk-appreciation-dialog=""
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
            <p className="mt-2 break-words text-sm leading-6 text-[#7d70a2]">{authorName}</p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ddcfef] text-lg text-[#7042c5]"
          >
            ×
          </button>
        </div>
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-[#25135c]">
            Выберите сумму или введите вручную
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {QUICK_AMOUNTS.map((quickAmount) => {
              const selected = selectedAmount === quickAmount;
              return (
                <button
                  key={quickAmount}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAmountInput(String(quickAmount))}
                  className={`min-h-11 rounded-2xl border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
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
          <label htmlFor={amountId} className="mt-3 block text-sm font-semibold text-[#25135c]">
            Сумма
          </label>
          <div className="mt-2 flex items-center rounded-2xl border border-[#ddcfef] bg-white px-4">
            <input
              id={amountId}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className="min-h-11 w-full bg-transparent text-sm text-[#25135c] outline-none"
            />
            <span className="text-sm text-[#7d70a2]">₽</span>
          </div>
        </fieldset>
        <label htmlFor={emailId} className="mt-5 block text-sm font-semibold text-[#25135c]">
          Email для получения чека
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={guestEmail}
            onChange={(event) => setGuestEmail(event.target.value)}
            data-vk-appreciation-email=""
            className="mt-2 min-h-11 w-full rounded-2xl border border-[#ddcfef] bg-white px-4 text-sm text-[#25135c] outline-none focus:border-[#7042c5] focus:ring-2 focus:ring-[#e8ddf7]"
          />
        </label>
        {paymentLink ? (
          <button
            type="button"
            onClick={() => {
              openVkExternalHttps(paymentLink);
            }}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
          >
            Перейти к оплате
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void submitCheckout();
            }}
            disabled={!selectedAmount || !email.ok || isSubmitting}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Переходим к оплате…"
              : <>Поблагодарить на {resolveAmountLabel(selectedAmount)}</>}
          </button>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-center text-sm text-[#b42318]">{error}</p>
        ) : null}
        <p className="mt-3 text-center text-xs leading-5 text-[#8c7dab]">
          Вы перейдёте на защищённую страницу оплаты. Оплата не считается завершённой, пока платёж не подтверждён.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <section
        className="mt-4 rounded-[20px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4"
        data-practice-section="thank-author"
        data-vk-author-appreciation=""
        aria-label="Поддержка автора"
      >
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPaymentLink(null);
            setOpen(true);
          }}
          className={`${FEATURED_CARD_PRIMARY_CTA_CLASS} author-appreciation-cta max-w-full justify-center text-center hover:bg-[#6338b0] active:bg-[#5a32a3]`}
        >
          <span className="author-appreciation-cta__heart">{APPRECIATION_CTA_HEART}</span>
          {APPRECIATION_CTA_LABEL.slice(APPRECIATION_CTA_HEART.length)}
        </button>
        <p className="author-appreciation-caption mt-2.5 text-sm leading-5 text-[#7d70a2]">
          Благодарность возвращается изобилием 🙏
        </p>
      </section>
      {open ? createPortal(dialog, document.body) : null}
    </>
  );
}

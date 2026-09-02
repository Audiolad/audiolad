"use client";

import { useEffect, useId, useState } from "react";

import { formatRubles } from "@/lib/products/price-format";

const QUICK_AMOUNTS = [100, 300, 500, 1000] as const;

type AuthorAppreciationPrototypeProps = {
  authorName: string;
  isAuthenticated: boolean;
  surface: "author" | "product";
};

function resolveAmountLabel(amount: number | null): string {
  return amount && amount > 0 ? formatRubles(amount) : "выбранную сумму";
}

export default function AuthorAppreciationPrototype({
  authorName,
  isAuthenticated,
  surface,
}: AuthorAppreciationPrototypeProps) {
  const titleId = useId();
  const emailId = useId();
  const amountId = useId();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(500);
  const [customAmount, setCustomAmount] = useState("");

  const selectedAmount =
    customAmount.trim() === "" ? amount : Number(customAmount.replace(",", "."));
  const isValidAmount =
    typeof selectedAmount === "number" &&
    Number.isFinite(selectedAmount) &&
    selectedAmount > 0;

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
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#c6afe6] bg-white px-4 py-2.5 text-sm font-semibold text-[#7042c5] transition-colors hover:border-[#7042c5] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          🙏 Поблагодарить автора ❤️
        </button>
        <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
          Благодарность возвращается изобилием
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
                  const selected =
                    customAmount.trim() === "" && amount === quickAmount;

                  return (
                    <button
                      key={quickAmount}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setAmount(quickAmount);
                        setCustomAmount("");
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
                Своя сумма
              </label>
              <div className="mt-2 flex items-center rounded-2xl border border-[#ddcfef] bg-white px-4 focus-within:border-[#7042c5] focus-within:ring-2 focus-within:ring-[#e8ddf7]">
                <input
                  id={amountId}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="Введите сумму"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
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
                  className="mt-2 min-h-11 w-full rounded-2xl border border-[#ddcfef] bg-white px-4 text-sm text-[#25135c] outline-none placeholder:text-[#a496bd] focus:border-[#7042c5] focus:ring-2 focus:ring-[#e8ddf7]"
                />
              </label>
            ) : null}

            <button
              type="button"
              disabled={!isValidAmount}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Поблагодарить на {resolveAmountLabel(selectedAmount)}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-[#8c7dab]">
              Оплата будет подключена на следующем этапе.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

import {
  partnerDiscountPercent,
  partnerDiscountProgressLine,
  partnerFinishedNotice,
  partnerLatePaymentNotice,
  partnerReservationCountdownLabel,
  partnerReservationNoteLead,
  partnerQuoteTermsLines,
  type PartnerQuote,
} from "@/lib/business/partner-codes";
import { BUSINESS_PLAN_PERIOD_LABEL } from "@/lib/business/plan";

/**
 * Sergey (t1300u): the personal price is never shown alone. The usual price is struck
 * through right next to it, so the discount is obvious: «~~799 ₽~~ 399 ₽».
 * Shown only while the discount is active (t1329u).
 */
export function BusinessStruckPrice({
  standardRub,
  priceRub,
  testId = "biz-partner-price",
  tone = "default",
}: {
  standardRub: number;
  priceRub: number;
  testId?: string;
  /** onButton: white bold on the brown/green pay CTA (t1336u). Default keeps dark ink on cards. */
  tone?: "default" | "onButton";
}) {
  const standardClass = tone === "onButton" ? "text-white/75" : "text-[var(--biz-text-muted)]";
  const currentClass = tone === "onButton" ? "font-bold text-white" : "text-[var(--biz-text)]";
  return (
    <span className="whitespace-nowrap" data-testid={testId}>
      <s className={standardClass} data-testid={`${testId}-standard`} aria-label={`Обычная цена ${standardRub} ₽`}>
        {`${standardRub}\u00a0₽`}
      </s>{" "}
      <strong className={currentClass} data-testid={`${testId}-current`}>
        {`${priceRub}\u00a0₽`}
      </strong>
    </span>
  );
}

/** What the next payment will be, shown before any link to the bank exists. */
export function BusinessPartnerTerms({ quote, now }: { quote: PartnerQuote; now?: Date }) {
  const venues = Math.max(quote.venueCount, 1);
  const progress = partnerDiscountProgressLine(quote);
  return (
    <div className="space-y-1 rounded-xl border border-[var(--biz-border)] p-3 text-sm leading-6" data-testid="biz-partner-terms">
      <p className="font-semibold text-[var(--biz-text)]">
        Персональное предложение – скидка {partnerDiscountPercent(quote.unitPriceRub, quote.standardUnitPriceRub)}% на первые{" "}
        {quote.discountPeriods ?? 3} оплаченных месяца
      </p>
      {progress ? (
        <p className="font-semibold text-[var(--biz-text)]" data-testid="biz-partner-progress">
          {progress}
        </p>
      ) : null}
      <p>
        <BusinessStruckPrice standardRub={quote.standardUnitPriceRub} priceRub={quote.unitPriceRub} /> за точку{" "}
        {BUSINESS_PLAN_PERIOD_LABEL}.
      </p>
      <p data-testid="biz-partner-total">
        Точек: {venues}. Итого:{" "}
        <BusinessStruckPrice standardRub={quote.standardTotalRub} priceRub={quote.totalRub} testId="biz-partner-total-price" />{" "}
        {BUSINESS_PLAN_PERIOD_LABEL}. Одна оплата за все активные точки.
      </p>
      {partnerQuoteTermsLines(quote).map((line) => (
        <p key={line} className="text-[var(--biz-text-muted)]">{line}</p>
      ))}
      <BusinessPartnerReservationNote quote={quote} now={now} />
    </div>
  );
}

export function BusinessPartnerFinishedNotice({ quote }: { quote: PartnerQuote | null }) {
  const notice = partnerFinishedNotice(quote);
  if (!notice) return null;
  return (
    <p className="text-sm leading-6 text-[var(--biz-text-muted)]" role="status" data-testid="biz-partner-finished">
      {notice}
    </p>
  );
}

export function BusinessPartnerLatePaymentNotice({ quote }: { quote: PartnerQuote | null }) {
  const notice = partnerLatePaymentNotice(quote);
  if (!notice) return null;
  return (
    <p className="text-sm leading-6 text-[var(--biz-text-muted)]" role="status" data-testid="biz-partner-late-payment">
      {notice}
    </p>
  );
}

/** While the code is held: live countdown + soft note with 799 struck through next to 399. */
export function BusinessPartnerReservationNote({ quote, now: nowProp }: { quote: PartnerQuote | null; now?: Date }) {
  // liveNow stays null on the server and the first client paint – no hydration mismatch (t1337u).
  // A fixed nowProp (unit tests) skips the interval and is used as the clock directly.
  const [liveNow, setLiveNow] = useState<Date | null>(null);
  useEffect(() => {
    if (nowProp) return;
    if (!quote || quote.source !== "reserved" || !quote.reservedUntil) return;
    let timer = 0;
    const tick = () => {
      const next = new Date();
      setLiveNow(next);
      const until = Date.parse(quote.reservedUntil!);
      if (Number.isFinite(until) && until <= next.getTime() && timer) {
        window.clearInterval(timer);
        timer = 0;
      }
    };
    // First tick after the effect body – avoids sync setState-in-effect lint.
    const first = window.setTimeout(tick, 0);
    timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(first);
      if (timer) window.clearInterval(timer);
    };
  }, [quote, nowProp]);

  const now = nowProp ?? liveNow;
  if (!quote || now === null) return null;
  const lead = partnerReservationNoteLead(quote, now);
  const countdown = partnerReservationCountdownLabel(quote, now);
  if (!lead && !countdown) return null;
  return (
    <div className="space-y-1" data-testid="biz-partner-reservation-block">
      {countdown ? (
        <p className="font-semibold text-[var(--biz-text)]" role="status" data-testid="biz-partner-countdown">
          {countdown}
        </p>
      ) : null}
      {lead ? (
        <p className="font-semibold text-[var(--biz-text)]" role="status" data-testid="biz-partner-reservation">
          {lead}{" "}
          <BusinessStruckPrice standardRub={quote.standardUnitPriceRub} priceRub={quote.unitPriceRub} testId="biz-partner-reservation-price" />{" "}
          сохранится при оплате. Оставшиеся бесплатные дни не сгорают.
        </p>
      ) : null}
    </div>
  );
}

/** Compact banner for the owner home after activation (reserved or entitlement). */
export function BusinessPartnerHomeBanner({ quote }: { quote: PartnerQuote | null }) {
  if (!quote || (quote.source !== "reserved" && quote.source !== "entitlement")) return null;
  if (quote.unitPriceRub >= quote.standardUnitPriceRub) return null;
  const progress = partnerDiscountProgressLine(quote);
  return (
    <div
      className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] p-3 text-sm leading-6"
      role="status"
      data-testid="biz-home-partner-banner"
    >
      <p className="font-semibold text-[var(--biz-text)]">Персональная скидка активна</p>
      <p>
        <BusinessStruckPrice standardRub={quote.standardUnitPriceRub} priceRub={quote.unitPriceRub} testId="biz-home-partner-banner-price" /> за
        точку {BUSINESS_PLAN_PERIOD_LABEL}.
        {progress ? ` ${progress}.` : " Цена закрепится за аккаунтом при первой оплате."}
      </p>
    </div>
  );
}

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
}: {
  standardRub: number;
  priceRub: number;
  testId?: string;
}) {
  return (
    <span className="whitespace-nowrap" data-testid={testId}>
      <s className="text-[var(--biz-text-muted)]" data-testid={`${testId}-standard`} aria-label={`Обычная цена ${standardRub} ₽`}>
        {`${standardRub}\u00a0₽`}
      </s>{" "}
      <strong className="text-[var(--biz-text)]" data-testid={`${testId}-current`}>
        {`${priceRub}\u00a0₽`}
      </strong>
    </span>
  );
}

/** What the next payment will be, shown before any link to the bank exists. */
export function BusinessPartnerTerms({ quote }: { quote: PartnerQuote }) {
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
      <BusinessPartnerReservationNote quote={quote} />
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
export function BusinessPartnerReservationNote({ quote }: { quote: PartnerQuote | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!quote || quote.source !== "reserved" || !quote.reservedUntil) return;
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [quote]);

  const lead = partnerReservationNoteLead(quote, now);
  const countdown = partnerReservationCountdownLabel(quote, now);
  if ((!lead && !countdown) || !quote) return null;
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

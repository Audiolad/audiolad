import {
  partnerDiscountPercent,
  partnerFinishedNotice,
  partnerLatePaymentNotice,
  partnerReservationNoteLead,
  partnerQuoteTermsLines,
  type PartnerQuote,
} from "@/lib/business/partner-codes";
import { BUSINESS_PLAN_PERIOD_LABEL } from "@/lib/business/plan";

/**
 * Sergey (t1300u): the personal price is never shown alone. The usual price is struck
 * through right next to it, so the discount is obvious: «~~799 ₽~~ 399 ₽».
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
  return (
    <div className="space-y-1 rounded-xl border border-[var(--biz-border)] p-3 text-sm leading-6" data-testid="biz-partner-terms">
      <p className="font-semibold text-[var(--biz-text)]">
        Персональное предложение – скидка {partnerDiscountPercent(quote.unitPriceRub, quote.standardUnitPriceRub)}%
      </p>
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

/** While the code is held: 72 hours, the exact end in Moscow time, and 799 struck through next to 399. */
export function BusinessPartnerReservationNote({ quote }: { quote: PartnerQuote | null }) {
  const lead = partnerReservationNoteLead(quote);
  if (!lead || !quote) return null;
  return (
    <p className="font-semibold text-[var(--biz-text)]" role="status" data-testid="biz-partner-reservation">
      {lead}{" "}
      <BusinessStruckPrice standardRub={quote.standardUnitPriceRub} priceRub={quote.unitPriceRub} testId="biz-partner-reservation-price" />{" "}
      сохранилась.
    </p>
  );
}

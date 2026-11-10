import {
  BUSINESS_PAYMENT_HISTORY_EMPTY,
  BUSINESS_PAYMENT_HISTORY_NOTE,
  formatRub,
  type BusinessPaymentHistoryView,
} from "@/lib/business-app/payment-history";

/** Owner «История оплат» (t1342u): newest first, Moscow time, the paid amount. */
export default function BusinessPaymentHistoryList({ view }: { view: BusinessPaymentHistoryView }) {
  if (!view.items.length) {
    return (
      <p className="text-[var(--biz-text-muted)]" data-testid="biz-payment-history-empty">
        {BUSINESS_PAYMENT_HISTORY_EMPTY}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--biz-text-muted)]" data-testid="biz-payment-history-total">
        Всего оплачено: <strong className="text-[var(--biz-text)]">{formatRub(view.totalRub)}</strong>
      </p>
      <ul className="space-y-3" data-testid="biz-payment-history-list">
        {view.items.map((item) => (
          <li key={item.orderId} className="rounded-xl border border-[var(--biz-border)] p-3 sm:p-4"
            data-testid="biz-payment-history-item">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-semibold text-[var(--biz-text)]">
                <span data-testid="biz-payment-history-date">{item.dateLabel}</span>,{" "}
                <span className="whitespace-nowrap" data-testid="biz-payment-history-time">{item.timeLabel}</span>
              </p>
              <p className="text-lg font-bold whitespace-nowrap" data-testid="biz-payment-history-amount">
                {item.standardAmountRub !== null ? (
                  <>
                    <s className="text-base font-normal text-[var(--biz-text-muted)]"
                      aria-label={`Обычная цена ${formatRub(item.standardAmountRub)}`}>
                      {formatRub(item.standardAmountRub)}
                    </s>{" "}
                  </>
                ) : null}
                <span className={item.refunded ? "text-[var(--biz-text-muted)]" : "text-[var(--biz-text)]"}>
                  {formatRub(item.amountRub)}
                </span>
              </p>
            </div>
            <p className="mt-1 text-sm text-[var(--biz-text-muted)]" data-testid="biz-payment-history-details">
              Доступ на 30 дней: {item.periodLabel} · {item.venuesLabel}
            </p>
            {item.standardAmountRub !== null ? (
              <p className="mt-1 text-sm text-[var(--biz-text-muted)]">Персональная цена по коду партнёра</p>
            ) : null}
            {item.refunded ? (
              <p className="mt-1 text-sm font-semibold text-[var(--biz-text-muted)]" data-testid="biz-payment-history-refunded">
                Деньги возвращены
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-sm text-[var(--biz-text-muted)]">{BUSINESS_PAYMENT_HISTORY_NOTE}</p>
    </div>
  );
}
